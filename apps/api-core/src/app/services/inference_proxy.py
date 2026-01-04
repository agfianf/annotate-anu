"""Service for proxying inference requests to model backends."""

import json
import time

import httpx

from app.helpers.logger import logger
from app.schemas.inference.response import InferenceResponse, MaskPolygon
from app.schemas.models.base import ModelBase


class InferenceProxyService:
    """Proxy inference requests to backend models.

    This service routes inference requests to either:
    - The built-in SAM3 API (api-inference)
    - External BYOM model endpoints

    All responses are normalized to the standard InferenceResponse format.
    """

    def __init__(self, sam3_url: str):
        """Initialize with SAM3 API URL.

        Parameters
        ----------
        sam3_url : str
            URL of the SAM3 API inference service
        """
        self.sam3_url = sam3_url.rstrip("/")
        self.timeout = 120.0  # 2 minutes for model inference

    async def text_prompt(
        self,
        model: ModelBase,
        image_bytes: bytes,
        image_filename: str,
        image_content_type: str,
        text_prompt: str,
        threshold: float,
        mask_threshold: float,
        simplify_tolerance: float,
        return_visualization: bool,
    ) -> InferenceResponse:
        """Proxy text prompt inference.

        Parameters
        ----------
        model : ModelBase
            Model to use for inference (includes endpoint_url for BYOM)
        image_bytes : bytes
            Image file bytes
        image_filename : str
            Original filename
        image_content_type : str
            MIME type of the image
        text_prompt : str
            Text description of objects to segment
        threshold : float
            Detection confidence threshold
        mask_threshold : float
            Mask generation threshold
        return_visualization : bool
            Whether to return visualization image

        Returns
        -------
        InferenceResponse
            Standardized inference response
        """
        if model.id == "sam3":
            return await self._sam3_text_prompt(
                image_bytes, image_filename, image_content_type,
                text_prompt, threshold, mask_threshold, simplify_tolerance, return_visualization
            )
        else:
            return await self._byom_inference(
                model,
                image_bytes,
                image_filename,
                image_content_type,
                "text",
                text_prompt=text_prompt,
                threshold=threshold,
                mask_threshold=mask_threshold,
                simplify_tolerance=simplify_tolerance,
                return_visualization=return_visualization,
            )

    async def bbox_prompt(
        self,
        model: ModelBase,
        image_bytes: bytes,
        image_filename: str,
        image_content_type: str,
        bounding_boxes: list[list[float]],
        threshold: float,
        mask_threshold: float,
        simplify_tolerance: float,
        return_visualization: bool,
    ) -> InferenceResponse:
        """Proxy bounding box prompt inference.

        Parameters
        ----------
        model : ModelBase
            Model to use for inference
        image_bytes : bytes
            Image file bytes
        image_filename : str
            Original filename
        image_content_type : str
            MIME type of the image
        bounding_boxes : list[list[float]]
            List of [x1, y1, x2, y2, label] bounding boxes
        threshold : float
            Detection confidence threshold
        mask_threshold : float
            Mask generation threshold
        return_visualization : bool
            Whether to return visualization image

        Returns
        -------
        InferenceResponse
            Standardized inference response
        """
        if model.id == "sam3":
            return await self._sam3_bbox_prompt(
                image_bytes, image_filename, image_content_type,
                bounding_boxes, threshold, mask_threshold, simplify_tolerance, return_visualization
            )
        else:
            return await self._byom_inference(
                model,
                image_bytes,
                image_filename,
                image_content_type,
                "bbox",
                bounding_boxes=bounding_boxes,
                threshold=threshold,
                mask_threshold=mask_threshold,
                simplify_tolerance=simplify_tolerance,
                return_visualization=return_visualization,
            )

    async def auto_detect(
        self,
        model: ModelBase,
        image_bytes: bytes,
        image_filename: str,
        image_content_type: str,
        threshold: float,
        class_filter: list[str] | None,
        return_visualization: bool,
    ) -> InferenceResponse:
        """Proxy auto-detection inference (BYOM only).

        Parameters
        ----------
        model : ModelBase
            Model to use for inference
        image_bytes : bytes
            Image file bytes
        image_filename : str
            Original filename
        image_content_type : str
            MIME type of the image
        threshold : float
            Detection confidence threshold
        class_filter : list[str] | None
            Optional list of classes to filter
        return_visualization : bool
            Whether to return visualization image

        Returns
        -------
        InferenceResponse
            Standardized inference response

        Raises
        ------
        ValueError
            If SAM3 model is used (doesn't support auto-detection)
        """
        if model.id == "sam3":
            raise ValueError("SAM3 does not support auto-detection")

        return await self._byom_inference(
            model,
            image_bytes,
            image_filename,
            image_content_type,
            "auto",
            threshold=threshold,
            class_filter=class_filter,
            return_visualization=return_visualization,
        )

    async def _sam3_text_prompt(
        self,
        image_bytes: bytes,
        image_filename: str,
        image_content_type: str,
        text_prompt: str,
        threshold: float,
        mask_threshold: float,
        simplify_tolerance: float,
        return_visualization: bool,
    ) -> InferenceResponse:
        """Call SAM3 text prompt endpoint.

        Parameters
        ----------
        image_bytes : bytes
            Image file bytes
        image_filename : str
            Original filename
        image_content_type : str
            MIME type
        text_prompt : str
            Text description
        threshold : float
            Detection threshold
        mask_threshold : float
            Mask threshold
        return_visualization : bool
            Return visualization

        Returns
        -------
        InferenceResponse
            Normalized response
        """
        url = f"{self.sam3_url}/api/v1/sam3/inference/text"

        logger.info(f"Proxying text: image size={len(image_bytes)} bytes, filename={image_filename}")

        files = {"image": (image_filename, image_bytes, image_content_type)}
        data = {
            "text_prompt": text_prompt,
            "threshold": str(threshold),
            "mask_threshold": str(mask_threshold),
            "simplify_tolerance": str(simplify_tolerance),
            "return_visualization": str(return_visualization).lower(),
        }

        logger.info(f"Proxying text prompt to SAM3: {url}")
        start_time = time.time()

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await client.post(url, files=files, data=data)
            response.raise_for_status()

        elapsed_ms = (time.time() - start_time) * 1000
        logger.info(f"SAM3 text prompt completed in {elapsed_ms:.0f}ms")

        result = response.json()["data"]
        return self._normalize_sam3_response(result)

    async def _sam3_bbox_prompt(
        self,
        image_bytes: bytes,
        image_filename: str,
        image_content_type: str,
        bounding_boxes: list[list[float]],
        threshold: float,
        mask_threshold: float,
        simplify_tolerance: float,
        return_visualization: bool,
    ) -> InferenceResponse:
        """Call SAM3 bbox prompt endpoint.

        Parameters
        ----------
        image_bytes : bytes
            Image file bytes
        image_filename : str
            Original filename
        image_content_type : str
            MIME type
        bounding_boxes : list[list[float]]
            Bounding boxes
        threshold : float
            Detection threshold
        mask_threshold : float
            Mask threshold
        return_visualization : bool
            Return visualization

        Returns
        -------
        InferenceResponse
            Normalized response
        """
        url = f"{self.sam3_url}/api/v1/sam3/inference/bbox"

        logger.info(f"Proxying bbox: image size={len(image_bytes)} bytes, filename={image_filename}")

        files = {"image": (image_filename, image_bytes, image_content_type)}
        data = {
            "bounding_boxes": json.dumps(bounding_boxes),
            "threshold": str(threshold),
            "mask_threshold": str(mask_threshold),
            "simplify_tolerance": str(simplify_tolerance),
            "return_visualization": str(return_visualization).lower(),
        }

        logger.info(f"Proxying bbox prompt to SAM3: {url}")
        start_time = time.time()

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await client.post(url, files=files, data=data)
            response.raise_for_status()

        elapsed_ms = (time.time() - start_time) * 1000
        logger.info(f"SAM3 bbox prompt completed in {elapsed_ms:.0f}ms")

        result = response.json()["data"]
        return self._normalize_sam3_response(result)

    async def _byom_inference(
        self,
        model: ModelBase,
        image_bytes: bytes,
        image_filename: str,
        image_content_type: str,
        mode: str,
        **params,
    ) -> InferenceResponse:
        """Call external BYOM model endpoint.

        Parameters
        ----------
        model : ModelBase
            BYOM model configuration
        image_bytes : bytes
            Image file bytes
        image_filename : str
            Original filename
        image_content_type : str
            MIME type
        mode : str
            Inference mode ('text', 'bbox', 'auto')
        **params
            Mode-specific parameters

        Returns
        -------
        InferenceResponse
            Normalized response
        """
        # Get custom endpoint path from config, default to /inference
        inference_path = "/inference"
        response_mapping = None
        if model.endpoint_config:
            inference_path = model.endpoint_config.get("inference_path", "/inference")
            response_mapping = model.endpoint_config.get("response_mapping")

        url = f"{model.endpoint_url.rstrip('/')}{inference_path}"

        logger.info(f"Proxying BYOM: image size={len(image_bytes)} bytes, filename={image_filename}")

        headers = {}
        if model.auth_token:
            headers["Authorization"] = f"Bearer {model.auth_token}"

        files = {"image": (image_filename, image_bytes, image_content_type)}
        data = {"mode": mode}

        # Add mode-specific params
        for key, value in params.items():
            if value is not None:
                if isinstance(value, (list, dict)):
                    data[key] = json.dumps(value)
                elif isinstance(value, bool):
                    data[key] = str(value).lower()
                else:
                    data[key] = str(value)

        logger.info(f"Proxying {mode} inference to BYOM: {url}")
        start_time = time.time()

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await client.post(url, files=files, data=data, headers=headers)
            response.raise_for_status()

        elapsed_ms = (time.time() - start_time) * 1000
        logger.info(f"BYOM {mode} inference completed in {elapsed_ms:.0f}ms")

        result = response.json()
        # Handle both wrapped and unwrapped responses
        if "data" in result:
            result = result["data"]

        return self._normalize_byom_response(result, response_mapping)

    def _normalize_sam3_response(self, data: dict) -> InferenceResponse:
        """Normalize SAM3 response to standard format.

        Parameters
        ----------
        data : dict
            Raw SAM3 API response data

        Returns
        -------
        InferenceResponse
            Standardized response
        """
        return InferenceResponse(
            num_objects=data["num_objects"],
            boxes=data["boxes"],
            scores=data["scores"],
            masks=[
                MaskPolygon(polygons=m["polygons"], area=m["area"]) for m in data["masks"]
            ],
            labels=None,  # SAM3 doesn't return class labels
            processing_time_ms=data["processing_time_ms"],
            visualization_base64=data.get("visualization_base64"),
        )

    def _get_nested_value(self, data: dict, path: str):
        """Get value from nested dict using dot-notation path.

        Parameters
        ----------
        data : dict
            Data dictionary
        path : str
            Dot-separated path (e.g., 'predictions.boxes')

        Returns
        -------
        Any
            Value at path or None if not found
        """
        parts = path.split(".")
        current = data
        for part in parts:
            if isinstance(current, dict) and part in current:
                current = current[part]
            else:
                return None
        return current

    def _normalize_byom_response(
        self, data: dict, response_mapping: dict | None = None
    ) -> InferenceResponse:
        """Normalize BYOM response to standard format.

        Parameters
        ----------
        data : dict
            Raw BYOM API response data
        response_mapping : dict | None
            Custom field mapping configuration

        Returns
        -------
        InferenceResponse
            Standardized response
        """
        # Use custom mapping or defaults
        mapping = response_mapping or {}
        boxes_field = mapping.get("boxes_field", "boxes")
        scores_field = mapping.get("scores_field", "scores")
        masks_field = mapping.get("masks_field", "masks")
        labels_field = mapping.get("labels_field", "labels")
        num_objects_field = mapping.get("num_objects_field")

        # Extract values using field mapping (supports dot notation)
        boxes = self._get_nested_value(data, boxes_field) or []
        scores = self._get_nested_value(data, scores_field) or []
        raw_masks = self._get_nested_value(data, masks_field) if masks_field else None
        labels = self._get_nested_value(data, labels_field) if labels_field else None
        num_objects = (
            self._get_nested_value(data, num_objects_field)
            if num_objects_field
            else len(boxes)
        )

        # Process masks
        masks = []
        if raw_masks:
            for m in raw_masks:
                if isinstance(m, dict):
                    masks.append(
                        MaskPolygon(
                            polygons=m.get("polygons", []), area=m.get("area", 0)
                        )
                    )
                else:
                    # Handle bare polygon arrays
                    masks.append(MaskPolygon(polygons=[m], area=0))

        return InferenceResponse(
            num_objects=num_objects,
            boxes=boxes,
            scores=scores,
            masks=masks,
            labels=labels,
            processing_time_ms=data.get("processing_time_ms", 0),
            visualization_base64=data.get("visualization_base64"),
        )
