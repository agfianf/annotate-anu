"""The export preview's numbers, and where they come from.

Two properties are checked here against a real database:

* the "no annotations" warning is about **exported images**, not about job-image rows. The set an export writes is `query_export_images`, so a pool image that never reached a job is exported and belongs in the warning, and an image reached by two jobs is exported once and must be counted once.
* every number the preview reports is aggregated in SQL. A preview is four integers and a warning list; fetching the matching rows in order to count them in Python is what made a 100 000-image preview move 100 000 rows.

The second property cannot be asserted on a return value, so it is checked by watching what the preview actually sends to the database.
"""

import pytest
from sqlalchemy import insert

from app.models.annotation import detections, image_tags, segmentations
from app.models.data_management import project_images, shared_images
from app.models.image import images
from app.models.job import jobs
from app.models.project import labels
from app.repositories.annotation_write import TABLES as ANNOTATION_TABLES
from app.schemas.export import ExportCreate, ExportMode, FilterSnapshot
from app.services.export import (
    ANNOTATION_KIND_BY_EXPORT_MODE,
    ExportService,
    count_export_images,
)
from tests.test_explore_filters import gallery  # noqa: F401
from tests.test_storage_access import db_engine  # noqa: F401


def snapshot(**values) -> FilterSnapshot:
    return FilterSnapshot(**values)


async def preview(gallery, mode: str, **values):  # noqa: F811
    return await ExportService().preview_export(
        gallery["conn"],
        gallery["project_id"],
        ExportCreate(
            export_mode=mode,
            output_format="manifest_csv",
            filter_snapshot=snapshot(**values),
        ),
    )


def unannotated(preview_result) -> list[int]:
    """The numbers the preview's "no annotations" warnings report, if any."""
    return [int(w.split()[0]) for w in preview_result.warnings if "no annotations" in w]


# ============================================================================
# The warning counts exported images
# ============================================================================
async def test_unannotated_warning_counts_every_exported_image(gallery):  # noqa: F811
    """Six images are exported and one is annotated, so five have no annotations.

    The fixture's pool holds six images, but only `alpha` and `dup_a` were ever pulled into a job, and only `alpha` carries a detection. Counting `images` rows therefore answered 1 — it could not see the four pool images that have no job row at all, even though the export writes every one of them.
    """
    result = await preview(gallery, "detection")

    assert result.image_count == len(gallery["pool"]) == 6
    assert unannotated(result) == [5], (
        f"expected 5 of the 6 exported images to lack a detection, got {unannotated(result)}"
    )


async def test_an_image_in_two_jobs_is_still_one_unannotated_image(gallery):  # noqa: F811
    """Membership is per exported image, so a second job row must not double the warning."""
    conn = gallery["conn"]
    second_job = (
        await conn.execute(
            insert(jobs).values(task_id=gallery["task_id"], sequence_number=2).returning(jobs.c.id)
        )
    ).scalar_one()
    # `dup_b` is unannotated; give it two job rows and it must still count once.
    for sequence in (0, 1):
        await conn.execute(
            insert(images).values(
                job_id=second_job,
                filename=f"dup_b_{sequence}",
                s3_key=f"dup_b_{sequence}",
                width=100,
                height=100,
                sequence_number=sequence,
                shared_image_id=gallery["pool"]["dup_b"],
            )
        )

    assert unannotated(await preview(gallery, "detection")) == [5]


async def test_the_warning_is_keyed_to_the_export_mode(gallery):  # noqa: F811
    """A detection does not make an image exportable as a segmentation or as a class.

    `alpha` has a detection and nothing else, so it is the one annotated image of a detection export and an unannotated image of either other mode. A warning keyed to a project-wide "is annotated" flag would report the same number for all three.
    """
    assert unannotated(await preview(gallery, "detection")) == [5]
    assert unannotated(await preview(gallery, "segmentation")) == [6]
    assert unannotated(await preview(gallery, "classification")) == [6]


async def test_a_classification_export_counts_images_lacking_an_image_tag(gallery):  # noqa: F811
    """Classification membership is `image_tags`, which is not what a detection writes."""
    conn = gallery["conn"]
    label_id = (
        await conn.execute(
            insert(labels)
            .values(project_id=gallery["project_id"], name="class-a")
            .returning(labels.c.id)
        )
    ).scalar_one()
    alpha_job_image = (
        await conn.execute(
            insert(images)
            .values(
                job_id=gallery["job_id"],
                filename="dup_b_tagged",
                s3_key="dup_b_tagged",
                width=100,
                height=100,
                sequence_number=9,
                shared_image_id=gallery["pool"]["dup_b"],
            )
            .returning(images.c.id)
        )
    ).scalar_one()
    await conn.execute(insert(image_tags).values(image_id=alpha_job_image, label_id=label_id))

    result = await preview(gallery, "classification")

    assert result.annotation_counts["classification"] == 1
    assert unannotated(result) == [5], "the one tagged image must drop out of the warning"
    # The detection export is unmoved: an image tag is not a box.
    assert unannotated(await preview(gallery, "detection")) == [5]


async def test_a_segmentation_export_counts_images_lacking_a_segmentation(gallery):  # noqa: F811
    conn = gallery["conn"]
    label_id = (
        await conn.execute(
            insert(labels)
            .values(project_id=gallery["project_id"], name="seg")
            .returning(labels.c.id)
        )
    ).scalar_one()
    job_image = (
        await conn.execute(
            insert(images)
            .values(
                job_id=gallery["job_id"],
                filename="zeta_seg",
                s3_key="zeta_seg",
                width=100,
                height=100,
                sequence_number=8,
                shared_image_id=gallery["pool"]["zeta"],
            )
            .returning(images.c.id)
        )
    ).scalar_one()
    await conn.execute(
        insert(segmentations).values(
            image_id=job_image,
            label_id=label_id,
            polygon=[[0.1, 0.1], [0.2, 0.1], [0.2, 0.2]],
        )
    )

    assert unannotated(await preview(gallery, "segmentation")) == [5]


async def test_the_warning_respects_the_filter(gallery):  # noqa: F811
    """The warning is about the exported set, so narrowing the export narrows the warning."""
    result = await preview(gallery, "detection", tag_ids=[gallery["tags"]["red"]])

    # red tags alpha (annotated), dup_a and dup_d (not).
    assert result.image_count == 3
    assert unannotated(result) == [2]


async def test_a_fully_annotated_export_warns_about_nothing(gallery):  # noqa: F811
    """No warning at all when every exported image has an annotation of the right kind."""
    result = await preview(gallery, "detection", search="alpha")

    assert result.image_count == 1
    assert unannotated(result) == []


async def test_an_empty_export_does_not_warn_about_unannotated_images(gallery):  # noqa: F811
    """Zero exported images means zero unannotated images, not a warning about the pool."""
    result = await preview(gallery, "detection", search="no-such-image")

    assert result.image_count == 0
    assert unannotated(result) == []
    assert "No images match the current filter" in result.warnings


# ============================================================================
# The preview aggregates in SQL
# ============================================================================
@pytest.fixture
def recorded_sql(monkeypatch):
    """Capture the statements a connection executes, as compiled SQL strings."""
    from sqlalchemy.ext.asyncio import AsyncConnection

    statements: list[str] = []
    original = AsyncConnection.execute

    async def spy(self, statement, *args, **kwargs):
        try:
            statements.append(str(statement.compile(compile_kwargs={"literal_binds": True})))
        except Exception:  # pragma: no cover - unparameterisable statements are not our concern
            statements.append(str(statement))
        return await original(self, statement, *args, **kwargs)

    monkeypatch.setattr(AsyncConnection, "execute", spy)
    return statements


async def test_the_preview_never_selects_the_image_rows(gallery, recorded_sql):  # noqa: F811
    """Every preview query is an aggregate; none of them fetches `shared_images.file_path`.

    The old preview ran `query_export_images` first and derived `image_count` from `len()`, so a 100 000-image preview transferred 100 000 full rows and then sent their ids back as five `IN` lists to produce four integers.
    """
    await preview(gallery, "detection")

    assert recorded_sql, "the preview executed no statements"
    for sql in recorded_sql:
        assert "count(" in sql, f"a preview query that aggregates nothing: {sql}"
        assert "shared_images.file_path" not in sql, (
            f"the preview is still fetching image rows: {sql}"
        )


async def test_no_preview_query_carries_an_inlined_id_list(gallery, recorded_sql):  # noqa: F811
    """The filtered set must reach each aggregate as a subquery, not as bound literal ids.

    A literal `IN (…)` list is the visible symptom of materialising in Python: its length grows with the export. Each exported id would appear as its own literal, so a query naming more ids than the pool holds can only have come from a Python list.
    """
    await preview(gallery, "classification")

    pool_ids = {str(image_id) for image_id in gallery["pool"].values()}
    for sql in recorded_sql:
        inlined = {image_id for image_id in pool_ids if image_id in sql}
        assert not inlined, f"exported ids were inlined into a preview query: {sql}"


async def test_the_preview_reports_the_same_count_as_the_sql_counter(gallery):  # noqa: F811
    """`count_export_images` is the preview's own source of `image_count`, not a test-only helper."""
    for values in (
        {},
        {"tag_ids": [gallery["tags"]["red"]]},
        {"search": "dup"},
        {"width_min": 400},
    ):
        result = await preview(gallery, "detection", **values)
        expected = await count_export_images(
            gallery["conn"], gallery["project_id"], snapshot(**values)
        )

        assert result.image_count == expected
        assert result.scope.image_count == expected


async def test_the_preview_counts_hold_when_a_pool_image_has_no_job_row(gallery):  # noqa: F811
    """A pool image outside every job is exported, so it must appear in the totals.

    It is the case the job-image-keyed warning could not see at all.
    """
    conn = gallery["conn"]
    orphan = (
        await conn.execute(
            insert(shared_images)
            .values(
                file_path="o/orphan.jpg",
                filename="orphan.jpg",
                width=100,
                height=100,
                aspect_ratio=1.0,
                file_size_bytes=1000,
            )
            .returning(shared_images.c.id)
        )
    ).scalar_one()
    await conn.execute(
        insert(project_images).values(project_id=gallery["project_id"], shared_image_id=orphan)
    )

    result = await preview(gallery, "detection")

    assert result.image_count == 7
    assert unannotated(result) == [6]


async def test_detection_counts_and_classes_survive_the_sql_rewrite(gallery):  # noqa: F811
    """The aggregates still answer what they answered when they took an id list."""
    conn = gallery["conn"]
    alpha_detection_label = (
        await conn.execute(
            insert(labels)
            .values(project_id=gallery["project_id"], name="second")
            .returning(labels.c.id)
        )
    ).scalar_one()
    job_image = (
        await conn.execute(
            insert(images)
            .values(
                job_id=gallery["job_id"],
                filename="zeta_det",
                s3_key="zeta_det",
                width=100,
                height=100,
                sequence_number=7,
                shared_image_id=gallery["pool"]["zeta"],
            )
            .returning(images.c.id)
        )
    ).scalar_one()
    await conn.execute(
        insert(detections).values(
            image_id=job_image,
            label_id=alpha_detection_label,
            x_min=0.1,
            y_min=0.1,
            x_max=0.2,
            y_max=0.2,
        )
    )

    unfiltered = await preview(gallery, "detection")
    assert unfiltered.annotation_counts["detection"] == 2
    assert unfiltered.class_counts == {"label": 1, "second": 1}
    assert unannotated(unfiltered) == [4]

    # A filter that excludes zeta excludes its detection from the counts too.
    narrowed = await preview(gallery, "detection", width_max=100)
    assert narrowed.annotation_counts["detection"] == 1
    assert narrowed.class_counts == {"label": 1}


async def test_split_counts_come_from_the_filtered_set(gallery):  # noqa: F811
    """Split counts are a per-export aggregate like the rest, and follow the filter."""
    unfiltered = await preview(gallery, "detection")
    assert unfiltered.split_counts["none"] == 2

    narrowed = await preview(gallery, "detection", search="alpha")
    assert narrowed.split_counts["none"] == 1


# ============================================================================
# The mode -> annotation table mapping is sourced, not hand-written
# ============================================================================
def test_every_export_mode_names_a_kind_the_write_repository_knows():
    """The warning's table must come from `AnnotationWriteRepository.TABLES`, not a second list.

    `images.is_annotated` is maintained from that mapping and `ProjectImageRepository.has_any_annotation` builds the general annotated predicate from it. A hand-written table list in the export service would be a third copy, free to drift from both — which is the failure mode that made the general predicate miss `image_tags` and `keypoints` in the first place. Here the export only chooses a *kind*; the kind's table is looked up in the one place that defines it.
    """
    assert set(ExportMode) == set(ANNOTATION_KIND_BY_EXPORT_MODE)
    for mode, kind in ANNOTATION_KIND_BY_EXPORT_MODE.items():
        assert kind in ANNOTATION_TABLES, f"{mode} names an annotation kind that does not exist"


def test_each_mode_resolves_to_its_own_annotation_table():
    """Three modes, three different tables: the mapping must not collapse onto one."""
    tables = {mode: ANNOTATION_TABLES[ANNOTATION_KIND_BY_EXPORT_MODE[mode]] for mode in ExportMode}

    assert tables[ExportMode.DETECTION] is detections
    assert tables[ExportMode.SEGMENTATION] is segmentations
    assert tables[ExportMode.CLASSIFICATION] is image_tags
    assert len({id(table) for table in tables.values()}) == 3
