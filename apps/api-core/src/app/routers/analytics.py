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
    DimensionInsightsResponse,
    EnhancedDatasetStatsResponse,
    AnnotationAnalysisResponse,
    ComputeQualityResponse,
    ProcessQualityResponse,
    QualityStatusCounts,
    QualityMetricsAverages,
    QualityBucket,
    IssueBreakdownEnhanced,
    FlaggedImageEnhanced,
)
from app.services.analytics_service import AnalyticsService
from app.services.image_quality_service import ImageQualityService
from app.repositories.image_quality import ImageQualityRepository

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


@router.get("/{project_id}/analytics/dimension-insights", response_model=JsonResponse[DimensionInsightsResponse, None])
async def get_dimension_insights(
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
    Get dimension insights analytics (Roboflow-style).
    Shows median dimensions, aspect ratio distribution, scatter plot data, and resize recommendations.
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

    # Compute dimension insights
    insights_data = AnalyticsService.compute_dimension_insights(images)

    response_data = DimensionInsightsResponse(**insights_data)

    return JsonResponse(
        data=response_data,
        message=f"Dimension insights computed from {total} images",
        status_code=status.HTTP_200_OK,
    )


# ============================================================================
# CONSOLIDATED ENDPOINTS
# ============================================================================

@router.get("/{project_id}/analytics/enhanced-dataset-stats", response_model=JsonResponse[EnhancedDatasetStatsResponse, None])
async def get_enhanced_dataset_stats(
    project: Annotated[dict, Depends(ProjectPermission("viewer"))],
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)],
    # Filter parameters
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
    category_id: UUID | None = Query(default=None, description="Filter class balance by category"),
):
    """
    Get enhanced dataset statistics (consolidated).

    Combines: Dataset Stats + Dimension Insights + Class Balance + Image Quality
    This is the main endpoint for the Dataset Statistics panel with tabs.
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

    shared_image_ids = [img["id"] for img in images]

    # === Original Dataset Stats ===
    # Get tag distribution
    all_tags = await TagRepository.list_with_usage_count(connection, project_id)
    tag_map = {tag["id"]: tag for tag in all_tags}
    all_categories = await TagCategoryRepository.list_for_project(connection, project_id)
    category_map = {cat["id"]: cat for cat in all_categories}

    tag_counter = Counter()
    for img in images:
        image_tags = await SharedImageRepository.get_tags(connection, img["id"], project_id)
        for tag in image_tags:
            tag_counter[tag["id"]] += 1

    tag_distribution = []
    for tag_id, count in tag_counter.most_common():
        tag_info = tag_map.get(tag_id)
        if tag_info:
            category_id_val = tag_info.get("category_id")
            category_info = category_map.get(category_id_val) if category_id_val else None
            tag_distribution.append(
                TagDistribution(
                    tag_id=str(tag_id),
                    name=tag_info["name"],
                    count=count,
                    color=tag_info.get("color", "#6B7280"),
                    category_id=str(category_id_val) if category_id_val else None,
                    category_name=category_info["name"] if category_info else None,
                    category_color=category_info.get("color") if category_info else None,
                )
            )

    # Dimension histogram
    dimensions = []
    aspect_ratios = []
    for img in images:
        width, height = img.get("width"), img.get("height")
        if width and height and height > 0:
            dimensions.append(max(width, height))
            aspect_ratios.append(round(width / height, 3))

    dimension_bins = compute_dynamic_bins(dimensions, max_bins=8)
    dimension_histogram = []
    if dimensions and dimension_bins:
        max_dim = max(dimensions)
        for bin_min, bin_max in dimension_bins:
            count = sum(1 for d in dimensions if bin_min <= d < bin_max or (bin_max == max_dim and d == bin_max))
            dimension_histogram.append(DimensionBucket(
                bucket=f"{bin_min}-{bin_max}px", count=count, min=bin_min, max=bin_max
            ))

    ratio_bins = compute_dynamic_ratio_bins(aspect_ratios, max_bins=8)
    aspect_ratio_histogram = []
    if aspect_ratios and ratio_bins:
        max_ratio = max(aspect_ratios)
        for bin_min, bin_max in ratio_bins:
            count = sum(1 for r in aspect_ratios if bin_min <= r < bin_max or (bin_max == max_ratio and r == bin_max))
            aspect_ratio_histogram.append(AspectRatioBucket(
                bucket=f"{bin_min:.2f}-{bin_max:.2f}", count=count, min=bin_min, max=bin_max
            ))

    # File size stats
    file_sizes = [img["file_size_bytes"] for img in images if img.get("file_size_bytes")]
    if file_sizes:
        file_size_stats = FileSizeStats(
            min=min(file_sizes), max=max(file_sizes),
            avg=sum(file_sizes) / len(file_sizes),
            median=sorted(file_sizes)[len(file_sizes) // 2]
        )
    else:
        file_size_stats = FileSizeStats(min=0, max=0, avg=0, median=0)

    # === Dimension Insights ===
    dim_insights = AnalyticsService.compute_dimension_insights(images)

    # === Class Balance ===
    balance_data = await AnalyticsService.compute_class_balance(
        connection, project_id, images, category_id=category_id
    )

    # === Image Quality ===
    quality_stats = await ImageQualityRepository.get_statistics_for_project(
        connection, project_id, shared_image_ids if shared_image_ids else None
    )

    status_counts = quality_stats.get("status_counts", {})
    total_with_metrics = status_counts.get("completed", 0) + status_counts.get("failed", 0) + status_counts.get("processing", 0) + status_counts.get("pending", 0)

    # Determine overall quality status
    if status_counts.get("completed", 0) == total and total > 0:
        quality_status = "complete"
    elif status_counts.get("completed", 0) > 0:
        quality_status = "partial"
    else:
        quality_status = "pending"

    # Get quality distribution and flagged images
    quality_distribution_data = await ImageQualityRepository.get_quality_distribution(
        connection, project_id, shared_image_ids if shared_image_ids else None
    )

    # Build quality histogram buckets
    quality_scores = [m.get("overall_quality", 0) for m in quality_distribution_data if m.get("overall_quality") is not None]
    quality_distribution = []
    if quality_scores:
        buckets = [
            ("Poor (0-0.3)", 0.0, 0.3),
            ("Fair (0.3-0.5)", 0.3, 0.5),
            ("Good (0.5-0.7)", 0.5, 0.7),
            ("Excellent (0.7-1.0)", 0.7, 1.0),
        ]
        for label, min_val, max_val in buckets:
            count = sum(1 for s in quality_scores if min_val <= s < max_val or (max_val == 1.0 and s == 1.0))
            quality_distribution.append(QualityBucket(bucket=label, count=count, min=min_val, max=max_val))

    # Count issues
    issue_counts = {"blur": 0, "low_brightness": 0, "high_brightness": 0, "low_contrast": 0, "duplicate": 0}
    for m in quality_distribution_data:
        issues = m.get("issues", [])
        if issues:
            for issue in issues:
                if issue in issue_counts:
                    issue_counts[issue] += 1

    issue_breakdown = IssueBreakdownEnhanced(**issue_counts)

    # Get flagged images
    flagged_raw = await ImageQualityRepository.get_flagged_images(connection, project_id, limit=20)
    flagged_images = [
        FlaggedImageEnhanced(
            shared_image_id=str(f["shared_image_id"]),
            filename=f.get("filename", ""),
            file_path=f.get("file_path", ""),
            overall_quality=f.get("overall_quality", 0),
            sharpness=f.get("sharpness"),
            brightness=f.get("brightness"),
            issues=f.get("issues", []),
        )
        for f in flagged_raw
    ]

    # Build response
    from app.schemas.analytics import (
        DimensionInsightsRecommendedResize,
        DimensionInsightsScatterPoint,
        AspectRatioDistributionBucket,
        ClassDistribution,
    )

    response_data = EnhancedDatasetStatsResponse(
        # Original Dataset Stats
        tag_distribution=tag_distribution,
        dimension_histogram=dimension_histogram,
        aspect_ratio_histogram=aspect_ratio_histogram,
        file_size_stats=file_size_stats,
        # Dimension Insights
        median_width=dim_insights.get("median_width", 0),
        median_height=dim_insights.get("median_height", 0),
        median_aspect_ratio=dim_insights.get("median_aspect_ratio", 0.0),
        min_width=dim_insights.get("min_width", 0),
        max_width=dim_insights.get("max_width", 0),
        min_height=dim_insights.get("min_height", 0),
        max_height=dim_insights.get("max_height", 0),
        dimension_variance=dim_insights.get("dimension_variance", 0.0),
        recommended_resize=DimensionInsightsRecommendedResize(**dim_insights["recommended_resize"]) if dim_insights.get("recommended_resize") else None,
        scatter_data=[DimensionInsightsScatterPoint(**p) for p in dim_insights.get("scatter_data", [])],
        aspect_ratio_distribution=[AspectRatioDistributionBucket(**b) for b in dim_insights.get("aspect_ratio_distribution", [])],
        # Class Balance
        class_distribution=[ClassDistribution(**c) for c in balance_data.get("class_distribution", [])],
        imbalance_score=balance_data.get("imbalance_score", 0.0),
        imbalance_level=balance_data.get("imbalance_level", "balanced"),
        class_recommendations=balance_data.get("recommendations", []),
        # Image Quality
        quality_status=quality_status,
        quality_status_counts=QualityStatusCounts(**status_counts),
        quality_averages=QualityMetricsAverages(**quality_stats.get("averages", {})) if quality_stats.get("averages") else None,
        quality_distribution=quality_distribution,
        issue_breakdown=issue_breakdown,
        flagged_images=flagged_images,
    )

    return JsonResponse(
        data=response_data,
        message=f"Enhanced dataset stats computed from {total} images",
        status_code=status.HTTP_200_OK,
    )


@router.get("/{project_id}/analytics/annotation-analysis", response_model=JsonResponse[AnnotationAnalysisResponse, None])
async def get_annotation_analysis(
    project: Annotated[dict, Depends(ProjectPermission("viewer"))],
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)],
    # Filter parameters
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
    grid_size: int = Query(default=10, ge=5, le=20, description="Grid size for heatmap"),
):
    """
    Get annotation analysis (consolidated).

    Combines: Annotation Coverage + Spatial Heatmap
    This is the main endpoint for the Annotation Analysis panel.
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

    # Compute annotation coverage
    coverage_data = await AnalyticsService.compute_annotation_coverage(
        connection, project_id, images
    )

    # Compute spatial heatmap
    heatmap_data = await AnalyticsService.compute_spatial_heatmap(
        connection, project_id, images, grid_size=grid_size
    )

    from app.schemas.analytics import DensityBucket, CenterOfMass, Spread, AnnotationPoint

    response_data = AnnotationAnalysisResponse(
        # Coverage
        total_images=coverage_data.get("total_images", 0),
        annotated_images=coverage_data.get("annotated_images", 0),
        unannotated_images=coverage_data.get("unannotated_images", 0),
        coverage_percentage=coverage_data.get("coverage_percentage", 0.0),
        density_histogram=[DensityBucket(**b) for b in coverage_data.get("density_histogram", [])],
        total_objects=coverage_data.get("total_objects", 0),
        avg_objects_per_image=coverage_data.get("avg_objects_per_image", 0.0),
        median_objects_per_image=coverage_data.get("median_objects_per_image", 0),
        # Heatmap
        grid_density=heatmap_data.get("grid_density", []),
        grid_size=heatmap_data.get("grid_size", grid_size),
        max_cell_count=heatmap_data.get("max_cell_count", 0),
        center_of_mass=CenterOfMass(**heatmap_data.get("center_of_mass", {"x": 0.5, "y": 0.5})),
        spread=Spread(**heatmap_data.get("spread", {"x_std": 0.0, "y_std": 0.0})),
        clustering_score=heatmap_data.get("clustering_score", 0.0),
        total_annotations=heatmap_data.get("total_annotations", 0),
        annotation_points=[AnnotationPoint(**p) for p in heatmap_data.get("annotation_points", [])[:500]],
    )

    return JsonResponse(
        data=response_data,
        message=f"Annotation analysis computed from {total} images",
        status_code=status.HTTP_200_OK,
    )


# ============================================================================
# QUALITY COMPUTATION ENDPOINTS
# ============================================================================

@router.post("/{project_id}/analytics/sync-quality", response_model=JsonResponse[dict, None])
async def sync_quality_metrics(
    project: Annotated[dict, Depends(ProjectPermission("editor"))],
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)],
):
    """
    Sync quality metrics by finding all images without metrics and creating pending records.

    This endpoint discovers images that don't have quality metrics records yet
    and creates 'pending' entries for them, so they can be processed.
    """
    project_id = project["id"]

    # Get all images in project without quality metrics (no limit to count them all)
    images_without = await ImageQualityRepository.get_images_without_metrics(
        connection, project_id, limit=10000
    )

    # Create pending records for all of them
    if images_without:
        await ImageQualityRepository.bulk_create_pending(
            connection, [img["id"] for img in images_without]
        )

    # Get current stats
    stats = await ImageQualityRepository.get_statistics_for_project(connection, project_id)

    return JsonResponse(
        data={
            "synced": len(images_without),
            "pending": stats["status_counts"].get("pending", 0),
            "completed": stats["status_counts"].get("completed", 0),
            "total": sum(stats["status_counts"].values()),
        },
        message=f"Synced {len(images_without)} images for quality processing",
        status_code=status.HTTP_200_OK,
    )


@router.post("/{project_id}/analytics/compute-quality", response_model=JsonResponse[ProcessQualityResponse, None])
async def process_quality_metrics(
    project: Annotated[dict, Depends(ProjectPermission("editor"))],
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)],
    batch_size: int = Query(default=50, ge=1, le=200, description="Number of images to process"),
):
    """
    Manually trigger quality metrics computation for pending images.

    This endpoint processes a batch of images that don't yet have quality metrics.
    Call repeatedly to process all images in batches.

    DEPRECATED: Use start-quality-job for background processing with progress tracking.
    """
    project_id = project["id"]

    results = await ImageQualityService.process_pending_for_project(
        connection, project_id, batch_size=batch_size
    )

    return JsonResponse(
        data=ProcessQualityResponse(**results),
        message=f"Processed {results['processed']} images, {results['remaining']} remaining",
        status_code=status.HTTP_200_OK,
    )


# ============================================================================
# QUALITY JOB ENDPOINTS (Background Processing with Progress Tracking)
# ============================================================================

@router.post("/{project_id}/analytics/start-quality-job")
async def start_quality_job(
    project: Annotated[dict, Depends(ProjectPermission("editor"))],
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)],
    batch_size: int = Query(default=50, ge=1, le=200, description="Batch size for processing"),
):
    """
    Start a background quality metrics processing job.

    This endpoint:
    1. Checks if there's already an active job for this project
    2. Counts total images that need processing
    3. Creates a quality_job record
    4. Dispatches a Celery task for background processing
    5. Returns the job_id for progress tracking

    Use GET /quality-progress to monitor progress.
    """
    from app.repositories.quality_job import QualityJobRepository
    from app.schemas.analytics import StartQualityJobResponse
    from app.tasks.quality import process_quality_metrics_task

    project_id = project["id"]

    # Check for existing active job
    existing_job = await QualityJobRepository.get_active_for_project(connection, project_id)
    if existing_job:
        return JsonResponse(
            data=StartQualityJobResponse(
                job_id=str(existing_job["id"]),
                total_images=existing_job["total_images"],
                status=existing_job["status"],
                message="Quality processing job already running",
            ),
            message="Job already in progress",
            status_code=status.HTTP_200_OK,
        )

    # Count total images needing processing
    total_without = await ImageQualityRepository.count_images_without_metrics(connection, project_id)
    total_pending = await ImageQualityRepository.count_pending_for_project(connection, project_id)
    total_to_process = total_without + total_pending

    if total_to_process == 0:
        return JsonResponse(
            data=StartQualityJobResponse(
                job_id="",
                total_images=0,
                status="completed",
                message="All images already have quality metrics",
            ),
            message="No images to process",
            status_code=status.HTTP_200_OK,
        )

    # Create job record
    job = await QualityJobRepository.create(
        connection,
        project_id=project_id,
        total_images=total_to_process,
    )
    await connection.commit()

    # Dispatch Celery task
    task = process_quality_metrics_task.delay(
        job_id=str(job["id"]),
        project_id=project_id,
        batch_size=batch_size,
    )

    # Update job with task ID
    await QualityJobRepository.update_celery_task_id(connection, job["id"], task.id)
    await connection.commit()

    return JsonResponse(
        data=StartQualityJobResponse(
            job_id=str(job["id"]),
            total_images=total_to_process,
            status="pending",
            message="Quality processing job started",
        ),
        message=f"Started processing {total_to_process} images",
        status_code=status.HTTP_200_OK,
    )


@router.get("/{project_id}/analytics/quality-progress")
async def get_quality_progress(
    project: Annotated[dict, Depends(ProjectPermission("viewer"))],
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)],
):
    """
    Get real-time quality processing progress.

    Checks Redis first for real-time progress updates,
    falls back to database if Redis is unavailable.

    Poll this endpoint every 2 seconds while processing is active.
    """
    import redis
    from app.config import settings
    from app.repositories.quality_job import QualityJobRepository
    from app.schemas.analytics import QualityProgressResponse

    project_id = project["id"]

    # Try Redis first for real-time progress
    try:
        redis_client = redis.from_url(settings.REDIS_URL, decode_responses=True)
        progress_key = f"quality:progress:{project_id}"
        redis_progress = redis_client.hgetall(progress_key)
        redis_client.close()

        if redis_progress and redis_progress.get("status") in ("processing", "pending"):
            total = int(redis_progress.get("total", 0))
            processed = int(redis_progress.get("processed", 0))
            failed = int(redis_progress.get("failed", 0))
            remaining = max(0, total - processed - failed)
            progress_pct = (processed / total * 100) if total > 0 else 0

            return JsonResponse(
                data=QualityProgressResponse(
                    job_id=redis_progress.get("job_id") or None,
                    total=total,
                    processed=processed,
                    failed=failed,
                    remaining=remaining,
                    status=redis_progress.get("status", "idle"),
                    progress_pct=round(progress_pct, 1),
                    started_at=redis_progress.get("started_at"),
                ),
                message="Progress from real-time tracking",
                status_code=status.HTTP_200_OK,
            )
    except Exception:
        pass  # Fall back to database

    # Fallback to database
    job = await QualityJobRepository.get_active_for_project(connection, project_id)

    if job:
        total = job["total_images"]
        processed = job["processed_count"]
        failed = job["failed_count"]
        remaining = max(0, total - processed - failed)
        progress_pct = (processed / total * 100) if total > 0 else 0

        return JsonResponse(
            data=QualityProgressResponse(
                job_id=str(job["id"]),
                total=total,
                processed=processed,
                failed=failed,
                remaining=remaining,
                status=job["status"],
                progress_pct=round(progress_pct, 1),
                started_at=job["started_at"].isoformat() if job.get("started_at") else None,
            ),
            message="Progress from database",
            status_code=status.HTTP_200_OK,
        )

    # No active job - check if there's a recently completed one
    latest_job = await QualityJobRepository.get_latest_for_project(connection, project_id)
    if latest_job and latest_job["status"] in ("completed", "failed", "cancelled"):
        total = latest_job["total_images"]
        processed = latest_job["processed_count"]
        failed = latest_job["failed_count"]

        return JsonResponse(
            data=QualityProgressResponse(
                job_id=str(latest_job["id"]),
                total=total,
                processed=processed,
                failed=failed,
                remaining=0,
                status=latest_job["status"],
                progress_pct=100.0 if latest_job["status"] == "completed" else 0.0,
                started_at=latest_job["started_at"].isoformat() if latest_job.get("started_at") else None,
            ),
            message=f"Last job {latest_job['status']}",
            status_code=status.HTTP_200_OK,
        )

    # No job at all
    return JsonResponse(
        data=QualityProgressResponse(
            job_id=None,
            total=0,
            processed=0,
            failed=0,
            remaining=0,
            status="idle",
            progress_pct=0,
            started_at=None,
        ),
        message="No active or recent quality jobs",
        status_code=status.HTTP_200_OK,
    )


@router.post("/{project_id}/analytics/cancel-quality-job")
async def cancel_quality_job(
    project: Annotated[dict, Depends(ProjectPermission("editor"))],
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)],
):
    """
    Cancel an active quality processing job.

    This endpoint:
    1. Finds the active job for this project
    2. Revokes the Celery task
    3. Updates job status to 'cancelled'
    4. Clears Redis progress key
    """
    import redis
    from app.config import settings
    from app.repositories.quality_job import QualityJobRepository
    from app.schemas.analytics import CancelQualityJobResponse
    from app.tasks.main import celery_app

    project_id = project["id"]

    # Get active job
    job = await QualityJobRepository.get_active_for_project(connection, project_id)
    if not job:
        return JsonResponse(
            data=CancelQualityJobResponse(
                cancelled=False,
                message="No active quality job to cancel",
            ),
            message="No active job",
            status_code=status.HTTP_404_NOT_FOUND,
        )

    # Revoke Celery task
    if job.get("celery_task_id"):
        try:
            celery_app.control.revoke(job["celery_task_id"], terminate=True)
        except Exception:
            pass  # Best effort

    # Update job status
    await QualityJobRepository.update_status(connection, job["id"], "cancelled")
    await connection.commit()

    # Clear Redis progress
    try:
        redis_client = redis.from_url(settings.REDIS_URL, decode_responses=True)
        redis_client.delete(f"quality:progress:{project_id}")
        redis_client.close()
    except Exception:
        pass  # Best effort

    return JsonResponse(
        data=CancelQualityJobResponse(
            cancelled=True,
            message="Quality job cancelled successfully",
        ),
        message="Job cancelled",
        status_code=status.HTTP_200_OK,
    )
