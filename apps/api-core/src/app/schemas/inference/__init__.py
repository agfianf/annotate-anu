"""Inference proxy schemas."""

from app.schemas.inference.payload import (
    AutoDetectPayload,
    BboxPromptPayload,
    TextPromptPayload,
)
from app.schemas.inference.response import (
    InferenceResponse,
    MaskPolygon,
)

__all__ = [
    "AutoDetectPayload",
    "BboxPromptPayload",
    "TextPromptPayload",
    "InferenceResponse",
    "MaskPolygon",
]
