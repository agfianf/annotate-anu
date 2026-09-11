"""Image router with CRUD and bulk operations."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncConnection

from app.dependencies.database import get_async_transaction_conn
from app.dependencies.rbac import ImagePermission, JobPermission
from app.helpers.response_api import JsonResponse
from app.repositories.image import ImageRepository
from app.schemas.image import (
    ImageBulkCreate,
    ImageCreate,
    ImageListResponse,
    ImageResponse,
    ImageUpdate,
)
from app.services.thumbnail import ThumbnailService

router = APIRouter(prefix="/api/v1", tags=["Images"])


@router.get("/jobs/{job_id}/images", response_model=JsonResponse[ImageListResponse, None])
async def list_images(
    job: Annotated[dict, Depends(JobPermission("viewer"))],
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)],
    page: int = 1,
    page_size: int = 50,
    annotated_only: bool | None = None,
):
    """List images for a job with pagination."""
    if page < 1:
        page = 1
    # Clamp rather than reset, so an oversized request returns the max, not the default
    page_size = max(1, min(page_size, 200))

    images_list, total = await ImageRepository.list_for_job(
        connection, job["id"], page=page, page_size=page_size, annotated_only=annotated_only
    )

    response = ImageListResponse(
        images=[ImageResponse(**img) for img in images_list],
        total=total,
        page=page,
        page_size=page_size,
    )

    return JsonResponse(
        data=response,
        message=f"Found {total} image(s)",
        status_code=status.HTTP_200_OK,
    )


@router.post("/jobs/{job_id}/images", response_model=JsonResponse[ImageResponse, None])
async def create_image(
    payload: ImageCreate,
    job: Annotated[dict, Depends(JobPermission("maintainer"))],
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)],
):
    """Add an image to a job. Requires maintainer role."""
    image = await ImageRepository.create(connection, job["id"], payload.model_dump())
    return JsonResponse(
        data=ImageResponse(**image),
        message="Image created successfully",
        status_code=status.HTTP_201_CREATED,
    )


@router.post("/jobs/{job_id}/images/bulk", response_model=JsonResponse[list[ImageResponse], None])
async def create_images_bulk(
    payload: ImageBulkCreate,
    job: Annotated[dict, Depends(JobPermission("maintainer"))],
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)],
):
    """Bulk add images to a job. Requires maintainer role."""
    image_dicts = [img.model_dump() for img in payload.images]
    created = await ImageRepository.create_bulk(connection, job["id"], image_dicts)
    return JsonResponse(
        data=[ImageResponse(**img) for img in created],
        message=f"Created {len(created)} image(s)",
        status_code=status.HTTP_201_CREATED,
    )


@router.get("/images/{image_id}", response_model=JsonResponse[ImageResponse, None])
async def get_image(
    image: Annotated[dict, Depends(ImagePermission("viewer"))],
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)],
):
    """Get image details."""

    return JsonResponse(
        data=ImageResponse(**image),
        message="Image retrieved successfully",
        status_code=status.HTTP_200_OK,
    )


@router.patch("/images/{image_id}", response_model=JsonResponse[ImageResponse, None])
async def update_image(
    image: Annotated[dict, Depends(ImagePermission("maintainer"))],
    payload: ImageUpdate,
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)],
):
    """Update image metadata."""

    update_data = payload.model_dump(exclude_unset=True)
    if not update_data:
        return JsonResponse(
            data=ImageResponse(**image), message="No changes", status_code=status.HTTP_200_OK
        )

    updated = await ImageRepository.update(connection, image["id"], update_data)
    return JsonResponse(
        data=ImageResponse(**updated),
        message="Image updated successfully",
        status_code=status.HTTP_200_OK,
    )


@router.delete("/images/{image_id}")
async def delete_image(
    image: Annotated[dict, Depends(ImagePermission("maintainer"))],
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)],
):
    """Delete an image."""

    await ImageRepository.delete(connection, image["id"])
    return JsonResponse(
        data={"deleted": True},
        message="Image deleted successfully",
        status_code=status.HTTP_200_OK,
    )


# ============================================================================
# Job Image Files
# ============================================================================


def get_thumbnail_service() -> ThumbnailService:
    """Get thumbnail service instance."""
    return ThumbnailService()


@router.get("/jobs/{job_id}/images/{image_id}/thumbnail")
async def get_job_image_thumbnail(
    job_id: int,
    image: Annotated[dict, Depends(ImagePermission("viewer"))],
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)],
    thumb: Annotated[ThumbnailService, Depends(get_thumbnail_service)],
):
    """Get thumbnail for a job image (requires job access)."""
    # Verify image exists and belongs to the job
    if image["job_id"] != job_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Image not found")

    try:
        thumbnail_path = await thumb.get_or_create_thumbnail(image["s3_key"])
        return FileResponse(
            thumbnail_path,
            media_type="image/jpeg",
            headers={
                "Cache-Control": "private, no-store",
            },
        )
    except FileNotFoundError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Image not found")
    except RuntimeError as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


@router.get("/jobs/{job_id}/images/{image_id}/file")
async def get_job_image_file(
    job_id: int,
    image: Annotated[dict, Depends(ImagePermission("viewer"))],
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)],
):
    """Get full-size image file for a job image (requires job access).

    This endpoint serves the original image file for canvas rendering.
    Uses the s3_key which is a relative path from SHARE_ROOT.
    """
    import mimetypes

    # Verify image exists and belongs to the job
    if image["job_id"] != job_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Image not found")

    # Construct full path from SHARE_ROOT and s3_key
    from app.services.image_file import resolve_image_path

    try:
        file_path = resolve_image_path(image["s3_key"])
    except FileNotFoundError as exc:
        raise HTTPException(404, "Image not found") from exc

    if not file_path.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=f"Image file not found: {image['s3_key']}"
        )

    # Determine MIME type from file extension
    mime_type, _ = mimetypes.guess_type(str(file_path))
    if not mime_type:
        mime_type = "application/octet-stream"

    return FileResponse(
        file_path,
        media_type=mime_type,
        filename=image["filename"],
        headers={
            "Cache-Control": "private, no-store",
            "Content-Disposition": f'inline; filename="{image["filename"]}"',
        },
    )
