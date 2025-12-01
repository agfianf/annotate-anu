"""Response schemas for inference proxy."""

from pydantic import BaseModel, Field


class MaskPolygon(BaseModel):
    """Polygon representation of segmentation mask."""

    polygons: list[list[list[float]]] = Field(
        ...,
        description="List of polygons as [x,y] coordinate arrays",
    )
    area: float = Field(..., description="Mask area in pixels")


class InferenceResponse(BaseModel):
    """Unified inference response format.

    This is the standardized response format that all inference endpoints return,
    regardless of the underlying model type (SAM3, YOLO, etc.).
    """

    num_objects: int = Field(..., description="Number of detected objects")
    boxes: list[list[float]] = Field(
        ...,
        description="Bounding boxes [[x1, y1, x2, y2], ...]",
    )
    scores: list[float] = Field(..., description="Confidence scores per object")
    masks: list[MaskPolygon] = Field(
        ...,
        description="Segmentation masks as polygons (empty list for detection-only models)",
    )
    labels: list[str] | None = Field(
        default=None,
        description="Detected class labels (for detection models)",
    )
    processing_time_ms: float = Field(..., description="Processing time in milliseconds")
    visualization_base64: str | None = Field(
        default=None,
        description="Base64 encoded visualization image",
    )
