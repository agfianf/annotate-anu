"""Analytics router for dataset statistics and insights."""

from typing import Annotated, Literal
from uuid import UUID
from collections import Counter
import math

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncConnection

from app.dependencies.rbac import ProjectPermission
from app.dependencies.database import get_async_transaction_conn
from app.helpers.response_api import JsonResponse
from app.repositories.project_image import ProjectImageRepository
from app.repositories.tag import TagRepository
from app.repositories.tag_category import TagCategoryRepository
from app.repositories.shared_image import SharedImageRepository
from app.schemas.data_management import (
    DatasetStatsResponse,
    TagDistribution,
    DimensionBucket,
    AspectRatioBucket,
    FileSizeStats,
)
from app.schemas.analytics import (
    AnnotationCoverageResponse,
    ClassBalanceResponse,
    SpatialHeatmapResponse,
    ImageQualityResponse,
)
from app.services.analytics_service import AnalyticsService

router = APIRouter(prefix="/api/v1/projects", tags=["Analytics"])


def compute_dynamic_bins(values: list[int], max_bins: int = 8) -> list[tuple[int, int]]:
    """
    Compute dynamic bins using Sturges' rule.
    Returns list of (min, max) tuples for each bin.
    """
    if not values:
        return []

    min_val = min(values)
    max_val = max(values)

    if min_val == max_val:
        return [(min_val, max_val)]

    # Sturges' rule: k = ceil(log2(n) + 1)
    n = len(values)
    num_bins = min(max(math.ceil(math.log2(n) + 1), 3), max_bins)

    # Create evenly spaced bins
    bin_width = (max_val - min_val) / num_bins
    bins = []

    for i in range(num_bins):
        bin_min = int(min_val + i * bin_width)
        bin_max = int(min_val + (i + 1) * bin_width)
        # Ensure last bin captures max value
        if i == num_bins - 1:
            bin_max = max_val
        bins.append((bin_min, bin_max))

    return bins


def compute_dynamic_ratio_bins(values: list[float], max_bins: int = 8) -> list[tuple[float, float]]:
    """
    Compute dynamic bins for aspect ratios using Sturges' rule.
    Returns list of (min, max) tuples for each bin.
    """
    if not values:
        return []

    min_val = min(values)
    max_val = max(values)

    if min_val == max_val:
        return [(min_val, max_val)]

    # Sturges' rule: k = ceil(log2(n) + 1)
    n = len(values)
    num_bins = min(max(math.ceil(math.log2(n) + 1), 3), max_bins)

    # Create evenly spaced bins
    bin_width = (max_val - min_val) / num_bins
    bins = []

    for i in range(num_bins):
        bin_min = round(min_val + i * bin_width, 2)
        bin_max = round(min_val + (i + 1) * bin_width, 2)
        # Ensure last bin captures max value
        if i == num_bins - 1:
            bin_max = round(max_val, 2)
        bins.append((bin_min, bin_max))

    return bins


@router.get("/{project_id}/analytics/dataset-stats", response_model=JsonResponse[DatasetStatsResponse, None])
async def get_dataset_stats(
    project: Annotated[dict, Depends(ProjectPermission("viewer"))],
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)],
    # Filter parameters (same as explore endpoint)
    tag_ids: list[UUID] | None = Query(default=None),
    excluded_tag_ids: list[UUID] | None = Query(default=None),
    include_match_mode: Literal["AND", "OR"] = Query(default="OR"),
    exclude_match_mode: Literal["AND", "OR"] = Query(default="OR"),
    task_ids: list[int] | None = Query(default=None),
    job_id: int | None = Query(default=None),
    is_annotated: bool | None = Query(default=None),
    search: str | None = Query(default=None, max_length=255),
    width_min: int | None = Query(default=None, ge=0),
    width_max: int | None = Query(default=None, ge=0),
    height_min: int | None = Query(default=None, ge=0),
    height_max: int | None = Query(default=None, ge=0),
    file_size_min: int | None = Query(default=None, ge=0),
    file_size_max: int | None = Query(default=None, ge=0),
    filepath_pattern: str | None = Query(default=None, max_length=255),
    filepath_paths: list[str] | None = Query(default=None),
    image_uids: list[UUID] | None = Query(default=None),
):
    """
    Get dataset statistics for analytics panel.
    Returns tag distribution, dimension histogram, and file size stats.
    Applies the same filters as the explore endpoint for consistency.
    """
    project_id = project["id"]

    # Get filtered images (all pages to compute accurate stats)
    images, total = await ProjectImageRepository.explore(
        connection,
        project_id=project_id,
        page=1,
        page_size=10000,  # Large limit to get all filtered images
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
        filepath_pattern=filepath_pattern,
        filepath_paths=filepath_paths,
        image_uids=image_uids,
    )

    # Get all project tags with usage counts
    all_tags = await TagRepository.list_with_usage_count(connection, project_id)
    tag_map = {tag["id"]: tag for tag in all_tags}

    # Get all tag categories for category info lookup
    all_categories = await TagCategoryRepository.list_for_project(connection, project_id)
    category_map = {cat["id"]: cat for cat in all_categories}

    # Compute tag distribution from filtered images
    tag_counter = Counter()
    for img in images:
        # Get tags for this image
        image_tags = await SharedImageRepository.get_tags(connection, img["id"], project_id)
        for tag in image_tags:
            tag_counter[tag["id"]] += 1

    # Build tag distribution list with category info
    tag_distribution = []
    for tag_id, count in tag_counter.most_common():
        tag_info = tag_map.get(tag_id)
        if tag_info:
            # Get category info if available
            category_id = tag_info.get("category_id")
            category_info = category_map.get(category_id) if category_id else None

            tag_distribution.append(
                TagDistribution(
                    tag_id=str(tag_id),
                    name=tag_info["name"],
                    count=count,
                    color=tag_info.get("color", "#6B7280"),
                    category_id=str(category_id) if category_id else None,
                    category_name=category_info["name"] if category_info else None,
                    category_color=category_info.get("color") if category_info else None,
                )
            )

    # Collect dimension and aspect ratio data
    dimensions = []  # Use max(width, height) for dimension binning
    aspect_ratios = []

    for img in images:
        width = img.get("width")
        height = img.get("height")
        if width and height and height > 0:
            # Use the larger dimension for binning
            dimensions.append(max(width, height))
            # Calculate aspect ratio (width / height)
            aspect_ratios.append(round(width / height, 3))

    # Compute dynamic dimension bins using Sturges' rule
    dimension_bins = compute_dynamic_bins(dimensions, max_bins=8)

    # Count images in each dimension bin
    dimension_histogram = []
    if dimensions and dimension_bins:
        max_dim = max(dimensions)
        for bin_min, bin_max in dimension_bins:
            count = sum(1 for d in dimensions if bin_min <= d < bin_max or (bin_max == max_dim and d == bin_max))
            bucket_label = f"{bin_min}-{bin_max}px"
            dimension_histogram.append(
                DimensionBucket(
                    bucket=bucket_label,
                    count=count,
                    min=bin_min,
                    max=bin_max,
                )
            )

    # Compute dynamic aspect ratio bins
    ratio_bins = compute_dynamic_ratio_bins(aspect_ratios, max_bins=8)

    # Count images in each aspect ratio bin
    aspect_ratio_histogram = []
    if aspect_ratios and ratio_bins:
        max_ratio = max(aspect_ratios)
        for bin_min, bin_max in ratio_bins:
            count = sum(1 for r in aspect_ratios if bin_min <= r < bin_max or (bin_max == max_ratio and r == bin_max))
            bucket_label = f"{bin_min:.2f}-{bin_max:.2f}"
            aspect_ratio_histogram.append(
                AspectRatioBucket(
                    bucket=bucket_label,
                    count=count,
                    min=bin_min,
                    max=bin_max,
                )
            )

    # Compute file size stats
    file_sizes = [img["file_size_bytes"] for img in images if img.get("file_size_bytes") is not None]
    if file_sizes:
        file_size_stats = FileSizeStats(
            min=min(file_sizes),
            max=max(file_sizes),
            avg=sum(file_sizes) / len(file_sizes),
            median=sorted(file_sizes)[len(file_sizes) // 2] if file_sizes else 0,
        )
    else:
        file_size_stats = FileSizeStats(min=0, max=0, avg=0, median=0)

    response_data = DatasetStatsResponse(
        tag_distribution=tag_distribution,
        dimension_histogram=dimension_histogram,
        aspect_ratio_histogram=aspect_ratio_histogram,
        file_size_stats=file_size_stats,
    )

    return JsonResponse(
        data=response_data,
        message=f"Dataset statistics computed from {total} filtered images",
        status_code=status.HTTP_200_OK,
    )


@router.get("/{project_id}/analytics/annotation-coverage", response_model=JsonResponse[AnnotationCoverageResponse, None])
async def get_annotation_coverage(
    project: Annotated[dict, Depends(ProjectPermission("viewer"))],
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)],
    # Same filter parameters as dataset-stats
    tag_ids: list[UUID] | None = Query(default=None),
    excluded_tag_ids: list[UUID] | None = Query(default=None),
    include_match_mode: Literal["AND", "OR"] = Query(default="OR"),
    exclude_match_mode: Literal["AND", "OR"] = Query(default="OR"),
    task_ids: list[int] | None = Query(default=None),
    job_id: int | None = Query(default=None),
    is_annotated: bool | None = Query(default=None),
    search: str | None = Query(default=None, max_length=255),
    width_min: int | None = Query(default=None, ge=0),
    width_max: int | None = Query(default=None, ge=0),
    height_min: int | None = Query(default=None, ge=0),
    height_max: int | None = Query(default=None, ge=0),
    file_size_min: int | None = Query(default=None, ge=0),
    file_size_max: int | None = Query(default=None, ge=0),
    filepath_pattern: str | None = Query(default=None, max_length=255),
    filepath_paths: list[str] | None = Query(default=None),
    image_uids: list[UUID] | None = Query(default=None),
):
    """
    Get annotation coverage analytics.
    Shows percentage annotated, density distribution, and coverage by category.
    """
    project_id = project["id"]

    # Get filtered images
    images, total = await ProjectImageRepository.explore(
        connection, project_id=project_id, page=1, page_size=10000,
        tag_ids=tag_ids, excluded_tag_ids=excluded_tag_ids,
        include_match_mode=include_match_mode, exclude_match_mode=exclude_match_mode,
        task_ids=task_ids, job_id=job_id, is_annotated=is_annotated,
        search=search, width_min=width_min, width_max=width_max,
        height_min=height_min, height_max=height_max,
        file_size_min=file_size_min, file_size_max=file_size_max,
        filepath_pattern=filepath_pattern, filepath_paths=filepath_paths,
        image_uids=image_uids,
    )

    # Compute coverage metrics
    coverage_data = await AnalyticsService.compute_annotation_coverage(
        connection, project_id, images
    )

    response_data = AnnotationCoverageResponse(**coverage_data)

    return JsonResponse(
        data=response_data,
        message=f"Annotation coverage computed from {total} images",
        status_code=status.HTTP_200_OK,
    )


@router.get("/{project_id}/analytics/class-balance", response_model=JsonResponse[ClassBalanceResponse, None])
async def get_class_balance(
    project: Annotated[dict, Depends(ProjectPermission("viewer"))],
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)],
    # Same filter parameters
    tag_ids: list[UUID] | None = Query(default=None),
    excluded_tag_ids: list[UUID] | None = Query(default=None),
    include_match_mode: Literal["AND", "OR"] = Query(default="OR"),
    exclude_match_mode: Literal["AND", "OR"] = Query(default="OR"),
    task_ids: list[int] | None = Query(default=None),
    job_id: int | None = Query(default=None),
    is_annotated: bool | None = Query(default=None),
    search: str | None = Query(default=None, max_length=255),
    width_min: int | None = Query(default=None, ge=0),
    width_max: int | None = Query(default=None, ge=0),
    height_min: int | None = Query(default=None, ge=0),
    height_max: int | None = Query(default=None, ge=0),
    file_size_min: int | None = Query(default=None, ge=0),
    file_size_max: int | None = Query(default=None, ge=0),
    filepath_pattern: str | None = Query(default=None, max_length=255),
    filepath_paths: list[str] | None = Query(default=None),
    image_uids: list[UUID] | None = Query(default=None),
    category_id: UUID | None = Query(default=None, description="Filter by tag category"),
):
    """
    Get class balance analytics.
    Shows class distribution, imbalance score, and recommendations.

    Supports category_id filter for per-category class balance analysis.
    """
    project_id = project["id"]

    # Get filtered images
    images, total = await ProjectImageRepository.explore(
        connection, project_id=project_id, page=1, page_size=10000,
        tag_ids=tag_ids, excluded_tag_ids=excluded_tag_ids,
        include_match_mode=include_match_mode, exclude_match_mode=exclude_match_mode,
        task_ids=task_ids, job_id=job_id, is_annotated=is_annotated,
        search=search, width_min=width_min, width_max=width_max,
        height_min=height_min, height_max=height_max,
        file_size_min=file_size_min, file_size_max=file_size_max,
        filepath_pattern=filepath_pattern, filepath_paths=filepath_paths,
        image_uids=image_uids,
    )

    # Compute class balance metrics
    balance_data = await AnalyticsService.compute_class_balance(
        connection, project_id, images, category_id=category_id
    )

    response_data = ClassBalanceResponse(**balance_data)

    return JsonResponse(
        data=response_data,
        message=f"Class balance computed from {total} images",
        status_code=status.HTTP_200_OK,
    )


@router.get("/{project_id}/analytics/spatial-heatmap", response_model=JsonResponse[SpatialHeatmapResponse, None])
async def get_spatial_heatmap(
    project: Annotated[dict, Depends(ProjectPermission("viewer"))],
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)],
    # Same filter parameters
    tag_ids: list[UUID] | None = Query(default=None),
    excluded_tag_ids: list[UUID] | None = Query(default=None),
    include_match_mode: Literal["AND", "OR"] = Query(default="OR"),
    exclude_match_mode: Literal["AND", "OR"] = Query(default="OR"),
    task_ids: list[int] | None = Query(default=None),
    job_id: int | None = Query(default=None),
    is_annotated: bool | None = Query(default=None),
    search: str | None = Query(default=None, max_length=255),
    width_min: int | None = Query(default=None, ge=0),
    width_max: int | None = Query(default=None, ge=0),
    height_min: int | None = Query(default=None, ge=0),
    height_max: int | None = Query(default=None, ge=0),
    file_size_min: int | None = Query(default=None, ge=0),
    file_size_max: int | None = Query(default=None, ge=0),
    filepath_pattern: str | None = Query(default=None, max_length=255),
    filepath_paths: list[str] | None = Query(default=None),
    image_uids: list[UUID] | None = Query(default=None),
):
    """
    Get spatial heatmap of annotation distribution.
    Shows normalized coordinates where annotations cluster on images.
    """
    project_id = project["id"]

    # Get filtered images
    images, total = await ProjectImageRepository.explore(
        connection, project_id=project_id, page=1, page_size=10000,
        tag_ids=tag_ids, excluded_tag_ids=excluded_tag_ids,
        include_match_mode=include_match_mode, exclude_match_mode=exclude_match_mode,
        task_ids=task_ids, job_id=job_id, is_annotated=is_annotated,
        search=search, width_min=width_min, width_max=width_max,
        height_min=height_min, height_max=height_max,
        file_size_min=file_size_min, file_size_max=file_size_max,
        filepath_pattern=filepath_pattern, filepath_paths=filepath_paths,
        image_uids=image_uids,
    )

    # Compute spatial heatmap (stub for now - needs annotation bbox data)
    heatmap_data = await AnalyticsService.compute_spatial_heatmap(
        connection, project_id, images
    )

    response_data = SpatialHeatmapResponse(**heatmap_data)

    return JsonResponse(
        data=response_data,
        message=f"Spatial heatmap computed from {total} images",
        status_code=status.HTTP_200_OK,
    )


@router.get("/{project_id}/analytics/image-quality", response_model=JsonResponse[ImageQualityResponse, None])
async def get_image_quality(
    project: Annotated[dict, Depends(ProjectPermission("viewer"))],
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)],
    # Same filter parameters
    tag_ids: list[UUID] | None = Query(default=None),
    excluded_tag_ids: list[UUID] | None = Query(default=None),
    include_match_mode: Literal["AND", "OR"] = Query(default="OR"),
    exclude_match_mode: Literal["AND", "OR"] = Query(default="OR"),
    task_ids: list[int] | None = Query(default=None),
    job_id: int | None = Query(default=None),
    is_annotated: bool | None = Query(default=None),
    search: str | None = Query(default=None, max_length=255),
    width_min: int | None = Query(default=None, ge=0),
    width_max: int | None = Query(default=None, ge=0),
    height_min: int | None = Query(default=None, ge=0),
    height_max: int | None = Query(default=None, ge=0),
    file_size_min: int | None = Query(default=None, ge=0),
    file_size_max: int | None = Query(default=None, ge=0),
    filepath_pattern: str | None = Query(default=None, max_length=255),
    filepath_paths: list[str] | None = Query(default=None),
    image_uids: list[UUID] | None = Query(default=None),
):
    """
    Get image quality analytics.
    Shows quality score distribution, issue breakdown, and flagged images.
    """
    project_id = project["id"]

    # Get filtered images
    images, total = await ProjectImageRepository.explore(
        connection, project_id=project_id, page=1, page_size=10000,
        tag_ids=tag_ids, excluded_tag_ids=excluded_tag_ids,
        include_match_mode=include_match_mode, exclude_match_mode=exclude_match_mode,
        task_ids=task_ids, job_id=job_id, is_annotated=is_annotated,
        search=search, width_min=width_min, width_max=width_max,
        height_min=height_min, height_max=height_max,
        file_size_min=file_size_min, file_size_max=file_size_max,
        filepath_pattern=filepath_pattern, filepath_paths=filepath_paths,
        image_uids=image_uids,
    )

    # Compute image quality (stub for now - needs async processing)
    quality_data = await AnalyticsService.compute_image_quality(
        connection, project_id, images
    )

    response_data = ImageQualityResponse(**quality_data)

    return JsonResponse(
        data=response_data,
        message=f"Image quality computed from {total} images",
        status_code=status.HTTP_200_OK,
    )
