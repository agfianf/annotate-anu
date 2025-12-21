"""Router for Project Images (project image pool)."""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncConnection

from app.dependencies.auth import get_current_active_user
from app.dependencies.database import get_async_transaction_conn
from app.dependencies.rbac import ProjectPermission
from app.helpers.response_api import JsonResponse
from app.repositories.project_image import ProjectImageRepository
from app.repositories.shared_image import SharedImageRepository
from app.repositories.shared_image_tag import SharedImageTagRepository
from app.repositories.tag import TagRepository
from app.schemas.auth import UserBase
from app.schemas.data_management import (
    AddTagsRequest,
    BulkTagRequest,
    BulkTagResponse,
    ExploreFilter,
    ExploreResponse,
    ProjectImageAdd,
    ProjectImageRemove,
    ProjectPoolListResponse,
    ProjectPoolResponse,
    SharedImageResponse,
    TagResponse,
)

router = APIRouter(prefix="/api/v1/projects", tags=["Project Images"])


def _build_thumbnail_url(file_path: str) -> str:
    """Build thumbnail URL for a file path."""
    return f"/api/v1/share/thumbnail/{file_path}"


async def _enrich_image(
    connection: AsyncConnection,
    image: dict,
    project_id: int,
) -> SharedImageResponse:
    """Enrich image with tags and thumbnail URL."""
    tags = await SharedImageRepository.get_tags(connection, image["id"], project_id)
    return SharedImageResponse(
        **{k: v for k, v in image.items() if k not in ("added_to_pool_at",)},
        thumbnail_url=_build_thumbnail_url(image["file_path"]),
        tags=[TagResponse(**t) for t in tags],
    )


# ============================================================================
# Project Image Pool
# ============================================================================
@router.get("/{project_id}/images", response_model=JsonResponse[ProjectPoolListResponse, None])
async def list_project_images(
    project: Annotated[dict, Depends(ProjectPermission("viewer"))],
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)],
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=200),
    search: str | None = Query(default=None, max_length=255),
    tag_ids: list[UUID] | None = Query(default=None),
):
    """List images in project pool with pagination and filtering."""
    project_id = project["id"]

    images, total = await ProjectImageRepository.list_for_project(
        connection,
        project_id=project_id,
        page=page,
        page_size=page_size,
        tag_ids=tag_ids,
        search=search,
    )

    enriched = []
    for img in images:
        enriched.append(await _enrich_image(connection, img, project_id))

    return JsonResponse(
        data=ProjectPoolListResponse(
            project_id=project_id,
            images=enriched,
            total=total,
            page=page,
            page_size=page_size,
        ),
        message=f"Found {total} image(s) in project pool",
        status_code=status.HTTP_200_OK,
    )


@router.post("/{project_id}/images", response_model=JsonResponse[ProjectPoolResponse, None])
async def add_images_to_pool(
    payload: ProjectImageAdd,
    project: Annotated[dict, Depends(ProjectPermission("maintainer"))],
    current_user: Annotated[UserBase, Depends(get_current_active_user)],
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)],
):
    """Add images to project pool."""
    project_id = project["id"]

    images_added = await ProjectImageRepository.bulk_add_to_pool(
        connection,
        project_id=project_id,
        shared_image_ids=payload.shared_image_ids,
        user_id=current_user.id,
    )

    total = await ProjectImageRepository.get_pool_count(connection, project_id)

    return JsonResponse(
        data=ProjectPoolResponse(
            project_id=project_id,
            total_images=total,
            images_added=images_added,
        ),
        message=f"Added {images_added} image(s) to project pool",
        status_code=status.HTTP_200_OK,
    )


@router.delete("/{project_id}/images", response_model=JsonResponse[ProjectPoolResponse, None])
async def remove_images_from_pool(
    payload: ProjectImageRemove,
    project: Annotated[dict, Depends(ProjectPermission("maintainer"))],
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)],
):
    """Remove images from project pool."""
    project_id = project["id"]

    images_removed = await ProjectImageRepository.bulk_remove_from_pool(
        connection,
        project_id=project_id,
        shared_image_ids=payload.shared_image_ids,
    )

    total = await ProjectImageRepository.get_pool_count(connection, project_id)

    return JsonResponse(
        data=ProjectPoolResponse(
            project_id=project_id,
            total_images=total,
            images_removed=images_removed,
        ),
        message=f"Removed {images_removed} image(s) from project pool",
        status_code=status.HTTP_200_OK,
    )


@router.get(
    "/{project_id}/images/available", response_model=JsonResponse[list[SharedImageResponse], None]
)
async def get_available_images(
    project: Annotated[dict, Depends(ProjectPermission("viewer"))],
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)],
    exclude_task_ids: list[int] | None = Query(default=None),
):
    """Get images in pool that are not yet assigned to specified tasks."""
    project_id = project["id"]

    images = await ProjectImageRepository.get_available_for_task(
        connection,
        project_id=project_id,
        exclude_task_ids=exclude_task_ids,
    )

    enriched = []
    for img in images:
        enriched.append(await _enrich_image(connection, img, project_id))

    return JsonResponse(
        data=enriched,
        message=f"Found {len(enriched)} available image(s)",
        status_code=status.HTTP_200_OK,
    )


# ============================================================================
# Explore - Advanced Filtering
# ============================================================================
@router.get("/{project_id}/explore", response_model=JsonResponse[ExploreResponse, None])
async def explore_project_images(
    project: Annotated[dict, Depends(ProjectPermission("viewer"))],
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)],
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=200),
    search: str | None = Query(default=None, max_length=255),
    tag_ids: list[UUID] | None = Query(default=None),
    task_ids: list[int] | None = Query(default=None),
    job_id: int | None = Query(default=None),
    is_annotated: bool | None = Query(default=None),
    # Metadata filters
    width_min: int | None = Query(default=None, ge=0),
    width_max: int | None = Query(default=None, ge=0),
    height_min: int | None = Query(default=None, ge=0),
    height_max: int | None = Query(default=None, ge=0),
    file_size_min: int | None = Query(default=None, ge=0),
    file_size_max: int | None = Query(default=None, ge=0),
    filepath_pattern: str | None = Query(default=None, max_length=255),
):
    """
    Explore images with combined filtering.
    Supports filtering by tags, task/job hierarchy (multi-task), annotation status, search, and metadata.

    Args:
        task_ids: Filter by multiple task IDs (OR logic - images in ANY of the selected tasks)
    """
    project_id = project["id"]

    images, total = await ProjectImageRepository.explore(
        connection,
        project_id=project_id,
        page=page,
        page_size=page_size,
        tag_ids=tag_ids,
        task_ids=task_ids,
        job_id=job_id,
        is_annotated=is_annotated,
        search=search,
        width_min=width_min,
        width_max=width_max,
        height_min=height_min,
        height_max=height_max,
        file_size_min=file_size_min,
        file_size_max=file_size_max,
        filepath_pattern=filepath_pattern,
    )

    enriched = []
    for img in images:
        enriched.append(await _enrich_image(connection, img, project_id))

    # Build filters applied dict
    filters_applied = {}
    if search:
        filters_applied["search"] = search
    if tag_ids:
        filters_applied["tag_ids"] = [str(t) for t in tag_ids]
    if task_ids is not None and len(task_ids) > 0:
        filters_applied["task_ids"] = task_ids
    if job_id is not None:
        filters_applied["job_id"] = job_id
    if is_annotated is not None:
        filters_applied["is_annotated"] = is_annotated

    return JsonResponse(
        data=ExploreResponse(
            images=enriched,
            total=total,
            page=page,
            page_size=page_size,
            filters_applied=filters_applied,
        ),
        message=f"Found {total} image(s)",
        status_code=status.HTTP_200_OK,
    )


@router.get("/{project_id}/explore/sidebar", response_model=JsonResponse[dict, None])
async def get_sidebar_aggregations(
    project: Annotated[dict, Depends(ProjectPermission("viewer"))],
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)],
    tag_ids: list[UUID] | None = Query(default=None),
    attribute_filters: str | None = Query(default=None),  # JSON encoded
    sidebar_mode: str = Query(default="best"),  # "all", "fast", "best"
):
    """
    Get sidebar aggregations for FiftyOne-style filtering.
    Returns tag counts, categorical attribute aggregations, numeric stats, and size distribution.
    """
    from app.repositories.attribute import AttributeSchemaRepository, ImageAttributeRepository
    from app.schemas.data_management import (
        CategoricalAggregation,
        CategoricalValueCount,
        ComputedFieldsAggregation,
        NumericAggregation,
        SidebarAggregationResponse,
        SizeDistribution,
        TagCount,
    )

    project_id = project["id"]

    # Get total and filtered image counts
    total_images = await ProjectImageRepository.get_pool_count(connection, project_id)

    # Get image IDs matching current filters (for dependent aggregations)
    filtered_image_ids = None
    if tag_ids:
        # Get images that have all the selected tags
        filtered_images, _ = await ProjectImageRepository.explore(
            connection,
            project_id=project_id,
            page=1,
            page_size=100000,  # Get all matching IDs
            tag_ids=tag_ids,
        )
        filtered_image_ids = [img["id"] for img in filtered_images]

    filtered_images_count = len(filtered_image_ids) if filtered_image_ids else total_images

    # Get tag counts with usage
    tags_with_count = await TagRepository.list_with_usage_count(connection, project_id)
    tag_counts = [
        TagCount(
            id=t["id"],
            name=t["name"],
            color=t["color"],
            count=t.get("usage_count", 0),
        )
        for t in tags_with_count
    ]

    # Get attribute schemas
    schemas = await AttributeSchemaRepository.list_for_project(
        connection, project_id, is_filterable=True
    )

    # Build categorical and numeric aggregations
    categorical_aggregations = []
    numeric_aggregations = []

    for schema in schemas:
        if schema["field_type"] == "categorical":
            values = await ImageAttributeRepository.get_categorical_aggregation(
                connection, project_id, schema["id"], filtered_image_ids
            )
            categorical_aggregations.append(
                CategoricalAggregation(
                    schema_id=schema["id"],
                    name=schema["name"],
                    display_name=schema.get("display_name"),
                    color=schema["color"],
                    values=[CategoricalValueCount(**v) for v in values],
                )
            )
        elif schema["field_type"] == "numeric":
            stats = await ImageAttributeRepository.get_numeric_aggregation(
                connection, project_id, schema["id"], filtered_image_ids
            )
            if stats["histogram"]:  # Only include if there's data
                from app.schemas.data_management import HistogramBucket

                numeric_aggregations.append(
                    NumericAggregation(
                        schema_id=schema["id"],
                        name=schema["name"],
                        display_name=schema.get("display_name"),
                        min_value=stats["min_value"],
                        max_value=stats["max_value"],
                        mean=stats["mean"],
                        histogram=[HistogramBucket(**b) for b in stats["histogram"]],
                    )
                )

    # Get size distribution (for computed fields)
    size_dist = await ProjectImageRepository.get_size_distribution(connection, project_id)

    # Get Metadata Stats (Width, Height, File Size)
    from uuid import UUID

    from app.models.data_management import shared_images

    # Helper to convert stats dict to NumericAggregation
    def to_numeric_agg(stats, name, display_name):
        # Use deterministic UUID for built-in metadata to avoid frontend key issues
        # Or just use a dummy one since it's in a specific named field
        dummy_id = UUID("00000000-0000-0000-0000-000000000000")
        return NumericAggregation(
            schema_id=dummy_id,
            name=name,
            display_name=display_name,
            min_value=stats["min_value"],
            max_value=stats["max_value"],
            mean=stats["mean"],
            histogram=[HistogramBucket(**h) for h in stats["histogram"]],
        )

    width_stats_raw = await ProjectImageRepository.get_numeric_stats(
        connection, project_id, shared_images.c.width, filtered_image_ids
    )
    width_stats = to_numeric_agg(width_stats_raw, "width", "Width")

    height_stats_raw = await ProjectImageRepository.get_numeric_stats(
        connection, project_id, shared_images.c.height, filtered_image_ids
    )
    height_stats = to_numeric_agg(height_stats_raw, "height", "Height")

    size_stats_raw = await ProjectImageRepository.get_numeric_stats(
        connection, project_id, shared_images.c.file_size_bytes, filtered_image_ids
    )
    file_size_stats = to_numeric_agg(size_stats_raw, "file_size_bytes", "File Size")

    return JsonResponse(
        data=SidebarAggregationResponse(
            total_images=total_images,
            filtered_images=filtered_images_count,
            tags=tag_counts,
            categorical_attributes=categorical_aggregations,
            numeric_attributes=numeric_aggregations,
            computed=ComputedFieldsAggregation(
                size_distribution=SizeDistribution(**size_dist),
                width_stats=width_stats,
                height_stats=height_stats,
                file_size_stats=file_size_stats,
            ),
        ),
        message="Sidebar aggregations",
        status_code=status.HTTP_200_OK,
    )


# ============================================================================
# Image Tagging (Project-Scoped)
# ============================================================================
@router.post(
    "/{project_id}/images/{image_id}/tags", response_model=JsonResponse[list[TagResponse], None]
)
async def add_tags_to_image(
    image_id: UUID,
    payload: AddTagsRequest,
    project: Annotated[dict, Depends(ProjectPermission("annotator"))],
    current_user: Annotated[UserBase, Depends(get_current_active_user)],
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)],
):
    """Add tags to an image in this project."""
    project_id = project["id"]

    # Verify image exists and is in project pool
    image = await SharedImageRepository.get_by_id(connection, image_id)
    if not image:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Image not found",
        )

    # Verify image is in project pool
    in_pool = await ProjectImageRepository.is_in_pool(connection, project_id, image_id)
    if not in_pool:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Image is not in this project's pool",
        )

    # Verify all tags belong to this project
    for tag_id in payload.tag_ids:
        tag = await TagRepository.get_by_id(connection, tag_id, project_id)
        if not tag:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Tag {tag_id} not found in this project",
            )

    # Add tags
    for tag_id in payload.tag_ids:
        await SharedImageTagRepository.add_tag(
            connection, project_id, image_id, tag_id, current_user.id
        )

    # Return updated tag list
    tags = await SharedImageTagRepository.get_tags_for_image(connection, project_id, image_id)
    return JsonResponse(
        data=[TagResponse(**t) for t in tags],
        message="Tags added",
        status_code=status.HTTP_200_OK,
    )


@router.delete(
    "/{project_id}/images/{image_id}/tags/{tag_id}",
    response_model=JsonResponse[list[TagResponse], None],
)
async def remove_tag_from_image(
    image_id: UUID,
    tag_id: UUID,
    project: Annotated[dict, Depends(ProjectPermission("annotator"))],
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)],
):
    """Remove a tag from an image in this project."""
    project_id = project["id"]

    # Verify image exists
    image = await SharedImageRepository.get_by_id(connection, image_id)
    if not image:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Image not found",
        )

    await SharedImageTagRepository.remove_tag(connection, project_id, image_id, tag_id)

    # Return updated tag list
    tags = await SharedImageTagRepository.get_tags_for_image(connection, project_id, image_id)
    return JsonResponse(
        data=[TagResponse(**t) for t in tags],
        message="Tag removed",
        status_code=status.HTTP_200_OK,
    )


@router.post("/{project_id}/images/bulk-tag", response_model=JsonResponse[BulkTagResponse, None])
async def bulk_tag_images(
    payload: BulkTagRequest,
    project: Annotated[dict, Depends(ProjectPermission("annotator"))],
    current_user: Annotated[UserBase, Depends(get_current_active_user)],
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)],
):
    """Add tags to multiple images in this project."""
    project_id = project["id"]

    # Verify all tags belong to this project
    for tag_id in payload.tag_ids:
        tag = await TagRepository.get_by_id(connection, tag_id, project_id)
        if not tag:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Tag {tag_id} not found in this project",
            )

    # Verify all images are in project pool
    for image_id in payload.shared_image_ids:
        in_pool = await ProjectImageRepository.is_in_pool(connection, project_id, image_id)
        if not in_pool:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Image {image_id} is not in this project's pool",
            )

    tags_added = await SharedImageTagRepository.bulk_add_tags(
        connection,
        project_id,
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


@router.delete("/{project_id}/images/bulk-tag", response_model=JsonResponse[BulkTagResponse, None])
async def bulk_untag_images(
    payload: BulkTagRequest,
    project: Annotated[dict, Depends(ProjectPermission("annotator"))],
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)],
):
    """Remove tags from multiple images in this project."""
    project_id = project["id"]

    tags_removed = await SharedImageTagRepository.bulk_remove_tags(
        connection,
        project_id,
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
