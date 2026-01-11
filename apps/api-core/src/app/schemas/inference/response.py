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


class ClassPrediction(BaseModel):
    """Single class prediction with probability."""

    class_name: str = Field(..., description="Predicted class name")
    probability: float = Field(
        ...,
        ge=0.0,
        le=1.0,
        description="Prediction probability (0.0-1.0)",
    )


class ClassificationResponse(BaseModel):
    """Response for image classification inference.

    Unlike detection/segmentation which produces spatial outputs (boxes, masks),
    classification produces whole-image labels with probability distributions.
    """

    predicted_class: str = Field(..., description="Top predicted class name")
    confidence: float = Field(
        ...,
        ge=0.0,
        le=1.0,
        description="Confidence of top prediction (0.0-1.0)",
    )
    top_k_predictions: list[ClassPrediction] = Field(
        ...,
        description="Top-k class predictions with probabilities",
    )
    class_probabilities: dict[str, float] = Field(
        default_factory=dict,
        description="Full probability distribution over all classes (optional)",
    )
    processing_time_ms: float = Field(..., description="Processing time in milliseconds")
    model_id: str = Field(..., description="ID of model that produced the result")
