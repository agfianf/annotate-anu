"""SAM3 inference following HuggingFace transformers documentation."""

import io
import time

import torch
from fastapi import UploadFile
from PIL import Image
from transformers import Sam3Model, Sam3Processor

from app.config import settings
from app.helpers.logger import logger
from app.integrations.sam3.mask_utils import masks_to_polygon_data
from app.integrations.sam3.visualizer import Sam3Visualizer


class SAM3Inference:
    """Simple SAM3 inference following transformers documentation patterns."""

    def __init__(self):
        """Initialize SAM3 model and processor."""
        self.model_name = settings.SAM3_MODEL_NAME
        self.device = self._get_device()
        self.model = None
        self.processor = None
        self.visualizer = Sam3Visualizer()

        logger.info(f"SAM3 inference initialized - Model: {self.model_name}, Device: {self.device}")

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

    def load_model(self):
        """Load SAM3 model and processor into memory."""
        logger.info(f"Loading SAM3 model from HuggingFace: {self.model_name}")

        # Login to HuggingFace if token provided
        if settings.HF_TOKEN:
            from huggingface_hub import login

            login(token=settings.HF_TOKEN)
            logger.info("HuggingFace authentication successful")
        else:
            logger.warning("No HF_TOKEN provided. This may fail for gated models like SAM3.")

        # Load model and processor
        self.model = Sam3Model.from_pretrained(
            self.model_name, cache_dir=settings.SAM3_CACHE_DIR, token=settings.HF_TOKEN
        ).to(self.device)
        self.model.eval()

        self.processor = Sam3Processor.from_pretrained(
            self.model_name, cache_dir=settings.SAM3_CACHE_DIR, token=settings.HF_TOKEN
        )

        logger.info(f"SAM3 model loaded successfully on {self.device}")

    async def _load_image_from_upload(self, file: UploadFile) -> Image.Image:
        """Load PIL Image from uploaded file.

        Parameters
        ----------
        file : UploadFile
            Uploaded image file

        Returns
        -------
        Image.Image
            PIL Image in RGB format

        Raises
        ------
        ValueError
            If image invalid or too large
        """
        content = await file.read()
        size_mb = len(content) / (1024 * 1024)

        if size_mb > settings.MAX_IMAGE_SIZE_MB:
            raise ValueError(f"Image size {size_mb:.2f}MB exceeds limit of {settings.MAX_IMAGE_SIZE_MB}MB")

        image = Image.open(io.BytesIO(content))

        if image.mode != "RGB":
            image = image.convert("RGB")

        width, height = image.size
        if width > settings.MAX_IMAGE_DIMENSION or height > settings.MAX_IMAGE_DIMENSION:
            raise ValueError(
                f"Image {width}x{height} exceeds max dimension {settings.MAX_IMAGE_DIMENSION}"
            )

        return image

    async def inference_text(
        self,
        image_file: UploadFile,
        text_prompt: str,
        threshold: float,
        mask_threshold: float,
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
        return_visualization : bool
            Return visualization base64

        Returns
        -------
        dict
            Results with boxes, scores, processing time, optional visualization
        """
        start_time = time.perf_counter()

        # Load image
        image = await self._load_image_from_upload(image_file)

        # Following docs: processor(images=image, text=text_prompt, return_tensors="pt")
        inputs = self.processor(images=image, text=text_prompt, return_tensors="pt").to(self.device)

        # Inference
        with torch.no_grad():
            outputs = self.model(**inputs)

        # Post-process
        results = self.processor.post_process_instance_segmentation(
            outputs,
            threshold=threshold,
            mask_threshold=mask_threshold,
            target_sizes=inputs.get("original_sizes").tolist(),
        )[0]

        # Prepare response
        num_objects = len(results["scores"])
        boxes_list = results["boxes"].cpu().tolist()
        scores_list = results["scores"].cpu().tolist()

        # Convert masks to polygon coordinates
        masks_polygon = masks_to_polygon_data(results["masks"])

        processing_time_ms = (time.perf_counter() - start_time) * 1000

        response = {
            "num_objects": num_objects,
            "boxes": boxes_list,
            "scores": scores_list,
            "masks": masks_polygon,
            "processing_time_ms": round(processing_time_ms, 2),
            "visualization_base64": None,
        }

        # Generate visualization if requested
        if return_visualization and num_objects > 0:
            viz_bytes = self.visualizer.create_visualization(
                image=image,
                masks=results["masks"],
                boxes=results["boxes"],
                scores=results["scores"],
            )
            import base64

            response["visualization_base64"] = base64.b64encode(viz_bytes).decode("utf-8")

        logger.info(f"Text inference completed - Objects: {num_objects}, Time: {response['processing_time_ms']:.2f}ms")

        return response

    async def inference_bbox(
        self,
        image_file: UploadFile,
        bounding_boxes: list[list[int]],
        box_labels: list[int],
        threshold: float,
        mask_threshold: float,
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
        return_visualization : bool
            Return visualization base64

        Returns
        -------
        dict
            Results with boxes, scores, processing time, optional visualization
        """
        start_time = time.perf_counter()

        # Load image
        image = await self._load_image_from_upload(image_file)

        # Following docs: processor(images=image, input_boxes=[boxes], input_boxes_labels=[labels], ...)
        inputs = self.processor(
            images=image,
            input_boxes=[bounding_boxes],
            input_boxes_labels=[box_labels],
            return_tensors="pt",
        ).to(self.device)

        # Inference
        with torch.no_grad():
            outputs = self.model(**inputs)

        # Post-process
        results = self.processor.post_process_instance_segmentation(
            outputs,
            threshold=threshold,
            mask_threshold=mask_threshold,
            target_sizes=inputs.get("original_sizes").tolist(),
        )[0]

        # Prepare response
        num_objects = len(results["scores"])
        boxes_list = results["boxes"].cpu().tolist()
        scores_list = results["scores"].cpu().tolist()

        # Convert masks to polygon coordinates
        masks_polygon = masks_to_polygon_data(results["masks"])

        processing_time_ms = (time.perf_counter() - start_time) * 1000

        response = {
            "num_objects": num_objects,
            "boxes": boxes_list,
            "scores": scores_list,
            "masks": masks_polygon,
            "processing_time_ms": round(processing_time_ms, 2),
            "visualization_base64": None,
        }

        # Generate visualization if requested
        if return_visualization and num_objects > 0:
            viz_bytes = self.visualizer.create_visualization(
                image=image,
                masks=results["masks"],
                boxes=results["boxes"],
                scores=results["scores"],
            )
            import base64

            response["visualization_base64"] = base64.b64encode(viz_bytes).decode("utf-8")

        logger.info(f"Bbox inference completed - Objects: {num_objects}, Time: {response['processing_time_ms']:.2f}ms")

        return response

    async def inference_batch(
        self,
        image_files: list[UploadFile],
        text_prompts: list[str | None],
        threshold: float,
        mask_threshold: float,
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
        return_visualizations : bool
            Return visualizations base64

        Returns
        -------
        dict
            Batch results
        """
        start_time = time.perf_counter()

        if len(image_files) > settings.MAX_BATCH_SIZE:
            raise ValueError(f"Batch size {len(image_files)} exceeds max {settings.MAX_BATCH_SIZE}")

        # Load all images
        images = []
        for file in image_files:
            image = await self._load_image_from_upload(file)
            images.append(image)

        # Following docs: processor(images=images, text=text_prompts, return_tensors="pt")
        inputs = self.processor(images=images, text=text_prompts, return_tensors="pt").to(self.device)

        # Inference
        with torch.no_grad():
            outputs = self.model(**inputs)

        # Post-process
        results = self.processor.post_process_instance_segmentation(
            outputs,
            threshold=threshold,
            mask_threshold=mask_threshold,
            target_sizes=inputs.get("original_sizes").tolist(),
        )

        # Process each result
        batch_results = []
        for idx, (image, result) in enumerate(zip(images, results)):
            num_objects = len(result["scores"])
            boxes_list = result["boxes"].cpu().tolist()
            scores_list = result["scores"].cpu().tolist()

            # Convert masks to polygon coordinates
            masks_polygon = masks_to_polygon_data(result["masks"])

            result_item = {
                "image_index": idx,
                "num_objects": num_objects,
                "boxes": boxes_list,
                "scores": scores_list,
                "masks": masks_polygon,
                "visualization_base64": None,
            }

            # Generate visualization if requested
            if return_visualizations and num_objects > 0:
                viz_bytes = self.visualizer.create_visualization(
                    image=image,
                    masks=result["masks"],
                    boxes=result["boxes"],
                    scores=result["scores"],
                )
                import base64

                result_item["visualization_base64"] = base64.b64encode(viz_bytes).decode("utf-8")

            batch_results.append(result_item)

        total_time_ms = (time.perf_counter() - start_time) * 1000

        response = {
            "total_images": len(image_files),
            "results": batch_results,
            "total_processing_time_ms": round(total_time_ms, 2),
            "average_time_per_image_ms": round(total_time_ms / len(image_files), 2),
        }

        logger.info(f"Batch inference completed - Images: {len(image_files)}, Total time: {response['total_processing_time_ms']:.2f}ms")

        return response
