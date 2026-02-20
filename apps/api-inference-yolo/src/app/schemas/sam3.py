"""Pydantic schemas for SAM3 API requests and responses."""

from pydantic import BaseModel, Field


class BoundingBoxInput(BaseModel):
    """Bounding box input coordinates."""

    x1: int = Field(..., description="Top-left x coordinate")
    y1: int = Field(..., description="Top-left y coordinate")
    x2: int = Field(..., description="Bottom-right x coordinate")
    y2: int = Field(..., description="Bottom-right y coordinate")
    label: int = Field(1, description="Box label: 1=positive (include), 0=negative (exclude)")


class BoundingBoxResult(BaseModel):
    """Bounding box result coordinates."""

    x1: float = Field(..., description="Top-left x coordinate")
    y1: float = Field(..., description="Top-left y coordinate")
    x2: float = Field(..., description="Bottom-right x coordinate")
    y2: float = Field(..., description="Bottom-right y coordinate")


class DetectedObject(BaseModel):
    """Single detected object with box and score."""

    object_id: int = Field(..., description="Object index")
    score: float = Field(..., description="Confidence score")
    bounding_box: list[float] = Field(..., description="Bounding box coordinates [x1, y1, x2, y2]")


class MaskPolygon(BaseModel):
    """Polygon representation of a segmentation mask."""

    polygons: list[list[list[float]]] = Field(
        ...,
        description="List of polygons, where each polygon is a list of [x, y] coordinate pairs. "
        "Multiple polygons represent disconnected regions or holes in the mask.",
    )
    area: float = Field(..., description="Total pixel area of the mask")


class InferenceResult(BaseModel):
    """Inference result for single image."""

    num_objects: int = Field(..., description="Number of detected objects")
    boxes: list[list[float]] = Field(..., description="List of bounding boxes [[x1, y1, x2, y2], ...]")
    scores: list[float] = Field(..., description="Confidence scores for each detection")
    masks: list[MaskPolygon] = Field(..., description="Polygon coordinates for each detected object's mask")
    processing_time_ms: float = Field(..., description="Processing time in milliseconds")
    visualization_base64: str | None = Field(default=None, description="Base64-encoded visualization image (optional)")


class BatchImageResult(BaseModel):
    """Result for single image in batch processing."""

    image_index: int = Field(..., description="Index of image in batch")
    num_objects: int = Field(..., description="Number of detected objects")
    boxes: list[list[float]] = Field(..., description="List of bounding boxes")
    scores: list[float] = Field(..., description="Confidence scores")
    masks: list[MaskPolygon] = Field(..., description="Polygon coordinates for each detected object's mask")
    visualization_base64: str | None = Field(default=None, description="Base64-encoded visualization (optional)")


class BatchInferenceResult(BaseModel):
    """Batch inference results."""

    total_images: int = Field(..., description="Total number of images processed")
    results: list[BatchImageResult] = Field(..., description="Results for each image")
    total_processing_time_ms: float = Field(..., description="Total processing time")
    average_time_per_image_ms: float = Field(..., description="Average time per image")


# Form request models (used with multipart/form-data)
class TextInferenceParams(BaseModel):
    """Parameters for text inference (form data)."""

    text_prompt: str = Field(..., description="Text description of objects to segment")
    threshold: float = Field(0.5, ge=0.0, le=1.0, description="Detection confidence threshold")
    mask_threshold: float = Field(0.5, ge=0.0, le=1.0, description="Mask generation threshold")
    return_visualization: bool = Field(False, description="Whether to generate visualization image")


class BboxInferenceParams(BaseModel):
    """Parameters for bbox inference (form data)."""

    bounding_boxes: str = Field(..., description="JSON string of bounding boxes: [[x1,y1,x2,y2,label], ...]")
    threshold: float = Field(0.5, ge=0.0, le=1.0, description="Detection confidence threshold")
    mask_threshold: float = Field(0.5, ge=0.0, le=1.0, description="Mask generation threshold")
    return_visualization: bool = Field(False, description="Whether to generate visualization image")
