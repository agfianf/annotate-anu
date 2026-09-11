"""Annotation router with CRUD and bulk operations."""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncConnection

from app.dependencies.database import get_async_transaction_conn
from app.dependencies.rbac import annotation_image_permission
from app.helpers.response_api import JsonResponse
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
from app.services.annotation import AnnotationService

router = APIRouter(prefix="/api/v1/images/{image_id}/annotations", tags=["Annotations"])


# ============================================================================
# Get All Annotations for Image
# ============================================================================
@router.get("", response_model=JsonResponse[ImageAnnotationsResponse, None])
async def get_all_annotations(
    image: Annotated[dict, Depends(annotation_image_permission)],
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)],
):
    """Get all annotations for an image."""

    annotations = await AnnotationService.list_for_image(connection, image["id"])

    response = ImageAnnotationsResponse(
        image_id=image["id"],
        tags=[ImageTagResponse(**t) for t in annotations["tags"]],
        detections=[DetectionResponse(**d) for d in annotations["detections"]],
        segmentations=[SegmentationResponse(**s) for s in annotations["segmentations"]],
        keypoints=[KeypointResponse(**k) for k in annotations["keypoints"]],
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
    image: Annotated[dict, Depends(annotation_image_permission)],
    payload: ImageTagCreate,
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)],
):
    """Create an image tag."""
    tag = (await AnnotationService.create_many(connection, image, "tags", [payload.model_dump()]))[
        0
    ]
    await AnnotationService.refresh_status(connection, image["job_id"], [image["id"]])
    return JsonResponse(
        data=ImageTagResponse(**tag),
        message="Tag created",
        status_code=status.HTTP_201_CREATED,
    )


@router.post("/tags/bulk", response_model=JsonResponse[list[ImageTagResponse], None])
async def create_tags_bulk(
    image: Annotated[dict, Depends(annotation_image_permission)],
    payload: BulkTagCreate,
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)],
):
    """Bulk create image tags."""
    items = [t.model_dump() for t in payload.tags]
    created = await AnnotationService.create_many(connection, image, "tags", items)
    await AnnotationService.refresh_status(connection, image["job_id"], [image["id"]])
    return JsonResponse(
        data=[ImageTagResponse(**t) for t in created],
        message=f"Created {len(created)} tag(s)",
        status_code=status.HTTP_201_CREATED,
    )


@router.delete("/tags/bulk")
async def delete_tags_bulk(
    image: Annotated[dict, Depends(annotation_image_permission)],
    payload: BulkAnnotationDelete,
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)],
):
    """Bulk delete image tags."""
    count = await AnnotationService.delete_many(connection, image, "tags", payload.ids)
    await AnnotationService.refresh_status(connection, image["job_id"], [image["id"]])
    return JsonResponse(
        data={"deleted": count}, message=f"Deleted {count} tag(s)", status_code=status.HTTP_200_OK
    )


@router.delete("/tags/{tag_id}")
async def delete_tag(
    image: Annotated[dict, Depends(annotation_image_permission)],
    tag_id: UUID,
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)],
):
    """Delete an image tag."""
    await AnnotationService.delete_many(connection, image, "tags", [tag_id])
    await AnnotationService.refresh_status(connection, image["job_id"], [image["id"]])
    return JsonResponse(
        data={"deleted": True}, message="Tag deleted", status_code=status.HTTP_200_OK
    )


# ============================================================================
# Detections (Bounding Boxes)
# ============================================================================
@router.post("/detections", response_model=JsonResponse[DetectionResponse, None])
async def create_detection(
    image: Annotated[dict, Depends(annotation_image_permission)],
    payload: DetectionCreate,
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)],
):
    """Create a detection (bounding box)."""
    det = (
        await AnnotationService.create_many(connection, image, "detections", [payload.model_dump()])
    )[0]
    await AnnotationService.refresh_status(connection, image["job_id"], [image["id"]])
    return JsonResponse(
        data=DetectionResponse(**det),
        message="Detection created",
        status_code=status.HTTP_201_CREATED,
    )


@router.post("/detections/bulk", response_model=JsonResponse[list[DetectionResponse], None])
async def create_detections_bulk(
    image: Annotated[dict, Depends(annotation_image_permission)],
    payload: BulkDetectionCreate,
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)],
):
    """Bulk create detections."""
    items = [d.model_dump() for d in payload.detections]
    created = await AnnotationService.create_many(connection, image, "detections", items)
    await AnnotationService.refresh_status(connection, image["job_id"], [image["id"]])
    return JsonResponse(
        data=[DetectionResponse(**d) for d in created],
        message=f"Created {len(created)} detection(s)",
        status_code=status.HTTP_201_CREATED,
    )


@router.patch("/detections/{detection_id}", response_model=JsonResponse[DetectionResponse, None])
async def update_detection(
    image: Annotated[dict, Depends(annotation_image_permission)],
    detection_id: UUID,
    payload: DetectionUpdate,
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)],
):
    """Update a detection."""
    updated = await AnnotationService.update(
        connection, image, "detections", detection_id, payload.model_dump(exclude_unset=True)
    )

    # Sync status
    await AnnotationService.refresh_status(connection, image["job_id"], [image["id"]])

    return JsonResponse(
        data=DetectionResponse(**updated),
        message="Detection updated",
        status_code=status.HTTP_200_OK,
    )


@router.delete("/detections/bulk")
async def delete_detections_bulk(
    image: Annotated[dict, Depends(annotation_image_permission)],
    payload: BulkAnnotationDelete,
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)],
):
    """Bulk delete detections."""
    count = await AnnotationService.delete_many(connection, image, "detections", payload.ids)
    await AnnotationService.refresh_status(connection, image["job_id"], [image["id"]])
    return JsonResponse(
        data={"deleted": count},
        message=f"Deleted {count} detection(s)",
        status_code=status.HTTP_200_OK,
    )


@router.delete("/detections/{detection_id}")
async def delete_detection(
    image: Annotated[dict, Depends(annotation_image_permission)],
    detection_id: UUID,
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)],
):
    """Delete a detection."""
    await AnnotationService.delete_many(connection, image, "detections", [detection_id])
    await AnnotationService.refresh_status(connection, image["job_id"], [image["id"]])
    return JsonResponse(
        data={"deleted": True}, message="Detection deleted", status_code=status.HTTP_200_OK
    )


# ============================================================================
# Segmentations (Polygons/Masks)
# ============================================================================
@router.post("/segmentations", response_model=JsonResponse[SegmentationResponse, None])
async def create_segmentation(
    image: Annotated[dict, Depends(annotation_image_permission)],
    payload: SegmentationCreate,
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)],
):
    """Create a segmentation."""
    seg = (
        await AnnotationService.create_many(
            connection, image, "segmentations", [payload.model_dump()]
        )
    )[0]
    await AnnotationService.refresh_status(connection, image["job_id"], [image["id"]])
    return JsonResponse(
        data=SegmentationResponse(**seg),
        message="Segmentation created",
        status_code=status.HTTP_201_CREATED,
    )


@router.post("/segmentations/bulk", response_model=JsonResponse[list[SegmentationResponse], None])
async def create_segmentations_bulk(
    image: Annotated[dict, Depends(annotation_image_permission)],
    payload: BulkSegmentationCreate,
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)],
):
    """Bulk create segmentations."""
    items = [s.model_dump() for s in payload.segmentations]
    created = await AnnotationService.create_many(connection, image, "segmentations", items)
    await AnnotationService.refresh_status(connection, image["job_id"], [image["id"]])
    return JsonResponse(
        data=[SegmentationResponse(**s) for s in created],
        message=f"Created {len(created)} segmentation(s)",
        status_code=status.HTTP_201_CREATED,
    )


@router.patch("/segmentations/{seg_id}", response_model=JsonResponse[SegmentationResponse, None])
async def update_segmentation(
    image: Annotated[dict, Depends(annotation_image_permission)],
    seg_id: UUID,
    payload: SegmentationUpdate,
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)],
):
    """Update a segmentation."""
    updated = await AnnotationService.update(
        connection, image, "segmentations", seg_id, payload.model_dump(exclude_unset=True)
    )

    # Sync status
    await AnnotationService.refresh_status(connection, image["job_id"], [image["id"]])

    return JsonResponse(
        data=SegmentationResponse(**updated),
        message="Segmentation updated",
        status_code=status.HTTP_200_OK,
    )


@router.delete("/segmentations/{seg_id}")
async def delete_segmentation(
    image: Annotated[dict, Depends(annotation_image_permission)],
    seg_id: UUID,
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)],
):
    """Delete a segmentation."""
    await AnnotationService.delete_many(connection, image, "segmentations", [seg_id])
    await AnnotationService.refresh_status(connection, image["job_id"], [image["id"]])
    return JsonResponse(
        data={"deleted": True}, message="Segmentation deleted", status_code=status.HTTP_200_OK
    )


# ============================================================================
# Keypoints
# ============================================================================
@router.post("/keypoints", response_model=JsonResponse[KeypointResponse, None])
async def create_keypoints(
    image: Annotated[dict, Depends(annotation_image_permission)],
    payload: KeypointCreate,
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)],
):
    """Create keypoints."""
    kp = (
        await AnnotationService.create_many(connection, image, "keypoints", [payload.model_dump()])
    )[0]
    await AnnotationService.refresh_status(connection, image["job_id"], [image["id"]])
    return JsonResponse(
        data=KeypointResponse(**kp),
        message="Keypoints created",
        status_code=status.HTTP_201_CREATED,
    )


@router.patch("/keypoints/{kp_id}", response_model=JsonResponse[KeypointResponse, None])
async def update_keypoints(
    image: Annotated[dict, Depends(annotation_image_permission)],
    kp_id: UUID,
    payload: KeypointUpdate,
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)],
):
    """Update keypoints."""
    updated = await AnnotationService.update(
        connection, image, "keypoints", kp_id, payload.model_dump(exclude_unset=True)
    )

    # Sync status
    await AnnotationService.refresh_status(connection, image["job_id"], [image["id"]])

    return JsonResponse(
        data=KeypointResponse(**updated),
        message="Keypoints updated",
        status_code=status.HTTP_200_OK,
    )


@router.delete("/keypoints/{kp_id}")
async def delete_keypoints(
    image: Annotated[dict, Depends(annotation_image_permission)],
    kp_id: UUID,
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)],
):
    """Delete keypoints."""
    await AnnotationService.delete_many(connection, image, "keypoints", [kp_id])
    await AnnotationService.refresh_status(connection, image["job_id"], [image["id"]])
    return JsonResponse(
        data={"deleted": True}, message="Keypoints deleted", status_code=status.HTTP_200_OK
    )
