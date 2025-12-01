"""Response schemas for model endpoints."""

from datetime import datetime

from pydantic import BaseModel, Field

from app.schemas.models.base import ModelBase, ModelCapabilities


class ModelResponse(BaseModel):
    """Public response containing model information (without auth_token)."""

    id: str = Field(..., description="Unique model identifier")
    name: str = Field(..., description="Model display name")
    endpoint_url: str = Field(..., description="Model endpoint URL")
    capabilities: ModelCapabilities | None = Field(
        default=None,
        description="Model capabilities"
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


class ModelListResponse(BaseModel):
    """Response containing list of models."""

    models: list[ModelResponse] = Field(..., description="List of registered models")
    total: int = Field(..., description="Total number of models")


class ModelHealthResponse(BaseModel):
    """Response from health check."""

    model_id: str = Field(..., description="Model identifier")
    is_healthy: bool = Field(..., description="Whether model is healthy")
    status_message: str = Field(..., description="Status message from health check")
    response_time_ms: float | None = Field(
        default=None,
        description="Response time in milliseconds"
    )
    checked_at: datetime = Field(..., description="When health check was performed")


class ExternalHealthResponse(BaseModel):
    """Expected health response from external model."""

    status: str = Field(..., description="Health status (healthy, degraded, unhealthy)")
    model_name: str | None = Field(default=None, description="Model name")
    version: str | None = Field(default=None, description="Model version")


class ExternalCapabilitiesResponse(BaseModel):
    """Expected capabilities response from external model."""

    model_id: str = Field(..., description="Model identifier")
    name: str = Field(..., description="Model name")
    capabilities: ModelCapabilities = Field(..., description="Model capabilities")
