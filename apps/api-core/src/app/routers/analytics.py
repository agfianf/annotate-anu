"""Analytics router for dataset statistics and insights.

Every panel here describes the same image set the gallery is showing. The filters arrive as the canonical `ImageFilterParams` contract — the whole contract, not a subset of it — and each aggregate is computed in SQL over `ProjectImageRepository.filtered_image_ids_subquery`. Handlers used to declare a smaller filter set by hand and then materialise up to 10 000 matching images to count them in Python; a project larger than that got numbers describing its first 10 000 matches, labelled as the whole filtered set.

Three reading rules the panels commit to, so a number can be trusted:

- **Counts are exact.** No handler caps how many images it aggregates over.
- **Facet counts mean "current results".** A tag count, a histogram bucket, a quality bucket counts matching images after every active filter, including one on the facet's own field. Every panel total therefore equals the gallery's matching count.
- **Only plotted points are sampled**, never a count. The scatter plot and the heatmap's dots are systematic samples whose size and total the response states; the statistics beside them are exact.
"""

import math
from typing import Annotated, Sequence
from uuid import UUID

from fastapi import APIRouter, Depends, Query, status
from redis import asyncio as aioredis
from sqlalchemy.ext.asyncio import AsyncConnection

from app.config import settings
from app.dependencies.database import get_async_transaction_conn
from app.dependencies.rbac import ProjectPermission
from app.helpers.response_api import JsonResponse
from app.repositories.analytics import AnalyticsRepository
from app.repositories.image_quality import ImageQualityRepository
from app.repositories.tag import TagRepository
from app.repositories.tag_category import TagCategoryRepository
from app.schemas.analytics import (
    AnnotationAnalysisResponse,
    AnnotationCoverageResponse,
    ClassBalanceResponse,
    DimensionInsightsResponse,
    EnhancedDatasetStatsResponse,
    FlaggedImage,
    FlaggedImageEnhanced,
    ImageQualityResponse,
    IssueBreakdown,
    IssueBreakdownEnhanced,
    ProcessQualityResponse,
    QualityBucket,
    QualityMetricsAverages,
    QualityStatusCounts,
    SpatialHeatmapResponse,
)
from app.schemas.data_management import (
    AspectRatioBucket,
    DatasetStatsResponse,
    DimensionBucket,
    FileSizeStats,
    TagDistribution,
)
from app.schemas.image_filters import ImageFilterParams
from app.services.analytics_service import AnalyticsService
from app.services.image_quality_service import ImageQualityService

router = APIRouter(prefix="/api/v1/projects", tags=["Analytics"])


def image_filters(filters: Annotated[ImageFilterParams, Query()]) -> ImageFilterParams:
    """Bind the whole image-membership contract from the query string.

    The model has to be the only query-bound parameter of the function that declares it: FastAPI 0.141 stops treating a Pydantic model as a query model as soon as another query parameter sits beside it, and then rejects every request with `filters: Field required`. Wrapping it in its own dependency is what lets a handler take `category_id` or `grid_size` as well. Do not inline `Annotated[ImageFilterParams, Query()]` into a handler that has any other query parameter.
    """
    return filters


#: The canonical image-membership contract, for every filtered analytics panel.
#:
#: One dependency everywhere, so analytics cannot drift back into accepting a smaller filter set
#: than the gallery. Unknown query parameters are ignored, and a request that sends no filters at
#: all describes the whole project pool, exactly as before.
ImageFilters = Annotated[ImageFilterParams, Depends(image_filters)]

#: Density buckets for objects per image, inclusive at both ends.
DENSITY_BUCKETS: tuple[tuple[str, int, int], ...] = (
    ("0", 0, 0),
    ("1", 1, 1),
    ("2-5", 2, 5),
    ("6-10", 6, 10),
    ("11-20", 11, 20),
    ("21+", 21, 10000),
)

#: Quality score buckets shown on the overall-quality histogram.
QUALITY_BUCKETS: tuple[tuple[str, float, float], ...] = (
    ("Poor (0-0.3)", 0.0, 0.3),
    ("Fair (0.3-0.5)", 0.3, 0.5),
    ("Good (0.5-0.7)", 0.5, 0.7),
    ("Excellent (0.7-1.0)", 0.7, 1.0),
)

#: Shared 0-1 buckets for every individual metric and RGB channel histogram.
SCORE_BUCKETS: tuple[tuple[str, float, float], ...] = (
    ("0.0-0.2", 0.0, 0.2),
    ("0.2-0.4", 0.2, 0.4),
    ("0.4-0.6", 0.4, 0.6),
    ("0.6-0.8", 0.6, 0.8),
    ("0.8-1.0", 0.8, 1.0),
)

#: How many points the scatter plot and the heatmap overlay carry at most.
MAX_PLOTTED_POINTS = 500

# One async Redis client (with its own connection pool) shared across requests,
# created on first use so importing this module never touches the network.
_redis_client: aioredis.Redis | None = None


def _get_redis() -> aioredis.Redis:
    global _redis_client
    if _redis_client is None:
        _redis_client = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
    return _redis_client


def _sturges_bin_count(n: int, max_bins: int) -> int:
    """Sturges' rule, clamped to between three and ``max_bins`` bins."""
    return min(max(math.ceil(math.log2(n) + 1), 3), max_bins)


def dimension_bins(
    count: int, min_val: int, max_val: int, max_bins: int = 8
) -> list[tuple[int, int]]:
    """Evenly spaced integer bins for ``count`` values spanning ``min_val``..``max_val``.

    Takes the range and the population size rather than the values themselves, so the bins can be chosen without pulling every image into memory. Sturges' rule only ever needed the count.
    """
    if count <= 0:
        return []
    if min_val == max_val:
        return [(min_val, max_val)]

    num_bins = _sturges_bin_count(count, max_bins)
    width = (max_val - min_val) / num_bins
    bins = []
    for index in range(num_bins):
        bin_min = int(min_val + index * width)
        bin_max = max_val if index == num_bins - 1 else int(min_val + (index + 1) * width)
        bins.append((bin_min, bin_max))
    return bins


def ratio_bins(
    count: int, min_val: float, max_val: float, max_bins: int = 8
) -> list[tuple[float, float]]:
    """Evenly spaced aspect-ratio bins, rounded to two decimals as the panels display them."""
    if count <= 0:
        return []
    if min_val == max_val:
        return [(min_val, max_val)]

    num_bins = _sturges_bin_count(count, max_bins)
    width = (max_val - min_val) / num_bins
    bins = []
    for index in range(num_bins):
        bin_min = round(min_val + index * width, 2)
        bin_max = (
            round(max_val, 2) if index == num_bins - 1 else round(min_val + (index + 1) * width, 2)
        )
        bins.append((bin_min, bin_max))
    return bins


def compute_dynamic_bins(values: list[int], max_bins: int = 8) -> list[tuple[int, int]]:
    """Dynamic bins for an in-memory list of values. Kept for callers that already hold the values."""
    if not values:
        return []
    return dimension_bins(len(values), min(values), max(values), max_bins=max_bins)


def compute_dynamic_ratio_bins(values: list[float], max_bins: int = 8) -> list[tuple[float, float]]:
    """Dynamic aspect-ratio bins for an in-memory list of values."""
    if not values:
        return []
    return ratio_bins(len(values), min(values), max(values), max_bins=max_bins)


# ============================================================================
# Shared panel builders — each one aggregates in SQL over the filtered set
# ============================================================================
async def _tag_distribution(
    connection: AsyncConnection, project_id: int, filters: ImageFilterParams
) -> list[TagDistribution]:
    """Tags carried by the matching images, most used first.

    A "current results" facet: each count is the number of *matching* images carrying the tag, so the distribution narrows as the gallery narrows. Tags no matching image carries are absent rather than listed as zero, which is what the panel has always shown.
    """
    counts = await AnalyticsRepository.tag_image_counts(connection, project_id, filters)
    if not counts:
        return []

    all_tags = await TagRepository.list_with_usage_count(connection, project_id)
    tag_map = {tag["id"]: tag for tag in all_tags}
    all_categories = await TagCategoryRepository.list_for_project(connection, project_id)
    category_map = {category["id"]: category for category in all_categories}

    distribution = []
    for tag_id, count in counts:
        tag_info = tag_map.get(tag_id)
        if not tag_info:
            continue
        category_id = tag_info.get("category_id")
        category_info = category_map.get(category_id) if category_id else None
        distribution.append(
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
    return distribution


async def _dimension_histogram(
    connection: AsyncConnection, project_id: int, filters: ImageFilterParams, summary: dict
) -> list[DimensionBucket]:
    """Histogram of each matching image's larger dimension."""
    bins = dimension_bins(
        summary["measured_images"], summary["min_dimension"], summary["max_dimension"]
    )
    if not bins:
        return []
    counts = await AnalyticsRepository.dimension_bucket_counts(
        connection, project_id, filters, bins
    )
    return [
        DimensionBucket(bucket=f"{low}-{high}px", count=count, min=low, max=high)
        for (low, high), count in zip(bins, counts)
    ]


async def _aspect_ratio_histogram(
    connection: AsyncConnection, project_id: int, filters: ImageFilterParams, summary: dict
) -> list[AspectRatioBucket]:
    """Histogram of width divided by height across the matching images."""
    bins = ratio_bins(
        summary["measured_images"],
        round(summary["min_ratio"], 3),
        round(summary["max_ratio"], 3),
    )
    if not bins:
        return []
    counts = await AnalyticsRepository.aspect_ratio_bucket_counts(
        connection, project_id, filters, bins
    )
    return [
        AspectRatioBucket(bucket=f"{low:.2f}-{high:.2f}", count=count, min=low, max=high)
        for (low, high), count in zip(bins, counts)
    ]


async def _file_size_stats(
    connection: AsyncConnection, project_id: int, filters: ImageFilterParams
) -> FileSizeStats:
    """Min, max, mean, and median file size over the matching images."""
    summary = await AnalyticsRepository.file_size_summary(connection, project_id, filters)
    return FileSizeStats(
        min=summary["min"],
        max=summary["max"],
        avg=summary["avg"],
        median=summary["median"],
    )


def _round_to_multiple(value: int, multiple: int = 32) -> int:
    return max(multiple, ((value + multiple // 2) // multiple) * multiple)


async def _dimension_insights(
    connection: AsyncConnection, project_id: int, filters: ImageFilterParams, summary: dict
) -> dict:
    """Median dimensions, spread, a resize recommendation, and a sampled scatter plot.

    Every statistic is exact over the whole matching set. `scatter_data` is the one sampled field: at most `MAX_PLOTTED_POINTS` points drawn systematically (every *k*-th image in gallery order), with `scatter_total` and `scatter_sample_size` saying what the plot is a sample of.
    """
    measured = summary["measured_images"]
    if not measured:
        return {
            "median_width": 0,
            "median_height": 0,
            "median_aspect_ratio": 1.0,
            "min_width": 0,
            "max_width": 0,
            "min_height": 0,
            "max_height": 0,
            "dimension_variance": 0.0,
            "recommended_resize": {"width": 640, "height": 640, "reason": "No dimension data"},
            "scatter_data": [],
            "scatter_total": 0,
            "scatter_sample_size": 0,
            "aspect_ratio_distribution": [],
        }

    median_width = summary["median_width"]
    median_height = summary["median_height"]
    median_ratio = summary["median_ratio"]

    cv_width = summary["stddev_width"] / summary["avg_width"] if summary["avg_width"] else 0.0
    cv_height = summary["stddev_height"] / summary["avg_height"] if summary["avg_height"] else 0.0
    dimension_variance = min((cv_width + cv_height) / 2 / 0.5, 1.0)

    if 0.9 <= median_ratio <= 1.1:
        size = _round_to_multiple((median_width + median_height) // 2)
        recommended_resize = {
            "width": size,
            "height": size,
            "reason": f"Near-square median ({median_ratio:.2f}), recommend square",
        }
    else:
        recommended_resize = {
            "width": _round_to_multiple(median_width),
            "height": _round_to_multiple(median_height),
            "reason": f"Based on median dimensions ({median_width}x{median_height})",
        }

    shapes = await AnalyticsRepository.aspect_ratio_shape_counts(connection, project_id, filters)
    scatter = await AnalyticsRepository.dimension_scatter_sample(
        connection, project_id, filters, limit=MAX_PLOTTED_POINTS
    )

    return {
        "median_width": median_width,
        "median_height": median_height,
        "median_aspect_ratio": round(median_ratio, 3),
        "min_width": summary["min_width"],
        "max_width": summary["max_width"],
        "min_height": summary["min_height"],
        "max_height": summary["max_height"],
        "dimension_variance": round(dimension_variance, 3),
        "recommended_resize": recommended_resize,
        "scatter_data": scatter,
        "scatter_total": measured,
        "scatter_sample_size": len(scatter),
        "aspect_ratio_distribution": [
            {"bucket": "Portrait (<0.9)", "count": shapes["portrait"], "min": 0.0, "max": 0.9},
            {"bucket": "Square (0.9-1.1)", "count": shapes["square"], "min": 0.9, "max": 1.1},
            {
                "bucket": "Landscape (1.1-2.0)",
                "count": shapes["landscape"],
                "min": 1.1,
                "max": 2.0,
            },
            {
                "bucket": "Ultra-wide (>2.0)",
                "count": shapes["ultra_wide"],
                "min": 2.0,
                "max": 100.0,
            },
        ],
    }


async def _class_balance(
    connection: AsyncConnection,
    project_id: int,
    filters: ImageFilterParams,
    category_id: UUID | None,
) -> dict:
    """Class distribution and imbalance over the matching images.

    Counts come from SQL; the Gini coefficient and the recommendation wording stay in `AnalyticsService` so the panel keeps saying the same things it always did.
    """
    all_tags = await TagRepository.list_with_usage_count(connection, project_id)
    if category_id is not None:
        all_tags = [tag for tag in all_tags if tag.get("category_id") == category_id]
    tag_map = {tag["id"]: tag for tag in all_tags}

    counts = [
        (tag_id, count)
        for tag_id, count in await AnalyticsRepository.tag_image_counts(
            connection, project_id, filters
        )
        if tag_id in tag_map
    ]
    total_annotations = sum(count for _, count in counts)

    class_distribution = []
    for tag_id, count in counts:
        percentage = (count / total_annotations * 100) if total_annotations else 0.0
        if percentage < 5:
            tag_status = "severely_underrepresented"
        elif percentage < 15:
            tag_status = "underrepresented"
        else:
            tag_status = "healthy"
        class_distribution.append(
            {
                "tag_id": str(tag_id),
                "tag_name": tag_map[tag_id]["name"],
                "annotation_count": count,
                "image_count": count,
                "percentage": round(percentage, 2),
                "status": tag_status,
            }
        )

    imbalance_score = AnalyticsService._gini_coefficient([count for _, count in counts])
    if imbalance_score < 0.3:
        imbalance_level = "balanced"
    elif imbalance_score < 0.6:
        imbalance_level = "moderate"
    else:
        imbalance_level = "severe"

    return {
        "class_distribution": class_distribution,
        "imbalance_score": round(imbalance_score, 3),
        "imbalance_level": imbalance_level,
        "recommendations": AnalyticsService._generate_balance_recommendations(
            class_distribution, imbalance_score
        ),
    }


async def _annotation_coverage(
    connection: AsyncConnection, project_id: int, filters: ImageFilterParams
) -> dict:
    """Coverage, object totals, and the density histogram over every matching image."""
    return await AnalyticsRepository.annotation_coverage(
        connection, project_id, filters, DENSITY_BUCKETS
    )


async def _spatial_heatmap(
    connection: AsyncConnection, project_id: int, filters: ImageFilterParams, grid_size: int
) -> dict:
    """Annotation heatmap for the matching images.

    The grid, the centre of mass, the spread, the clustering score, and the annotation total are exact over every annotation on every matching image. `annotation_points` is a systematic sample of at most `MAX_PLOTTED_POINTS` centres, reported alongside the exact total so the overlay is never mistaken for the whole distribution.
    """
    summary = await AnalyticsRepository.annotation_spatial_summary(
        connection, project_id, filters, grid_size=grid_size
    )
    grid = summary["grid_density"]
    non_zero = [count for row in grid for count in row if count > 0]
    if len(non_zero) > 1 and summary["max_cell_count"] > 0:
        mean_count = sum(non_zero) / len(non_zero)
        variance = sum((count - mean_count) ** 2 for count in non_zero) / len(non_zero)
        coefficient = (variance**0.5) / mean_count if mean_count else 0.0
        clustering_score = min(coefficient / 2.0, 1.0)
    else:
        clustering_score = 0.0

    points = (
        await AnalyticsRepository.annotation_center_sample(
            connection, project_id, filters, limit=MAX_PLOTTED_POINTS
        )
        if summary["total_annotations"]
        else []
    )

    return {
        **summary,
        "clustering_score": round(clustering_score, 3),
        "annotation_points": points,
        "annotation_points_sample_size": len(points),
    }


def _dynamic_count_histogram(values: Sequence[int]) -> list[dict]:
    """Dynamic-bin histogram over one integer per matching image.

    The values are per-image annotation counts, one small integer each, so the whole matching set fits comfortably in memory where the image rows did not.
    """
    if not values:
        return []
    bins = AnalyticsService._create_dynamic_bins(list(values))
    return [
        {
            "bucket": label,
            "count": sum(1 for value in values if low <= value <= high),
            "min": low,
            "max": high,
        }
        for label, low, high in bins
    ]


async def _quality_panel(
    connection: AsyncConnection, project_id: int, filters: ImageFilterParams, total: int
) -> dict:
    """Every quality readout for the matching images, aggregated in SQL."""
    status_counts = await AnalyticsRepository.quality_status_counts(connection, project_id, filters)
    completed = status_counts.get("completed", 0)
    if total > 0 and completed == total:
        quality_status = "complete"
    elif completed > 0:
        quality_status = "partial"
    else:
        quality_status = "pending"

    async def histogram(metric: str, buckets) -> list[QualityBucket]:
        counts = await AnalyticsRepository.quality_metric_histogram(
            connection, project_id, filters, metric, buckets
        )
        return [
            QualityBucket(bucket=label, count=count, min=low, max=high)
            for (label, low, high), count in zip(buckets, counts)
        ]

    return {
        "quality_status": quality_status,
        "status_counts": status_counts,
        "averages": await AnalyticsRepository.quality_averages(connection, project_id, filters),
        "quality_distribution": await histogram("overall_quality", QUALITY_BUCKETS),
        "sharpness_histogram": await histogram("sharpness", SCORE_BUCKETS),
        "brightness_histogram": await histogram("brightness", SCORE_BUCKETS),
        "contrast_histogram": await histogram("contrast", SCORE_BUCKETS),
        "uniqueness_histogram": await histogram("uniqueness", SCORE_BUCKETS),
        "red_histogram": await histogram("red_avg", SCORE_BUCKETS),
        "green_histogram": await histogram("green_avg", SCORE_BUCKETS),
        "blue_histogram": await histogram("blue_avg", SCORE_BUCKETS),
        "issue_counts": await AnalyticsRepository.quality_issue_counts(
            connection, project_id, filters
        ),
        "flagged": await AnalyticsRepository.flagged_images(
            connection, project_id, filters, limit=20
        ),
    }


# ============================================================================
# Filtered analytics panels
# ============================================================================
@router.get(
    "/{project_id}/analytics/dataset-stats", response_model=JsonResponse[DatasetStatsResponse, None]
)
async def get_dataset_stats(
    project: Annotated[dict, Depends(ProjectPermission("viewer"))],
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)],
    filters: ImageFilters,
):
    """Tag distribution, dimension and aspect-ratio histograms, and file size stats.

    Every number covers the whole filtered set, counted in SQL. Filters are the gallery's own contract, so this panel and the gallery's matching count always agree.
    """
    project_id = project["id"]
    total = await AnalyticsRepository.count_images(connection, project_id, filters)
    summary = await AnalyticsRepository.dimension_summary(connection, project_id, filters)

    response_data = DatasetStatsResponse(
        tag_distribution=await _tag_distribution(connection, project_id, filters),
        dimension_histogram=await _dimension_histogram(connection, project_id, filters, summary),
        aspect_ratio_histogram=await _aspect_ratio_histogram(
            connection, project_id, filters, summary
        ),
        file_size_stats=await _file_size_stats(connection, project_id, filters),
    )

    return JsonResponse(
        data=response_data,
        message=f"Dataset statistics computed from {total} filtered images",
        status_code=status.HTTP_200_OK,
    )


@router.get(
    "/{project_id}/analytics/annotation-coverage",
    response_model=JsonResponse[AnnotationCoverageResponse, None],
)
async def get_annotation_coverage(
    project: Annotated[dict, Depends(ProjectPermission("viewer"))],
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)],
    filters: ImageFilters,
):
    """Percentage annotated, object density distribution, and object totals."""
    project_id = project["id"]
    coverage = await _annotation_coverage(connection, project_id, filters)

    return JsonResponse(
        data=AnnotationCoverageResponse(**coverage),
        message=f"Annotation coverage computed from {coverage['total_images']} images",
        status_code=status.HTTP_200_OK,
    )


@router.get(
    "/{project_id}/analytics/class-balance", response_model=JsonResponse[ClassBalanceResponse, None]
)
async def get_class_balance(
    project: Annotated[dict, Depends(ProjectPermission("viewer"))],
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)],
    filters: ImageFilters,
    category_id: UUID | None = Query(default=None, description="Filter by tag category"),
):
    """Class distribution, imbalance score, and recommendations over the matching images."""
    project_id = project["id"]
    total = await AnalyticsRepository.count_images(connection, project_id, filters)
    balance_data = await _class_balance(connection, project_id, filters, category_id)

    return JsonResponse(
        data=ClassBalanceResponse(**balance_data),
        message=f"Class balance computed from {total} images",
        status_code=status.HTTP_200_OK,
    )


@router.get(
    "/{project_id}/analytics/spatial-heatmap",
    response_model=JsonResponse[SpatialHeatmapResponse, None],
)
async def get_spatial_heatmap(
    project: Annotated[dict, Depends(ProjectPermission("viewer"))],
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)],
    filters: ImageFilters,
):
    """Where annotations cluster on the matching images."""
    project_id = project["id"]
    total = await AnalyticsRepository.count_images(connection, project_id, filters)
    heatmap_data = await _spatial_heatmap(connection, project_id, filters, grid_size=10)

    sampled = heatmap_data["annotation_points_sample_size"]
    plotted = (
        f"{sampled} of {heatmap_data['total_annotations']} annotation centres plotted"
        if sampled < heatmap_data["total_annotations"]
        else f"{heatmap_data['total_annotations']} annotation centres plotted"
    )
    return JsonResponse(
        data=SpatialHeatmapResponse(**heatmap_data),
        message=f"Spatial heatmap computed from {total} images; {plotted}",
        status_code=status.HTTP_200_OK,
    )


@router.get(
    "/{project_id}/analytics/image-quality", response_model=JsonResponse[ImageQualityResponse, None]
)
async def get_image_quality(
    project: Annotated[dict, Depends(ProjectPermission("viewer"))],
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)],
    filters: ImageFilters,
):
    """Quality score distribution, issue breakdown, and flagged images for the matching set.

    `corrupted` stays zero: the quality pipeline records no such issue, so reporting anything else would be inventing a number.
    """
    project_id = project["id"]
    total = await AnalyticsRepository.count_images(connection, project_id, filters)
    panel = await _quality_panel(connection, project_id, filters, total)
    issues = panel["issue_counts"]

    response_data = ImageQualityResponse(
        quality_distribution=panel["quality_distribution"],
        issue_breakdown=IssueBreakdown(
            blur_detected=issues["blur"],
            low_brightness=issues["low_brightness"],
            high_brightness=issues["high_brightness"],
            low_contrast=issues["low_contrast"],
            corrupted=0,
        ),
        flagged_images=[
            FlaggedImage(
                image_id=str(flagged["shared_image_id"]),
                filename=flagged.get("filename", ""),
                quality_score=flagged.get("overall_quality") or 0.0,
                issues=flagged.get("issues") or [],
                blur_score=flagged.get("sharpness") or 0.0,
                brightness=flagged.get("brightness") or 0.0,
            )
            for flagged in panel["flagged"]
        ],
    )

    return JsonResponse(
        data=response_data,
        message=f"Image quality computed from {total} images",
        status_code=status.HTTP_200_OK,
    )


@router.get(
    "/{project_id}/analytics/dimension-insights",
    response_model=JsonResponse[DimensionInsightsResponse, None],
)
async def get_dimension_insights(
    project: Annotated[dict, Depends(ProjectPermission("viewer"))],
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)],
    filters: ImageFilters,
):
    """Median dimensions, aspect ratio distribution, scatter sample, and resize recommendation."""
    project_id = project["id"]
    total = await AnalyticsRepository.count_images(connection, project_id, filters)
    summary = await AnalyticsRepository.dimension_summary(connection, project_id, filters)
    insights_data = await _dimension_insights(connection, project_id, filters, summary)

    plotted = (
        f"scatter plot shows {insights_data['scatter_sample_size']} of "
        f"{insights_data['scatter_total']} measured images, every "
        f"{max(1, insights_data['scatter_total'] // MAX_PLOTTED_POINTS)}th in gallery order"
    )
    return JsonResponse(
        data=DimensionInsightsResponse(**insights_data),
        message=f"Dimension insights computed from {total} images; {plotted}",
        status_code=status.HTTP_200_OK,
    )


# ============================================================================
# CONSOLIDATED ENDPOINTS
# ============================================================================


@router.get(
    "/{project_id}/analytics/enhanced-dataset-stats",
    response_model=JsonResponse[EnhancedDatasetStatsResponse, None],
)
async def get_enhanced_dataset_stats(
    project: Annotated[dict, Depends(ProjectPermission("viewer"))],
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)],
    filters: ImageFilters,
    category_id: UUID | None = Query(default=None, description="Filter class balance by category"),
):
    """Dataset stats, dimension insights, class balance, and image quality in one response.

    `total_images` is the exact number of matching images, not the number of rows a handler managed to fetch.
    """
    from app.schemas.analytics import (
        AspectRatioDistributionBucket,
        ClassDistribution,
        DimensionInsightsRecommendedResize,
        DimensionInsightsScatterPoint,
    )

    project_id = project["id"]
    total = await AnalyticsRepository.count_images(connection, project_id, filters)
    summary = await AnalyticsRepository.dimension_summary(connection, project_id, filters)

    dim_insights = await _dimension_insights(connection, project_id, filters, summary)
    balance_data = await _class_balance(connection, project_id, filters, category_id)
    panel = await _quality_panel(connection, project_id, filters, total)
    issues = panel["issue_counts"]
    averages = {key: value for key, value in panel["averages"].items() if value is not None}

    response_data = EnhancedDatasetStatsResponse(
        total_images=total,
        # Original Dataset Stats
        tag_distribution=await _tag_distribution(connection, project_id, filters),
        dimension_histogram=await _dimension_histogram(connection, project_id, filters, summary),
        aspect_ratio_histogram=await _aspect_ratio_histogram(
            connection, project_id, filters, summary
        ),
        file_size_stats=await _file_size_stats(connection, project_id, filters),
        # Dimension Insights
        median_width=dim_insights["median_width"],
        median_height=dim_insights["median_height"],
        median_aspect_ratio=dim_insights["median_aspect_ratio"],
        min_width=dim_insights["min_width"],
        max_width=dim_insights["max_width"],
        min_height=dim_insights["min_height"],
        max_height=dim_insights["max_height"],
        dimension_variance=dim_insights["dimension_variance"],
        recommended_resize=DimensionInsightsRecommendedResize(**dim_insights["recommended_resize"]),
        scatter_data=[
            DimensionInsightsScatterPoint(**point) for point in dim_insights["scatter_data"]
        ],
        aspect_ratio_distribution=[
            AspectRatioDistributionBucket(**bucket)
            for bucket in dim_insights["aspect_ratio_distribution"]
        ],
        # Class Balance
        class_distribution=[
            ClassDistribution(**entry) for entry in balance_data["class_distribution"]
        ],
        imbalance_score=balance_data["imbalance_score"],
        imbalance_level=balance_data["imbalance_level"],
        class_recommendations=balance_data["recommendations"],
        # Image Quality
        quality_status=panel["quality_status"],
        quality_status_counts=QualityStatusCounts(**panel["status_counts"]),
        quality_averages=QualityMetricsAverages(**averages) if averages else None,
        quality_distribution=panel["quality_distribution"],
        sharpness_histogram=panel["sharpness_histogram"],
        brightness_histogram=panel["brightness_histogram"],
        contrast_histogram=panel["contrast_histogram"],
        uniqueness_histogram=panel["uniqueness_histogram"],
        red_histogram=panel["red_histogram"],
        green_histogram=panel["green_histogram"],
        blue_histogram=panel["blue_histogram"],
        issue_breakdown=IssueBreakdownEnhanced(**issues),
        flagged_images=[
            FlaggedImageEnhanced(
                shared_image_id=str(flagged["shared_image_id"]),
                filename=flagged.get("filename", ""),
                file_path=flagged.get("file_path", ""),
                overall_quality=flagged.get("overall_quality") or 0,
                sharpness=flagged.get("sharpness"),
                brightness=flagged.get("brightness"),
                issues=flagged.get("issues") or [],
            )
            for flagged in panel["flagged"]
        ],
    )

    return JsonResponse(
        data=response_data,
        message=f"Enhanced dataset stats computed from {total} images",
        status_code=status.HTTP_200_OK,
    )


@router.get(
    "/{project_id}/analytics/annotation-analysis",
    response_model=JsonResponse[AnnotationAnalysisResponse, None],
)
async def get_annotation_analysis(
    project: Annotated[dict, Depends(ProjectPermission("viewer"))],
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)],
    filters: ImageFilters,
    grid_size: int = Query(default=10, ge=5, le=20, description="Grid size for heatmap"),
):
    """Annotation coverage and spatial heatmap in one response."""
    from app.schemas.analytics import (
        AnnotationPoint,
        BboxCountBucket,
        CenterOfMass,
        DensityBucket,
        PolygonCountBucket,
        Spread,
    )

    project_id = project["id"]
    total = await AnalyticsRepository.count_images(connection, project_id, filters)
    coverage_data = await _annotation_coverage(connection, project_id, filters)
    heatmap_data = await _spatial_heatmap(connection, project_id, filters, grid_size=grid_size)

    bbox_histogram = _dynamic_count_histogram(
        await AnalyticsRepository.annotation_count_values(connection, project_id, filters, "bbox")
    )
    polygon_histogram = _dynamic_count_histogram(
        await AnalyticsRepository.annotation_count_values(
            connection, project_id, filters, "polygon"
        )
    )

    response_data = AnnotationAnalysisResponse(
        # Coverage
        total_images=coverage_data["total_images"],
        annotated_images=coverage_data["annotated_images"],
        unannotated_images=coverage_data["unannotated_images"],
        coverage_percentage=coverage_data["coverage_percentage"],
        density_histogram=[
            DensityBucket(**bucket) for bucket in coverage_data["density_histogram"]
        ],
        total_objects=coverage_data["total_objects"],
        avg_objects_per_image=coverage_data["avg_objects_per_image"],
        median_objects_per_image=coverage_data["median_objects_per_image"],
        # Annotation type distributions (dynamic binning)
        bbox_count_histogram=[BboxCountBucket(**bucket) for bucket in bbox_histogram],
        polygon_count_histogram=[PolygonCountBucket(**bucket) for bucket in polygon_histogram],
        # Heatmap
        grid_density=heatmap_data["grid_density"],
        grid_size=heatmap_data["grid_size"],
        max_cell_count=heatmap_data["max_cell_count"],
        center_of_mass=CenterOfMass(**heatmap_data["center_of_mass"]),
        spread=Spread(**heatmap_data["spread"]),
        clustering_score=heatmap_data["clustering_score"],
        total_annotations=heatmap_data["total_annotations"],
        annotation_points=[AnnotationPoint(**point) for point in heatmap_data["annotation_points"]],
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


@router.post(
    "/{project_id}/analytics/compute-quality",
    response_model=JsonResponse[ProcessQualityResponse, None],
)
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
    total_without = await ImageQualityRepository.count_images_without_metrics(
        connection, project_id
    )
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

    # Dispatch Celery task
    task = process_quality_metrics_task.delay(
        job_id=str(job["id"]),
        project_id=project_id,
        batch_size=batch_size,
    )

    # Update job with task ID and commit both changes together
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
    from app.repositories.quality_job import QualityJobRepository
    from app.schemas.analytics import QualityProgressResponse

    project_id = project["id"]

    # Try Redis first for real-time progress
    try:
        progress_key = f"quality:progress:{project_id}"
        redis_progress = await _get_redis().hgetall(progress_key)

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
                started_at=latest_job["started_at"].isoformat()
                if latest_job.get("started_at")
                else None,
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
        await _get_redis().delete(f"quality:progress:{project_id}")
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
