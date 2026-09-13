"""What ``is_annotated`` means, against a real database.

``images.is_annotated`` is maintained by ``AnnotationWriteRepository.refresh_image_status`` from four tables — ``image_tags``, ``detections``, ``segmentations`` and ``keypoints``. The filter contract has to mean the same thing, or an export whose snapshot says ``is_annotated: true`` covers a different set from the column it names: a classification project, where annotating writes an ``image_tags`` row, would export nothing at all.

Each fixture image carries exactly one kind of annotation, so a predicate that silently drops a kind fails here rather than in a user's export. Every case asserts the gallery (``explore``), the query builder, and an export snapshot agree — they are one membership rule and must not diverge.
"""

from uuid import UUID, uuid4

import pytest
from sqlalchemy import insert, select
from sqlalchemy.ext.asyncio import create_async_engine

from app.models.annotation import detections, image_tags, keypoints, segmentations
from app.models.data_management import project_images, shared_images
from app.models.image import images
from app.models.job import jobs
from app.models.project import labels, projects
from app.models.task import tasks
from app.models.user import users
from app.repositories.annotation_write import TABLES, AnnotationWriteRepository
from app.repositories.project_image import ProjectImageRepository
from app.schemas.export import FilterSnapshot
from app.schemas.image_filters import ImageFilterParams
from app.services.export import query_export_images
from tests.test_storage_access import db_engine  # noqa: F401

#: The images the fixture builds, and the annotation kinds each one carries.
KINDS_BY_IMAGE = {
    "tagged": ("tags",),
    "boxed": ("detections",),
    "masked": ("segmentations",),
    "posed": ("keypoints",),
    "everything": ("tags", "detections", "segmentations", "keypoints"),
    "bare": (),
}
ANNOTATED = {name for name, kinds in KINDS_BY_IMAGE.items() if kinds}
UNANNOTATED = {name for name, kinds in KINDS_BY_IMAGE.items() if not kinds}


@pytest.fixture
async def pool(db_engine):  # noqa: F811 - imported pytest fixture
    """One project, one task, one job, and an image per annotation kind.

    Every image is in the project pool and linked to a job image, so the global, per-job and
    per-task branches of the filter all see the same six images.
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
                .values(name="annotated", slug=str(uuid4()), owner_id=user_id)
                .returning(projects.c.id)
            )
        ).scalar_one()
        task_id = (
            await conn.execute(
                insert(tasks).values(name="task", project_id=project_id).returning(tasks.c.id)
            )
        ).scalar_one()
        job_id = (
            await conn.execute(
                insert(jobs).values(task_id=task_id, sequence_number=1).returning(jobs.c.id)
            )
        ).scalar_one()
        label_id = (
            await conn.execute(
                insert(labels).values(project_id=project_id, name="label").returning(labels.c.id)
            )
        ).scalar_one()

        shared_ids: dict[str, UUID] = {}
        job_image_ids: dict[str, UUID] = {}
        for sequence, name in enumerate(KINDS_BY_IMAGE):
            shared_ids[name] = (
                await conn.execute(
                    insert(shared_images)
                    .values(
                        file_path=f"pool/{name}.jpg",
                        filename=f"{name}.jpg",
                        width=100,
                        height=100,
                        aspect_ratio=1.0,
                        file_size_bytes=1000,
                    )
                    .returning(shared_images.c.id)
                )
            ).scalar_one()
            await conn.execute(
                insert(project_images).values(
                    project_id=project_id, shared_image_id=shared_ids[name]
                )
            )
            job_image_ids[name] = (
                await conn.execute(
                    insert(images)
                    .values(
                        job_id=job_id,
                        filename=f"{name}.jpg",
                        s3_key=name,
                        width=100,
                        height=100,
                        sequence_number=sequence,
                        shared_image_id=shared_ids[name],
                    )
                    .returning(images.c.id)
                )
            ).scalar_one()

        # One row per kind, written straight to the annotation tables the column is built from.
        rows = {
            "tags": lambda image_id: {"image_id": image_id, "label_id": label_id},
            "detections": lambda image_id: {
                "image_id": image_id,
                "label_id": label_id,
                "x_min": 0.1,
                "y_min": 0.1,
                "x_max": 0.5,
                "y_max": 0.5,
            },
            "segmentations": lambda image_id: {
                "image_id": image_id,
                "label_id": label_id,
                "format": "polygon",
                "polygon": [[0.1, 0.1], [0.5, 0.1], [0.5, 0.5]],
            },
            "keypoints": lambda image_id: {
                "image_id": image_id,
                "label_id": label_id,
                "points": [{"name": "nose", "x": 0.5, "y": 0.5, "visibility": 2}],
            },
        }
        for name, kinds in KINDS_BY_IMAGE.items():
            for kind in kinds:
                await conn.execute(insert(TABLES[kind]).values(**rows[kind](job_image_ids[name])))

        # Bring images.is_annotated up to date the way the write path does, so the tests can
        # compare the filter against the column rather than against a second hand-written rule.
        await AnnotationWriteRepository.refresh_image_status(conn, list(job_image_ids.values()))

        yield {
            "conn": conn,
            "project_id": project_id,
            "task_id": task_id,
            "job_id": job_id,
            "shared_ids": shared_ids,
            "job_image_ids": job_image_ids,
        }

        await transaction.rollback()
    await engine.dispose()


def names(pool, image_ids) -> set[str]:
    by_id = {image_id: name for name, image_id in pool["shared_ids"].items()}
    return {by_id.get(image_id, "unknown") for image_id in image_ids}


async def builder_ids(pool, filters: ImageFilterParams) -> set[UUID]:
    stmt = ProjectImageRepository.build_filtered_query(pool["project_id"], filters)
    return {row.id for row in (await pool["conn"].execute(stmt)).fetchall()}


async def explore_ids(pool, filters: ImageFilterParams) -> set[UUID]:
    rows, _ = await ProjectImageRepository.explore(
        pool["conn"], project_id=pool["project_id"], page=1, page_size=50, filters=filters
    )
    return {row["id"] for row in rows}


async def export_ids(pool, filters: ImageFilterParams) -> set[UUID]:
    """The set an export covers, resolved from a stored snapshot the way the Celery task does."""
    snapshot = FilterSnapshot.model_validate(filters.model_dump())
    rows = await query_export_images(
        pool["conn"], pool["project_id"], snapshot.model_dump(mode="json")
    )
    return {row["id"] for row in rows}


async def column_ids(pool, annotated: bool) -> set[UUID]:
    """The set the ``images.is_annotated`` column names — the definition the old export used."""
    result = await pool["conn"].execute(
        select(images.c.shared_image_id).where(images.c.is_annotated == annotated)
    )
    return set(result.scalars())


# ============================================================================
# The column's own definition
# ============================================================================
def test_column_is_maintained_from_exactly_four_tables():
    """If a fifth annotation kind appears, the filter's definition has to grow with it."""
    assert set(TABLES) == {"tags", "detections", "segmentations", "keypoints"}
    assert set(TABLES.values()) == {image_tags, detections, segmentations, keypoints}


async def test_every_annotation_kind_marks_the_column_annotated(pool):
    """The regression's premise: a tag-only and a keypoint-only image are annotated images."""
    assert names(pool, await column_ids(pool, True)) == ANNOTATED
    assert names(pool, await column_ids(pool, False)) == UNANNOTATED


# ============================================================================
# The filter must mean the same thing
# ============================================================================
@pytest.mark.parametrize("name", sorted(ANNOTATED))
async def test_each_annotation_kind_alone_matches_annotated(pool, name):
    """A single row in any one of the four tables is enough to be annotated.

    ``tagged`` and ``posed`` are the regression: they used to fall on the wrong side of both
    the filter and its complement, so a classification project exported zero images.
    """
    matched = await builder_ids(pool, ImageFilterParams(is_annotated=True))
    assert name in names(pool, matched)


async def test_annotated_is_every_kind_and_false_is_the_complement(pool):
    annotated = await builder_ids(pool, ImageFilterParams(is_annotated=True))
    unannotated = await builder_ids(pool, ImageFilterParams(is_annotated=False))
    everything = await builder_ids(pool, ImageFilterParams())

    assert names(pool, annotated) == ANNOTATED
    assert names(pool, unannotated) == UNANNOTATED
    assert annotated | unannotated == everything
    assert annotated & unannotated == set()


async def test_filter_agrees_with_the_column_it_names(pool):
    """The filter and ``images.is_annotated`` are one definition, not two that drifted."""
    assert await builder_ids(pool, ImageFilterParams(is_annotated=True)) == await column_ids(
        pool, True
    )
    assert await builder_ids(pool, ImageFilterParams(is_annotated=False)) == await column_ids(
        pool, False
    )


# ============================================================================
# Every scope, and every consumer
# ============================================================================
@pytest.mark.parametrize("scope", ["global", "job", "task"])
@pytest.mark.parametrize("annotated", [True, False])
async def test_all_three_scopes_use_the_same_predicate(pool, scope, annotated):
    """Global, per-job and per-task branches are separate SQL; all three must agree."""
    scoped = {
        "global": {},
        "job": {"job_id": pool["job_id"]},
        "task": {"task_ids": [pool["task_id"]]},
    }[scope]
    matched = await builder_ids(pool, ImageFilterParams(is_annotated=annotated, **scoped))
    assert names(pool, matched) == (ANNOTATED if annotated else UNANNOTATED)


@pytest.mark.parametrize("annotated", [True, False])
async def test_gallery_builder_and_export_resolve_the_same_set(pool, annotated):
    """The gallery page, the query builder, and an export snapshot describe one image set."""
    filters = ImageFilterParams(is_annotated=annotated)
    from_builder = await builder_ids(pool, filters)
    assert from_builder == await explore_ids(pool, filters)
    assert from_builder == await export_ids(pool, filters)


async def test_classification_export_covers_every_tagged_image(pool):
    """The reported regression, end to end: a tag-only project exported zero images."""
    exported = await export_ids(pool, ImageFilterParams(is_annotated=True))
    assert "tagged" in names(pool, exported)
    assert "posed" in names(pool, exported)
    assert len(exported) == len(ANNOTATED)
