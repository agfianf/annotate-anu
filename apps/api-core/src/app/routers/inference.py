"""Router for inference proxy endpoints."""

import json
from datetime import datetime
from typing import Annotated

import redis
from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncConnection

from app.config import settings
from app.dependencies.database import get_async_conn
from app.helpers.logger import logger
from app.helpers.response_api import JsonResponse
from app.repositories.models import ModelAsyncRepositories
from app.schemas.inference.response import ClassificationResponse, InferenceResponse
from app.schemas.models.base import ModelBase, ModelCapabilities
from app.services.inference_proxy import InferenceProxyService
from app.services.mock_classifier import IMAGENET_SUBSET, mock_classifier
from app.services.mock_detector import COCO_SUBSET

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


def _get_mock_classifier_model() -> ModelBase:
    """Create pseudo-model for built-in mock classifier.

    Returns
    -------
    ModelBase
        Mock classifier model configuration
    """
    now = datetime.now()
    return ModelBase(
        id="mock-classifier",
        name="Mock Classifier (Demo)",
        endpoint_url="internal://mock-classifier",
        auth_token=None,
        capabilities=ModelCapabilities(
            supports_text_prompt=False,
            supports_bbox_prompt=False,
            supports_auto_detect=False,
            supports_class_filter=False,
            supports_classification=True,
            output_types=[],
            classes=IMAGENET_SUBSET,
        ),
        description="Mock classifier for testing - generates random but reproducible predictions",
        is_active=True,
        is_healthy=True,
        last_health_check=now,
        created_at=now,
        updated_at=now,
    )


def _get_mock_detector_model() -> ModelBase:
    """Create pseudo-model for built-in mock detector.

    Returns
    -------
    ModelBase
        Mock detector model configuration
    """
    now = datetime.now()
    return ModelBase(
        id="mock-detector",
        name="Mock Detector (Demo)",
        endpoint_url="internal://mock-detector",
        auth_token=None,
        capabilities=ModelCapabilities(
            supports_text_prompt=False,
            supports_bbox_prompt=False,
            supports_auto_detect=True,
            supports_class_filter=True,
            supports_classification=False,
            output_types=["bbox"],
            classes=COCO_SUBSET,
        ),
        description="Mock detector for testing - generates random but reproducible bounding boxes",
        is_active=True,
        is_healthy=True,
        last_health_check=now,
        created_at=now,
        updated_at=now,
    )


def _get_mock_segmenter_model() -> ModelBase:
    """Create pseudo-model for built-in mock segmenter.

    Returns
    -------
    ModelBase
        Mock segmenter model configuration
    """
    now = datetime.now()
    return ModelBase(
        id="mock-segmenter",
        name="Mock Segmenter (Demo)",
        endpoint_url="internal://mock-segmenter",
        auth_token=None,
        capabilities=ModelCapabilities(
            supports_text_prompt=True,
            supports_bbox_prompt=True,
            supports_auto_detect=True,
            supports_class_filter=True,
            supports_classification=False,
            output_types=["bbox", "polygon"],
            classes=COCO_SUBSET,
        ),
        description="Mock segmenter for testing - generates random but reproducible polygon masks",
        is_active=True,
        is_healthy=True,
        last_health_check=now,
        created_at=now,
        updated_at=now,
    )


async def get_model_by_id(
    model_id: str,
    request: Request,
    connection: AsyncConnection | None,
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

    if model_id == "mock-classifier":
        return _get_mock_classifier_model()

    if model_id == "mock-detector":
        return _get_mock_detector_model()

    if model_id == "mock-segmenter":
        return _get_mock_segmenter_model()

    # Get from database
    if connection is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Database connection required for BYOM models",
        )
    try:
        model = await ModelAsyncRepositories.get_by_id(connection, model_id)
        if not model.is_active:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Model {model.name} is not active",
            )

        # Mark internal:// URL models as healthy (no external check needed)
        if model.endpoint_url.startswith("internal://"):
            model.is_healthy = True

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
    simplify_tolerance: float = Form(1.5, ge=0.0, le=10.0, description="Polygon simplification tolerance"),
    return_visualization: bool = Form(False, description="Return visualization image"),
    connection: Annotated[AsyncConnection | None, Depends(get_async_conn)] = None,
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

    # Read image bytes immediately to avoid consumption issues
    image_bytes = await image.read()
    if not image_bytes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Empty image file received",
        )

    proxy: InferenceProxyService = request.state.inference_proxy

    try:
        result = await proxy.text_prompt(
            model=model,
            image_bytes=image_bytes,
            image_filename=image.filename or "image.jpg",
            image_content_type=image.content_type or "image/jpeg",
            text_prompt=text_prompt,
            threshold=threshold,
            mask_threshold=mask_threshold,
            simplify_tolerance=simplify_tolerance,
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
    simplify_tolerance: float = Form(1.5, ge=0.0, le=10.0, description="Polygon simplification tolerance"),
    return_visualization: bool = Form(False, description="Return visualization image"),
    connection: Annotated[AsyncConnection | None, Depends(get_async_conn)] = None,
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

    # Read image bytes immediately to avoid consumption issues
    image_bytes = await image.read()
    if not image_bytes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Empty image file received",
        )

    proxy: InferenceProxyService = request.state.inference_proxy

    try:
        result = await proxy.bbox_prompt(
            model=model,
            image_bytes=image_bytes,
            image_filename=image.filename or "image.jpg",
            image_content_type=image.content_type or "image/jpeg",
            bounding_boxes=boxes,
            threshold=threshold,
            mask_threshold=mask_threshold,
            simplify_tolerance=simplify_tolerance,
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
    connection: Annotated[AsyncConnection | None, Depends(get_async_conn)] = None,
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

    # Read image bytes immediately to avoid consumption issues
    image_bytes = await image.read()
    if not image_bytes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Empty image file received",
        )

    proxy: InferenceProxyService = request.state.inference_proxy

    try:
        result = await proxy.auto_detect(
            model=model,
            image_bytes=image_bytes,
            image_filename=image.filename or "image.jpg",
            image_content_type=image.content_type or "image/jpeg",
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


@router.post("/classify", response_model=JsonResponse[ClassificationResponse, None])
async def inference_classify(
    request: Request,
    image: UploadFile = File(..., description="Image file to classify"),
    model_id: str = Form(..., description="Model ID ('mock-classifier' or UUID)"),
    top_k: int = Form(5, ge=1, le=100, description="Number of top predictions to return"),
    connection: Annotated[AsyncConnection | None, Depends(get_async_conn)] = None,
):
    """Classify an image using a classification model.

    Unlike detection/segmentation which produces spatial outputs (boxes, masks),
    classification produces whole-image labels with probability distributions.

    Parameters
    ----------
    request : Request
        FastAPI request
    image : UploadFile
        Image file to classify
    model_id : str
        Model ID ('mock-classifier' for built-in, or UUID for BYOM)
    top_k : int
        Number of top predictions to return (1-100, default 5)
    connection : AsyncConnection
        Database connection

    Returns
    -------
    JsonResponse[ClassificationResponse, None]
        Classification response with top-k predictions
    """
    model = await get_model_by_id(model_id, request, connection)

    # Check capability
    if model.capabilities and not model.capabilities.supports_classification:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Model {model.name} does not support classification",
        )

    # Read image bytes immediately to avoid consumption issues
    image_bytes = await image.read()
    if not image_bytes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Empty image file received",
        )

    try:
        # For mock-classifier, use the built-in mock service directly
        if model_id == "mock-classifier":
            result = await mock_classifier.classify(image_bytes, top_k)
        else:
            # For external BYOM classification models, use the proxy
            proxy: InferenceProxyService = request.state.inference_proxy
            result = await proxy.classify(
                model=model,
                image_bytes=image_bytes,
                image_filename=image.filename or "image.jpg",
                image_content_type=image.content_type or "image/jpeg",
                top_k=top_k,
            )

        return JsonResponse(
            data=result,
            message=f"Classified as '{result.predicted_class}' ({result.confidence:.1%}) using {model.name}",
            status_code=status.HTTP_200_OK,
        )
    except Exception as e:
        logger.error(f"Classification inference failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Classification failed: {str(e)}",
        )


@router.post("/batch-classify/start")
async def start_batch_classification(
    project_id: int = Form(..., description="Project ID for tag creation"),
    model_id: str = Form(..., description="Model ID for classification"),
    image_ids: str = Form(..., description="JSON array of image IDs to classify"),
    create_tags: bool = Form(True, description="Whether to create tags from predictions"),
    label_mapping_config: str | None = Form(None, description="JSON config for label mapping"),
):
    """Start a batch classification job.

    This endpoint starts a background Celery task to classify multiple images
    and optionally create tags from predictions.

    Parameters
    ----------
    project_id : int
        Project ID for tag creation
    model_id : str
        Model ID ('mock-classifier' for built-in, or UUID for registered models)
    image_ids : str
        JSON array of image IDs to classify
    create_tags : bool
        Whether to create tags from predictions (default True)
    label_mapping_config : str | None
        JSON object with structured label mapping configuration:
        {
            "className": {
                "mode": "existing" | "create",
                "existingTagId": "uuid",      // when mode="existing"
                "newTagName": "name",         // when mode="create" (default: className)
                "newTagCategoryId": "uuid"    // when mode="create" (default: uncategorized)
            }
        }

    Returns
    -------
    dict
        Job ID and status
    """
    # Parse image IDs
    try:
        ids = json.loads(image_ids)
        if not isinstance(ids, list) or len(ids) == 0:
            raise ValueError("image_ids must be a non-empty array")
    except json.JSONDecodeError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid image_ids JSON: {str(e)}",
        )

    # Parse label mapping config
    mapping_config = None
    if label_mapping_config:
        try:
            mapping_config = json.loads(label_mapping_config)
        except json.JSONDecodeError as e:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid label_mapping_config JSON: {str(e)}",
            )

    # Import and start the Celery task
    from app.tasks.classification import batch_classify_images_task

    task = batch_classify_images_task.delay(
        project_id=project_id,
        model_id=model_id,
        image_ids=ids,
        create_tags=create_tags,
        label_mapping_config=mapping_config,
    )

    logger.info(f"Started batch classification job {task.id} for {len(ids)} images")

    return {
        "job_id": task.id,
        "status": "started",
        "total": len(ids),
    }


@router.get("/batch-classify/progress/{job_id}")
async def get_batch_classification_progress(job_id: str):
    """Get batch classification job progress.

    Parameters
    ----------
    job_id : str
        Celery task ID

    Returns
    -------
    dict
        Job progress with status, processed count, total, and failed count
    """
    # First check Redis for progress updates
    redis_client = redis.from_url(settings.REDIS_URL, decode_responses=True)
    progress_key = f"classification:progress:{job_id}"

    redis_progress = redis_client.hgetall(progress_key)

    if redis_progress:
        return {
            "job_id": job_id,
            "status": redis_progress.get("status", "unknown"),
            "processed": int(redis_progress.get("processed", 0)),
            "failed": int(redis_progress.get("failed", 0)),
            "total": int(redis_progress.get("total", 0)),
            "error": redis_progress.get("error"),
        }

    # Fall back to Celery task state
    from celery.result import AsyncResult

    result = AsyncResult(job_id)

    if result.state == "PENDING":
        return {
            "job_id": job_id,
            "status": "pending",
            "processed": 0,
            "failed": 0,
            "total": 0,
        }
    elif result.state == "SUCCESS":
        # Task completed, get result
        task_result = result.result or {}
        return {
            "job_id": job_id,
            "status": "completed",
            "processed": task_result.get("processed", 0),
            "failed": task_result.get("failed", 0),
            "total": task_result.get("total", 0),
            "results": task_result.get("results", []),
        }
    elif result.state == "FAILURE":
        return {
            "job_id": job_id,
            "status": "failed",
            "error": str(result.result) if result.result else "Unknown error",
            "processed": 0,
            "failed": 0,
            "total": 0,
        }
    else:
        # STARTED or other states
        return {
            "job_id": job_id,
            "status": result.state.lower(),
            "processed": 0,
            "failed": 0,
            "total": 0,
        }
