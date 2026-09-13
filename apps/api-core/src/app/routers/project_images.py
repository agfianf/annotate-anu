"""Router for Project Images (project image pool)."""

import logging
from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import Select
from sqlalchemy.ext.asyncio import AsyncConnection

from app.dependencies.auth import get_current_active_user
from app.dependencies.database import get_async_transaction_conn
from app.dependencies.rbac import ProjectPermission
from app.helpers.response_api import JsonResponse
from app.models.data_management import shared_images
from app.repositories.analytics import AnalyticsRepository
from app.repositories.annotation import AnnotationSummaryRepository
from app.repositories.image_quality import ImageQualityRepository
from app.repositories.image_scope import ImageScopeRepository
from app.repositories.project_image import ProjectImageRepository
from app.repositories.shared_image import SharedImageRepository
from app.repositories.shared_image_tag import SharedImageTagRepository
from app.repositories.tag import TagRepository
from app.routers.analytics import ImageFilters
from app.schemas.auth import UserBase
from app.schemas.data_management import (
    AddTagsRequest,
    AddTagsResponse,
    BboxPreview,
    BulkTagPreviewResponse,
    BulkTagResponse,
    PolygonPreview,
    ProjectImageAdd,
    ProjectImageRemove,
    ProjectPoolListResponse,
    ProjectPoolResponse,
    ReplacedTagInfo,
    SharedImageResponse,
    TagResponse,
)
from app.schemas.image_filters import (
    MAX_FILTER_RESOLVED_IMAGES,
    AnnotationSummaryWithTruncation,
    BulkTagPreviewScopedRequest,
    BulkTagScopedRequest,
    ExplorePageResponse,
    ImageFilterParams,
    SharedImageWithAnnotationPreview,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/projects", tags=["Project Images"])


def _build_thumbnail_url(file_path: str) -> str:
    """Build thumbnail URL for a file path."""
    return f"/api/v1/share/thumbnail/{file_path}"


async def _enrich_image(
    connection: AsyncConnection,
    image: dict,
    project_id: int,
    annotation_summary: dict | None = None,
    tags: list[dict] | None = None,
    bbox_limit: int | None = None,
    polygon_limit: int | None = None,
) -> SharedImageWithAnnotationPreview:
    """Enrich image with tags, thumbnail URL, and optional annotation summary.

    Pass ``tags`` (from ``SharedImageRepository.get_tags_bulk``) when enriching
    many images so the tags are fetched in one query instead of one per image.

    ``bbox_limit`` and ``polygon_limit`` are the per-image geometry caps the summary was built
    with. Reaching a cap sets the matching ``*_truncated`` flag so the client can label the image
    as showing a partial overlay; the counts stay exact either way.
    """
    if tags is None:
        tags = await SharedImageRepository.get_tags(connection, image["id"], project_id)

    # Build annotation summary if provided
    ann_summary = None
    if annotation_summary:
        bboxes = None
        if annotation_summary.get("bboxes"):
            bboxes = [BboxPreview(**bbox) for bbox in annotation_summary["bboxes"]]
        polygons = None
        if annotation_summary.get("polygons"):
            polygons = [PolygonPreview(**poly) for poly in annotation_summary["polygons"]]
        ann_summary = AnnotationSummaryWithTruncation(
            detection_count=annotation_summary.get("detection_count", 0),
            segmentation_count=annotation_summary.get("segmentation_count", 0),
            bboxes=bboxes,
            polygons=polygons,
            bboxes_truncated=bbox_limit is not None
            and bboxes is not None
            and len(bboxes) >= bbox_limit,
            polygons_truncated=polygon_limit is not None
            and polygons is not None
            and len(polygons) >= polygon_limit,
        )

    return SharedImageWithAnnotationPreview(
        **{k: v for k, v in image.items() if k not in ("added_to_pool_at",)},
        thumbnail_url=_build_thumbnail_url(image["file_path"]),
        tags=[TagResponse(**t) for t in tags],
        annotation_summary=ann_summary,
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

    tags_by_image = await SharedImageRepository.get_tags_bulk(
        connection, [img["id"] for img in images], project_id
    )
    enriched = []
    for img in images:
        enriched.append(
            await _enrich_image(connection, img, project_id, tags=tags_by_image.get(img["id"], []))
        )

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
    """Add images to project pool and trigger quality metrics computation.

    This endpoint:
    1. Adds images to the project pool
    2. Creates pending quality metrics records
    3. Dispatches a Celery task for background quality processing
    """
    project_id = project["id"]

    images_added = await ProjectImageRepository.bulk_add_to_pool(
        connection,
        project_id=project_id,
        shared_image_ids=payload.shared_image_ids,
        user_id=current_user.id,
    )

    # Queue quality metrics computation for newly added images
    if images_added > 0:
        await ImageQualityRepository.bulk_create_pending(connection, payload.shared_image_ids)

        # Dispatch Celery task for background processing (non-blocking)
        # This will process ALL pending images in the project, including newly added ones
        try:
            from app.tasks.quality import process_quality_metrics_task

            # Commit first so the pending records are visible to the worker
            await connection.commit()

            # Dispatch task without creating a job record (auto-triggered)
            process_quality_metrics_task.delay(
                job_id=None,  # No job tracking for auto-triggered processing
                project_id=project_id,
                batch_size=50,
            )
        except Exception:
            # Don't fail the upload if Celery is unavailable
            pass

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

    tags_by_image = await SharedImageRepository.get_tags_bulk(
        connection, [img["id"] for img in images], project_id
    )
    enriched = []
    for img in images:
        enriched.append(
            await _enrich_image(connection, img, project_id, tags=tags_by_image.get(img["id"], []))
        )

    return JsonResponse(
        data=enriched,
        message=f"Found {len(enriched)} available image(s)",
        status_code=status.HTTP_200_OK,
    )


# ============================================================================
# Explore - Advanced Filtering
# ============================================================================
@router.get("/{project_id}/explore", response_model=JsonResponse[ExplorePageResponse, None])
async def explore_project_images(
    project: Annotated[dict, Depends(ProjectPermission("viewer"))],
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)],
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=200),
    search: str | None = Query(default=None, max_length=255),
    tag_ids: list[UUID] | None = Query(default=None),
    excluded_tag_ids: list[UUID] | None = Query(default=None),
    include_match_mode: Literal["AND", "OR"] = Query(default="OR"),
    exclude_match_mode: Literal["AND", "OR"] = Query(default="OR"),
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
    aspect_ratio_min: float | None = Query(
        default=None, ge=0, description="Minimum aspect ratio (width/height)"
    ),
    aspect_ratio_max: float | None = Query(
        default=None, ge=0, description="Maximum aspect ratio (width/height)"
    ),
    object_count_min: int | None = Query(
        default=None,
        ge=0,
        description="Minimum annotation count per image (detections + segmentations)",
    ),
    object_count_max: int | None = Query(
        default=None,
        ge=0,
        description="Maximum annotation count per image (detections + segmentations)",
    ),
    bbox_count_min: int | None = Query(
        default=None, ge=0, description="Minimum bbox (detection) count per image"
    ),
    bbox_count_max: int | None = Query(
        default=None, ge=0, description="Maximum bbox (detection) count per image"
    ),
    polygon_count_min: int | None = Query(
        default=None, ge=0, description="Minimum polygon (segmentation) count per image"
    ),
    polygon_count_max: int | None = Query(
        default=None, ge=0, description="Maximum polygon (segmentation) count per image"
    ),
    filepath_pattern: str | None = Query(default=None, max_length=255),
    filepath_paths: list[str] | None = Query(default=None),
    image_uids: list[UUID] | None = Query(default=None),
    # Quality metric filters
    quality_min: float | None = Query(
        default=None, ge=0, le=1, description="Minimum overall quality score (0-1)"
    ),
    quality_max: float | None = Query(
        default=None, ge=0, le=1, description="Maximum overall quality score (0-1)"
    ),
    sharpness_min: float | None = Query(
        default=None, ge=0, le=1, description="Minimum sharpness score (0-1)"
    ),
    sharpness_max: float | None = Query(
        default=None, ge=0, le=1, description="Maximum sharpness score (0-1)"
    ),
    brightness_min: float | None = Query(
        default=None, ge=0, le=1, description="Minimum brightness score (0-1)"
    ),
    brightness_max: float | None = Query(
        default=None, ge=0, le=1, description="Maximum brightness score (0-1)"
    ),
    contrast_min: float | None = Query(
        default=None, ge=0, le=1, description="Minimum contrast score (0-1)"
    ),
    contrast_max: float | None = Query(
        default=None, ge=0, le=1, description="Maximum contrast score (0-1)"
    ),
    uniqueness_min: float | None = Query(
        default=None, ge=0, le=1, description="Minimum uniqueness score (0-1)"
    ),
    uniqueness_max: float | None = Query(
        default=None, ge=0, le=1, description="Maximum uniqueness score (0-1)"
    ),
    # RGB channel filters
    red_min: float | None = Query(
        default=None, ge=0, le=1, description="Minimum red channel average (0-1)"
    ),
    red_max: float | None = Query(
        default=None, ge=0, le=1, description="Maximum red channel average (0-1)"
    ),
    green_min: float | None = Query(
        default=None, ge=0, le=1, description="Minimum green channel average (0-1)"
    ),
    green_max: float | None = Query(
        default=None, ge=0, le=1, description="Maximum green channel average (0-1)"
    ),
    blue_min: float | None = Query(
        default=None, ge=0, le=1, description="Minimum blue channel average (0-1)"
    ),
    blue_max: float | None = Query(
        default=None, ge=0, le=1, description="Maximum blue channel average (0-1)"
    ),
    # Quality issues filter
    issues: list[str] | None = Query(
        default=None,
        description="Filter by quality issues: blur, low_brightness, high_brightness, low_contrast, duplicate",
    ),
    # Annotation overlay options
    include_bboxes: bool = Query(default=True, description="Include bboxes in annotation_summary"),
    include_polygons: bool = Query(
        default=True, description="Include polygon data for segmentations"
    ),
    include_bbox: bool | None = Query(
        default=None, description="Alias for include_bboxes; wins when both are sent"
    ),
    include_polygon: bool | None = Query(
        default=None, description="Alias for include_polygons; wins when both are sent"
    ),
    max_bboxes_per_image: int = Query(
        default=100, ge=1, le=500, description="Max bboxes per image"
    ),
    max_polygons_per_image: int = Query(
        default=50, ge=1, le=200, description="Max polygons per image"
    ),
):
    """
    Explore images with combined filtering.
    Supports filtering by tags, task/job hierarchy (multi-task), annotation status, search, and metadata.

    Annotation counts are always returned. Geometry is only fetched when asked for: with
    ``include_bboxes``/``include_polygons`` off (or their ``include_bbox``/``include_polygon``
    aliases), each summary carries its exact counts and no shapes, so hiding overlays makes the
    response smaller. Geometry that is returned is capped per image; an image that hits a cap is
    marked with ``bboxes_truncated``/``polygons_truncated`` rather than silently showing fewer
    shapes than it has.

    Args:
        task_ids: Filter by multiple task IDs (OR logic - images in ANY of the selected tasks)
        include_bboxes: Include bbox previews for annotation overlay in gallery
        max_bboxes_per_image: Maximum number of bboxes to return per image
    """
    project_id = project["id"]

    filters = ImageFilterParams(
        tag_ids=tag_ids,
        excluded_tag_ids=excluded_tag_ids,
        include_match_mode=include_match_mode,
        exclude_match_mode=exclude_match_mode,
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
        aspect_ratio_min=aspect_ratio_min,
        aspect_ratio_max=aspect_ratio_max,
        object_count_min=object_count_min,
        object_count_max=object_count_max,
        bbox_count_min=bbox_count_min,
        bbox_count_max=bbox_count_max,
        polygon_count_min=polygon_count_min,
        polygon_count_max=polygon_count_max,
        filepath_pattern=filepath_pattern,
        filepath_paths=filepath_paths,
        image_uids=image_uids,
        quality_min=quality_min,
        quality_max=quality_max,
        sharpness_min=sharpness_min,
        sharpness_max=sharpness_max,
        brightness_min=brightness_min,
        brightness_max=brightness_max,
        contrast_min=contrast_min,
        contrast_max=contrast_max,
        uniqueness_min=uniqueness_min,
        uniqueness_max=uniqueness_max,
        red_min=red_min,
        red_max=red_max,
        green_min=green_min,
        green_max=green_max,
        blue_min=blue_min,
        blue_max=blue_max,
        issues=issues,
    )

    images, total = await ProjectImageRepository.explore(
        connection,
        project_id=project_id,
        page=page,
        page_size=page_size,
        filters=filters,
    )

    want_bboxes = include_bboxes if include_bbox is None else include_bbox
    want_polygons = include_polygons if include_polygon is None else include_polygon

    # Fetch annotation summaries for all images in batch
    image_ids = [img["id"] for img in images]
    annotation_summaries = await AnnotationSummaryRepository.get_summary_for_images(
        connection,
        image_ids,
        include_bboxes=want_bboxes,
        include_polygons=want_polygons,
        max_bboxes_per_image=max_bboxes_per_image,
        max_polygons_per_image=max_polygons_per_image,
    )

    if logger.isEnabledFor(logging.DEBUG):
        logger.debug(
            "explore annotation summaries: project=%s page=%s images=%s detections=%s "
            "segmentations=%s bboxes=%s polygons=%s geometry=%s",
            project_id,
            page,
            len(annotation_summaries),
            sum(s.get("detection_count", 0) for s in annotation_summaries.values()),
            sum(s.get("segmentation_count", 0) for s in annotation_summaries.values()),
            sum(len(s.get("bboxes") or []) for s in annotation_summaries.values()),
            sum(len(s.get("polygons") or []) for s in annotation_summaries.values()),
            f"bboxes={want_bboxes},polygons={want_polygons}",
        )

    tags_by_image = await SharedImageRepository.get_tags_bulk(connection, image_ids, project_id)
    enriched = []
    for img in images:
        ann_summary = annotation_summaries.get(img["id"])
        enriched.append(
            await _enrich_image(
                connection,
                img,
                project_id,
                ann_summary,
                tags=tags_by_image.get(img["id"], []),
                bbox_limit=max_bboxes_per_image if want_bboxes else None,
                polygon_limit=max_polygons_per_image if want_polygons else None,
            )
        )

    # Build filters applied dict
    filters_applied = {}
    if search:
        filters_applied["search"] = search
    if tag_ids:
        filters_applied["tag_ids"] = [str(t) for t in tag_ids]
    if excluded_tag_ids:
        filters_applied["excluded_tag_ids"] = [str(t) for t in excluded_tag_ids]
    if tag_ids or excluded_tag_ids:
        filters_applied["include_match_mode"] = include_match_mode
        filters_applied["exclude_match_mode"] = exclude_match_mode
    if task_ids is not None and len(task_ids) > 0:
        filters_applied["task_ids"] = task_ids
    if job_id is not None:
        filters_applied["job_id"] = job_id
    if is_annotated is not None:
        filters_applied["is_annotated"] = is_annotated
    if filepath_paths is not None and len(filepath_paths) > 0:
        filters_applied["filepath_paths"] = filepath_paths
    if image_uids is not None and len(image_uids) > 0:
        filters_applied["image_uids"] = [str(uid) for uid in image_uids]

    return JsonResponse(
        data=ExplorePageResponse(
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
    filters: ImageFilters,
    attribute_filters: str | None = Query(default=None),  # JSON encoded
    sidebar_mode: str = Query(default="best"),  # "all", "fast", "best"
):
    """
    Get sidebar aggregations for FiftyOne-style filtering.
    Returns tag counts, categorical attribute aggregations, numeric stats, and size distribution.

    Every panel describes the same image set as the gallery beside it — the "current results" rule `AnalyticsRepository` states: a facet counts matching images *after* all active filters, including a filter on the facet's own field. `filters` is the whole `ImageFilterParams` contract, resolved through `ProjectImageRepository.build_filtered_query`; it used to accept `tag_ids` alone, so every other filter the client sent was dropped on the floor, and the tag facet and the size distribution stayed project-wide even once it did not.

    The filtered set is carried into the aggregates as a **statement**, never as a list of ids: a search matching 150 000 images must not put 150 000 UUIDs into Python and then back into every aggregate as an `IN` list, once per keystroke.

    Only the counts move with the filter; the rows do not. Every tag the project defines is still listed, at zero when nothing in the results carries it, so the client can still offer it as a filter to add.
    """
    from app.repositories.attribute import AttributeSchemaRepository, ImageAttributeRepository
    from app.schemas.data_management import (
        CategoricalAggregation,
        CategoricalValueCount,
        ComputedFieldsAggregation,
        HistogramBucket,
        NumericAggregation,
        SidebarAggregationResponse,
        SizeDistribution,
        TagCount,
    )

    project_id = project["id"]

    # Get total and filtered image counts
    total_images = await ProjectImageRepository.get_pool_count(connection, project_id)

    # Counted in SQL over the filtered set: a filter matching nothing reports 0, not the project
    # total. The old `len(ids) if ids else total_images` made an empty result indistinguishable
    # from no filter at all.
    filtered_images_count = await AnalyticsRepository.count_images(connection, project_id, filters)

    # `None` means "no filter applied", so every aggregation below covers the whole pool. Anything
    # else is the filtered set as an unexecuted `SELECT`, which the aggregates match against with
    # `IN (SELECT ...)`. Resolving it to a list here is what made a one-character search term cost
    # six statements each carrying the whole match set as bound parameters.
    filtered_ids = (
        None
        if filters.is_empty()
        else ProjectImageRepository.filtered_image_ids_subquery(project_id, filters)
    )

    # Tag counts over the results, not over the project: a sidebar reporting 412 images carrying
    # `red` beside `filtered_images: 3` was describing a different image set from the gallery.
    # Every project tag stays in the list so the client can still offer it as a filter to add;
    # only the count narrows.
    filtered_tag_counts = dict(
        await AnalyticsRepository.tag_image_counts(connection, project_id, filters)
    )
    tags_with_count = await TagRepository.list_with_usage_count(connection, project_id)
    tag_counts = [
        TagCount(
            id=t["id"],
            name=t["name"],
            color=t["color"],
            count=filtered_tag_counts.get(t["id"], 0),
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
                connection, project_id, schema["id"], filtered_ids
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
                connection, project_id, schema["id"], filtered_ids
            )
            if stats["histogram"]:  # Only include if there's data
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

    # Size distribution over the results too: it sits in the same panel as the width and height
    # histograms, which have been filter-scoped all along.
    size_dist = await ImageScopeRepository.size_distribution(connection, project_id, filtered_ids)

    # Get Metadata Stats (Width, Height, File Size)
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

    width_stats_raw = await ImageScopeRepository.numeric_column_stats(
        connection, project_id, shared_images.c.width, filtered_ids
    )
    width_stats = to_numeric_agg(width_stats_raw, "width", "Width")

    height_stats_raw = await ImageScopeRepository.numeric_column_stats(
        connection, project_id, shared_images.c.height, filtered_ids
    )
    height_stats = to_numeric_agg(height_stats_raw, "height", "Height")

    size_stats_raw = await ImageScopeRepository.numeric_column_stats(
        connection, project_id, shared_images.c.file_size_bytes, filtered_ids
    )
    file_size_stats = to_numeric_agg(size_stats_raw, "file_size_bytes", "File Size")

    response_data = SidebarAggregationResponse(
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
    )

    return JsonResponse(
        data=response_data.model_dump(),
        message="Sidebar aggregations",
        status_code=status.HTTP_200_OK,
    )


# ============================================================================
# Image Tagging (Project-Scoped)
# ============================================================================
@router.post(
    "/{project_id}/images/{image_id}/tags", response_model=JsonResponse[AddTagsResponse, None]
)
async def add_tags_to_image(
    image_id: UUID,
    payload: AddTagsRequest,
    project: Annotated[dict, Depends(ProjectPermission("annotator"))],
    current_user: Annotated[UserBase, Depends(get_current_active_user)],
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)],
):
    """
    Add tags to an image in this project.

    Enforces the 1-tag-per-label rule: only one tag from each non-uncategorized
    label can exist on an image at a time. Adding a new tag from a label will
    automatically replace the existing tag (auto-replacement).

    Uncategorized tags are exempt from this rule and can have multiple tags.
    """
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

    # Add tags with automatic replacement (1-tag-per-label rule)
    replaced_tags = []
    for tag_id in payload.tag_ids:
        new_link, replaced_info = await SharedImageTagRepository.add_tag_with_replacement(
            connection, project_id, image_id, tag_id, current_user.id
        )
        if replaced_info:
            replaced_tags.append(
                ReplacedTagInfo(
                    tag_id=replaced_info["tag_id"],
                    tag_name=replaced_info["tag_name"],
                    label_id=replaced_info["category_id"],
                    label_name=replaced_info["category_name"],
                )
            )

    # Return updated tag list and any replaced tags
    tags = await SharedImageTagRepository.get_tags_for_image(connection, project_id, image_id)

    message = "Tags added"
    if replaced_tags:
        message = (
            f"Added tags (replaced {len(replaced_tags)} existing tag(s) due to 1-per-label rule)"
        )

    return JsonResponse(
        data=AddTagsResponse(
            tags=[TagResponse(**t) for t in tags],
            replaced_tags=replaced_tags,
        ),
        message=message,
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


#: Ceiling on one bulk tag request, counted in (image, tag) pairs — the rows the write actually
#: touches, which is what decides whether the request finishes. `MAX_FILTER_RESOLVED_IMAGES` caps
#: the images; this caps the work, and a request over either is refused before anything is written.
#:
#: Measured on this project's Postgres against the 10 100-image test pool: the set-based write
#: (freeze the scope, one DELETE for displaced links, one `INSERT ... SELECT ... ON CONFLICT` per
#: tag) runs at ~18 600 pairs/s — 101 000 pairs in 5.6 s, 202 000 in 10.8 s, linear. So this
#: ceiling is a request of roughly eleven seconds. The per-pair loop it replaced ran at 844
#: pairs/s, which put the old, unenforceable ceiling of 50 000 images × 50 tags at about 49
#: minutes inside one transaction holding locks on `shared_image_tags` throughout.
MAX_BULK_TAG_PAIRS = 200_000


async def _resolve_bulk_targets(
    connection: AsyncConnection,
    project_id: int,
    payload: BulkTagScopedRequest,
) -> list[UUID] | Select:
    """Resolve which images a bulk request acts on.

    An explicit ``shared_image_ids`` list is used as given; the request schema caps it at 500.
    A ``scope`` comes back as the **statement** that selects the matching ids, not as the ids: the
    repository freezes it once and joins against it, so a 50 000-image scope costs the same number
    of round trips as a 50-image one. Membership is still resolved **at action time** — the set is
    whatever matches when the request arrives, minus the caller's ``excluded_image_ids``, so images
    added since the user made the selection are included and images that stopped matching are not.

    The scope is sized before anything is written, and a request whose (image, tag) pairs exceed
    `MAX_BULK_TAG_PAIRS` is refused outright rather than accepted and left to time out.
    """
    if payload.shared_image_ids:
        return payload.shared_image_ids
    if payload.scope is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Provide either a non-empty shared_image_ids list or scope",
        )

    scope = payload.scope
    ids_query = ImageScopeRepository.filtered_scope(
        project_id, scope.filters, scope.excluded_image_ids
    )
    matched = await ImageScopeRepository.count_scope(connection, ids_query)
    if not matched:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Filter matches no images in this project's pool",
        )
    if matched > MAX_FILTER_RESOLVED_IMAGES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Filter matches more than {MAX_FILTER_RESOLVED_IMAGES} images; "
                "narrow the filters before applying a bulk action"
            ),
        )
    pairs = matched * len(payload.tag_ids)
    if pairs > MAX_BULK_TAG_PAIRS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"{matched} images x {len(payload.tag_ids)} tags is {pairs} tag assignments, "
                f"over the {MAX_BULK_TAG_PAIRS} limit for one request; "
                "narrow the filters or apply fewer tags at a time"
            ),
        )
    return ids_query


@router.post(
    "/{project_id}/images/bulk-tag/preview",
    response_model=JsonResponse[BulkTagPreviewResponse, None],
)
async def preview_bulk_tag(
    payload: BulkTagPreviewScopedRequest,
    project: Annotated[dict, Depends(ProjectPermission("annotator"))],
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)],
):
    """
    Preview a bulk tag operation to show how many tags would be replaced.

    Use this endpoint before bulk_tag_images to show the user a confirmation
    dialog when tags from the same label would be replaced.

    Targets are named either by ``shared_image_ids`` or by ``scope``; a scope is resolved at
    request time, so a preview and the operation that follows it can differ if the project
    changes in between.
    """
    project_id = project["id"]

    targets = await _resolve_bulk_targets(connection, project_id, payload)

    # Get preview stats
    preview = await SharedImageTagRepository.get_bulk_tag_preview(
        connection,
        project_id,
        targets,
        payload.tag_ids,
    )

    return JsonResponse(
        data=BulkTagPreviewResponse(
            total_images=preview["total_images"],
            total_tags_to_add=preview["total_tags_to_add"],
            tags_to_replace=preview["tags_to_replace"],
            conflicts_by_label=preview["conflicts_by_label"],
        ),
        message="Bulk tag preview",
        status_code=status.HTTP_200_OK,
    )


@router.post("/{project_id}/images/bulk-tag", response_model=JsonResponse[BulkTagResponse, None])
async def bulk_tag_images(
    payload: BulkTagScopedRequest,
    project: Annotated[dict, Depends(ProjectPermission("annotator"))],
    current_user: Annotated[UserBase, Depends(get_current_active_user)],
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)],
):
    """
    Add tags to multiple images in this project.

    Name the targets either with an explicit ``shared_image_ids`` list or with a ``scope``
    (a filter set plus ``excluded_image_ids``) to act on every image the filters match without
    sending the ids. **A scope's membership is resolved at action time**, not when the user made
    the selection: the server runs the filter as this request arrives, so images that started
    matching in the meantime are tagged and images that stopped matching are not. Show the same
    rule in the UI.

    Enforces the 1-tag-per-label rule: only one tag from each non-uncategorized
    label can exist on an image at a time. Adding a new tag from a label will
    automatically replace the existing tag.

    Use the preview endpoint first to show a confirmation dialog to the user
    when replacements would occur.
    """
    project_id = project["id"]

    # Verify all tags belong to this project
    for tag_id in payload.tag_ids:
        tag = await TagRepository.get_by_id(connection, tag_id, project_id)
        if not tag:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Tag {tag_id} not found in this project",
            )

    targets = await _resolve_bulk_targets(connection, project_id, payload)

    # Verify all images are in project pool. Filter-resolved targets come from the pool by
    # construction, so only an explicitly supplied list needs checking.
    if payload.shared_image_ids:
        for image_id in payload.shared_image_ids:
            in_pool = await ProjectImageRepository.is_in_pool(connection, project_id, image_id)
            if not in_pool:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Image {image_id} is not in this project's pool",
                )

    # Bulk add tags with automatic replacement (1-tag-per-label rule). The replacement breakdown
    # comes back from the same DELETE that performed the replacements; asking for it afterwards
    # with the preview query, as this handler used to, could only ever answer an empty map, since
    # by then the displaced tags were gone.
    result = await SharedImageTagRepository.bulk_add_tags_with_replacement(
        connection,
        project_id,
        targets,
        payload.tag_ids,
        current_user.id,
    )

    message = f"Added {result['tags_added']} tag(s) to {result['images_affected']} image(s)"
    if result["tags_replaced"] > 0:
        message += f" (replaced {result['tags_replaced']} existing tag(s))"

    return JsonResponse(
        data=BulkTagResponse(
            tags_added=result["tags_added"],
            tags_replaced=result["tags_replaced"],
            images_affected=result["images_affected"],
            conflicts_by_label=result["conflicts_by_label"],
        ),
        message=message,
        status_code=status.HTTP_200_OK,
    )


@router.delete("/{project_id}/images/bulk-tag", response_model=JsonResponse[BulkTagResponse, None])
async def bulk_untag_images(
    payload: BulkTagScopedRequest,
    project: Annotated[dict, Depends(ProjectPermission("annotator"))],
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)],
):
    """Remove tags from multiple images in this project.

    Targets are named either with an explicit ``shared_image_ids`` list or with a ``scope``
    (a filter set plus ``excluded_image_ids``). **A scope's membership is resolved at action
    time**: the filter runs as this request arrives, not when the user made the selection.
    """
    project_id = project["id"]

    targets = await _resolve_bulk_targets(connection, project_id, payload)
    image_count = (
        len(targets)
        if isinstance(targets, list)
        else await ImageScopeRepository.count_scope(connection, targets)
    )

    tags_removed = await SharedImageTagRepository.bulk_remove_tags(
        connection,
        project_id,
        targets,
        payload.tag_ids,
    )

    return JsonResponse(
        data=BulkTagResponse(
            tags_added=tags_removed,  # Reusing field for removed count
            images_affected=image_count,
        ),
        message=f"Removed {tags_removed} tag(s) from {image_count} image(s)",
        status_code=status.HTTP_200_OK,
    )
