"""Canonical image filter contract and deterministic paging, against PostgreSQL.

``ProjectImageRepository.build_filtered_query`` is the single definition of which images a gallery page, an export, or an analytics aggregate is about, so it is exercised against a real database rather than asserted on in Python. The paging tests use a fixture whose filenames repeat across directories, which is the case filename-only ordering cannot page through safely.
"""

from uuid import UUID, uuid4

import pytest
from sqlalchemy import insert, select
from sqlalchemy.ext.asyncio import create_async_engine

from app.models.annotation import detections
from app.models.data_management import (
    project_images,
    shared_image_tags,
    shared_images,
    tag_categories,
    tags,
)
from app.models.image import images
from app.models.image_quality import image_quality_metrics
from app.models.job import jobs
from app.models.project import labels, projects
from app.models.task import tasks
from app.models.user import users
from app.repositories.project_image import IMAGE_ORDER_BY, ProjectImageRepository
from app.schemas.image_filters import ImageFilterParams
from tests.test_storage_access import db_engine  # noqa: F401


@pytest.fixture
async def gallery(db_engine):  # noqa: F811 - imported pytest fixture
    """A project pool of six images, four of which share the filename ``dup.jpg``.

    Also sets up two tags, quality metrics in three different states, and one annotated image,
    so a single fixture can answer membership questions for every filter family.
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
                .values(name="explore", slug=str(uuid4()), owner_id=user_id)
                .returning(projects.c.id)
            )
        ).scalar_one()

        async def make_image(directory: str, filename: str, width: int = 100) -> UUID:
            image_id = (
                await conn.execute(
                    insert(shared_images)
                    .values(
                        file_path=f"{directory}/{filename}",
                        filename=filename,
                        width=width,
                        height=100,
                        aspect_ratio=width / 100,
                        file_size_bytes=width * 10,
                    )
                    .returning(shared_images.c.id)
                )
            ).scalar_one()
            return image_id

        pool: dict[str, UUID] = {
            "alpha": await make_image("a", "alpha.jpg", width=50),
            "dup_a": await make_image("a", "dup.jpg"),
            "dup_b": await make_image("b", "dup.jpg"),
            "dup_c": await make_image("c", "dup.jpg"),
            "dup_d": await make_image("d", "dup.jpg"),
            "zeta": await make_image("z", "zeta.jpg", width=400),
        }
        # Registered but never added to this project's pool.
        outside_pool = await make_image("a", "alpha.jpg".replace("alpha", "outside"))

        for image_id in pool.values():
            await conn.execute(
                insert(project_images).values(project_id=project_id, shared_image_id=image_id)
            )

        category_id = (
            await conn.execute(
                insert(tag_categories)
                .values(project_id=project_id, name="colours")
                .returning(tag_categories.c.id)
            )
        ).scalar_one()
        tag_ids = {}
        for name in ("red", "blue"):
            tag_ids[name] = (
                await conn.execute(
                    insert(tags)
                    .values(project_id=project_id, category_id=category_id, name=name)
                    .returning(tags.c.id)
                )
            ).scalar_one()

        tagging = {
            "alpha": ["red"],
            "dup_a": ["red", "blue"],
            "dup_b": ["blue"],
            "dup_d": ["red"],
        }
        for key, names in tagging.items():
            for name in names:
                await conn.execute(
                    insert(shared_image_tags).values(
                        project_id=project_id,
                        shared_image_id=pool[key],
                        tag_id=tag_ids[name],
                        category_id=category_id,
                    )
                )

        # Quality metrics: completed for two images, still pending for a third, absent elsewhere.
        await conn.execute(
            insert(image_quality_metrics).values(
                shared_image_id=pool["alpha"],
                sharpness=0.9,
                brightness=0.5,
                contrast=0.6,
                uniqueness=0.8,
                red_avg=0.7,
                green_avg=0.4,
                blue_avg=0.2,
                overall_quality=0.9,
                issues=[],
                status="completed",
            )
        )
        await conn.execute(
            insert(image_quality_metrics).values(
                shared_image_id=pool["dup_a"],
                sharpness=0.2,
                brightness=0.1,
                contrast=0.2,
                uniqueness=0.3,
                red_avg=0.1,
                green_avg=0.1,
                blue_avg=0.1,
                overall_quality=0.3,
                issues=["blur", "low_brightness"],
                status="completed",
            )
        )
        await conn.execute(
            insert(image_quality_metrics).values(
                shared_image_id=pool["dup_b"],
                sharpness=0.95,
                overall_quality=0.95,
                status="pending",
            )
        )

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

        job_image_ids = {}
        for sequence, key in enumerate(("alpha", "dup_a")):
            job_image_ids[key] = (
                await conn.execute(
                    insert(images)
                    .values(
                        job_id=job_id,
                        filename=key,
                        s3_key=key,
                        width=100,
                        height=100,
                        sequence_number=sequence,
                        shared_image_id=pool[key],
                    )
                    .returning(images.c.id)
                )
            ).scalar_one()
        await conn.execute(
            insert(detections).values(
                image_id=job_image_ids["alpha"],
                label_id=label_id,
                x_min=0.1,
                y_min=0.1,
                x_max=0.5,
                y_max=0.5,
            )
        )

        yield {
            "conn": conn,
            "project_id": project_id,
            "pool": pool,
            "outside_pool": outside_pool,
            "tags": tag_ids,
            "task_id": task_id,
            "job_id": job_id,
        }

        await transaction.rollback()
    await engine.dispose()


async def explore_ids(gallery, filters: ImageFilterParams, page_size: int = 50) -> set[UUID]:
    rows, _ = await ProjectImageRepository.explore(
        gallery["conn"],
        project_id=gallery["project_id"],
        page=1,
        page_size=page_size,
        filters=filters,
    )
    return {row["id"] for row in rows}


async def builder_ids(gallery, filters: ImageFilterParams) -> set[UUID]:
    stmt = ProjectImageRepository.build_filtered_query(gallery["project_id"], filters)
    result = await gallery["conn"].execute(stmt)
    return {row.id for row in result.fetchall()}


async def subquery_ids(gallery, filters: ImageFilterParams) -> set[UUID]:
    stmt = ProjectImageRepository.filtered_image_ids_subquery(gallery["project_id"], filters)
    result = await gallery["conn"].execute(stmt)
    return {row[0] for row in result.fetchall()}


def names(gallery, image_ids) -> set[str]:
    by_id = {image_id: key for key, image_id in gallery["pool"].items()}
    return {by_id.get(image_id, "unknown") for image_id in image_ids}


# ============================================================================
# G08 - deterministic ordering
# ============================================================================
async def test_paginated_walk_visits_every_image_exactly_once(gallery):
    """Four images share a filename; a full walk must still see each id once."""
    seen: list[UUID] = []
    page = 1
    while True:
        rows, total = await ProjectImageRepository.explore(
            gallery["conn"], project_id=gallery["project_id"], page=page, page_size=2
        )
        if not rows:
            break
        seen.extend(row["id"] for row in rows)
        page += 1

    assert total == len(gallery["pool"])
    assert len(seen) == len(set(seen)) == len(gallery["pool"])
    assert set(seen) == set(gallery["pool"].values())


def test_order_by_is_a_total_order():
    """C2: filename alone is not unique, so the id tie-breaker must stay in the ordering."""
    assert [str(clause) for clause in IMAGE_ORDER_BY] == [
        "shared_images.filename ASC",
        "shared_images.id ASC",
    ]


async def test_ordering_breaks_filename_ties_by_id(gallery):
    rows, _ = await ProjectImageRepository.explore(
        gallery["conn"], project_id=gallery["project_id"], page=1, page_size=50
    )
    ordering = [(row["filename"], row["id"]) for row in rows]
    assert ordering == sorted(ordering)


@pytest.mark.parametrize("page_size", [1, 2, 3, 4])
async def test_page_size_does_not_change_the_sequence(gallery, page_size):
    """Walking at any page size yields the same image sequence as one large page."""
    single, _ = await ProjectImageRepository.explore(
        gallery["conn"], project_id=gallery["project_id"], page=1, page_size=50
    )
    walked: list[UUID] = []
    page = 1
    while True:
        rows, _ = await ProjectImageRepository.explore(
            gallery["conn"], project_id=gallery["project_id"], page=page, page_size=page_size
        )
        if not rows:
            break
        walked.extend(row["id"] for row in rows)
        page += 1

    assert walked == [row["id"] for row in single]


# ============================================================================
# C1 - the builder and explore describe the same image set
# ============================================================================
FILTER_CASES = {
    "everything": ImageFilterParams(),
    "search": ImageFilterParams(search="dup"),
    "tags_or": ImageFilterParams(include_match_mode="OR"),
    "dimensions": ImageFilterParams(width_min=60, width_max=500, aspect_ratio_min=1.0),
    "file_size": ImageFilterParams(file_size_min=1000),
    "filepath_pattern": ImageFilterParams(filepath_pattern="*/dup.jpg"),
    "filepath_paths": ImageFilterParams(filepath_paths=["a", "b"]),
    "quality": ImageFilterParams(quality_min=0.5),
    "issues": ImageFilterParams(issues=["blur"]),
    "rgb": ImageFilterParams(red_min=0.5, blue_max=0.5),
    "annotated": ImageFilterParams(is_annotated=True),
    "object_counts": ImageFilterParams(object_count_min=1),
}


@pytest.mark.parametrize("case", list(FILTER_CASES))
async def test_builder_matches_explore(gallery, case):
    filters = FILTER_CASES[case]
    from_explore = await explore_ids(gallery, filters)
    assert from_explore == await builder_ids(gallery, filters)
    assert from_explore == await subquery_ids(gallery, filters)


async def test_combined_filters_match_explore(gallery):
    """A representative combination across every filter family resolves to one image set."""
    filters = ImageFilterParams(
        search="dup",
        tag_ids=[gallery["tags"]["red"], gallery["tags"]["blue"]],
        include_match_mode="AND",
        excluded_tag_ids=[gallery["tags"]["blue"]],
        exclude_match_mode="AND",
        task_ids=[gallery["task_id"]],
        is_annotated=False,
        width_min=10,
        width_max=1000,
        aspect_ratio_min=0.1,
        file_size_min=10,
        object_count_max=5,
        bbox_count_max=5,
        polygon_count_max=5,
        filepath_paths=["a", "b", "c", "d"],
        quality_max=0.5,
        sharpness_max=0.5,
        issues=["blur"],
        red_max=0.5,
    )
    from_explore = await explore_ids(gallery, filters)
    assert from_explore == await builder_ids(gallery, filters)
    assert from_explore == await subquery_ids(gallery, filters)


async def test_pool_scoping_excludes_images_outside_the_project(gallery):
    everything = await builder_ids(gallery, ImageFilterParams())
    assert everything == set(gallery["pool"].values())
    assert gallery["outside_pool"] not in everything


# ============================================================================
# Filter semantics that must survive the refactor
# ============================================================================
async def test_include_tag_match_modes(gallery):
    red, blue = gallery["tags"]["red"], gallery["tags"]["blue"]

    any_of = await builder_ids(gallery, ImageFilterParams(tag_ids=[red, blue]))
    assert names(gallery, any_of) == {"alpha", "dup_a", "dup_b", "dup_d"}

    all_of = await builder_ids(
        gallery, ImageFilterParams(tag_ids=[red, blue], include_match_mode="AND")
    )
    assert names(gallery, all_of) == {"dup_a"}


async def test_exclude_tag_match_modes(gallery):
    red, blue = gallery["tags"]["red"], gallery["tags"]["blue"]

    without_any = await builder_ids(gallery, ImageFilterParams(excluded_tag_ids=[red, blue]))
    assert names(gallery, without_any) == {"dup_c", "zeta"}

    without_all = await builder_ids(
        gallery, ImageFilterParams(excluded_tag_ids=[red, blue], exclude_match_mode="AND")
    )
    assert names(gallery, without_all) == {"alpha", "dup_b", "dup_c", "dup_d", "zeta"}


async def test_annotation_status_is_scoped_to_job_and_task(gallery):
    job_id, task_id = gallery["job_id"], gallery["task_id"]

    assert names(gallery, await builder_ids(gallery, ImageFilterParams(is_annotated=True))) == {
        "alpha"
    }
    assert names(
        gallery, await builder_ids(gallery, ImageFilterParams(job_id=job_id, is_annotated=True))
    ) == {"alpha"}
    assert names(
        gallery, await builder_ids(gallery, ImageFilterParams(job_id=job_id, is_annotated=False))
    ) == {"dup_a"}
    assert names(
        gallery,
        await builder_ids(gallery, ImageFilterParams(task_ids=[task_id], is_annotated=False)),
    ) == {"dup_a"}


async def test_job_id_wins_over_task_ids(gallery):
    """A job filter replaces the task filter rather than intersecting with it."""
    unrelated_task = 10_000_000
    scoped = await builder_ids(
        gallery, ImageFilterParams(job_id=gallery["job_id"], task_ids=[unrelated_task])
    )
    assert names(gallery, scoped) == {"alpha", "dup_a"}


async def test_quality_filters_require_completed_metrics(gallery):
    """An image whose metrics are still pending is not a match, even at a wide bound."""
    matched = await builder_ids(gallery, ImageFilterParams(sharpness_min=0.0))
    assert names(gallery, matched) == {"alpha", "dup_a"}

    issues = await builder_ids(gallery, ImageFilterParams(issues=["blur"]))
    assert names(gallery, issues) == {"dup_a"}


async def test_annotation_count_bounds(gallery):
    with_objects = await builder_ids(gallery, ImageFilterParams(object_count_min=1))
    assert names(gallery, with_objects) == {"alpha"}

    with_bboxes = await builder_ids(gallery, ImageFilterParams(bbox_count_min=1))
    assert names(gallery, with_bboxes) == {"alpha"}

    without_polygons = await builder_ids(gallery, ImageFilterParams(polygon_count_max=0))
    assert names(gallery, without_polygons) == set(gallery["pool"])


# ============================================================================
# G05 - server-resolved "all matching images"
# ============================================================================
async def test_resolve_filtered_image_ids_drops_exclusions(gallery):
    excluded = [gallery["pool"]["dup_a"], gallery["pool"]["dup_b"]]
    resolved = await ProjectImageRepository.resolve_filtered_image_ids(
        gallery["conn"],
        gallery["project_id"],
        ImageFilterParams(search="dup"),
        excluded_image_ids=excluded,
    )
    assert names(gallery, resolved) == {"dup_c", "dup_d"}


async def test_resolve_filtered_image_ids_respects_limit_and_order(gallery):
    resolved = await ProjectImageRepository.resolve_filtered_image_ids(
        gallery["conn"], gallery["project_id"], ImageFilterParams(), limit=3
    )
    rows, _ = await ProjectImageRepository.explore(
        gallery["conn"], project_id=gallery["project_id"], page=1, page_size=3
    )
    assert resolved == [row["id"] for row in rows]


async def test_filtered_image_ids_subquery_aggregates_in_sql(gallery):
    """The subquery is usable as a set to count against without materialising ids."""
    stmt = ProjectImageRepository.filtered_image_ids_subquery(
        gallery["project_id"], ImageFilterParams(search="dup")
    )
    count = (
        await gallery["conn"].execute(
            select(shared_images.c.id).where(shared_images.c.id.in_(stmt))
        )
    ).fetchall()
    assert len(count) == 4
