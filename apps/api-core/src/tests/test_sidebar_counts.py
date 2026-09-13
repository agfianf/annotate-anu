"""The sidebar and the export task must describe the same image set as the gallery.

Two filter implementations survived the move to the canonical contract. The `/explore/sidebar` handler read `tag_ids` and nothing else, and answered `len(ids) if ids else total_images` — so a filter matching zero images reported the whole project, and an empty result was indistinguishable from no filter at all. The Celery task that generates the export artifact kept its own 12-field copy of the filter, so an export could legitimately cover a different set of images from the preview that described it.

Both failure modes are silent: the numbers look plausible. The checks here therefore compare real counts from a real database, and cover the cases the two implementations disagreed on — zero matches, filters the old code never received, and pools above the old materialisation caps.

Fixtures come from `test_explore_filters` (the canonical gallery) and `test_filter_parity` (`large_gallery`, a pool above the old caps).
"""

from contextlib import contextmanager
from uuid import uuid4

import pytest
from fastapi import HTTPException
from sqlalchemy import Select, event, func, insert, select

from app.models.attribute import attribute_schemas, image_attributes
from app.models.data_management import shared_image_tags
from app.repositories.analytics import AnalyticsRepository
from app.repositories.image_scope import ImageScopeRepository
from app.repositories.shared_image_tag import SharedImageTagRepository
from app.routers.analytics import ImageFilters
from app.routers.project_images import (
    MAX_BULK_TAG_PAIRS,
    _resolve_bulk_targets,
    get_sidebar_aggregations,
)
from app.schemas.export import ExportCreate, FilterSnapshot
from app.schemas.image_filters import BulkTagScopedRequest, FilterScope, ImageFilterParams
from app.services.export import ExportService, count_export_images
from app.tasks.export import _query_images_for_export
from tests.test_explore_filters import explore_ids, gallery  # noqa: F401
from tests.test_filter_parity import (  # noqa: F401
    LARGE_POOL_SIZE,
    LARGE_TAGGED,
    large_gallery,
)
from tests.test_storage_access import db_engine  # noqa: F401


@pytest.fixture
async def gallery_with_attributes(gallery):  # noqa: F811 - imported pytest fixture
    """The gallery pool plus one categorical and one numeric sidebar attribute.

    Every image carries a value, so a facet that quietly ignored the filter would report six of them where the filtered answer is smaller.
    """
    conn = gallery["conn"]
    project_id = gallery["project_id"]

    categorical_id = (
        await conn.execute(
            insert(attribute_schemas)
            .values(
                project_id=project_id,
                name="ripeness",
                field_type="categorical",
                allowed_values=["ripe", "unripe"],
            )
            .returning(attribute_schemas.c.id)
        )
    ).scalar_one()
    numeric_id = (
        await conn.execute(
            insert(attribute_schemas)
            .values(project_id=project_id, name="score", field_type="numeric")
            .returning(attribute_schemas.c.id)
        )
    ).scalar_one()

    for index, image_id in enumerate(gallery["pool"].values()):
        await conn.execute(
            insert(image_attributes).values(
                project_id=project_id,
                shared_image_id=image_id,
                attribute_schema_id=categorical_id,
                value_categorical="ripe" if index % 2 == 0 else "unripe",
            )
        )
        await conn.execute(
            insert(image_attributes).values(
                project_id=project_id,
                shared_image_id=image_id,
                attribute_schema_id=numeric_id,
                value_numeric=float(index),
            )
        )

    return gallery


async def sidebar(gallery, filters: ImageFilterParams) -> dict:  # noqa: F811
    """Call the handler itself, so the response model is exercised and not just the aggregates."""
    response = await get_sidebar_aggregations(
        project={"id": gallery["project_id"]},
        connection=gallery["conn"],
        filters=filters,
    )
    return response.data


def snapshot(**values) -> FilterSnapshot:
    return FilterSnapshot(**values)


async def preview_count(gallery, filters: FilterSnapshot) -> int:  # noqa: F811
    preview = await ExportService().preview_export(
        gallery["conn"],
        gallery["project_id"],
        ExportCreate(
            export_mode="classification",
            output_format="manifest_csv",
            filter_snapshot=filters,
        ),
    )
    return preview.image_count


# ============================================================================
# G11 - zero matches is zero, and is not "no filter"
# ============================================================================
async def test_a_filter_matching_nothing_reports_zero_not_the_project_total(gallery):  # noqa: F811
    """The headline G11 bug: `len(ids) if ids else total_images` answered 6 for an empty result."""
    data = await sidebar(gallery, ImageFilterParams(search="no-such-image"))

    assert data["filtered_images"] == 0
    assert data["total_images"] == len(gallery["pool"])


async def test_zero_matches_is_distinguishable_from_no_filter(gallery):  # noqa: F811
    """Both used to answer the project total, which is what made the bug invisible."""
    empty_filter = await sidebar(gallery, ImageFilterParams())
    no_matches = await sidebar(gallery, ImageFilterParams(search="no-such-image"))

    assert empty_filter["filtered_images"] == len(gallery["pool"])
    assert no_matches["filtered_images"] == 0
    assert empty_filter["total_images"] == no_matches["total_images"] == len(gallery["pool"])


async def test_facets_of_a_filter_matching_nothing_are_empty(gallery_with_attributes):
    """An empty id list must narrow the aggregations to nothing, not widen them back to the pool."""
    project = gallery_with_attributes
    data = await sidebar(project, ImageFilterParams(search="no-such-image"))

    assert data["filtered_images"] == 0
    for facet in data["categorical_attributes"]:
        assert facet["values"] == []
    assert data["numeric_attributes"] == []
    assert data["computed"]["width_stats"]["histogram"] == []
    assert data["computed"]["width_stats"]["max_value"] == 0
    assert data["computed"]["file_size_stats"]["histogram"] == []


async def test_facets_without_a_filter_still_cover_the_whole_pool(gallery_with_attributes):
    """The `is not None` guard must not turn "no filter" into "matched nothing"."""
    project = gallery_with_attributes
    data = await sidebar(project, ImageFilterParams())

    counted = sum(
        value["count"] for facet in data["categorical_attributes"] for value in facet["values"]
    )
    assert counted == len(project["pool"])
    assert len(data["numeric_attributes"]) == 1
    assert data["computed"]["width_stats"]["max_value"] == 400


# ============================================================================
# G11 - the sidebar accepts the whole contract and agrees with everything else
# ============================================================================
async def test_sidebar_agrees_with_the_gallery_and_the_export_preview(gallery):  # noqa: F811
    """A combined filter the old handler could not even receive: search plus a tag."""
    filters = ImageFilterParams(search="dup", tag_ids=[gallery["tags"]["red"]])
    matching = await explore_ids(gallery, filters)

    data = await sidebar(gallery, filters)

    assert matching == {gallery["pool"]["dup_a"], gallery["pool"]["dup_d"]}
    assert data["filtered_images"] == len(matching)
    assert data["filtered_images"] == await preview_count(
        gallery, snapshot(**filters.model_dump(exclude_defaults=True))
    )
    assert data["filtered_images"] == await AnalyticsRepository.count_images(
        gallery["conn"], gallery["project_id"], filters
    )


@pytest.mark.parametrize(
    "field,value,expected",
    [
        ("quality_min", 0.5, 1),
        ("aspect_ratio_min", 2.0, 1),
        ("issues", ["blur"], 1),
        ("object_count_min", 1, 1),
        ("width_max", 60, 1),
    ],
)
async def test_filters_the_old_sidebar_dropped_now_narrow_it(gallery, field, value, expected):  # noqa: F811
    """Every one of these reached the endpoint and was discarded: the handler declared `tag_ids` only."""
    filters = ImageFilterParams(**{field: value})
    data = await sidebar(gallery, filters)

    assert data["filtered_images"] == expected
    assert data["filtered_images"] == len(await explore_ids(gallery, filters))


async def test_facets_narrow_with_the_filter(gallery_with_attributes):
    """The panels describe the filtered subset, not the project, whenever a filter is applied."""
    project = gallery_with_attributes
    filters = ImageFilterParams(width_max=60)

    data = await sidebar(project, filters)

    assert data["filtered_images"] == 1
    counted = sum(
        value["count"] for facet in data["categorical_attributes"] for value in facet["values"]
    )
    assert counted == 1
    assert data["computed"]["width_stats"]["max_value"] == 50


def test_sidebar_binds_the_shared_filter_dependency():
    """`Annotated[ImageFilterParams, Query()]` inlined here would 422 every request.

    FastAPI stops treating a Pydantic model as a query model as soon as another query parameter sits beside it, and this handler has two (`attribute_filters`, `sidebar_mode`). The wrapper dependency is what makes the model bind anyway.
    """
    import inspect

    assert inspect.signature(get_sidebar_aggregations).parameters["filters"].annotation is (
        ImageFilters
    )


def test_the_contract_binds_beside_the_sidebar_own_query_params():
    """The 422 trap itself, reproduced with the sidebar's exact extra query parameters."""
    from fastapi import FastAPI, Query
    from fastapi.testclient import TestClient

    app = FastAPI()

    @app.get("/probe")
    def probe(
        filters: ImageFilters,
        attribute_filters: str | None = Query(default=None),
        sidebar_mode: str = Query(default="best"),
    ):
        return filters.model_dump(mode="json", exclude_defaults=True)

    tag_id = str(uuid4())
    response = TestClient(app).get(
        "/probe",
        params=[
            ("tag_ids", tag_id),
            ("quality_min", "0.4"),
            ("issues", "blur"),
            ("sidebar_mode", "best"),
        ],
    )

    assert response.status_code == 200, response.text
    assert response.json() == {"tag_ids": [tag_id], "quality_min": 0.4, "issues": ["blur"]}


# ============================================================================
# G03 - the export task resolves what the export preview promised
# ============================================================================
@pytest.mark.parametrize(
    "values",
    [
        {},
        {"search": "dup"},
        {"quality_min": 0.5},
        {"aspect_ratio_min": 2.0},
        {"issues": ["blur", "low_brightness"]},
        {"object_count_min": 1},
        {"filepath_pattern": "a/*"},
        {"search": "dup", "object_count_max": 0},
    ],
)
async def test_export_task_resolves_the_preview_image_set(gallery, values):  # noqa: F811
    """The artifact and the preview that described it must cover the same images.

    `_query_images_for_export` used to read 12 keys off the snapshot and ignore search, aspect ratio, quality, RGB, issues, filepath pattern, and the annotation-count filters, so every row here was a case where the two silently disagreed.
    """
    filters = snapshot(**values)
    resolved = await _query_images_for_export(
        gallery["conn"], gallery["project_id"], filters.model_dump(mode="json")
    )
    resolved_ids = {row["id"] for row in resolved}

    assert resolved_ids == await explore_ids(gallery, ImageFilterParams(**values))
    assert len(resolved_ids) == await preview_count(gallery, filters)
    assert len(resolved_ids) == await count_export_images(
        gallery["conn"], gallery["project_id"], filters
    )


async def test_export_task_reads_a_stored_snapshot_dict(gallery):  # noqa: F811
    """The task reads its snapshot back out of JSONB, so it must survive the round trip as a dict."""
    stored = {"search": "dup", "quality_min": 0.2, "object_count_max": 0}
    resolved = await _query_images_for_export(gallery["conn"], gallery["project_id"], stored)

    assert {row["id"] for row in resolved} == {gallery["pool"]["dup_a"]}


async def test_export_task_orders_its_rows_deterministically(gallery):  # noqa: F811
    """Four images share the filename `dup.jpg`; filename alone cannot order them stably."""
    first = await _query_images_for_export(gallery["conn"], gallery["project_id"], {})
    second = await _query_images_for_export(gallery["conn"], gallery["project_id"], {})

    assert [row["id"] for row in first] == [row["id"] for row in second]
    assert [row["filename"] for row in first] == sorted(row["filename"] for row in first)


async def test_export_task_and_sidebar_agree_above_the_old_caps(large_gallery):  # noqa: F811
    """A pool above the 10 000 and 100 000 row limits the old implementations imposed."""
    filters = ImageFilterParams(width_min=300)
    project_id = large_gallery["project_id"]
    conn = large_gallery["conn"]

    resolved = await _query_images_for_export(conn, project_id, filters.model_dump(mode="json"))
    expected = LARGE_POOL_SIZE // 2

    assert len(resolved) == expected
    assert len(resolved) == await count_export_images(
        conn, project_id, FilterSnapshot(**filters.model_dump())
    )
    data = await sidebar(large_gallery, filters)
    assert data["filtered_images"] == expected
    assert data["total_images"] == LARGE_POOL_SIZE


async def test_unfiltered_export_above_the_cap_covers_the_whole_pool(large_gallery):  # noqa: F811
    """The unfiltered case is the one a 10 000-row materialisation cap truncated."""
    resolved = await _query_images_for_export(
        large_gallery["conn"], large_gallery["project_id"], {}
    )

    assert len(resolved) == LARGE_POOL_SIZE


# ============================================================================
# G3 - the sidebar aggregates in SQL and never materialises the match set
# ============================================================================
@contextmanager
def recorded_statements(connection):
    """Record every statement a connection issues, with its bound parameters.

    Asserting on the *returned numbers* cannot tell a SQL aggregate from a Python one that happens
    to add up — both were right on six images and only one of them survives 150 000. What separates
    them is the shape of the traffic: how many statements, and whether any of them carries the
    match set as bound parameters. That is what this records and what the checks below assert on.
    """
    captured: list[tuple[str, object]] = []

    def record(conn, cursor, statement, parameters, context, executemany):  # noqa: ANN001
        captured.append((statement, parameters))

    sync_connection = connection.sync_connection
    event.listen(sync_connection, "before_cursor_execute", record)
    try:
        yield captured
    finally:
        event.remove(sync_connection, "before_cursor_execute", record)


def widest_parameter_list(captured) -> int:
    """The largest number of values any recorded statement bound.

    An expanding ``IN`` renders one placeholder per id, so a materialised match set shows up here
    as its own size; a subquery shows up as nothing at all. Parameters that are themselves
    sequences are measured too, so an ``= ANY($1)`` spelling cannot hide a list inside one slot.
    """
    widest = 0
    for _, parameters in captured:
        rows = parameters if isinstance(parameters, list) else [parameters]
        for row in rows:
            if isinstance(row, dict):
                values = list(row.values())
            elif isinstance(row, (list, tuple)):
                values = list(row)
            else:
                continue
            widest = max(widest, len(values))
            for value in values:
                if isinstance(value, (list, tuple, set, frozenset)):
                    widest = max(widest, len(value))
    return widest


async def test_the_sidebar_never_binds_the_match_set_as_parameters(large_gallery):  # noqa: F811
    """The G3 defect, reproduced by its signature: 5 050 ids bound into statement after statement.

    Before this, the handler resolved the filter to a list and handed the same list to the numeric
    stats (twice each), to every attribute aggregation, and to the size distribution — half a dozen
    statements whose parameter list *was* the filtered set. Filtering is now one `IN (SELECT ...)`,
    so nothing here binds more than a handful of values whatever the pool contains.
    """
    with recorded_statements(large_gallery["conn"]) as captured:
        data = await sidebar(large_gallery, ImageFilterParams(width_min=300))

    assert data["filtered_images"] == LARGE_POOL_SIZE // 2
    assert widest_parameter_list(captured) <= 16
    # Fixed cost: pool count, filtered count, tag counts, tag list, schema list, size distribution,
    # and two statements for each of the three metadata histograms. It does not grow with the pool.
    assert len(captured) <= 16


async def test_sidebar_statement_count_does_not_grow_with_the_pool(gallery, large_gallery):  # noqa: F811
    """Six images and ten thousand must cost the same statements, or something is still per-row.

    `width_min=100` matches several distinct widths and file sizes in both pools, so neither side
    skips a histogram statement for a column that turned out to hold a single value.
    """
    with recorded_statements(gallery["conn"]) as small:
        await sidebar(gallery, ImageFilterParams(width_min=100))
    with recorded_statements(large_gallery["conn"]) as large:
        await sidebar(large_gallery, ImageFilterParams(width_min=100))

    assert len(small) == len(large)
    assert widest_parameter_list(small) == widest_parameter_list(large)


# ============================================================================
# G11 - every panel follows the "current results" rule, tags and sizes included
# ============================================================================
async def test_the_tag_facet_counts_results_not_the_project(gallery):  # noqa: F811
    """`filtered_images: 1` beside a tag facet claiming 3 images carry `red` described two sets."""
    unfiltered = await sidebar(gallery, ImageFilterParams())
    filtered = await sidebar(gallery, ImageFilterParams(width_max=60))

    assert {t["name"]: t["count"] for t in unfiltered["tags"]} == {"red": 3, "blue": 2}
    assert filtered["filtered_images"] == 1
    # `alpha` is the only image under 60px wide and it carries `red` alone.
    assert {t["name"]: t["count"] for t in filtered["tags"]} == {"red": 1, "blue": 0}


async def test_a_tag_no_result_carries_is_still_offered(gallery):  # noqa: F811
    """Only the counts narrow. Dropping the row would take the tag out of the filter UI."""
    data = await sidebar(gallery, ImageFilterParams(search="no-such-image"))

    assert [t["name"] for t in data["tags"]] == ["blue", "red"]
    assert all(t["count"] == 0 for t in data["tags"])


async def test_the_tag_facet_agrees_with_the_gallery_for_each_tag(gallery):  # noqa: F811
    """Each facet count must equal what filtering the gallery by that tag as well would return."""
    filters = ImageFilterParams(search="dup")
    data = await sidebar(gallery, filters)

    for tag in data["tags"]:
        narrowed = ImageFilterParams(search="dup", tag_ids=[tag["id"]])
        assert tag["count"] == len(await explore_ids(gallery, narrowed))


async def test_the_size_distribution_counts_results_not_the_project(gallery):  # noqa: F811
    """The last project-wide panel: it sits beside width and height stats that always filtered."""
    unfiltered = await sidebar(gallery, ImageFilterParams())
    filtered = await sidebar(gallery, ImageFilterParams(width_max=60))
    nothing = await sidebar(gallery, ImageFilterParams(search="no-such-image"))

    assert unfiltered["computed"]["size_distribution"]["small"] == len(gallery["pool"])
    assert filtered["computed"]["size_distribution"]["small"] == 1
    assert nothing["computed"]["size_distribution"] == {"small": 0, "medium": 0, "large": 0}


async def test_every_panel_narrows_together_above_the_old_caps(large_gallery):  # noqa: F811
    """The same filter, read off all five panels of a 10 100-image pool. They must agree."""
    filters = ImageFilterParams(width_min=300)
    data = await sidebar(large_gallery, filters)
    matching = LARGE_POOL_SIZE // 2

    assert data["total_images"] == LARGE_POOL_SIZE
    assert data["filtered_images"] == matching
    # 7 000 images carry `bulk`; half of the first 7 000 are 300px or wider.
    assert [t["count"] for t in data["tags"]] == [LARGE_TAGGED // 2]
    assert data["computed"]["size_distribution"]["small"] == matching
    assert data["computed"]["width_stats"]["min_value"] == 300
    assert data["computed"]["file_size_stats"]["max_value"] == 4000


async def test_the_unfiltered_sidebar_still_describes_the_whole_pool(large_gallery):  # noqa: F811
    """ "No filter" must stay distinguishable from "matched nothing" on the new panels too."""
    data = await sidebar(large_gallery, ImageFilterParams())

    assert data["filtered_images"] == LARGE_POOL_SIZE
    assert [t["count"] for t in data["tags"]] == [LARGE_TAGGED]
    assert data["computed"]["size_distribution"]["small"] == LARGE_POOL_SIZE


# ============================================================================
# G3 - a filter-scoped bulk tag is set-based, bounded, and honours its own limit
# ============================================================================
async def images_carrying(gallery, tag_name: str) -> set:  # noqa: F811
    rows = await gallery["conn"].execute(
        select(shared_image_tags.c.shared_image_id).where(
            shared_image_tags.c.project_id == gallery["project_id"],
            shared_image_tags.c.tag_id == gallery["tags"][tag_name],
        )
    )
    return {row[0] for row in rows}


def scoped_request(tag_ids: list, **filter_values) -> BulkTagScopedRequest:
    return BulkTagScopedRequest(
        tag_ids=tag_ids,
        scope=FilterScope(filters=ImageFilterParams(**filter_values)),
    )


async def test_a_filter_scoped_bulk_tag_costs_a_fixed_number_of_statements(large_gallery):  # noqa: F811
    """The G3 defect: image x tag, three to five round trips each, inside one transaction.

    10 100 images and one tag was 10 100 iterations and upwards of 30 000 statements; the ceiling
    of 50 000 images x 50 tags was millions. It is now one DELETE plus one INSERT per tag over a
    frozen scope, so the statement count is a constant and nothing binds the match set.
    """
    conn = large_gallery["conn"]
    targets = ImageScopeRepository.filtered_scope(
        large_gallery["project_id"], ImageFilterParams(width_min=300)
    )

    with recorded_statements(conn) as captured:
        result = await SharedImageTagRepository.bulk_add_tags_with_replacement(
            conn, large_gallery["project_id"], targets, [large_gallery["tag_id"]], None
        )

    assert result["images_affected"] == LARGE_POOL_SIZE // 2
    assert len(captured) <= 8
    assert widest_parameter_list(captured) <= 16


async def test_a_filter_scoped_bulk_tag_reaches_every_matching_image(large_gallery):  # noqa: F811
    """A constant number of statements is only worth anything if it still tags everything."""
    conn = large_gallery["conn"]
    project_id = large_gallery["project_id"]
    targets = ImageScopeRepository.filtered_scope(project_id, ImageFilterParams(width_min=300))

    await SharedImageTagRepository.bulk_add_tags_with_replacement(
        conn, project_id, targets, [large_gallery["tag_id"]], None
    )

    tagged = (
        await conn.execute(
            select(func.count()).where(
                shared_image_tags.c.project_id == project_id,
                shared_image_tags.c.tag_id == large_gallery["tag_id"],
            )
        )
    ).scalar()
    # The 7 000 already tagged, plus the 300px-and-wider half of the 3 100 that were not.
    assert tagged == LARGE_TAGGED + (LARGE_POOL_SIZE - LARGE_TAGGED) // 2


async def test_the_one_tag_per_label_rule_survives_the_set_based_write(gallery):  # noqa: F811
    """`red` and `blue` share a label, so applying `blue` everywhere must displace every `red`."""
    conn = gallery["conn"]
    targets = ImageScopeRepository.filtered_scope(gallery["project_id"], ImageFilterParams())

    result = await SharedImageTagRepository.bulk_add_tags_with_replacement(
        conn, gallery["project_id"], targets, [gallery["tags"]["blue"]], None
    )

    assert result["tags_replaced"] == 3
    assert result["conflicts_by_label"] == {"colours": 3}
    assert result["images_affected"] == len(gallery["pool"])
    assert await images_carrying(gallery, "blue") == set(gallery["pool"].values())
    assert await images_carrying(gallery, "red") == set()


async def test_a_scope_that_filters_on_the_tag_being_replaced_still_tags_its_images(gallery):  # noqa: F811
    """The reason the scope is frozen rather than re-run per statement.

    "Everything tagged `red`, make it `blue`" is the ordinary case, and `red` and `blue` share a
    label. Re-evaluating the filter after the replacement DELETE would find no `red` images left
    and tag nothing at all, silently.
    """
    conn = gallery["conn"]
    red_images = await images_carrying(gallery, "red")
    targets = ImageScopeRepository.filtered_scope(
        gallery["project_id"], ImageFilterParams(tag_ids=[gallery["tags"]["red"]])
    )

    result = await SharedImageTagRepository.bulk_add_tags_with_replacement(
        conn, gallery["project_id"], targets, [gallery["tags"]["blue"]], None
    )

    assert result["images_affected"] == len(red_images) == 3
    assert await images_carrying(gallery, "blue") >= red_images
    assert await images_carrying(gallery, "red") == set()


async def test_the_preview_predicts_exactly_what_the_write_replaces(gallery):  # noqa: F811
    """Preview and write share one predicate, so the confirmation dialog cannot be wrong."""
    conn = gallery["conn"]
    project_id = gallery["project_id"]
    blue = [gallery["tags"]["blue"]]

    preview = await SharedImageTagRepository.get_bulk_tag_preview(
        conn, project_id, ImageScopeRepository.filtered_scope(project_id, ImageFilterParams()), blue
    )
    result = await SharedImageTagRepository.bulk_add_tags_with_replacement(
        conn,
        project_id,
        ImageScopeRepository.filtered_scope(project_id, ImageFilterParams()),
        blue,
        None,
    )

    assert preview["total_images"] == result["images_affected"] == len(gallery["pool"])
    assert preview["tags_to_replace"] == result["tags_replaced"]
    assert preview["conflicts_by_label"] == result["conflicts_by_label"]


async def test_a_request_over_the_pair_ceiling_is_refused_before_writing(large_gallery):  # noqa: F811
    """A limit that cannot be honoured is worse than no limit: it accepts, then never returns."""
    payload = scoped_request([uuid4() for _ in range(20)])
    assert LARGE_POOL_SIZE * 20 > MAX_BULK_TAG_PAIRS

    with pytest.raises(HTTPException) as refused:
        await _resolve_bulk_targets(large_gallery["conn"], large_gallery["project_id"], payload)

    assert refused.value.status_code == 400
    assert str(MAX_BULK_TAG_PAIRS) in refused.value.detail


async def test_a_request_inside_the_pair_ceiling_resolves_to_a_statement(large_gallery):  # noqa: F811
    """Just under the ceiling still goes through, and still goes through as a subquery."""
    payload = scoped_request([uuid4() for _ in range(19)])
    assert LARGE_POOL_SIZE * 19 <= MAX_BULK_TAG_PAIRS

    targets = await _resolve_bulk_targets(
        large_gallery["conn"], large_gallery["project_id"], payload
    )

    assert isinstance(targets, Select)


async def test_a_scope_matching_nothing_is_still_refused(gallery):  # noqa: F811
    """The empty case must not be swallowed by the new sizing query."""
    payload = scoped_request([uuid4()], search="no-such-image")

    with pytest.raises(HTTPException) as refused:
        await _resolve_bulk_targets(gallery["conn"], gallery["project_id"], payload)

    assert refused.value.status_code == 400
    assert "no images" in refused.value.detail
