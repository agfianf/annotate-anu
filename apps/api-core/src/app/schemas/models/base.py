"""Base schema for models with all database fields."""

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class ModelCapabilities(BaseModel):
    """Model capabilities declaration."""

    supports_text_prompt: bool = Field(
        default=False,
        description="Whether model supports text prompt segmentation"
    )
    supports_bbox_prompt: bool = Field(
        default=False,
        description="Whether model supports bounding box prompt segmentation"
    )
    supports_auto_detect: bool = Field(
        default=False,
        description="Whether model supports automatic detection without prompts"
    )
    supports_class_filter: bool = Field(
        default=False,
        description="Whether model supports filtering by class names"
    )
    supports_classification: bool = Field(
        default=False,
        description="Whether model supports image classification (whole-image labels)"
    )
    output_types: list[str] = Field(
        default=["bbox"],
        description="Output types supported (bbox, polygon, mask)"
    )
    classes: list[str] | None = Field(
        default=None,
        description="List of class names the model can detect"
    )
    is_mock: bool = Field(
        default=False,
        description="Whether model uses local mock instead of external API"
    )


class ModelBase(BaseModel):
    """Model with all database fields from the registered_models table."""

    id: str = Field(..., description="Unique model identifier")
    name: str = Field(..., description="Model display name")
    endpoint_url: str = Field(..., description="Model endpoint URL")
    auth_token: str | None = Field(default=None, description="Bearer token (not exposed in responses)")
    capabilities: ModelCapabilities | None = Field(
        default=None,
        description="Model capabilities"
    )
    endpoint_config: dict[str, Any] | None = Field(
        default=None,
        description="Custom endpoint configuration"
    )
    description: str | None = Field(default=None, description="Model description")
    is_active: bool = Field(..., description="Whether model is active")
    is_healthy: bool = Field(..., description="Last health check result")
    last_health_check: datetime | None = Field(
        default=None,
        description="Timestamp of last health check"
    )
    created_at: datetime = Field(..., description="Creation timestamp")
    updated_at: datetime = Field(..., description="Last update timestamp")

    model_config = {"from_attributes": True}
