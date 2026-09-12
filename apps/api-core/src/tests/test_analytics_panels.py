"""Every analytics panel must return real numbers, not a successful shape full of ``None``.

The analytics rewrite moved each panel's aggregate into SQL and renamed the columns on the way. One rename drifted: `quality_averages` labelled its aggregates `avg_sharpness`/`avg_overall`/… while `QualityMetricsAverages` declares `sharpness`/`overall_quality`/…, so Pydantic discarded all eight keys as unknown and the enhanced panel reported `None` for every average over real data. Nothing failed. The suite had a test that the quality panel *responds*, and a test that every panel covers the same image set, and neither one ever looked inside `averages`.

So the checks here assert values, not status. Each panel's numbers are compared against what the `gallery` fixture actually contains, which is the only thing that would have caught a rename that silently drops a key. `test_no_panel_silently_drops_a_repository_key` generalises it: it re-runs the audit that found the bug, over every dict-to-model hand-off in the router at once.

The fixture's two images with completed quality metrics are `alpha` (sharpness 0.9, brightness 0.5, contrast 0.6, uniqueness 0.8, rgb 0.7/0.4/0.2, overall 0.9) and `dup_a` (0.2, 0.1, 0.2, 0.3, rgb 0.1/0.1/0.1, overall 0.3), so every average below is the midpoint of those two.
"""

from pytest import approx

from app.repositories.analytics import QUALITY_AVERAGE_COLUMNS, AnalyticsRepository
from app.routers import analytics as analytics_router
from app.routers.analytics import (
    _annotation_coverage,
    _class_balance,
    _dimension_insights,
    _quality_panel,
    _spatial_heatmap,
)
from app.schemas import analytics as schemas
from app.schemas.image_filters import ImageFilterParams
from tests.test_explore_filters import gallery  # noqa: F401
from tests.test_storage_access import db_engine  # noqa: F401

#: Mean of `alpha` and `dup_a`, the fixture's only images with completed metrics.
EXPECTED_AVERAGES = {
    "sharpness": 0.55,
    "brightness": 0.30,
    "contrast": 0.40,
    "uniqueness": 0.55,
    "red_avg": 0.40,
    "green_avg": 0.25,
    "blue_avg": 0.15,
    "overall_quality": 0.60,
}


def project(gallery) -> dict:  # noqa: F811
    return {"id": gallery["project_id"]}


# ============================================================================
# The regression: averages arrived as eight Nones over real data
# ============================================================================
async def test_quality_averages_reach_the_response_model_as_numbers(gallery):  # noqa: F811
    """The headline bug. Every field here came back `None` while the SQL returned the right means."""
    enhanced = await analytics_router.get_enhanced_dataset_stats(
        project(gallery), gallery["conn"], ImageFilterParams(), None
    )
    averages = enhanced.data.quality_averages

    assert averages is not None, "two images have completed metrics, so this is not 'no data'"
    for field, expected in EXPECTED_AVERAGES.items():
        actual = getattr(averages, field)
        assert actual is not None, f"{field} was dropped between the repository and the schema"
        assert actual == approx(expected), field


async def test_the_repository_keys_its_averages_by_schema_field_name(gallery):  # noqa: F811
    """The structural half of the fix: the aggregate labels *are* the schema's field names.

    Asserted on the mapping and on a live result, so a hand-written label sneaking back in fails here
    rather than in a panel nobody inspects.
    """
    fields = set(schemas.QualityMetricsAverages.model_fields)

    assert set(QUALITY_AVERAGE_COLUMNS) == fields

    averages = await AnalyticsRepository.quality_averages(
        gallery["conn"], gallery["project_id"], ImageFilterParams()
    )
    assert set(averages) == fields
    assert averages["overall_quality"] == approx(0.60)


async def test_quality_averages_narrow_with_the_filter(gallery):  # noqa: F811
    """A filtered average must be the filtered images' own, not the project's and not `None`."""
    enhanced = await analytics_router.get_enhanced_dataset_stats(
        project(gallery), gallery["conn"], ImageFilterParams(search="alpha"), None
    )
    averages = enhanced.data.quality_averages

    assert averages is not None
    assert averages.sharpness == approx(0.9)
    assert averages.brightness == approx(0.5)
    assert averages.overall_quality == approx(0.9)


async def test_averages_are_absent_only_when_no_metrics_completed(gallery):  # noqa: F811
    """`None` must mean "nothing measured", which is only readable once real data stops yielding it."""
    enhanced = await analytics_router.get_enhanced_dataset_stats(
        project(gallery), gallery["conn"], ImageFilterParams(search="no-such-image"), None
    )
    assert enhanced.data.quality_averages is None


# ============================================================================
# The general form: no hand-off may drop a key
# ============================================================================
#: Keys a panel computes for reasons other than the response model. Sampled endpoints report how
#: large a sample they drew; the schemas do not expose it. Anything *not* listed here that fails to
#: land in its model is the `avg_sharpness` bug again.
DELIBERATELY_UNMAPPED = {
    "SpatialHeatmapResponse": {"annotation_points_sample_size"},
    "DimensionInsightsResponse": {"scatter_sample_size", "scatter_total"},
}


async def test_no_panel_silently_drops_a_repository_key(gallery):  # noqa: F811
    """Pydantic ignores unknown keys, so a renamed key is a silent data loss at every hand-off.

    This is the audit that found the averages bug, kept as a test: each dict the router splats into a
    model is checked against that model's fields.
    """
    conn, project_id, filters = gallery["conn"], gallery["project_id"], ImageFilterParams()
    summary = await AnalyticsRepository.dimension_summary(conn, project_id, filters)
    insights = await _dimension_insights(conn, project_id, filters, summary)
    heatmap = await _spatial_heatmap(conn, project_id, filters, 10)
    balance = await _class_balance(conn, project_id, filters, None)
    panel = await _quality_panel(conn, project_id, filters, 6)

    hand_offs: list[tuple[schemas.BaseModel, dict]] = [
        (schemas.AnnotationCoverageResponse, await _annotation_coverage(conn, project_id, filters)),
        (schemas.ClassBalanceResponse, balance),
        (schemas.SpatialHeatmapResponse, heatmap),
        (schemas.CenterOfMass, heatmap["center_of_mass"]),
        (schemas.Spread, heatmap["spread"]),
        (schemas.DimensionInsightsResponse, insights),
        (schemas.DimensionInsightsRecommendedResize, insights["recommended_resize"]),
        (schemas.QualityStatusCounts, panel["status_counts"]),
        (schemas.QualityMetricsAverages, panel["averages"]),
        (schemas.IssueBreakdownEnhanced, panel["issue_counts"]),
    ]
    hand_offs += [(schemas.ClassDistribution, entry) for entry in balance["class_distribution"]]
    hand_offs += [(schemas.AnnotationPoint, point) for point in heatmap["annotation_points"]]
    hand_offs += [(schemas.DimensionInsightsScatterPoint, p) for p in insights["scatter_data"]]
    hand_offs += [
        (schemas.AspectRatioDistributionBucket, bucket)
        for bucket in insights["aspect_ratio_distribution"]
    ]

    for model, data in hand_offs:
        allowed = DELIBERATELY_UNMAPPED.get(model.__name__, set())
        dropped = set(data) - set(model.model_fields) - allowed
        assert not dropped, f"{model.__name__} would discard {sorted(dropped)}"


# ============================================================================
# Per-panel values, against what the fixture actually holds
# ============================================================================
async def test_quality_panel_carries_real_counts_and_examples(gallery):  # noqa: F811
    enhanced = await analytics_router.get_enhanced_dataset_stats(
        project(gallery), gallery["conn"], ImageFilterParams(), None
    )
    data = enhanced.data

    assert data.quality_status == "partial"
    assert (data.quality_status_counts.completed, data.quality_status_counts.pending) == (2, 1)
    assert (data.quality_status_counts.processing, data.quality_status_counts.failed) == (0, 0)
    assert data.issue_breakdown.blur == 1
    assert data.issue_breakdown.low_brightness == 1
    assert data.issue_breakdown.duplicate == 0

    assert [image.filename for image in data.flagged_images] == ["dup.jpg"]
    assert data.flagged_images[0].overall_quality == approx(0.3)
    assert data.flagged_images[0].sharpness == approx(0.2)
    assert sorted(data.flagged_images[0].issues) == ["blur", "low_brightness"]

    # Every score histogram covers the two completed images and nothing else.
    for histogram in (
        data.quality_distribution,
        data.sharpness_histogram,
        data.brightness_histogram,
        data.contrast_histogram,
        data.uniqueness_histogram,
        data.red_histogram,
        data.green_histogram,
        data.blue_histogram,
    ):
        assert sum(bucket.count for bucket in histogram) == 2


async def test_image_quality_panel_carries_real_values(gallery):  # noqa: F811
    quality = await analytics_router.get_image_quality(
        project(gallery), gallery["conn"], ImageFilterParams()
    )
    data = quality.data

    assert data.issue_breakdown.blur_detected == 1
    assert data.issue_breakdown.low_brightness == 1
    assert sum(bucket.count for bucket in data.quality_distribution) == 2
    assert [flagged.filename for flagged in data.flagged_images] == ["dup.jpg"]
    assert data.flagged_images[0].quality_score == approx(0.3)
    assert data.flagged_images[0].blur_score == approx(0.2)
    assert data.flagged_images[0].brightness == approx(0.1)


async def test_dataset_stats_carries_real_tag_and_size_numbers(gallery):  # noqa: F811
    stats = await analytics_router.get_dataset_stats(
        project(gallery), gallery["conn"], ImageFilterParams()
    )
    data = stats.data

    assert {tag.name: tag.count for tag in data.tag_distribution} == {"red": 3, "blue": 2}
    # file_size_bytes is width * 10 across the pool: 500, 1000 x 4, 4000.
    assert data.file_size_stats.min == 500
    assert data.file_size_stats.max == 4000
    assert data.file_size_stats.avg == approx(8500 / 6, rel=1e-3)
    assert sum(bucket.count for bucket in data.dimension_histogram) == 6
    assert sum(bucket.count for bucket in data.aspect_ratio_histogram) == 6


async def test_dimension_insights_carries_real_medians(gallery):  # noqa: F811
    insights = await analytics_router.get_dimension_insights(
        project(gallery), gallery["conn"], ImageFilterParams()
    )
    data = insights.data

    # Widths are 50, 100, 100, 100, 100, 400; every height is 100.
    assert data.median_width == 100
    assert data.median_height == 100
    assert data.median_aspect_ratio == approx(1.0)
    assert (data.min_width, data.max_width) == (50, 400)
    assert (data.min_height, data.max_height) == (100, 100)
    assert data.recommended_resize.width > 0 and data.recommended_resize.height > 0
    assert len(data.scatter_data) == 6
    assert sum(bucket.count for bucket in data.aspect_ratio_distribution) == 6


async def test_class_balance_carries_real_counts(gallery):  # noqa: F811
    balance = await analytics_router.get_class_balance(
        project(gallery), gallery["conn"], ImageFilterParams(), None
    )
    distribution = {entry.tag_name: entry.image_count for entry in balance.data.class_distribution}

    assert distribution == {"red": 3, "blue": 2}
    assert balance.data.imbalance_score > 0
    assert balance.data.imbalance_level in {"balanced", "moderate", "severe"}


async def test_annotation_coverage_carries_real_numbers(gallery):  # noqa: F811
    coverage = await analytics_router.get_annotation_coverage(
        project(gallery), gallery["conn"], ImageFilterParams()
    )
    data = coverage.data

    # Only `alpha` carries an annotation, and it carries exactly one.
    assert data.total_images == 6
    assert data.annotated_images == 1
    assert data.unannotated_images == 5
    assert data.coverage_percentage == approx(100 / 6, rel=1e-3)
    assert data.total_objects == 1
    assert sum(bucket.count for bucket in data.density_histogram) == 6


async def test_spatial_heatmap_carries_a_real_centre_of_mass(gallery):  # noqa: F811
    heatmap = await analytics_router.get_spatial_heatmap(
        project(gallery), gallery["conn"], ImageFilterParams()
    )
    data = heatmap.data

    # The single detection spans 0.1-0.5 on both axes, so its centre is (0.3, 0.3).
    assert data.total_annotations == 1
    assert data.center_of_mass.x == approx(0.3)
    assert data.center_of_mass.y == approx(0.3)
    assert data.spread.x_std == approx(0.0)
    assert len(data.annotation_points) == 1
    assert data.grid_size == 10
    assert data.max_cell_count == 1


async def test_annotation_analysis_carries_real_coverage_and_heatmap(gallery):  # noqa: F811
    analysis = await analytics_router.get_annotation_analysis(
        project(gallery), gallery["conn"], ImageFilterParams(), 10
    )
    data = analysis.data

    assert data.total_images == 6
    assert data.annotated_images == 1
    assert data.total_objects == 1
    assert data.total_annotations == 1
    assert data.center_of_mass.x == approx(0.3)
    assert sum(bucket.count for bucket in data.bbox_count_histogram) == 6
    assert sum(bucket.count for bucket in data.density_histogram) == 6
