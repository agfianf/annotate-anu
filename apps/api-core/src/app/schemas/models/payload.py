"""Payload schemas for creating and updating models."""

from pydantic import BaseModel, Field, HttpUrl

from app.schemas.models.base import ModelCapabilities


class ResponseMapping(BaseModel):
    """Map external API response fields to standard format.

    Use this to configure how fields from external model APIs
    map to the standardized inference response format.
    """

    boxes_field: str = Field(
        default="boxes",
        description="JSON path to bounding boxes (e.g., 'predictions.boxes' or 'detections')",
    )
    scores_field: str = Field(
        default="scores",
        description="JSON path to confidence scores (e.g., 'predictions.confidence')",
    )
    masks_field: str | None = Field(
        default="masks",
        description="JSON path to segmentation masks (null if not supported)",
    )
    labels_field: str | None = Field(
        default="labels",
        description="JSON path to class labels (e.g., 'class_names')",
    )
    num_objects_field: str | None = Field(
        default=None,
        description="JSON path to object count (computed from boxes if null)",
    )


class EndpointConfig(BaseModel):
    """Configurable endpoint mapping for BYOM models.

    Use this to customize how requests are made to external model APIs
    and how their responses are parsed.
    """

    inference_path: str = Field(
        default="/inference",
        description="Path to inference endpoint (appended to endpoint_url)",
    )
    response_mapping: ResponseMapping | None = Field(
        default=None,
        description="Custom response field mapping (uses defaults if null)",
    )


class ModelCreatePayload(BaseModel):
    """Payload for creating a new model."""

    name: str = Field(
        ...,
        min_length=1,
        max_length=100,
        description="Unique display name for the model"
    )
    endpoint_url: HttpUrl = Field(
        ...,
        description="Base URL of the external model API"
    )
    auth_token: str | None = Field(
        default=None,
        description="Bearer token for authentication (optional)"
    )
    description: str | None = Field(
        default=None,
        max_length=500,
        description="Optional description of the model"
    )
    capabilities: ModelCapabilities | None = Field(
        default=None,
        description="Model capabilities (auto-detected if not provided)"
    )
    endpoint_config: EndpointConfig | None = Field(
        default=None,
        description="Custom endpoint configuration for non-standard APIs"
    )

    def transform(self) -> dict:
        """Transform payload for database insertion.

        Returns
        -------
        dict
            Transformed payload ready for database
        """
        data = self.model_dump(exclude_none=True)
        # Convert HttpUrl to string
        if "endpoint_url" in data:
            data["endpoint_url"] = str(data["endpoint_url"])
        # Convert capabilities to dict
        if "capabilities" in data and isinstance(data["capabilities"], ModelCapabilities):
            data["capabilities"] = data["capabilities"].model_dump()
        # Convert endpoint_config to dict
        if "endpoint_config" in data and isinstance(data["endpoint_config"], EndpointConfig):
            data["endpoint_config"] = data["endpoint_config"].model_dump()
        return data

    model_config = {"json_schema_extra": {
        "example": {
            "name": "YOLOv8 Traffic Detection",
            "endpoint_url": "https://my-yolo-api.com",
            "auth_token": "bearer_token_here",
            "description": "Custom YOLOv8 model trained on traffic scenes",
            "capabilities": {
                "supports_text_prompt": False,
                "supports_bbox_prompt": False,
                "supports_auto_detect": True,
                "supports_class_filter": True,
                "output_types": ["bbox", "polygon"],
                "classes": ["car", "truck", "person", "bicycle"]
            },
            "endpoint_config": {
                "inference_path": "/v1/detect",
                "response_mapping": {
                    "boxes_field": "predictions.boxes",
                    "scores_field": "predictions.confidence",
                    "labels_field": "predictions.class_names"
                }
            }
        }
    }}


class ModelUpdatePayload(BaseModel):
    """Payload for updating an existing model."""

    name: str | None = Field(default=None, min_length=1, max_length=100)
    endpoint_url: HttpUrl | None = Field(default=None)
    auth_token: str | None = Field(default=None)
    description: str | None = Field(default=None, max_length=500)
    capabilities: ModelCapabilities | None = Field(default=None)
    endpoint_config: EndpointConfig | None = Field(default=None)
    is_active: bool | None = Field(default=None)

    def transform(self) -> dict:
        """Transform payload for database update.

        Returns
        -------
        dict
            Transformed payload ready for database
        """
        data = self.model_dump(exclude_none=True)
        # Convert HttpUrl to string
        if "endpoint_url" in data:
            data["endpoint_url"] = str(data["endpoint_url"])
        # Convert capabilities to dict
        if "capabilities" in data and isinstance(data["capabilities"], ModelCapabilities):
            data["capabilities"] = data["capabilities"].model_dump()
        # Convert endpoint_config to dict
        if "endpoint_config" in data and isinstance(data["endpoint_config"], EndpointConfig):
            data["endpoint_config"] = data["endpoint_config"].model_dump()
        return data
