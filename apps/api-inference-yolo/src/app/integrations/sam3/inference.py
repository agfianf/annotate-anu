"""SAM3 inference using Ultralytics SAM3SemanticPredictor."""

import io
import time
import base64

import cv2
import numpy as np
import torch
from fastapi import UploadFile
from PIL import Image
from ultralytics.models.sam import SAM3SemanticPredictor

from app.config import settings
from app.helpers.logger import logger
from app.integrations.sam3.mask_utils import masks_to_polygon_data
from app.integrations.sam3.visualizer import Sam3Visualizer


class SAM3Inference:
    """SAM3 inference implementation using Ultralytics."""

    def __init__(self):
        """Initialize SAM3 model configuration."""
        import os
        
        # Support both local file paths and model names
        model_path = settings.SAM3_MODEL_PATH
        
        # Resolve the model path
        resolved_path = self._resolve_model_path(model_path)
        
        self.model_path = resolved_path
        self.device = self._get_device()
        self.feature_predictor = None
        self.inference_predictor = None
        self.visualizer = Sam3Visualizer()

        logger.info(f"SAM3 (Ultralytics) inference initialized - Model: {self.model_path}, Device: {self.device}")
    
    def _resolve_model_path(self, model_path: str) -> str:
        """Resolve model path from config, checking multiple locations.
        
        Checks:
        1. Absolute path if provided
        2. Current working directory
        3. apps/ directory relative to project root
        4. Falls back to model name for Ultralytics to download
        """
        import os
        
        logger.info(f"Resolving model path: {model_path}")
        
        # If it's already an absolute path and exists
        if os.path.isabs(model_path) and os.path.isfile(model_path):
            logger.info(f"Found model at absolute path: {model_path}")
            return model_path
        
        # Check if it exists in current directory
        if os.path.isfile(model_path):
            abs_path = os.path.abspath(model_path)
            logger.info(f"Found model in current directory: {abs_path}")
            return abs_path
        
        # Check in apps directory (assuming this runs from api-inference-yolo)
        # Path: api-inference-yolo/src/app/integrations/sam3/inference.py
        # Go up: ../../../../ = api-inference-yolo -> apps -> SSD-EXT -> ... 
        # But we want: api-inference-yolo -> .. (apps) = ../
        apps_model = os.path.join(os.path.dirname(__file__), "../../../..", model_path)
        apps_model = os.path.abspath(apps_model)
        
        logger.info(f"Checking apps directory: {apps_model}")
        if os.path.isfile(apps_model):
            logger.info(f"Found model in apps directory: {apps_model}")
            return apps_model
        
        # Try one level up (for models in project root)
        root_model = os.path.join(os.path.dirname(__file__), "../../../../..", model_path)
        root_model = os.path.abspath(root_model)
        
        logger.info(f"Checking project root: {root_model}")
        if os.path.isfile(root_model):
            logger.info(f"Found model in project root: {root_model}")
            return root_model
        
        # Fall back to the model name (let Ultralytics handle it)
        logger.warning(f"Model file not found locally, using as Ultralytics model name: {model_path}")
        return model_path

    def _get_device(self) -> str:
        """Determine device (cuda or cpu)."""
        if settings.SAM3_DEVICE == "auto":
            device = "cuda" if torch.cuda.is_available() else "cpu"
            return device
        return settings.SAM3_DEVICE

    def load_model(self):
        """Load SAM3 model into memory."""
        logger.info(f"Loading SAM3 model (Ultralytics): {self.model_path}")

        overrides = dict(
            conf=settings.SAM3_DEFAULT_THRESHOLD,
            task="segment",
            mode="predict",
            model=self.model_path,
            half=False,  # Use full precision as requested
            save=False,  # Don't save prediction results to disk
            device=self.device,
            verbose=False  # Reduce noise in logs
        )
        
        try:
            # Initialize two predictors to follow the working reference implementation exactly
            # One for feature extraction (image encoding), one for inference (decoding)
            self.feature_predictor = SAM3SemanticPredictor(overrides=overrides)
            self.inference_predictor = SAM3SemanticPredictor(overrides=overrides)
            
            # Setup both models
            self.feature_predictor.setup_model()
            self.inference_predictor.setup_model()
            
            # Share the underlying model to save VRAM if possible, while keeping separate predictor states
            if hasattr(self.feature_predictor, 'model') and self.feature_predictor.model is not None:
                self.inference_predictor.model = self.feature_predictor.model
                logger.info("Shared underlying model between predictors to optimized VRAM")
            
            logger.info(f"SAM3 model loaded successfully on {self.device} (FP16: {overrides['half']})")
        except Exception as e:
            logger.error(f"Failed to load SAM3 model: {e}")
            raise

    async def _load_image_from_upload(self, file: UploadFile) -> np.ndarray:
        """Load image for Ultralytics (numpy array in RGB format)."""
        content = await file.read()
        
        size_mb = len(content) / (1024 * 1024)
        if size_mb > settings.MAX_IMAGE_SIZE_MB:
            raise ValueError(f"Image size {size_mb:.2f}MB exceeds limit of {settings.MAX_IMAGE_SIZE_MB}MB")

        # Load image using PIL
        image_pil = Image.open(io.BytesIO(content))
        if image_pil.mode != "RGB":
            image_pil = image_pil.convert("RGB")
        
        w, h = image_pil.size
        if w > settings.MAX_IMAGE_DIMENSION or h > settings.MAX_IMAGE_DIMENSION:
            logger.warning(f"Image size {w}x{h} exceeds recommended max dimension {settings.MAX_IMAGE_DIMENSION}")

        # Convert to numpy array (RGB format for Ultralytics)
        return np.array(image_pil) 

    async def _run_inference(self, image_np, conf_threshold=None, **kwargs) -> tuple:
        """Shared inference logic following feature-based inference pattern.
        
        Args:
            image_np: Image as numpy array
            conf_threshold: Confidence threshold to override model default
            **kwargs: Arguments to pass to predictor (text, bboxes, etc.)
        """
        
        # Update predictor confidence if specified for inference predictor
        if conf_threshold is not None and hasattr(self.inference_predictor, 'args'):
            self.inference_predictor.args.conf = conf_threshold
            logger.info(f"Set confidence threshold to {conf_threshold}")
        
        # 1. Extract features using feature_predictor (like predictor.set_image())
        # Ultralytics models typically expect BGR format when passed numpy arrays directly
        # because they are built around OpenCV which uses BGR by default
        if image_np.ndim == 3 and image_np.shape[2] == 3:
            logger.info("Converting image from RGB to BGR for Ultralytics predictor")
            image_input = cv2.cvtColor(image_np, cv2.COLOR_RGB2BGR)
        else:
            image_input = image_np
            
        self.feature_predictor.set_image(image_input)
        src_shape = image_np.shape[:2]  # Get image shape (height, width)
        
        # Verify features are extracted
        if not hasattr(self.feature_predictor, 'features') or self.feature_predictor.features is None:
            logger.error("Failed to extract features from image")
            return None, None, [], [], []
        
        # 2. Run inference using inference_predictor reusing features (like predictor2.inference_features)
        try:
            # Extract text or bboxes from kwargs
            text_prompts = kwargs.get('text', None)
            bboxes = kwargs.get('bboxes', None)
            
            if text_prompts is not None:
                logger.info(f"Running feature-based inference with text prompts: {text_prompts}")
                masks, boxes = self.inference_predictor.inference_features(
                    self.feature_predictor.features,
                    src_shape=src_shape,
                    text=text_prompts
                )
            elif bboxes is not None:
                logger.info(f"Running feature-based inference with {len(bboxes)} bounding boxes")
                masks, boxes = self.inference_predictor.inference_features(
                    self.feature_predictor.features,
                    src_shape=src_shape,
                    bboxes=bboxes
                )
            else:
                logger.error("No text prompts or bounding boxes provided")
                return None, None, [], [], []
            
            # Inference result logging
            box_count = 0
            mask_count = 0
            
            if boxes is not None:
                box_count = len(boxes)
                if torch.is_tensor(boxes):
                    logger.info(f"Boxes tensor shape: {boxes.shape}, device: {boxes.device}")
            
            if masks is not None:
                mask_count = len(masks)
                if torch.is_tensor(masks):
                    logger.info(f"Masks tensor shape: {masks.shape}, device: {masks.device}")

            logger.info(f"Feature-based inference successful: {mask_count} masks, {box_count} boxes")
            
        except Exception as e:
            logger.error(f"Feature-based inference failed: {e}", exc_info=True)
            return None, None, [], [], []
        
        boxes_list = []
        scores_list = []
        masks_polygon = []
        masks_tensor = None
        
        # Process masks
        if masks is not None and len(masks) > 0:
            masks_tensor = masks  # Already tensor format from inference_features
            # Convert masks to polygon format
            masks_polygon = masks_to_polygon_data(masks_tensor)
            logger.info(f"Extracted {len(masks_polygon)} mask(s)")
        else:
            logger.warning("No masks found in results")

        # Process boxes - inference_features returns boxes as tensor
        if boxes is not None and len(boxes) > 0:
            boxes_list = boxes.cpu().tolist() if torch.is_tensor(boxes) else boxes.tolist()
            # inference_features doesn't return confidence scores directly
            # Use default confidence based on threshold
            scores_list = [conf_threshold if conf_threshold else settings.SAM3_DEFAULT_THRESHOLD] * len(boxes_list)
            logger.info(f"Extracted {len(boxes_list)} box(es)")
            
            # Log confidence for each detection
            for idx, (box, score) in enumerate(zip(boxes_list, scores_list)):
                logger.info(f"  Detection #{idx+1}: bbox={box}, confidence={score:.4f}")
        else:
            logger.warning("No boxes found in results")

        return None, masks_tensor, boxes_list, scores_list, masks_polygon


    async def inference_text(
        self,
        image_file: UploadFile,
        text_prompt: str,
        threshold: float,
        mask_threshold: float,
        return_visualization: bool = False,
    ) -> dict:
        """Text-based inference."""
        start_time = time.perf_counter()
        image_np = await self._load_image_from_upload(image_file)
        
        # Convert single prompt to list (like test script)
        text_prompts = [text_prompt]
        
        logger.info(f"Running text inference with prompt: '{text_prompt}', threshold: {threshold}")

        result_obj, masks_tensor, boxes, scores, masks_poly = await self._run_inference(
            image_np,
            conf_threshold=threshold,  # Pass threshold to inference
            text=text_prompts
        )

        processing_time_ms = (time.perf_counter() - start_time) * 1000
        num_objects = len(boxes)

        response = {
            "num_objects": num_objects,
            "boxes": boxes,
            "scores": scores,
            "masks": masks_poly,
            "processing_time_ms": round(processing_time_ms, 2),
            "visualization_base64": None,
        }

        if return_visualization and num_objects > 0:
            image_pil = Image.fromarray(image_np)
            viz_bytes = self.visualizer.create_visualization(
                image=image_pil,
                masks=masks_tensor,
                boxes=torch.tensor(boxes) if boxes else None,
                scores=torch.tensor(scores) if scores else None,
            )
            response["visualization_base64"] = base64.b64encode(viz_bytes).decode("utf-8")

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
        """Bounding box inference."""
        start_time = time.perf_counter()
        image_np = await self._load_image_from_upload(image_file)
        
        logger.info(f"Running bbox inference with {len(bounding_boxes)} box(es), threshold: {threshold}")
        
        result_obj, masks_tensor, boxes, scores, masks_poly = await self._run_inference(
            image_np,
            conf_threshold=threshold,  # Pass threshold to inference
            bboxes=bounding_boxes
        )
        
        processing_time_ms = (time.perf_counter() - start_time) * 1000
        num_objects = len(boxes)

        response = {
            "num_objects": num_objects,
            "boxes": boxes,
            "scores": scores,
            "masks": masks_poly,
            "processing_time_ms": round(processing_time_ms, 2),
            "visualization_base64": None,
        }

        if return_visualization and num_objects > 0:
            image_pil = Image.fromarray(image_np)
            viz_bytes = self.visualizer.create_visualization(
                image=image_pil,
                masks=masks_tensor,
                boxes=torch.tensor(boxes) if boxes else None,
                scores=torch.tensor(scores) if scores else None,
            )
            response["visualization_base64"] = base64.b64encode(viz_bytes).decode("utf-8")
            
        return response

    async def inference_batch(
        self,
        image_files: list[UploadFile],
        text_prompts: list[str | None],
        threshold: float,
        mask_threshold: float,
        return_visualizations: bool = False,
    ) -> dict:
        """Batch inference loop."""
        start_time = time.perf_counter()
        
        batch_output = []
        
        for idx, file in enumerate(image_files):
             prompt = text_prompts[idx] if idx < len(text_prompts) else ""
             
             # Call inference_text directly as it handles logic
             # This is inefficient compared to true batching but ensures logic reuse
             res = await self.inference_text(
                 file, 
                 prompt if prompt else "everything", 
                 threshold, 
                 mask_threshold, 
                 return_visualization=return_visualizations
             )
             
             batch_output.append({
                 "image_index": idx,
                 "num_objects": res["num_objects"],
                 "boxes": res["boxes"],
                 "scores": res["scores"],
                 "masks": res["masks"],
                 "visualization_base64": res["visualization_base64"],
             })
             
        total_time_ms = (time.perf_counter() - start_time) * 1000
        
        response = {
            "total_images": len(image_files),
            "results": batch_output,
            "total_processing_time_ms": round(total_time_ms, 2),
            "average_time_per_image_ms": round(total_time_ms / len(image_files), 2) if image_files else 0
        }
            
        return response
