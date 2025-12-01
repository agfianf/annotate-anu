"""Payload schemas for inference proxy."""

from pydantic import BaseModel, Field


class BaseInferencePayload(BaseModel):
    """Base payload for all inference types."""

    model_id: str = Field(..., description="Model ID (uuid or 'sam3' for builtin)")
    threshold: float = Field(default=0.5, ge=0.0, le=1.0, description="Detection confidence threshold")
    mask_threshold: float = Field(default=0.5, ge=0.0, le=1.0, description="Mask generation threshold")
    return_visualization: bool = Field(default=False, description="Generate visualization image")


class TextPromptPayload(BaseInferencePayload):
    """Payload for text prompt inference."""

    text_prompt: str = Field(..., min_length=1, description="Text description of objects to segment")


class BboxPromptPayload(BaseInferencePayload):
    """Payload for bounding box prompt inference."""

    bounding_boxes: list[list[float]] = Field(
        ...,
        description="List of [x1, y1, x2, y2, label] arrays where label is 1 (positive) or 0 (negative)",
    )


class AutoDetectPayload(BaseInferencePayload):
    """Payload for auto-detection inference."""

    class_filter: list[str] | None = Field(
        default=None,
        description="Optional list of classes to detect",
    )
