"""Model server router.

Authenticated proxy in front of the local model server, which serves Ultralytics/YOLO
.pt weights and has no authentication of its own. Uploaded weights are unpickled by
Ultralytics, so reaching these endpoints must require a logged-in user.

Inference is not proxied here: api-core calls the model server directly through the
BYOM registry, using the endpoint URL recorded when the model was registered.
"""

from typing import Annotated

from fastapi import APIRouter, Depends, File, UploadFile
from pydantic import BaseModel, Field

from app.dependencies.auth import get_current_active_user
from app.helpers.response_api import JsonResponse
from app.schemas.auth import UserBase
from app.services.model_server import ModelServerService

router = APIRouter(prefix="/api/v1/model-server", tags=["Model Server"])

model_server_service = ModelServerService()


class HealthData(BaseModel):
    """Model server health."""

    status: str = Field(..., description="Health status reported by the model server")
    models_dir: str = Field(..., description="Directory the weights are served from")
    models: int = Field(..., description="Number of .pt files available")


class ServerModel(BaseModel):
    """One .pt weight file on the model server."""

    name: str = Field(..., description="Model name, the filename without .pt")
    size_bytes: int = Field(..., description="File size in bytes")
    loaded: bool = Field(..., description="Whether the weights are loaded in memory")
    task: str | None = Field(None, description="Ultralytics task (detect, segment, classify)")
    classes: list[str] | None = Field(None, description="Class names the model predicts")


class ModelListData(BaseModel):
    """Available models on the model server."""

    models: list[ServerModel] = Field(..., description="Available models")
    models_dir: str = Field(..., description="Directory the weights are served from")


class UploadedModelData(BaseModel):
    """Result of uploading a weight file."""

    name: str = Field(..., description="Model name, the filename without .pt")
    size_bytes: int = Field(..., description="Uploaded size in bytes")
    task: str = Field(..., description="Ultralytics task detected from the weights")
    classes: list[str] = Field(..., description="Class names the model predicts")
    endpoint_url: str = Field(..., description="Path the model is served at")


class ModelInfoData(BaseModel):
    """Task and classes for one model."""

    name: str = Field(..., description="Model name")
    task: str = Field(..., description="Ultralytics task")
    classes: list[str] = Field(..., description="Class names the model predicts")


class DeletedModelData(BaseModel):
    """Result of deleting a weight file."""

    deleted: str = Field(..., description="Name of the deleted model")


@router.get("/health", response_model=JsonResponse[HealthData, None])
async def model_server_health(
    current_user: Annotated[UserBase, Depends(get_current_active_user)],
) -> JsonResponse[HealthData, None]:
    """Check whether the model server is reachable."""
    result = await model_server_service.health()

    return JsonResponse(
        data=HealthData(**result),
        message="Model server is healthy",
        success=True,
        status_code=200,
    )


@router.get("/models", response_model=JsonResponse[ModelListData, None])
async def list_models(
    current_user: Annotated[UserBase, Depends(get_current_active_user)],
) -> JsonResponse[ModelListData, None]:
    """List the .pt weights available on the model server."""
    result = await model_server_service.list_models()

    return JsonResponse(
        data=ModelListData(**result),
        message="Models retrieved successfully",
        success=True,
        status_code=200,
    )


@router.post("/models/upload", response_model=JsonResponse[UploadedModelData, None])
async def upload_model(
    current_user: Annotated[UserBase, Depends(get_current_active_user)],
    file: Annotated[UploadFile, File(description="Ultralytics/YOLO .pt weight file")],
) -> JsonResponse[UploadedModelData, None]:
    """Upload a .pt weight file to the model server.

    The upstream rejects anything that is not a .pt file and loads the weights to
    report the task and class names.
    """
    result = await model_server_service.upload_model(file)

    return JsonResponse(
        data=UploadedModelData(**result),
        message=f"Model '{result['name']}' uploaded successfully",
        success=True,
        status_code=200,
    )


@router.get("/models/{name}/info", response_model=JsonResponse[ModelInfoData, None])
async def model_info(
    name: str,
    current_user: Annotated[UserBase, Depends(get_current_active_user)],
) -> JsonResponse[ModelInfoData, None]:
    """Get the task and class names for one model."""
    result = await model_server_service.model_info(name)

    return JsonResponse(
        data=ModelInfoData(**result),
        message="Model info retrieved successfully",
        success=True,
        status_code=200,
    )


@router.delete("/models/{name}", response_model=JsonResponse[DeletedModelData, None])
async def delete_model(
    name: str,
    current_user: Annotated[UserBase, Depends(get_current_active_user)],
) -> JsonResponse[DeletedModelData, None]:
    """Delete one model's weights from the model server."""
    result = await model_server_service.delete_model(name)

    return JsonResponse(
        data=DeletedModelData(**result),
        message=f"Model '{result['deleted']}' deleted successfully",
        success=True,
        status_code=200,
    )
