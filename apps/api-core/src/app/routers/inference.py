"""Router for inference proxy endpoints."""

import json
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncConnection

from app.dependencies.database import get_async_conn
from app.helpers.logger import logger
from app.helpers.response_api import JsonResponse
from app.repositories.models import ModelAsyncRepositories
from app.schemas.inference.response import InferenceResponse
from app.schemas.models.base import ModelBase, ModelCapabilities
from app.services.inference_proxy import InferenceProxyService

router = APIRouter(prefix="/api/v1/inference", tags=["Inference Proxy"])


def _get_sam3_model(sam3_url: str) -> ModelBase:
    """Create pseudo-model for built-in SAM3.

    Parameters
    ----------
    sam3_url : str
        SAM3 API URL

    Returns
    -------
    ModelBase
        SAM3 model configuration
    """
    now = datetime.now()
    return ModelBase(
        id="sam3",
        name="SAM3 (Built-in)",
        endpoint_url=sam3_url,
        auth_token=None,
        capabilities=ModelCapabilities(
            supports_text_prompt=True,
            supports_bbox_prompt=True,
            supports_auto_detect=False,
            supports_class_filter=False,
            output_types=["polygon"],
        ),
        description="Segment Anything Model 3 - Built-in segmentation model",
        is_active=True,
        is_healthy=True,
        last_health_check=now,
        created_at=now,
        updated_at=now,
    )


async def get_model_by_id(
    model_id: str,
    request: Request,
    connection: AsyncConnection,
) -> ModelBase:
    """Get model by ID or return SAM3 builtin.

    Parameters
    ----------
    model_id : str
        Model identifier ('sam3' or UUID)
    request : Request
        FastAPI request with state
    connection : AsyncConnection
        Database connection

    Returns
    -------
    ModelBase
        Model configuration

    Raises
    ------
    HTTPException
        If model not found or inactive
    """
    if model_id == "sam3":
        proxy: InferenceProxyService = request.state.inference_proxy
        return _get_sam3_model(proxy.sam3_url)

    # Get from database
    try:
        model = await ModelAsyncRepositories.get_by_id(connection, model_id)
        if not model.is_active:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Model {model.name} is not active",
            )
        return model
    except Exception as e:
        logger.error(f"Failed to get model {model_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Model not found: {model_id}",
        )


@router.post("/text", response_model=JsonResponse[InferenceResponse, None])
async def inference_text(
    request: Request,
    image: UploadFile = File(..., description="Image file to process"),
    model_id: str = Form(..., description="Model ID ('sam3' or UUID)"),
    text_prompt: str = Form(..., description="Text description of objects to segment"),
    threshold: float = Form(0.5, ge=0.0, le=1.0, description="Detection confidence threshold"),
    mask_threshold: float = Form(0.5, ge=0.0, le=1.0, description="Mask generation threshold"),
    return_visualization: bool = Form(False, description="Return visualization image"),
    connection: Annotated[AsyncConnection, Depends(get_async_conn)] = None,
):
    """Proxy text prompt inference to model backend.

    This endpoint accepts a text description and returns segmentation masks
    for objects matching the description.

    Parameters
    ----------
    request : Request
        FastAPI request
    image : UploadFile
        Image file to process
    model_id : str
        Model ID ('sam3' for built-in, or UUID for BYOM)
    text_prompt : str
        Text description of objects
    threshold : float
        Detection confidence threshold (0.0-1.0)
    mask_threshold : float
        Mask generation threshold (0.0-1.0)
    return_visualization : bool
        Whether to return visualization image
    connection : AsyncConnection
        Database connection

    Returns
    -------
    JsonResponse[InferenceResponse, None]
        Standardized inference response
    """
    model = await get_model_by_id(model_id, request, connection)

    # Check capability
    if model.capabilities and not model.capabilities.supports_text_prompt:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Model {model.name} does not support text prompts",
        )

    proxy: InferenceProxyService = request.state.inference_proxy

    try:
        result = await proxy.text_prompt(
            model=model,
            image=image,
            text_prompt=text_prompt,
            threshold=threshold,
            mask_threshold=mask_threshold,
            return_visualization=return_visualization,
        )

        return JsonResponse(
            data=result,
            message=f"Detected {result.num_objects} object(s) using {model.name}",
            status_code=status.HTTP_200_OK,
        )
    except Exception as e:
        logger.error(f"Text prompt inference failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Inference failed: {str(e)}",
        )


@router.post("/bbox", response_model=JsonResponse[InferenceResponse, None])
async def inference_bbox(
    request: Request,
    image: UploadFile = File(..., description="Image file to process"),
    model_id: str = Form(..., description="Model ID ('sam3' or UUID)"),
    bounding_boxes: str = Form(..., description="JSON array of [x1, y1, x2, y2, label] boxes"),
    threshold: float = Form(0.5, ge=0.0, le=1.0, description="Detection confidence threshold"),
    mask_threshold: float = Form(0.5, ge=0.0, le=1.0, description="Mask generation threshold"),
    return_visualization: bool = Form(False, description="Return visualization image"),
    connection: Annotated[AsyncConnection, Depends(get_async_conn)] = None,
):
    """Proxy bounding box prompt inference to model backend.

    This endpoint accepts bounding boxes and returns segmentation masks
    for the specified regions.

    Parameters
    ----------
    request : Request
        FastAPI request
    image : UploadFile
        Image file to process
    model_id : str
        Model ID ('sam3' for built-in, or UUID for BYOM)
    bounding_boxes : str
        JSON string of bounding boxes [[x1, y1, x2, y2, label], ...]
    threshold : float
        Detection confidence threshold (0.0-1.0)
    mask_threshold : float
        Mask generation threshold (0.0-1.0)
    return_visualization : bool
        Whether to return visualization image
    connection : AsyncConnection
        Database connection

    Returns
    -------
    JsonResponse[InferenceResponse, None]
        Standardized inference response
    """
    model = await get_model_by_id(model_id, request, connection)

    # Check capability
    if model.capabilities and not model.capabilities.supports_bbox_prompt:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Model {model.name} does not support bounding box prompts",
        )

    # Parse bounding boxes
    try:
        boxes = json.loads(bounding_boxes)
    except json.JSONDecodeError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid bounding_boxes JSON: {str(e)}",
        )

    proxy: InferenceProxyService = request.state.inference_proxy

    try:
        result = await proxy.bbox_prompt(
            model=model,
            image=image,
            bounding_boxes=boxes,
            threshold=threshold,
            mask_threshold=mask_threshold,
            return_visualization=return_visualization,
        )

        return JsonResponse(
            data=result,
            message=f"Detected {result.num_objects} object(s) using {model.name}",
            status_code=status.HTTP_200_OK,
        )
    except Exception as e:
        logger.error(f"Bbox prompt inference failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Inference failed: {str(e)}",
        )


@router.post("/auto", response_model=JsonResponse[InferenceResponse, None])
async def inference_auto(
    request: Request,
    image: UploadFile = File(..., description="Image file to process"),
    model_id: str = Form(..., description="Model ID (UUID, SAM3 not supported)"),
    threshold: float = Form(0.5, ge=0.0, le=1.0, description="Detection confidence threshold"),
    class_filter: str | None = Form(None, description="JSON array of class names to filter"),
    return_visualization: bool = Form(False, description="Return visualization image"),
    connection: Annotated[AsyncConnection, Depends(get_async_conn)] = None,
):
    """Proxy auto-detection inference to model backend.

    This endpoint performs automatic object detection without user prompts.
    Only supported by BYOM models with auto-detect capability.

    Parameters
    ----------
    request : Request
        FastAPI request
    image : UploadFile
        Image file to process
    model_id : str
        Model ID (UUID, SAM3 not supported for auto-detect)
    threshold : float
        Detection confidence threshold (0.0-1.0)
    class_filter : str | None
        Optional JSON array of class names to filter
    return_visualization : bool
        Whether to return visualization image
    connection : AsyncConnection
        Database connection

    Returns
    -------
    JsonResponse[InferenceResponse, None]
        Standardized inference response
    """
    model = await get_model_by_id(model_id, request, connection)

    # Check capability
    if model.capabilities and not model.capabilities.supports_auto_detect:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Model {model.name} does not support auto-detection",
        )

    # Parse class filter
    filters = None
    if class_filter:
        try:
            filters = json.loads(class_filter)
        except json.JSONDecodeError as e:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid class_filter JSON: {str(e)}",
            )

    proxy: InferenceProxyService = request.state.inference_proxy

    try:
        result = await proxy.auto_detect(
            model=model,
            image=image,
            threshold=threshold,
            class_filter=filters,
            return_visualization=return_visualization,
        )

        return JsonResponse(
            data=result,
            message=f"Detected {result.num_objects} object(s) using {model.name}",
            status_code=status.HTTP_200_OK,
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )
    except Exception as e:
        logger.error(f"Auto-detect inference failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Inference failed: {str(e)}",
        )
