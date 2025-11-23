"""SAM3 API endpoints for image segmentation."""

import json

from fastapi import APIRouter, File, Form, HTTPException, Request, Response, UploadFile, status
from fastapi.responses import Response as FastAPIResponse

from app.helpers.logger import logger
from app.helpers.response_api import JsonResponse
from app.schemas.sam3 import BatchInferenceResult, InferenceResult

router = APIRouter(prefix="/api/v1/sam3", tags=["SAM3 Inference"])


@router.post(
    "/inference/text",
    response_model=JsonResponse[InferenceResult, None],
    status_code=status.HTTP_200_OK,
    description="Run SAM3 inference with text prompt on single image. Returns bounding boxes, confidence scores, and polygon coordinates for each detected object's segmentation mask.",
)
async def inference_text(
    request: Request,
    response: Response,
    image: UploadFile = File(..., description="Image file to process"),
    text_prompt: str = Form(..., description="Text description of objects to segment"),
    threshold: float = Form(0.5, ge=0.0, le=1.0, description="Detection confidence threshold"),
    mask_threshold: float = Form(0.5, ge=0.0, le=1.0, description="Mask generation threshold"),
    return_visualization: bool = Form(False, description="Generate visualization image"),
):
    """Run text-based inference on uploaded image.

    Parameters
    ----------
    request : Request
        FastAPI request object
    response : Response
        FastAPI response object
    image : UploadFile
        Uploaded image file
    text_prompt : str
        Text description of objects to segment
    threshold : float
        Detection confidence threshold
    mask_threshold : float
        Mask generation threshold
    return_visualization : bool
        Whether to generate visualization

    Returns
    -------
    JsonResponse[InferenceResult, None]
        Inference results with job ID and detection data
    """
    try:
        # Get inference instance from app state
        sam3_inference = request.state.sam3_inference

        # Run inference
        result = await sam3_inference.inference_text(
            image_file=image,
            text_prompt=text_prompt,
            threshold=threshold,
            mask_threshold=mask_threshold,
            return_visualization=return_visualization,
        )

        # Build response
        inference_result = InferenceResult(**result)

        status_code = status.HTTP_200_OK
        response.status_code = status_code
        return JsonResponse(
            data=inference_result,
            message=f"Successfully processed image with text prompt. Found {result['num_objects']} objects.",
            status_code=status_code,
        )

    except ValueError as e:
        logger.error(f"Validation error in text inference: {e}")
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        logger.error(f"Error in text inference: {e}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Inference failed")


@router.post(
    "/inference/bbox",
    response_model=JsonResponse[InferenceResult, None],
    status_code=status.HTTP_200_OK,
    description="Run SAM3 inference with bounding box prompts on single image. Returns bounding boxes, confidence scores, and polygon coordinates for each detected object's segmentation mask.",
)
async def inference_bbox(
    request: Request,
    response: Response,
    image: UploadFile = File(..., description="Image file to process"),
    bounding_boxes: str = Form(..., description="JSON array of bounding boxes: [[x1,y1,x2,y2,label], ...]"),
    threshold: float = Form(0.5, ge=0.0, le=1.0, description="Detection confidence threshold"),
    mask_threshold: float = Form(0.5, ge=0.0, le=1.0, description="Mask generation threshold"),
    return_visualization: bool = Form(False, description="Generate visualization image"),
):
    """Run bounding box-based inference on uploaded image.

    Parameters
    ----------
    request : Request
        FastAPI request object
    response : Response
        FastAPI response object
    image : UploadFile
        Uploaded image file
    bounding_boxes : str
        JSON string of bounding boxes
    threshold : float
        Detection confidence threshold
    mask_threshold : float
        Mask generation threshold
    return_visualization : bool
        Whether to generate visualization

    Returns
    -------
    JsonResponse[InferenceResult, None]
        Inference results
    """
    try:
        # Parse bounding boxes JSON
        try:
            boxes_data = json.loads(bounding_boxes)
        except json.JSONDecodeError:
            raise ValueError("Invalid JSON format for bounding_boxes")

        # Extract boxes and labels
        boxes = [[b[0], b[1], b[2], b[3]] for b in boxes_data]
        labels = [b[4] if len(b) > 4 else 1 for b in boxes_data]  # Default to positive

        # Get inference instance
        sam3_inference = request.state.sam3_inference

        # Run inference
        result = await sam3_inference.inference_bbox(
            image_file=image,
            bounding_boxes=boxes,
            box_labels=labels,
            threshold=threshold,
            mask_threshold=mask_threshold,
            return_visualization=return_visualization,
        )

        # Build response
        inference_result = InferenceResult(**result)

        status_code = status.HTTP_200_OK
        response.status_code = status_code
        return JsonResponse(
            data=inference_result,
            message=f"Successfully processed image with bbox prompts. Found {result['num_objects']} objects.",
            status_code=status_code,
        )

    except ValueError as e:
        logger.error(f"Validation error in bbox inference: {e}")
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        logger.error(f"Error in bbox inference: {e}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Inference failed")


@router.post(
    "/inference/batch",
    response_model=JsonResponse[BatchInferenceResult, None],
    status_code=status.HTTP_200_OK,
    description="Run SAM3 inference on multiple images in batch. Returns bounding boxes, confidence scores, and polygon coordinates for each detected object in each image.",
)
async def inference_batch(
    request: Request,
    response: Response,
    images: list[UploadFile] = File(..., description="List of image files to process"),
    text_prompts: str = Form(..., description="JSON array of text prompts (one per image, null for none)"),
    threshold: float = Form(0.5, ge=0.0, le=1.0, description="Detection confidence threshold"),
    mask_threshold: float = Form(0.5, ge=0.0, le=1.0, description="Mask generation threshold"),
    return_visualizations: bool = Form(False, description="Generate visualization images"),
):
    """Run batch inference on multiple images.

    Parameters
    ----------
    request : Request
        FastAPI request object
    response : Response
        FastAPI response object
    images : list[UploadFile]
        List of uploaded image files
    text_prompts : str
        JSON array of text prompts
    threshold : float
        Detection confidence threshold
    mask_threshold : float
        Mask generation threshold
    return_visualizations : bool
        Whether to generate visualizations

    Returns
    -------
    JsonResponse[BatchInferenceResult, None]
        Batch inference results
    """
    try:
        # Parse text prompts JSON
        try:
            prompts_list = json.loads(text_prompts)
        except json.JSONDecodeError:
            raise ValueError("Invalid JSON format for text_prompts")

        # Validate length match
        if len(images) != len(prompts_list):
            raise ValueError(f"Number of images ({len(images)}) must match number of prompts ({len(prompts_list)})")

        # Get inference instance
        sam3_inference = request.state.sam3_inference

        # Run batch inference
        result = await sam3_inference.inference_batch(
            image_files=images,
            text_prompts=prompts_list,
            threshold=threshold,
            mask_threshold=mask_threshold,
            return_visualizations=return_visualizations,
        )

        # Build response
        batch_result = BatchInferenceResult(**result)

        status_code = status.HTTP_200_OK
        response.status_code = status_code
        return JsonResponse(
            data=batch_result,
            message=f"Successfully processed {result['total_images']} images in batch.",
            status_code=status_code,
        )

    except ValueError as e:
        logger.error(f"Validation error in batch inference: {e}")
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        logger.error(f"Error in batch inference: {e}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Batch inference failed")


@router.get(
    "/health",
    status_code=status.HTTP_200_OK,
    description="Health check endpoint",
)
async def health_check(request: Request):
    """Check API health status.

    Returns
    -------
    dict
        Health status
    """
    return {"status": "healthy", "service": "SAM3 API"}
