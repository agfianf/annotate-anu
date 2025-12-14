"""Router for Shared Images (central image registry)."""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncConnection

from app.dependencies.auth import get_current_active_user
from app.dependencies.database import get_async_transaction_conn
from app.helpers.response_api import JsonResponse
from app.repositories.shared_image import SharedImageRepository
from app.repositories.shared_image_tag import SharedImageTagRepository
from app.schemas.auth import UserBase
from app.schemas.data_management import (
    AddTagsRequest,
    BulkTagRequest,
    BulkTagResponse,
    JobAssociationInfo,
    RemoveTagsRequest,
    SharedImageBulkRegister,
    SharedImageBulkRegisterResponse,
    SharedImageCreate,
    SharedImageResponse,
    SharedImageUpdate,
    TagResponse,
)
from app.services.filesystem import FileSystemService
from app.services.thumbnail import ThumbnailService

router = APIRouter(prefix="/api/v1/shared-images", tags=["Shared Images"])

# Initialize services
filesystem_service = FileSystemService()
thumbnail_service = ThumbnailService()


def _build_thumbnail_url(file_path: str) -> str:
    """Build thumbnail URL for a file path."""
    return f"/api/v1/share/thumbnail/{file_path}"


async def _enrich_with_tags_and_thumbnail(
    connection: AsyncConnection,
    image: dict,
) -> SharedImageResponse:
    """Enrich shared image with tags and thumbnail URL."""
    tags = await SharedImageRepository.get_tags(connection, image["id"])
    return SharedImageResponse(
        **image,
        thumbnail_url=_build_thumbnail_url(image["file_path"]),
        tags=[TagResponse(**t) for t in tags],
    )


# ============================================================================
# List & Get
# ============================================================================
@router.get("", response_model=JsonResponse[list[SharedImageResponse], dict])
async def list_shared_images(
    current_user: Annotated[UserBase, Depends(get_current_active_user)],
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)],
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=200),
    search: str | None = Query(default=None, max_length=255),
    tag_ids: list[UUID] | None = Query(default=None),
):
    """List all shared images with pagination and filtering."""
    images, total = await SharedImageRepository.list_all(
        connection,
        page=page,
        page_size=page_size,
        search=search,
        tag_ids=tag_ids,
    )

    enriched = []
    for img in images:
        enriched.append(await _enrich_with_tags_and_thumbnail(connection, img))

    return JsonResponse(
        data=enriched,
        meta={"total": total, "page": page, "page_size": page_size},
        message=f"Found {total} shared image(s)",
        status_code=status.HTTP_200_OK,
    )


@router.get("/{image_id}", response_model=JsonResponse[SharedImageResponse, None])
async def get_shared_image(
    image_id: UUID,
    current_user: Annotated[UserBase, Depends(get_current_active_user)],
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)],
):
    """Get shared image details."""
    image = await SharedImageRepository.get_by_id(connection, image_id)
    if not image:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Shared image not found",
        )

    enriched = await _enrich_with_tags_and_thumbnail(connection, image)
    return JsonResponse(
        data=enriched,
        message="Shared image retrieved",
        status_code=status.HTTP_200_OK,
    )


@router.get("/{image_id}/jobs", response_model=JsonResponse[list[JobAssociationInfo], None])
async def get_image_jobs(
    image_id: UUID,
    current_user: Annotated[UserBase, Depends(get_current_active_user)],
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)],
):
    """Get all jobs and tasks that include this shared image."""
    image = await SharedImageRepository.get_by_id(connection, image_id)
    if not image:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Shared image not found",
        )

    jobs_info = await SharedImageRepository.get_associated_jobs(connection, image_id)

    return JsonResponse(
        data=[JobAssociationInfo(**job) for job in jobs_info],
        message=f"Found {len(jobs_info)} job(s) for this image",
        status_code=status.HTTP_200_OK,
    )


# ============================================================================
# Register Images
# ============================================================================
@router.post("/register", response_model=JsonResponse[SharedImageBulkRegisterResponse, None])
async def register_shared_images(
    payload: SharedImageBulkRegister,
    current_user: Annotated[UserBase, Depends(get_current_active_user)],
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)],
):
    """
    Register file paths as shared images.
    Files must exist in the file share directory.
    """
    registered = []
    already_existed = []
    failed = []

    for file_path in payload.file_paths:
        # Check if already registered
        existing = await SharedImageRepository.get_by_file_path(connection, file_path)
        if existing:
            already_existed.append(file_path)
            continue

        # Validate file exists and get metadata
        try:
            absolute_path = filesystem_service.get_absolute_path(file_path)
            if not absolute_path.exists():
                failed.append(file_path)
                continue

            # Get image info
            image_info = await thumbnail_service.get_image_info(file_path)

            # Create shared image record
            image_data = SharedImageCreate(
                file_path=file_path,
                filename=absolute_path.name,
                width=image_info.get("width"),
                height=image_info.get("height"),
                file_size_bytes=image_info.get("size"),
                mime_type=image_info.get("mime_type"),
            )
            data = image_data.model_dump()
            data["registered_by"] = current_user.id

            image = await SharedImageRepository.create(connection, data)
            enriched = await _enrich_with_tags_and_thumbnail(connection, image)
            registered.append(enriched)

        except Exception:
            failed.append(file_path)

    return JsonResponse(
        data=SharedImageBulkRegisterResponse(
            registered=registered,
            already_existed=already_existed,
            failed=failed,
            total_registered=len(registered),
            total_already_existed=len(already_existed),
            total_failed=len(failed),
        ),
        message=f"Registered {len(registered)} image(s)",
        status_code=status.HTTP_201_CREATED,
    )


@router.delete("/{image_id}", response_model=JsonResponse[None, None])
async def delete_shared_image(
    image_id: UUID,
    current_user: Annotated[UserBase, Depends(get_current_active_user)],
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)],
):
    """Unregister a shared image (does not delete the file)."""
    image = await SharedImageRepository.get_by_id(connection, image_id)
    if not image:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Shared image not found",
        )

    await SharedImageRepository.delete(connection, image_id)
    return JsonResponse(
        data=None,
        message="Shared image unregistered",
        status_code=status.HTTP_200_OK,
    )


# ============================================================================
# Tagging
# ============================================================================
@router.post("/{image_id}/tags", response_model=JsonResponse[list[TagResponse], None])
async def add_tags_to_image(
    image_id: UUID,
    payload: AddTagsRequest,
    current_user: Annotated[UserBase, Depends(get_current_active_user)],
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)],
):
    """Add tags to a shared image."""
    image = await SharedImageRepository.get_by_id(connection, image_id)
    if not image:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Shared image not found",
        )

    for tag_id in payload.tag_ids:
        await SharedImageTagRepository.add_tag(
            connection, image_id, tag_id, current_user.id
        )

    tags = await SharedImageTagRepository.get_tags_for_image(connection, image_id)
    return JsonResponse(
        data=[TagResponse(**t) for t in tags],
        message="Tags added",
        status_code=status.HTTP_200_OK,
    )


@router.delete("/{image_id}/tags/{tag_id}", response_model=JsonResponse[list[TagResponse], None])
async def remove_tag_from_image(
    image_id: UUID,
    tag_id: UUID,
    current_user: Annotated[UserBase, Depends(get_current_active_user)],
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)],
):
    """Remove a tag from a shared image."""
    image = await SharedImageRepository.get_by_id(connection, image_id)
    if not image:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Shared image not found",
        )

    await SharedImageTagRepository.remove_tag(connection, image_id, tag_id)

    tags = await SharedImageTagRepository.get_tags_for_image(connection, image_id)
    return JsonResponse(
        data=[TagResponse(**t) for t in tags],
        message="Tag removed",
        status_code=status.HTTP_200_OK,
    )


@router.post("/bulk-tag", response_model=JsonResponse[BulkTagResponse, None])
async def bulk_tag_images(
    payload: BulkTagRequest,
    current_user: Annotated[UserBase, Depends(get_current_active_user)],
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)],
):
    """Add tags to multiple images at once."""
    tags_added = await SharedImageTagRepository.bulk_add_tags(
        connection,
        payload.shared_image_ids,
        payload.tag_ids,
        current_user.id,
    )

    return JsonResponse(
        data=BulkTagResponse(
            tags_added=tags_added,
            images_affected=len(payload.shared_image_ids),
        ),
        message=f"Added {tags_added} tag(s) to {len(payload.shared_image_ids)} image(s)",
        status_code=status.HTTP_200_OK,
    )


@router.delete("/bulk-tag", response_model=JsonResponse[BulkTagResponse, None])
async def bulk_untag_images(
    payload: BulkTagRequest,
    current_user: Annotated[UserBase, Depends(get_current_active_user)],
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)],
):
    """Remove tags from multiple images at once."""
    tags_removed = await SharedImageTagRepository.bulk_remove_tags(
        connection,
        payload.shared_image_ids,
        payload.tag_ids,
    )

    return JsonResponse(
        data=BulkTagResponse(
            tags_added=tags_removed,  # Reusing field for removed count
            images_affected=len(payload.shared_image_ids),
        ),
        message=f"Removed {tags_removed} tag(s) from {len(payload.shared_image_ids)} image(s)",
        status_code=status.HTTP_200_OK,
    )
