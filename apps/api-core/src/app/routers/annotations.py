"""Annotation router with CRUD and bulk operations."""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncConnection

from app.dependencies.database import get_async_transaction_conn
from app.helpers.response_api import JsonResponse
from app.repositories.annotation import (
    DetectionRepository,
    ImageTagRepository,
    KeypointRepository,
    SegmentationRepository,
)
from app.repositories.image import ImageRepository
from app.repositories.job import JobRepository
from app.schemas.annotation import (
    BulkAnnotationDelete,
    BulkDetectionCreate,
    BulkSegmentationCreate,
    BulkTagCreate,
    DetectionCreate,
    DetectionResponse,
    DetectionUpdate,
    ImageAnnotationsResponse,
    ImageTagCreate,
    ImageTagResponse,
    KeypointCreate,
    KeypointResponse,
    KeypointUpdate,
    SegmentationCreate,
    SegmentationResponse,
    SegmentationUpdate,
)

router = APIRouter(prefix="/api/v1/images/{image_id}/annotations", tags=["Annotations"])


async def _get_image(image_id: UUID, connection: AsyncConnection) -> dict:
    """Helper to get and validate image exists."""
    image = await ImageRepository.get_by_id(connection, image_id)
    if not image:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Image not found")
    return image


async def _sync_image_annotation_status(
    connection: AsyncConnection,
    image: dict,
) -> None:
    """Sync image annotation status and refresh job stats.
    
    This verifies if the image has ANY annotations (tags, dets, segs, kps)
    and updates is_annotated flag accordingly.
    """
    image_id = image["id"]
    job_id = image["job_id"]
    
    # Check all annotation types
    tags = await ImageTagRepository.list_for_image(connection, image_id)
    dets = await DetectionRepository.list_for_image(connection, image_id)
    segs = await SegmentationRepository.list_for_image(connection, image_id)
    kps = await KeypointRepository.list_for_image(connection, image_id)
    
    has_annotations = (len(tags) + len(dets) + len(segs) + len(kps)) > 0
    
    # Update image status if changed
    if image.get("is_annotated") != has_annotations:
        await ImageRepository.mark_annotated(connection, image_id, is_annotated=has_annotations)
    
    # Always refresh job's cached annotation count to be safe
    await JobRepository.refresh_annotation_counts(connection, job_id)


# ============================================================================
# Get All Annotations for Image
# ============================================================================
@router.get("", response_model=JsonResponse[ImageAnnotationsResponse, None])
async def get_all_annotations(
    image_id: UUID,
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)],
):
    """Get all annotations for an image."""
    await _get_image(image_id, connection)
    
    tags = await ImageTagRepository.list_for_image(connection, image_id)
    dets = await DetectionRepository.list_for_image(connection, image_id)
    segs = await SegmentationRepository.list_for_image(connection, image_id)
    kps = await KeypointRepository.list_for_image(connection, image_id)
    
    response = ImageAnnotationsResponse(
        image_id=image_id,
        tags=[ImageTagResponse(**t) for t in tags],
        detections=[DetectionResponse(**d) for d in dets],
        segmentations=[SegmentationResponse(**s) for s in segs],
        keypoints=[KeypointResponse(**k) for k in kps],
    )
    
    return JsonResponse(
        data=response,
        message="Annotations retrieved",
        status_code=status.HTTP_200_OK,
    )


# ============================================================================
# Image Tags (Classification)
# ============================================================================
@router.post("/tags", response_model=JsonResponse[ImageTagResponse, None])
async def create_tag(
    image_id: UUID,
    payload: ImageTagCreate,
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)],
):
    """Create an image tag."""
    image = await _get_image(image_id, connection)
    tag = await ImageTagRepository.create(connection, image_id, payload.model_dump())
    await _sync_image_annotation_status(connection, image)
    return JsonResponse(
        data=ImageTagResponse(**tag),
        message="Tag created",
        status_code=status.HTTP_201_CREATED,
    )


@router.post("/tags/bulk", response_model=JsonResponse[list[ImageTagResponse], None])
async def create_tags_bulk(
    image_id: UUID,
    payload: BulkTagCreate,
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)],
):
    """Bulk create image tags."""
    image = await _get_image(image_id, connection)
    items = [t.model_dump() for t in payload.tags]
    created = await ImageTagRepository.create_bulk(connection, image_id, items)
    await _sync_image_annotation_status(connection, image)
    return JsonResponse(
        data=[ImageTagResponse(**t) for t in created],
        message=f"Created {len(created)} tag(s)",
        status_code=status.HTTP_201_CREATED,
    )


@router.delete("/tags/{tag_id}")
async def delete_tag(
    image_id: UUID,
    tag_id: UUID,
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)],
):
    """Delete an image tag."""
    image = await _get_image(image_id, connection)
    await ImageTagRepository.delete(connection, tag_id)
    await _sync_image_annotation_status(connection, image)
    return JsonResponse(data={"deleted": True}, message="Tag deleted", status_code=status.HTTP_200_OK)


@router.delete("/tags/bulk")
async def delete_tags_bulk(
    image_id: UUID,
    payload: BulkAnnotationDelete,
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)],
):
    """Bulk delete image tags."""
    image = await _get_image(image_id, connection)
    count = await ImageTagRepository.delete_bulk(connection, payload.ids)
    await _sync_image_annotation_status(connection, image)
    return JsonResponse(data={"deleted": count}, message=f"Deleted {count} tag(s)", status_code=status.HTTP_200_OK)


# ============================================================================
# Detections (Bounding Boxes)
# ============================================================================
@router.post("/detections", response_model=JsonResponse[DetectionResponse, None])
async def create_detection(
    image_id: UUID,
    payload: DetectionCreate,
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)],
):
    """Create a detection (bounding box)."""
    image = await _get_image(image_id, connection)
    det = await DetectionRepository.create(connection, image_id, payload.model_dump())
    await _sync_image_annotation_status(connection, image)
    return JsonResponse(
        data=DetectionResponse(**det),
        message="Detection created",
        status_code=status.HTTP_201_CREATED,
    )


@router.post("/detections/bulk", response_model=JsonResponse[list[DetectionResponse], None])
async def create_detections_bulk(
    image_id: UUID,
    payload: BulkDetectionCreate,
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)],
):
    """Bulk create detections."""
    image = await _get_image(image_id, connection)
    items = [d.model_dump() for d in payload.detections]
    created = await DetectionRepository.create_bulk(connection, image_id, items)
    await _sync_image_annotation_status(connection, image)
    return JsonResponse(
        data=[DetectionResponse(**d) for d in created],
        message=f"Created {len(created)} detection(s)",
        status_code=status.HTTP_201_CREATED,
    )


@router.patch("/detections/{detection_id}", response_model=JsonResponse[DetectionResponse, None])
async def update_detection(
    image_id: UUID,
    detection_id: UUID,
    payload: DetectionUpdate,
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)],
):
    """Update a detection."""
    det = await DetectionRepository.get_by_id(connection, detection_id)
    if not det:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Detection not found")
    
    update_data = payload.model_dump(exclude_unset=True)
    if not update_data:
        return JsonResponse(data=DetectionResponse(**det), message="No changes", status_code=status.HTTP_200_OK)
    
    updated = await DetectionRepository.update(connection, detection_id, update_data)
    
    # Sync status
    image = await _get_image(image_id, connection)
    await _sync_image_annotation_status(connection, image)
    
    return JsonResponse(
        data=DetectionResponse(**updated),
        message="Detection updated",
        status_code=status.HTTP_200_OK,
    )


@router.delete("/detections/{detection_id}")
async def delete_detection(
    image_id: UUID,
    detection_id: UUID,
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)],
):
    """Delete a detection."""
    image = await _get_image(image_id, connection)
    await DetectionRepository.delete(connection, detection_id)
    await _sync_image_annotation_status(connection, image)
    return JsonResponse(data={"deleted": True}, message="Detection deleted", status_code=status.HTTP_200_OK)


@router.delete("/detections/bulk")
async def delete_detections_bulk(
    image_id: UUID,
    payload: BulkAnnotationDelete,
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)],
):
    """Bulk delete detections."""
    image = await _get_image(image_id, connection)
    count = await DetectionRepository.delete_bulk(connection, payload.ids)
    await _sync_image_annotation_status(connection, image)
    return JsonResponse(data={"deleted": count}, message=f"Deleted {count} detection(s)", status_code=status.HTTP_200_OK)


# ============================================================================
# Segmentations (Polygons/Masks)
# ============================================================================
@router.post("/segmentations", response_model=JsonResponse[SegmentationResponse, None])
async def create_segmentation(
    image_id: UUID,
    payload: SegmentationCreate,
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)],
):
    """Create a segmentation."""
    image = await _get_image(image_id, connection)
    seg = await SegmentationRepository.create(connection, image_id, payload.model_dump())
    await _sync_image_annotation_status(connection, image)
    return JsonResponse(
        data=SegmentationResponse(**seg),
        message="Segmentation created",
        status_code=status.HTTP_201_CREATED,
    )


@router.post("/segmentations/bulk", response_model=JsonResponse[list[SegmentationResponse], None])
async def create_segmentations_bulk(
    image_id: UUID,
    payload: BulkSegmentationCreate,
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)],
):
    """Bulk create segmentations."""
    image = await _get_image(image_id, connection)
    items = [s.model_dump() for s in payload.segmentations]
    created = await SegmentationRepository.create_bulk(connection, image_id, items)
    await _sync_image_annotation_status(connection, image)
    return JsonResponse(
        data=[SegmentationResponse(**s) for s in created],
        message=f"Created {len(created)} segmentation(s)",
        status_code=status.HTTP_201_CREATED,
    )


@router.patch("/segmentations/{seg_id}", response_model=JsonResponse[SegmentationResponse, None])
async def update_segmentation(
    image_id: UUID,
    seg_id: UUID,
    payload: SegmentationUpdate,
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)],
):
    """Update a segmentation."""
    seg = await SegmentationRepository.get_by_id(connection, seg_id)
    if not seg:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Segmentation not found")
    
    update_data = payload.model_dump(exclude_unset=True)
    if not update_data:
        return JsonResponse(data=SegmentationResponse(**seg), message="No changes", status_code=status.HTTP_200_OK)
    
    updated = await SegmentationRepository.update(connection, seg_id, update_data)
    
    # Sync status
    image = await _get_image(image_id, connection)
    await _sync_image_annotation_status(connection, image)
    
    return JsonResponse(
        data=SegmentationResponse(**updated),
        message="Segmentation updated",
        status_code=status.HTTP_200_OK,
    )


@router.delete("/segmentations/{seg_id}")
async def delete_segmentation(
    image_id: UUID,
    seg_id: UUID,
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)],
):
    """Delete a segmentation."""
    image = await _get_image(image_id, connection)
    await SegmentationRepository.delete(connection, seg_id)
    await _sync_image_annotation_status(connection, image)
    return JsonResponse(data={"deleted": True}, message="Segmentation deleted", status_code=status.HTTP_200_OK)


# ============================================================================
# Keypoints
# ============================================================================
@router.post("/keypoints", response_model=JsonResponse[KeypointResponse, None])
async def create_keypoints(
    image_id: UUID,
    payload: KeypointCreate,
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)],
):
    """Create keypoints."""
    image = await _get_image(image_id, connection)
    kp = await KeypointRepository.create(connection, image_id, payload.model_dump())
    await _sync_image_annotation_status(connection, image)
    return JsonResponse(
        data=KeypointResponse(**kp),
        message="Keypoints created",
        status_code=status.HTTP_201_CREATED,
    )


@router.patch("/keypoints/{kp_id}", response_model=JsonResponse[KeypointResponse, None])
async def update_keypoints(
    image_id: UUID,
    kp_id: UUID,
    payload: KeypointUpdate,
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)],
):
    """Update keypoints."""
    kp = await KeypointRepository.get_by_id(connection, kp_id)
    if not kp:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Keypoints not found")
    
    update_data = payload.model_dump(exclude_unset=True)
    if not update_data:
        return JsonResponse(data=KeypointResponse(**kp), message="No changes", status_code=status.HTTP_200_OK)
    
    updated = await KeypointRepository.update(connection, kp_id, update_data)
    
    # Sync status
    image = await _get_image(image_id, connection)
    await _sync_image_annotation_status(connection, image)
    
    return JsonResponse(
        data=KeypointResponse(**updated),
        message="Keypoints updated",
        status_code=status.HTTP_200_OK,
    )


@router.delete("/keypoints/{kp_id}")
async def delete_keypoints(
    image_id: UUID,
    kp_id: UUID,
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)],
):
    """Delete keypoints."""
    image = await _get_image(image_id, connection)
    await KeypointRepository.delete(connection, kp_id)
    await _sync_image_annotation_status(connection, image)
    return JsonResponse(data={"deleted": True}, message="Keypoints deleted", status_code=status.HTTP_200_OK)
