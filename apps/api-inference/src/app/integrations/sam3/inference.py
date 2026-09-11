"""SAM3 inference following HuggingFace transformers documentation.

Performance notes
-----------------
* Every GPU-touching call runs on a single dedicated worker thread. The public
  ``inference_*`` coroutines only read the upload, then hand off. That keeps the event
  loop free (health checks and uploads keep flowing during a 700ms segmentation) and
  structurally serialises GPU access, so concurrent requests queue instead of racing
  for memory.
* The vision encoder is most of a forward pass, so its output is cached per image
  content hash (for both the detector and the tracker). Another prompt on the same
  image - a second click, a different text query - skips the encoder and the CPU
  preprocessing entirely.
* On CUDA the forward pass runs under bf16 autocast (see ``SAM3_AUTOCAST``), with
  cuDNN autotuning enabled: the model input is always 1008x1008, so the tuning cost is
  paid once at warmup.
* Masks leave the GPU as one uint8 stack (see ``mask_utils``).
"""

import asyncio
import base64
import contextlib
import hashlib
import io
import time
from collections import OrderedDict
from concurrent.futures import ThreadPoolExecutor
from functools import partial
from typing import Any

import torch
from fastapi import UploadFile
from PIL import Image
from transformers import Sam3Model, Sam3Processor

from app.config import settings
from app.helpers.logger import logger
from app.integrations.sam3.mask_utils import masks_to_numpy, masks_to_polygon_data
from app.integrations.sam3.visualizer import Sam3Visualizer

_WARMUP_KEY = b"__warmup__"


class SAM3Inference:
    """Simple SAM3 inference following transformers documentation patterns."""

    def __init__(self):
        """Initialize SAM3 model and processor."""
        self.model_name = settings.SAM3_MODEL_NAME
        self.device = self._get_device()
        self.model = None
        self.processor = None
        self.tracker_model = None
        self.tracker_processor = None
        self.visualizer = Sam3Visualizer()

        self._gpu_executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="sam3-gpu")
        self._autocast_enabled = self.device == "cuda" and settings.SAM3_AUTOCAST
        # image content hash -> (encoder output, (height, width))
        self._vision_cache: OrderedDict[bytes, tuple[Any, tuple[int, int]]] = OrderedDict()
        self._tracker_cache: OrderedDict[bytes, tuple[list[torch.Tensor], tuple[int, int]]] = OrderedDict()

        logger.info(
            f"SAM3 inference initialized - Model: {self.model_name}, Device: {self.device}, "
            f"Autocast: {self._autocast_enabled}"
        )

    def _get_device(self) -> str:
        """Determine device (cuda or cpu).

        Returns
        -------
        str
            Device name
        """
        if settings.SAM3_DEVICE == "auto":
            device = "cuda" if torch.cuda.is_available() else "cpu"
            return device
        return settings.SAM3_DEVICE

    # ------------------------------------------------------------------ loading

    def load_model(self):
        """Load SAM3 model, tracker and processors into memory, then warm up."""
        logger.info(f"Loading SAM3 model from HuggingFace: {self.model_name}")

        # Login to HuggingFace if token provided
        if settings.HF_TOKEN:
            from huggingface_hub import login

            login(token=settings.HF_TOKEN)
            logger.info("HuggingFace authentication successful")
        else:
            logger.warning("No HF_TOKEN provided. This may fail for gated models like SAM3.")

        if self.device == "cuda":
            # Input shape is fixed (1008x1008), so cuDNN can autotune once and reuse.
            torch.backends.cudnn.benchmark = True
            # TF32 matmuls for whatever still runs in fp32 outside autocast.
            torch.backends.cuda.matmul.allow_tf32 = True
            torch.backends.cudnn.allow_tf32 = True

        # Load model and processor
        self.model = Sam3Model.from_pretrained(
            self.model_name, cache_dir=settings.SAM3_CACHE_DIR, token=settings.HF_TOKEN
        ).to(self.device)
        self.model.eval()

        self.processor = Sam3Processor.from_pretrained(
            self.model_name, cache_dir=settings.SAM3_CACHE_DIR, token=settings.HF_TOKEN
        )

        logger.info(f"SAM3 model loaded successfully on {self.device}")

        # The tracker used to be loaded lazily on the first point prompt, which froze
        # the whole server for seconds (or minutes on a cold cache) mid-request.
        self.load_tracker()

        if settings.SAM3_WARMUP:
            # cuBLAS/cuDNN handles and workspaces are per thread, so warm up on the
            # worker thread that will actually serve requests, not the startup thread.
            self._gpu_executor.submit(self._warmup).result()

    def load_tracker(self):
        """Load the tracker model used for point prompts (idempotent)."""
        if self.tracker_model is not None:
            return

        from transformers import Sam3TrackerModel, Sam3TrackerProcessor

        logger.info("Loading SAM3 tracker for point prompts")
        self.tracker_model = Sam3TrackerModel.from_pretrained(
            self.model_name, cache_dir=settings.SAM3_CACHE_DIR, token=settings.HF_TOKEN
        ).to(self.device)
        self.tracker_model.eval()
        self.tracker_processor = Sam3TrackerProcessor.from_pretrained(
            self.model_name, cache_dir=settings.SAM3_CACHE_DIR, token=settings.HF_TOKEN
        )
        logger.info(f"SAM3 tracker loaded on {self.device}")

    def _warmup(self):
        """Run one dummy request through each model so startup, not a user, pays for it."""
        start = time.perf_counter()
        # Non-square and larger than the model input, so the GPU resize and the
        # mask upsampling kernels get exercised with a realistic shape, not identity.
        image = Image.new("RGB", (1920, 1080), (127, 127, 127))
        buffer = io.BytesIO()
        image.save(buffer, format="JPEG")
        content = buffer.getvalue()
        try:
            self._inference_text_sync(content, "object", 0.5, 0.5, 1.5, False, cache_key=_WARMUP_KEY)
            self._inference_point_sync(content, [[960.0, 540.0]], [1], 1.5, cache_key=_WARMUP_KEY)
            logger.info(f"SAM3 warmup completed in {(time.perf_counter() - start) * 1000:.0f}ms")
        except Exception as e:  # warmup is best-effort; never block startup on it
            logger.warning(f"SAM3 warmup failed (continuing): {e}")
        finally:
            self._vision_cache.pop(_WARMUP_KEY, None)
            self._tracker_cache.pop(_WARMUP_KEY, None)

    def shutdown(self):
        """Release the GPU worker thread."""
        self._gpu_executor.shutdown(wait=False, cancel_futures=True)

    # ------------------------------------------------------------------ helpers

    def _inference_ctx(self):
        """Context manager for a forward pass: no autograd, bf16 autocast on CUDA."""
        stack = contextlib.ExitStack()
        stack.enter_context(torch.inference_mode())
        if self._autocast_enabled:
            stack.enter_context(torch.autocast("cuda", dtype=torch.bfloat16))
        return stack

    async def _run_on_gpu(self, fn, *args, **kwargs):
        """Run ``fn`` on the single GPU worker thread and await its result."""
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(self._gpu_executor, partial(fn, *args, **kwargs))

    @staticmethod
    async def _read_upload(file: UploadFile) -> bytes:
        """Read an upload into memory, enforcing the size limit.

        Raises
        ------
        ValueError
            If the file is larger than ``MAX_IMAGE_SIZE_MB``
        """
        content = await file.read()
        size_mb = len(content) / (1024 * 1024)

        if size_mb > settings.MAX_IMAGE_SIZE_MB:
            raise ValueError(f"Image size {size_mb:.2f}MB exceeds limit of {settings.MAX_IMAGE_SIZE_MB}MB")

        return content

    @staticmethod
    def _decode_image(content: bytes) -> Image.Image:
        """Decode image bytes to an RGB PIL image.

        The dimension check runs on the header before any pixels are decoded, so an
        oversized upload is rejected without paying for the decode.

        Raises
        ------
        ValueError
            If image invalid or too large
        """
        try:
            image = Image.open(io.BytesIO(content))
        except Exception as e:
            raise ValueError("Unsupported or corrupt image file") from e

        width, height = image.size
        if width > settings.MAX_IMAGE_DIMENSION or height > settings.MAX_IMAGE_DIMENSION:
            raise ValueError(f"Image {width}x{height} exceeds max dimension {settings.MAX_IMAGE_DIMENSION}")

        if image.mode != "RGB":
            image = image.convert("RGB")
        else:
            image.load()

        return image

    @staticmethod
    def _content_key(content: bytes) -> bytes:
        return hashlib.blake2b(content, digest_size=16).digest()

    @staticmethod
    def _remember(cache: OrderedDict, key: bytes, value: Any) -> None:
        cache[key] = value
        cache.move_to_end(key)
        while len(cache) > max(settings.SAM3_FEATURE_CACHE_SIZE, 1):
            cache.popitem(last=False)

    def _detector_inputs(self, cache_key: bytes, content: bytes, **prompt_kwargs) -> tuple[Any, Any, tuple[int, int]]:
        """Build processor inputs and vision features for the detector.

        On a cache hit neither the image decode nor the encoder runs; the processor is
        only asked to tokenise the prompt and normalise the boxes against the stored
        original size.

        Returns
        -------
        tuple
            (processor inputs on device, vision encoder output, (height, width))
        """
        cached = self._vision_cache.get(cache_key)
        if cached is not None:
            self._vision_cache.move_to_end(cache_key)
            vision, (height, width) = cached
            inputs = self.processor(original_sizes=[[height, width]], return_tensors="pt", **prompt_kwargs)
            return inputs.to(self.device), vision, (height, width)

        image = self._decode_image(content)
        width, height = image.size
        # device= moves resize/normalise onto the GPU instead of single-threaded CPU.
        inputs = self.processor(images=image, return_tensors="pt", device=self.device, **prompt_kwargs)
        inputs = inputs.to(self.device)
        with self._inference_ctx():
            vision = self.model.get_vision_features(inputs["pixel_values"])
        self._remember(self._vision_cache, cache_key, (vision, (height, width)))
        return inputs, vision, (height, width)

    def _detect(self, inputs: Any, vision: Any, size: tuple[int, int], threshold: float, mask_threshold: float):
        """Run the detector head on cached vision features and post-process one image."""
        with self._inference_ctx():
            outputs = self.model(
                vision_embeds=vision,
                input_ids=inputs.get("input_ids"),
                attention_mask=inputs.get("attention_mask"),
                input_boxes=inputs.get("input_boxes"),
                input_boxes_labels=inputs.get("input_boxes_labels"),
            )

        return self.processor.post_process_instance_segmentation(
            outputs,
            threshold=threshold,
            mask_threshold=mask_threshold,
            target_sizes=[list(size)],
        )[0]

    def _build_result(self, results: dict, simplify_tolerance: float) -> tuple[dict, Any]:
        """Turn one post-processed result into response fields plus the uint8 mask stack."""
        masks_u8 = masks_to_numpy(results["masks"])
        return (
            {
                "num_objects": len(results["scores"]),
                "boxes": results["boxes"].float().cpu().tolist(),
                "scores": results["scores"].float().cpu().tolist(),
                "masks": masks_to_polygon_data(masks_u8, simplify_tolerance),
            },
            masks_u8,
        )

    def _visualization(self, content: bytes, results: dict, masks_u8: Any) -> str:
        image = self._decode_image(content)
        viz_bytes = self.visualizer.create_visualization(
            image=image,
            masks=masks_u8,
            boxes=results["boxes"],
            scores=results["scores"],
        )
        return base64.b64encode(viz_bytes).decode("utf-8")

    # ------------------------------------------------------------------ point prompt

    async def inference_point(
        self,
        image_file: UploadFile,
        points: list[list[float]],
        point_labels: list[int],
        simplify_tolerance: float = 1.5,
    ) -> dict:
        """Point-prompted instance segmentation.

        Parameters
        ----------
        image_file : UploadFile
            Image file
        points : list[list[float]]
            Click points as [[x, y], ...]
        point_labels : list[int]
            1 for foreground, 0 for background
        simplify_tolerance : float
            Polygon simplification tolerance

        Returns
        -------
        dict
            Single best instance with box, score and mask polygons
        """
        content = await self._read_upload(image_file)
        return await self._run_on_gpu(self._inference_point_sync, content, points, point_labels, simplify_tolerance)

    def _inference_point_sync(
        self,
        content: bytes,
        points: list[list[float]],
        point_labels: list[int],
        simplify_tolerance: float,
        cache_key: bytes | None = None,
    ) -> dict:
        start_time = time.perf_counter()
        cache_key = cache_key or self._content_key(content)

        cached = self._tracker_cache.get(cache_key)
        if cached is not None:
            self._tracker_cache.move_to_end(cache_key)
            embeddings, (height, width) = cached
            inputs = self.tracker_processor(
                input_points=[[points]],
                input_labels=[[point_labels]],
                original_sizes=[[height, width]],
                return_tensors="pt",
            ).to(self.device)
        else:
            image = self._decode_image(content)
            width, height = image.size
            inputs = self.tracker_processor(
                images=image,
                input_points=[[points]],
                input_labels=[[point_labels]],
                return_tensors="pt",
            ).to(self.device)
            with self._inference_ctx():
                embeddings = self.tracker_model.get_image_embeddings(inputs["pixel_values"])
            self._remember(self._tracker_cache, cache_key, (embeddings, (height, width)))

        with self._inference_ctx():
            outputs = self.tracker_model(
                image_embeddings=embeddings,
                input_points=inputs["input_points"],
                input_labels=inputs["input_labels"],
            )

        masks = self.tracker_processor.post_process_masks(outputs.pred_masks.float(), inputs["original_sizes"])[0]

        # The decoder returns competing hypotheses; keep the highest-IoU one
        scores = outputs.iou_scores.float().squeeze().tolist()
        if isinstance(scores, float):
            scores = [scores]
        best = max(range(len(scores)), key=lambda i: scores[i])

        best_mask = masks[best] if masks.ndim == 3 else masks[0][best]
        binary = best_mask > 0

        ys, xs = torch.nonzero(binary, as_tuple=True)
        if xs.numel() == 0:
            return {
                "num_objects": 0,
                "boxes": [],
                "scores": [],
                "masks": [],
                "processing_time_ms": round((time.perf_counter() - start_time) * 1000, 2),
                "visualization_base64": None,
            }

        box = [float(xs.min()), float(ys.min()), float(xs.max()), float(ys.max())]
        mask_data = masks_to_polygon_data(binary, simplify_tolerance)

        processing_time_ms = (time.perf_counter() - start_time) * 1000
        logger.info(
            f"Point inference completed - Score: {scores[best]:.3f}, Cached: {cached is not None}, "
            f"Time: {processing_time_ms:.2f}ms"
        )

        return {
            "num_objects": 1,
            "boxes": [box],
            "scores": [float(scores[best])],
            "masks": mask_data,
            "processing_time_ms": round(processing_time_ms, 2),
            "visualization_base64": None,
        }

    # ------------------------------------------------------------------ text prompt

    async def inference_text(
        self,
        image_file: UploadFile,
        text_prompt: str,
        threshold: float,
        mask_threshold: float,
        simplify_tolerance: float = 1.5,
        return_visualization: bool = False,
    ) -> dict:
        """Text-based inference following docs/sam3.md pattern.

        Parameters
        ----------
        image_file : UploadFile
            Image file
        text_prompt : str
            Text description
        threshold : float
            Detection threshold
        mask_threshold : float
            Mask threshold
        simplify_tolerance : float
            Polygon simplification tolerance
        return_visualization : bool
            Return visualization base64

        Returns
        -------
        dict
            Results with boxes, scores, processing time, optional visualization
        """
        content = await self._read_upload(image_file)
        return await self._run_on_gpu(
            self._inference_text_sync,
            content,
            text_prompt,
            threshold,
            mask_threshold,
            simplify_tolerance,
            return_visualization,
        )

    def _inference_text_sync(
        self,
        content: bytes,
        text_prompt: str,
        threshold: float,
        mask_threshold: float,
        simplify_tolerance: float,
        return_visualization: bool,
        cache_key: bytes | None = None,
    ) -> dict:
        start_time = time.perf_counter()
        cache_key = cache_key or self._content_key(content)
        cached = cache_key in self._vision_cache

        inputs, vision, size = self._detector_inputs(cache_key, content, text=text_prompt)
        results = self._detect(inputs, vision, size, threshold, mask_threshold)
        response, masks_u8 = self._build_result(results, simplify_tolerance)

        processing_time_ms = (time.perf_counter() - start_time) * 1000
        response["processing_time_ms"] = round(processing_time_ms, 2)
        response["visualization_base64"] = None

        if return_visualization and response["num_objects"] > 0:
            response["visualization_base64"] = self._visualization(content, results, masks_u8)

        logger.info(
            f"Text inference completed - Objects: {response['num_objects']}, Cached: {cached}, "
            f"Time: {response['processing_time_ms']:.2f}ms"
        )

        return response

    # ------------------------------------------------------------------ bbox prompt

    async def inference_bbox(
        self,
        image_file: UploadFile,
        bounding_boxes: list[list[int]],
        box_labels: list[int],
        threshold: float,
        mask_threshold: float,
        simplify_tolerance: float = 1.5,
        return_visualization: bool = False,
    ) -> dict:
        """Bounding box inference following docs/sam3.md pattern.

        Parameters
        ----------
        image_file : UploadFile
            Image file
        bounding_boxes : list[list[int]]
            Boxes in [x1, y1, x2, y2] format
        box_labels : list[int]
            Labels (1=positive, 0=negative)
        threshold : float
            Detection threshold
        mask_threshold : float
            Mask threshold
        simplify_tolerance : float
            Polygon simplification tolerance
        return_visualization : bool
            Return visualization base64

        Returns
        -------
        dict
            Results with boxes, scores, processing time, optional visualization
        """
        content = await self._read_upload(image_file)
        return await self._run_on_gpu(
            self._inference_bbox_sync,
            content,
            bounding_boxes,
            box_labels,
            threshold,
            mask_threshold,
            simplify_tolerance,
            return_visualization,
        )

    def _inference_bbox_sync(
        self,
        content: bytes,
        bounding_boxes: list[list[int]],
        box_labels: list[int],
        threshold: float,
        mask_threshold: float,
        simplify_tolerance: float,
        return_visualization: bool,
    ) -> dict:
        start_time = time.perf_counter()
        cache_key = self._content_key(content)
        cached = cache_key in self._vision_cache

        inputs, vision, size = self._detector_inputs(
            cache_key,
            content,
            input_boxes=[bounding_boxes],
            input_boxes_labels=[box_labels],
        )
        results = self._detect(inputs, vision, size, threshold, mask_threshold)
        response, masks_u8 = self._build_result(results, simplify_tolerance)

        processing_time_ms = (time.perf_counter() - start_time) * 1000
        response["processing_time_ms"] = round(processing_time_ms, 2)
        response["visualization_base64"] = None

        if return_visualization and response["num_objects"] > 0:
            response["visualization_base64"] = self._visualization(content, results, masks_u8)

        logger.info(
            f"Bbox inference completed - Objects: {response['num_objects']}, Cached: {cached}, "
            f"Time: {response['processing_time_ms']:.2f}ms"
        )

        return response

    # ------------------------------------------------------------------ batch

    async def inference_batch(
        self,
        image_files: list[UploadFile],
        text_prompts: list[str | None],
        threshold: float,
        mask_threshold: float,
        simplify_tolerance: float = 1.5,
        return_visualizations: bool = False,
    ) -> dict:
        """Batch inference following docs/sam3.md pattern.

        Parameters
        ----------
        image_files : list[UploadFile]
            List of image files
        text_prompts : list[str | None]
            List of text prompts (one per image, None allowed)
        threshold : float
            Detection threshold
        mask_threshold : float
            Mask threshold
        simplify_tolerance : float
            Polygon simplification tolerance
        return_visualizations : bool
            Return visualizations base64

        Returns
        -------
        dict
            Batch results
        """
        if not image_files:
            raise ValueError("At least one image is required")
        if len(image_files) > settings.MAX_BATCH_SIZE:
            raise ValueError(f"Batch size {len(image_files)} exceeds max {settings.MAX_BATCH_SIZE}")

        contents = [await self._read_upload(file) for file in image_files]
        return await self._run_on_gpu(
            self._inference_batch_sync,
            contents,
            text_prompts,
            threshold,
            mask_threshold,
            simplify_tolerance,
            return_visualizations,
        )

    def _inference_batch_sync(
        self,
        contents: list[bytes],
        text_prompts: list[str | None],
        threshold: float,
        mask_threshold: float,
        simplify_tolerance: float,
        return_visualizations: bool,
    ) -> dict:
        start_time = time.perf_counter()

        images = [self._decode_image(content) for content in contents]
        sizes = [(image.size[1], image.size[0]) for image in images]

        # Following docs: processor(images=images, text=text_prompts, return_tensors="pt")
        inputs = self.processor(images=images, text=text_prompts, return_tensors="pt", device=self.device)
        inputs = inputs.to(self.device)

        with self._inference_ctx():
            outputs = self.model(**inputs)

        results = self.processor.post_process_instance_segmentation(
            outputs,
            threshold=threshold,
            mask_threshold=mask_threshold,
            target_sizes=[list(size) for size in sizes],
        )

        batch_results = []
        for idx, (image, result) in enumerate(zip(images, results)):
            item, masks_u8 = self._build_result(result, simplify_tolerance)
            item = {"image_index": idx, **item, "visualization_base64": None}

            if return_visualizations and item["num_objects"] > 0:
                viz_bytes = self.visualizer.create_visualization(
                    image=image,
                    masks=masks_u8,
                    boxes=result["boxes"],
                    scores=result["scores"],
                )
                item["visualization_base64"] = base64.b64encode(viz_bytes).decode("utf-8")

            batch_results.append(item)

        total_time_ms = (time.perf_counter() - start_time) * 1000

        response = {
            "total_images": len(contents),
            "results": batch_results,
            "total_processing_time_ms": round(total_time_ms, 2),
            "average_time_per_image_ms": round(total_time_ms / len(contents), 2),
        }

        logger.info(
            f"Batch inference completed - Images: {len(contents)}, Total time: {response['total_processing_time_ms']:.2f}ms"
        )

        return response
