"""Gallery, export, and analytics must describe the same image set.

The gallery pages a filter, the export resolves the same filter into a manifest, and every analytics panel aggregates over it. Until these shared one query they disagreed: the export snapshot carried 16 of the contract's fields and re-implemented them, and the analytics handlers counted at most the first 10 000 matching images. Both failure modes are silent — the numbers look plausible — so the checks here compare real numbers from a real database rather than asserting on code shape.

Fixtures come from `test_explore_filters`, which owns the canonical gallery fixture; `large_gallery` adds a pool above the old 10 000-image materialisation cap so a truncated aggregate would be visibly wrong.
"""

from uuid import UUID, uuid4

import pytest
from sqlalchemy import insert
from sqlalchemy.ext.asyncio import create_async_engine

from app.models.data_management import (
    project_images,
    shared_image_tags,
    shared_images,
    tag_categories,
    tags,
)
from app.models.project import projects
from app.models.user import users
from app.repositories.analytics import AnalyticsRepository
from app.repositories.project_image import ProjectImageRepository
from app.routers.analytics import (
    DENSITY_BUCKETS,
    QUALITY_BUCKETS,
    _annotation_coverage,
    _class_balance,
    _dimension_insights,
    _file_size_stats,
    _quality_panel,
    _spatial_heatmap,
    _tag_distribution,
)
from app.schemas.export import ExportCreate, FilterSnapshot
from app.schemas.image_filters import ImageFilterParams
from app.services.export import (
    ExportService,
    count_export_images,
    describe_filter_scope,
    query_export_images,
)
from tests.test_explore_filters import gallery  # noqa: F401
from tests.test_storage_access import db_engine  # noqa: F401

#: Images in the large fixture. Above the 10 000 cap the analytics handlers used to impose, so any
#: aggregate that still truncates reports 10 000 where the fixture knows the answer is this.
LARGE_POOL_SIZE = 10_100

#: How many of those carry the "bulk" tag, chosen so a truncated tag count cannot coincide with it.
LARGE_TAGGED = 7_000


@pytest.fixture
async def large_gallery(db_engine):  # noqa: F811 - imported pytest fixture
    """A pool larger than the old materialisation cap, with known totals.

    Widths cycle 100/200/300/400 and file sizes track them, so every extreme, mean, and median is known without counting rows in the test.
    """
    engine = create_async_engine(db_engine.url.set(drivername="postgresql+asyncpg"))
    async with engine.connect() as conn:
        transaction = await conn.begin()

        user_id = (
            await conn.execute(
                insert(users)
                .values(
                    email=f"{uuid4()}@example.test",
                    username=str(uuid4()),
                    hashed_password="x",
                    full_name="Owner",
                )
                .returning(users.c.id)
            )
        ).scalar_one()
        project_id = (
            await conn.execute(
                insert(projects)
                .values(name="large", slug=str(uuid4()), owner_id=user_id)
                .returning(projects.c.id)
            )
        ).scalar_one()

        widths = [100, 200, 300, 400]
        rows = [
            {
                "file_path": f"bulk/{index:06d}.jpg",
                "filename": f"{index:06d}.jpg",
                "width": widths[index % len(widths)],
                "height": 100,
                "aspect_ratio": widths[index % len(widths)] / 100,
                "file_size_bytes": widths[index % len(widths)] * 10,
            }
            for index in range(LARGE_POOL_SIZE)
        ]
        image_ids = [
            row[0]
            for row in (
                await conn.execute(insert(shared_images).returning(shared_images.c.id), rows)
            ).fetchall()
        ]
        await conn.execute(
            insert(project_images),
            [{"project_id": project_id, "shared_image_id": image_id} for image_id in image_ids],
        )

        category_id = (
            await conn.execute(
                insert(tag_categories)
                .values(project_id=project_id, name="bulk")
                .returning(tag_categories.c.id)
            )
        ).scalar_one()
        tag_id = (
            await conn.execute(
                insert(tags)
                .values(project_id=project_id, category_id=category_id, name="bulk")
                .returning(tags.c.id)
            )
        ).scalar_one()
        await conn.execute(
            insert(shared_image_tags),
            [
                {
                    "project_id": project_id,
                    "shared_image_id": image_id,
                    "tag_id": tag_id,
                    "category_id": category_id,
                }
                for image_id in image_ids[:LARGE_TAGGED]
            ],
        )

        yield {
            "conn": conn,
            "project_id": project_id,
            "image_ids": image_ids,
            "tag_id": tag_id,
        }

        await transaction.rollback()
    await engine.dispose()


async def gallery_total(gallery, filters: ImageFilterParams) -> int:  # noqa: F811
    _, total = await ProjectImageRepository.explore(
        gallery["conn"], project_id=gallery["project_id"], page=1, page_size=1, filters=filters
    )
    return total


async def gallery_ids(gallery, filters: ImageFilterParams) -> set[UUID]:  # noqa: F811
    rows, _ = await ProjectImageRepository.explore(
        gallery["conn"], project_id=gallery["project_id"], page=1, page_size=10_000, filters=filters
    )
    return {row["id"] for row in rows}


def snapshot(**values) -> FilterSnapshot:
    return FilterSnapshot(**values)


def preview_config(filters: FilterSnapshot) -> ExportCreate:
    return ExportCreate(
        export_mode="classification",
        output_format="manifest_csv",
        filter_snapshot=filters,
    )


# ============================================================================
# G03 - the export snapshot is the gallery's filter contract
# ============================================================================
def test_filter_snapshot_carries_the_whole_contract():
    """The export snapshot must not be a hand-copied subset of the gallery's filters again."""
    assert issubclass(FilterSnapshot, ImageFilterParams)
    assert set(FilterSnapshot.model_fields) == set(ImageFilterParams.model_fields)


def test_snapshot_field_names_match_the_contract_exactly():
    """Field names, not just field counts: a renamed field would silently stop filtering."""
    for name, field in ImageFilterParams.model_fields.items():
        assert FilterSnapshot.model_fields[name].annotation == field.annotation


def test_describe_filter_scope_ignores_modes_without_their_tags():
    """A match mode on its own constrains nothing, so it must not read as an active filter."""
    assert describe_filter_scope({}) == []
    assert describe_filter_scope({"include_match_mode": "AND"}) == []
    assert describe_filter_scope({"tag_ids": [], "quality_min": 0.4}) == ["quality_min"]


async def test_export_resolves_the_same_images_as_the_gallery(gallery):  # noqa: F811
    """G03: search, quality, and annotation-count filters must survive into the export."""
    filters = snapshot(search="dup", quality_min=0.2, object_count_max=0)
    exported = await query_export_images(
        gallery["conn"], gallery["project_id"], filters.model_dump()
    )

    assert {row["id"] for row in exported} == await gallery_ids(gallery, filters)
    assert {row["id"] for row in exported} == {gallery["pool"]["dup_a"]}


async def test_export_preview_reports_the_scope_it_resolved(gallery):  # noqa: F811
    """The preview's count and the execution query's count come from one place."""
    filters = snapshot(tag_ids=[gallery["tags"]["red"]], quality_min=0.5)
    preview = await ExportService().preview_export(
        gallery["conn"], gallery["project_id"], preview_config(filters)
    )

    assert preview.image_count == 1
    assert preview.scope is not None
    assert preview.scope.image_count == await count_export_images(
        gallery["conn"], gallery["project_id"], filters
    )
    assert preview.scope.is_whole_project is False
    assert preview.scope.active_filters == ["tag_ids", "quality_min"]
    assert preview.scope.filters.quality_min == 0.5


async def test_unannotated_warning_counts_exported_images_not_job_image_rows(gallery):  # noqa: F811
    """The preview's "no annotations" warning must count each exported image once.

    Two defects lived here. It built its FROM and its WHERE from two independently materialised copies of one subquery, cross-joining the export with itself so the number was multiplied by the export's size. It then counted ``images`` (job) rows rather than exported images, so a pool image never pulled into a job contributed nothing and an image in two jobs contributed twice. The fixture exports six images and only ``alpha`` carries a detection, so a detection-mode export has five images with no annotation.
    """
    preview = await ExportService().preview_export(
        gallery["conn"],
        gallery["project_id"],
        ExportCreate(
            export_mode="detection",
            output_format="manifest_csv",
            filter_snapshot=snapshot(),
        ),
    )

    assert preview.image_count == len(gallery["pool"])
    unannotated = [int(w.split()[0]) for w in preview.warnings if "no annotations" in w]
    assert unannotated == [5], f"expected five unannotated exported images, got {unannotated}"


async def test_export_preview_of_an_unfiltered_snapshot_covers_the_whole_pool(gallery):  # noqa: F811
    preview = await ExportService().preview_export(
        gallery["conn"], gallery["project_id"], preview_config(snapshot())
    )

    assert preview.scope.is_whole_project is True
    assert preview.scope.active_filters == []
    assert preview.image_count == len(gallery["pool"])


async def test_a_filter_the_old_snapshot_dropped_now_narrows_the_export(gallery):  # noqa: F811
    """`aspect_ratio_*` was one of the 27 fields the export snapshot did not carry."""
    wide = snapshot(aspect_ratio_min=2.0)
    exported = await query_export_images(gallery["conn"], gallery["project_id"], wide)

    assert {row["id"] for row in exported} == {gallery["pool"]["zeta"]}
    assert len(exported) < len(gallery["pool"])


async def test_export_rows_are_ordered_deterministically(gallery):  # noqa: F811
    """A manifest of an unchanged project must not reshuffle between two exports."""
    first = await query_export_images(gallery["conn"], gallery["project_id"], snapshot())
    second = await query_export_images(gallery["conn"], gallery["project_id"], snapshot())

    order = [(row["filename"], row["id"]) for row in first]
    assert order == sorted(order)
    assert [row["id"] for row in first] == [row["id"] for row in second]


# ============================================================================
# G11 - gallery, analytics, export preview, and facet counts agree
# ============================================================================
@pytest.mark.parametrize(
    "case",
    [
        {},
        {"search": "dup"},
        {"tag_ids": "red"},
        {"tag_ids": "red", "quality_min": 0.5},
        {"is_annotated": True},
        {"width_min": 100, "aspect_ratio_max": 1.5},
        {"issues": ["blur"]},
        {"object_count_min": 1},
    ],
)
async def test_every_surface_reports_the_same_matching_count(gallery, case):  # noqa: F811
    """The plan's acceptance check for combined filters, on one filter set at a time."""
    values = dict(case)
    if "tag_ids" in values:
        values["tag_ids"] = [gallery["tags"][values["tag_ids"]]]
    filters = snapshot(**values)

    expected = await gallery_total(gallery, filters)
    analytics_count = await AnalyticsRepository.count_images(
        gallery["conn"], gallery["project_id"], filters
    )
    preview = await ExportService().preview_export(
        gallery["conn"], gallery["project_id"], preview_config(filters)
    )
    coverage = await _annotation_coverage(gallery["conn"], gallery["project_id"], filters)

    assert analytics_count == expected
    assert preview.image_count == expected
    assert preview.scope.image_count == expected
    assert coverage["total_images"] == expected
    assert (
        len(await query_export_images(gallery["conn"], gallery["project_id"], filters)) == expected
    )


async def test_combined_filters_resolve_to_the_expected_images(gallery):  # noqa: F811
    """Not just equal counts — the same images."""
    filters = snapshot(tag_ids=[gallery["tags"]["red"]], quality_min=0.5, width_max=50)
    exported = await query_export_images(gallery["conn"], gallery["project_id"], filters)

    assert {row["id"] for row in exported} == {gallery["pool"]["alpha"]}
    assert await gallery_ids(gallery, filters) == {gallery["pool"]["alpha"]}


async def test_zero_matches_report_zero_everywhere(gallery):  # noqa: F811
    """An applied filter that matches nothing must never fall back to the project total."""
    filters = snapshot(tag_ids=[gallery["tags"]["blue"]], quality_min=0.95)

    assert await gallery_total(gallery, filters) == 0
    assert (
        await AnalyticsRepository.count_images(gallery["conn"], gallery["project_id"], filters) == 0
    )

    coverage = await _annotation_coverage(gallery["conn"], gallery["project_id"], filters)
    assert coverage["total_images"] == 0
    assert coverage["annotated_images"] == 0
    assert coverage["coverage_percentage"] == 0.0
    assert coverage["total_objects"] == 0
    assert all(bucket["count"] == 0 for bucket in coverage["density_histogram"])

    assert await _tag_distribution(gallery["conn"], gallery["project_id"], filters) == []

    sizes = await _file_size_stats(gallery["conn"], gallery["project_id"], filters)
    assert (sizes.min, sizes.max, sizes.avg, sizes.median) == (0, 0, 0, 0)

    heatmap = await _spatial_heatmap(gallery["conn"], gallery["project_id"], filters, grid_size=10)
    assert heatmap["total_annotations"] == 0
    assert heatmap["max_cell_count"] == 0

    preview = await ExportService().preview_export(
        gallery["conn"], gallery["project_id"], preview_config(filters)
    )
    assert preview.image_count == 0
    assert "No images match the current filter" in preview.warnings


async def test_an_empty_filter_and_a_zero_match_filter_are_distinguishable(gallery):  # noqa: F811
    """The bug this replaces: `len(ids) if ids else total` made these two look identical."""
    unfiltered = await AnalyticsRepository.count_images(
        gallery["conn"], gallery["project_id"], snapshot()
    )
    impossible = await AnalyticsRepository.count_images(
        gallery["conn"], gallery["project_id"], snapshot(search="no-such-image")
    )

    assert unfiltered == len(gallery["pool"])
    assert impossible == 0


# ============================================================================
# G11 - SQL aggregates against known fixture totals
# ============================================================================
async def test_tag_facet_counts_describe_the_current_results(gallery):  # noqa: F811
    """Facets mean "current results": narrowing the gallery narrows the facet."""
    unfiltered = dict(
        await AnalyticsRepository.tag_image_counts(
            gallery["conn"], gallery["project_id"], snapshot()
        )
    )
    assert unfiltered[gallery["tags"]["red"]] == 3
    assert unfiltered[gallery["tags"]["blue"]] == 2

    narrowed = dict(
        await AnalyticsRepository.tag_image_counts(
            gallery["conn"], gallery["project_id"], snapshot(search="dup")
        )
    )
    assert narrowed[gallery["tags"]["red"]] == 2
    assert narrowed[gallery["tags"]["blue"]] == 2


async def test_tag_facet_counts_sum_consistently_with_the_gallery(gallery):  # noqa: F811
    """Every image a facet counts is an image the gallery would page."""
    filters = snapshot(tag_ids=[gallery["tags"]["red"]])
    counts = dict(
        await AnalyticsRepository.tag_image_counts(gallery["conn"], gallery["project_id"], filters)
    )
    assert counts[gallery["tags"]["red"]] == await gallery_total(gallery, filters)


async def test_annotation_coverage_matches_the_fixture(gallery):  # noqa: F811
    coverage = await _annotation_coverage(gallery["conn"], gallery["project_id"], snapshot())

    assert coverage["total_images"] == 6
    assert coverage["annotated_images"] == 1
    assert coverage["unannotated_images"] == 5
    assert coverage["total_objects"] == 1
    assert coverage["median_objects_per_image"] == 0
    assert coverage["coverage_percentage"] == round(1 / 6 * 100, 2)
    buckets = {bucket["bucket"]: bucket["count"] for bucket in coverage["density_histogram"]}
    assert buckets["0"] == 5
    assert buckets["1"] == 1
    assert sum(buckets.values()) == 6
    assert [name for name, _, _ in DENSITY_BUCKETS] == list(buckets)


async def test_dimension_and_file_size_aggregates_match_the_fixture(gallery):  # noqa: F811
    summary = await AnalyticsRepository.dimension_summary(
        gallery["conn"], gallery["project_id"], snapshot()
    )
    assert summary["measured_images"] == 6
    assert (summary["min_width"], summary["max_width"]) == (50, 400)
    assert (summary["min_height"], summary["max_height"]) == (100, 100)
    assert summary["median_width"] == 100
    assert summary["median_height"] == 100
    assert summary["median_ratio"] == pytest.approx(1.0)
    assert summary["min_ratio"] == pytest.approx(0.5)
    assert summary["max_ratio"] == pytest.approx(4.0)

    sizes = await _file_size_stats(gallery["conn"], gallery["project_id"], snapshot())
    assert sizes.min == 500
    assert sizes.max == 4000
    assert sizes.median == 1000
    assert sizes.avg == pytest.approx(8500 / 6)


async def test_dimension_histogram_buckets_cover_every_matching_image(gallery):  # noqa: F811
    from app.routers.analytics import _dimension_histogram

    summary = await AnalyticsRepository.dimension_summary(
        gallery["conn"], gallery["project_id"], snapshot()
    )
    histogram = await _dimension_histogram(
        gallery["conn"], gallery["project_id"], snapshot(), summary
    )
    assert sum(bucket.count for bucket in histogram) == 6


async def test_aspect_ratio_shapes_match_the_fixture(gallery):  # noqa: F811
    shapes = await AnalyticsRepository.aspect_ratio_shape_counts(
        gallery["conn"], gallery["project_id"], snapshot()
    )
    assert shapes == {"portrait": 1, "square": 4, "landscape": 0, "ultra_wide": 1}


async def test_quality_panel_counts_only_the_matching_images(gallery):  # noqa: F811
    panel = await _quality_panel(gallery["conn"], gallery["project_id"], snapshot(), 6)

    assert panel["status_counts"] == {"completed": 2, "pending": 1}
    assert panel["quality_status"] == "partial"
    assert panel["issue_counts"]["blur"] == 1
    assert panel["issue_counts"]["low_brightness"] == 1
    assert panel["issue_counts"]["duplicate"] == 0
    assert [row["shared_image_id"] for row in panel["flagged"]] == [gallery["pool"]["dup_a"]]

    distribution = {bucket.bucket: bucket.count for bucket in panel["quality_distribution"]}
    assert distribution["Poor (0-0.3)"] == 0
    assert distribution["Fair (0.3-0.5)"] == 1
    assert distribution["Excellent (0.7-1.0)"] == 1
    assert sum(distribution.values()) == 2
    assert [name for name, _, _ in QUALITY_BUCKETS] == list(distribution)


async def test_flagged_images_stay_inside_the_filtered_set(gallery):  # noqa: F811
    """Flagged examples used to come from the whole project regardless of the filters."""
    panel = await _quality_panel(
        gallery["conn"], gallery["project_id"], snapshot(search="alpha"), 1
    )
    assert panel["flagged"] == []


async def test_class_balance_counts_match_the_tag_facet(gallery):  # noqa: F811
    balance = await _class_balance(gallery["conn"], gallery["project_id"], snapshot(), None)
    counts = {
        entry["tag_name"]: entry["annotation_count"] for entry in balance["class_distribution"]
    }

    assert counts == {"red": 3, "blue": 2}
    assert balance["imbalance_level"] in {"balanced", "moderate", "severe"}


async def test_spatial_heatmap_totals_are_exact(gallery):  # noqa: F811
    heatmap = await _spatial_heatmap(gallery["conn"], gallery["project_id"], snapshot(), 10)

    assert heatmap["total_annotations"] == 1
    assert sum(sum(row) for row in heatmap["grid_density"]) == 1
    assert heatmap["max_cell_count"] == 1
    assert heatmap["annotation_points_sample_size"] == 1
    assert heatmap["center_of_mass"] == {"x": 0.3, "y": 0.3}


async def test_dimension_insights_report_their_sample_size(gallery):  # noqa: F811
    summary = await AnalyticsRepository.dimension_summary(
        gallery["conn"], gallery["project_id"], snapshot()
    )
    insights = await _dimension_insights(
        gallery["conn"], gallery["project_id"], snapshot(), summary
    )

    assert insights["scatter_total"] == 6
    assert insights["scatter_sample_size"] == 6
    assert len(insights["scatter_data"]) == 6
    assert sum(bucket["count"] for bucket in insights["aspect_ratio_distribution"]) == 6
    assert insights["median_width"] == 100


# ============================================================================
# G11 - above the old materialisation limits
# ============================================================================
async def test_counts_above_the_old_cap_are_exact(large_gallery):
    """10 100 images: an aggregate that still truncates would report 10 000."""
    conn, project_id = large_gallery["conn"], large_gallery["project_id"]
    filters = snapshot()

    _, gallery_count = await ProjectImageRepository.explore(
        conn, project_id=project_id, page=1, page_size=1, filters=filters
    )
    assert gallery_count == LARGE_POOL_SIZE
    assert await AnalyticsRepository.count_images(conn, project_id, filters) == LARGE_POOL_SIZE
    assert await count_export_images(conn, project_id, filters) == LARGE_POOL_SIZE

    coverage = await _annotation_coverage(conn, project_id, filters)
    assert coverage["total_images"] == LARGE_POOL_SIZE
    assert coverage["annotated_images"] == 0
    assert coverage["unannotated_images"] == LARGE_POOL_SIZE
    assert {bucket["bucket"]: bucket["count"] for bucket in coverage["density_histogram"]}["0"] == (
        LARGE_POOL_SIZE
    )


async def test_tag_facet_above_the_old_cap_is_exact(large_gallery):
    counts = dict(
        await AnalyticsRepository.tag_image_counts(
            large_gallery["conn"], large_gallery["project_id"], snapshot()
        )
    )
    assert counts[large_gallery["tag_id"]] == LARGE_TAGGED


async def test_dimension_aggregates_above_the_old_cap_are_exact(large_gallery):
    """Widths cycle 100/200/300/400, so every statistic is known in advance."""
    summary = await AnalyticsRepository.dimension_summary(
        large_gallery["conn"], large_gallery["project_id"], snapshot()
    )
    assert summary["measured_images"] == LARGE_POOL_SIZE
    assert (summary["min_width"], summary["max_width"]) == (100, 400)
    assert summary["avg_width"] == pytest.approx(250, abs=1)

    sizes = await _file_size_stats(large_gallery["conn"], large_gallery["project_id"], snapshot())
    assert (sizes.min, sizes.max) == (1000, 4000)
    assert sizes.avg == pytest.approx(2500, abs=10)


async def test_scatter_plot_samples_and_says_so(large_gallery):
    """A plot of 10 100 points is a sample; the response must report its size, not imply exactness."""
    summary = await AnalyticsRepository.dimension_summary(
        large_gallery["conn"], large_gallery["project_id"], snapshot()
    )
    insights = await _dimension_insights(
        large_gallery["conn"], large_gallery["project_id"], snapshot(), summary
    )

    assert insights["scatter_total"] == LARGE_POOL_SIZE
    assert insights["scatter_sample_size"] <= 500
    assert len(insights["scatter_data"]) == insights["scatter_sample_size"]
    assert insights["median_width"] in {100, 200, 300, 400}


async def test_per_image_annotation_values_cover_every_matching_image(large_gallery):
    values = await AnalyticsRepository.annotation_count_values(
        large_gallery["conn"], large_gallery["project_id"], snapshot(), "bbox"
    )
    assert len(values) == LARGE_POOL_SIZE
    assert set(values) == {0}


async def test_export_above_the_old_cap_covers_every_matching_image(large_gallery):
    rows = await query_export_images(large_gallery["conn"], large_gallery["project_id"], snapshot())
    assert len(rows) == LARGE_POOL_SIZE


# ============================================================================
# Analytics accepts the whole contract
# ============================================================================
def test_every_filtered_panel_binds_the_shared_filter_dependency():
    """A4's client now sends the full contract; a handler declaring its own subset would drop the rest.

    Checked by wiring rather than by the OpenAPI parameter list: FastAPI renders a query model as an
    opaque dependency, so the schema does not enumerate the fields even though every one of them binds
    (`test_array_filters_bind_from_repeated_query_keys` covers the binding itself).
    """
    import inspect

    from app.routers import analytics as analytics_router

    filtered_handlers = [
        analytics_router.get_dataset_stats,
        analytics_router.get_annotation_coverage,
        analytics_router.get_class_balance,
        analytics_router.get_spatial_heatmap,
        analytics_router.get_image_quality,
        analytics_router.get_dimension_insights,
        analytics_router.get_enhanced_dataset_stats,
        analytics_router.get_annotation_analysis,
    ]
    for handler in filtered_handlers:
        annotation = inspect.signature(handler).parameters["filters"].annotation
        assert annotation is analytics_router.ImageFilters, handler.__name__


def test_a_handler_with_extra_query_params_still_binds_filters():
    """The regression the wrapper dependency exists for: `category_id` used to make every filter 422."""
    from uuid import uuid4 as _uuid4

    from fastapi import FastAPI, Query
    from fastapi.testclient import TestClient

    from app.routers.analytics import ImageFilters

    app = FastAPI()

    @app.get("/probe")
    def probe(filters: ImageFilters, category_id: str | None = Query(default=None)):
        return filters.model_dump(mode="json", exclude_defaults=True)

    tag_id = str(_uuid4())
    response = TestClient(app).get(
        "/probe", params=[("tag_ids", tag_id), ("category_id", str(_uuid4()))]
    )
    assert response.status_code == 200
    assert response.json() == {"tag_ids": [tag_id]}


def test_array_filters_bind_from_repeated_query_keys():
    """A4 switched the client to repeated keys (`tag_ids=a&tag_ids=b`); the old `tag_ids[]` bound nothing."""
    from fastapi import FastAPI
    from fastapi.testclient import TestClient

    from app.routers.analytics import ImageFilters

    app = FastAPI()

    @app.get("/probe")
    def probe(filters: ImageFilters):
        return filters.model_dump(mode="json", exclude_defaults=True)

    first, second = str(uuid4()), str(uuid4())
    response = TestClient(app).get(
        "/probe",
        params=[
            ("tag_ids", first),
            ("tag_ids", second),
            ("issues", "blur"),
            ("quality_min", "0.4"),
            ("aspect_ratio_max", "1.5"),
        ],
    )

    assert response.status_code == 200
    assert response.json() == {
        "tag_ids": [first, second],
        "issues": ["blur"],
        "quality_min": 0.4,
        "aspect_ratio_max": 1.5,
    }


def test_every_contract_field_is_bindable():
    """Each membership field must arrive; a field the model declares but the request layer drops is invisible."""
    from fastapi import FastAPI
    from fastapi.testclient import TestClient

    from app.routers.analytics import ImageFilters

    app = FastAPI()

    @app.get("/probe")
    def probe(filters: ImageFilters):
        return sorted(filters.model_dump(exclude_defaults=True))

    samples: dict[str, str] = {}
    for name, field in ImageFilterParams.model_fields.items():
        annotation = str(field.annotation)
        if "UUID" in annotation:
            samples[name] = str(uuid4())
        elif "bool" in annotation:
            samples[name] = "true"
        elif "float" in annotation:
            samples[name] = "0.4"
        elif "int" in annotation:
            samples[name] = "2"
        elif name in {"include_match_mode", "exclude_match_mode"}:
            samples[name] = "AND"
        elif name == "issues":
            samples[name] = "blur"
        else:
            samples[name] = "x"

    response = TestClient(app).get("/probe", params=list(samples.items()))
    assert response.status_code == 200, response.text
    assert set(response.json()) == set(ImageFilterParams.model_fields)


# ============================================================================
# The panels themselves build a valid response over the filtered set
# ============================================================================
async def test_every_filtered_panel_responds_over_the_same_set(gallery):  # noqa: F811
    """Each handler is called directly, so the response models are exercised, not just the aggregates."""
    from app.routers import analytics as analytics_router

    project = {"id": gallery["project_id"]}
    conn = gallery["conn"]
    filters = snapshot(search="dup")
    expected = await gallery_total(gallery, filters)

    stats = await analytics_router.get_dataset_stats(project, conn, filters)
    assert f"from {expected} filtered images" in stats.message

    coverage = await analytics_router.get_annotation_coverage(project, conn, filters)
    assert coverage.data.total_images == expected

    balance = await analytics_router.get_class_balance(project, conn, filters, None)
    assert f"from {expected} images" in balance.message

    heatmap = await analytics_router.get_spatial_heatmap(project, conn, filters)
    assert heatmap.data.total_annotations == 0

    quality = await analytics_router.get_image_quality(project, conn, filters)
    assert quality.data.issue_breakdown.blur_detected == 1

    dimensions = await analytics_router.get_dimension_insights(project, conn, filters)
    assert dimensions.data.median_width == 100

    enhanced = await analytics_router.get_enhanced_dataset_stats(project, conn, filters, None)
    assert enhanced.data.total_images == expected

    analysis = await analytics_router.get_annotation_analysis(project, conn, filters, 10)
    assert analysis.data.total_images == expected


async def test_panels_over_a_zero_match_filter_do_not_fall_back_to_the_pool(gallery):  # noqa: F811
    """The whole point of G11: an empty result must render as empty, not as the project."""
    from app.routers import analytics as analytics_router

    project = {"id": gallery["project_id"]}
    conn = gallery["conn"]
    filters = snapshot(search="no-such-image")

    assert (
        "from 0 filtered images"
        in (await analytics_router.get_dataset_stats(project, conn, filters)).message
    )
    enhanced = await analytics_router.get_enhanced_dataset_stats(project, conn, filters, None)
    assert enhanced.data.total_images == 0
    assert enhanced.data.tag_distribution == []
    assert enhanced.data.quality_status == "pending"
    analysis = await analytics_router.get_annotation_analysis(project, conn, filters, 10)
    assert analysis.data.total_images == 0
    assert analysis.data.total_annotations == 0
