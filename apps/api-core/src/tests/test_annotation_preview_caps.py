"""Per-image geometry caps for the gallery overlay, against PostgreSQL.

`AnnotationSummaryRepository` caps how much geometry one image contributes to an explore page. The cap now lives in the SQL (`row_number() over (partition by shared_image_id ...)`) instead of in a Python loop that ran after every row had already been fetched, so what the cap means has to be pinned down by tests rather than by reading the loop: the counts beside the overlay stay exact and uncapped, the bbox array stays one array shared by detections and segmentation bboxes, and two identical calls return the same subset in the same order.

The truncation flags the API reports are `len(geometry) >= limit`, computed in `project_images._enrich_image`; these tests assert the length the flag is derived from, which is why an image seeded to exactly the cap counts as truncated here just as it did before.
"""

from uuid import UUID, uuid4

import pytest
from sqlalchemy import insert
from sqlalchemy.ext.asyncio import create_async_engine

from app.models.annotation import detections, segmentations
from app.models.data_management import project_images, shared_images
from app.models.image import images
from app.models.job import jobs
from app.models.project import labels, projects
from app.models.task import tasks
from app.models.user import users
from app.repositories.annotation import AnnotationSummaryRepository
from tests.test_storage_access import db_engine  # noqa: F401

#: Distinct polygon rings, so a capped subset can be told apart from a differently capped one.
POLYGON_POINTS = 8


def _polygon(seed: int) -> list[list[float]]:
    return [[(seed + i) / 1000, (seed + i) / 2000] for i in range(POLYGON_POINTS)]


@pytest.fixture
async def pool(db_engine):  # noqa: F811 - imported pytest fixture
    """Three images: one below both caps, one far above them, one with no geometry at all.

    ``dense`` carries 12 detections and 9 segmentations (each segmentation has both a cached bbox
    and a polygon), so with a cap of 5 the bbox array has to mix the two sources and the polygon
    array has to be cut. ``sparse`` stays under any cap used here.
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
                .values(name="caps", slug=str(uuid4()), owner_id=user_id)
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
                insert(labels)
                .values(project_id=project_id, name="label", color="#123456")
                .returning(labels.c.id)
            )
        ).scalar_one()

        shared: dict[str, UUID] = {}
        job_images: dict[str, UUID] = {}
        for sequence, key in enumerate(("dense", "sparse", "bare")):
            shared[key] = (
                await conn.execute(
                    insert(shared_images)
                    .values(
                        file_path=f"{key}/{key}.jpg",
                        filename=f"{key}.jpg",
                        width=100,
                        height=100,
                        aspect_ratio=1.0,
                        file_size_bytes=1000,
                    )
                    .returning(shared_images.c.id)
                )
            ).scalar_one()
            await conn.execute(
                insert(project_images).values(project_id=project_id, shared_image_id=shared[key])
            )
            job_images[key] = (
                await conn.execute(
                    insert(images)
                    .values(
                        job_id=job_id,
                        filename=key,
                        s3_key=key,
                        width=100,
                        height=100,
                        sequence_number=sequence,
                        shared_image_id=shared[key],
                    )
                    .returning(images.c.id)
                )
            ).scalar_one()

        seeded = {"dense": (12, 9), "sparse": (2, 1)}
        for key, (n_detections, n_segmentations) in seeded.items():
            for i in range(n_detections):
                await conn.execute(
                    insert(detections).values(
                        image_id=job_images[key],
                        label_id=label_id,
                        x_min=i / 100,
                        y_min=i / 100,
                        x_max=(i + 1) / 100,
                        y_max=(i + 1) / 100,
                    )
                )
            for i in range(n_segmentations):
                await conn.execute(
                    insert(segmentations).values(
                        image_id=job_images[key],
                        label_id=label_id,
                        polygon=_polygon(i),
                        bbox_x_min=i / 100,
                        bbox_y_min=i / 100,
                        bbox_x_max=(i + 1) / 100,
                        bbox_y_max=(i + 1) / 100,
                    )
                )

        yield {
            "conn": conn,
            "project_id": project_id,
            "shared": shared,
            "job_images": job_images,
            "label_id": label_id,
            "seeded": seeded,
        }

        await transaction.rollback()
    await engine.dispose()


def _ids(pool) -> list[UUID]:
    return list(pool["shared"].values())


# ============================================================================
# Below the cap: nothing is withheld
# ============================================================================
async def test_image_below_cap_returns_every_shape(pool):
    bboxes = await AnnotationSummaryRepository.get_bboxes_for_images(
        pool["conn"], _ids(pool), max_per_image=100
    )
    polygons = await AnnotationSummaryRepository.get_polygons_for_images(
        pool["conn"], _ids(pool), max_per_image=50
    )

    # sparse: 2 detections + 1 segmentation bbox, 1 polygon.
    assert len(bboxes[pool["shared"]["sparse"]]) == 3
    assert len(polygons[pool["shared"]["sparse"]]) == 1
    # An image with no annotations is still a key, with empty lists.
    assert bboxes[pool["shared"]["bare"]] == []
    assert polygons[pool["shared"]["bare"]] == []


async def test_image_at_the_cap_returns_every_shape(pool):
    """21 shapes with the cap at exactly 21: the boundary returns all of them, not 20."""
    bboxes = await AnnotationSummaryRepository.get_bboxes_for_images(
        pool["conn"], _ids(pool), max_per_image=21
    )
    assert len(bboxes[pool["shared"]["dense"]]) == 21


# ============================================================================
# Above the cap: exactly the cap, and the API's truncation flag follows
# ============================================================================
@pytest.mark.parametrize("cap", [1, 5, 13, 20])
async def test_dense_image_returns_exactly_the_cap(pool, cap):
    bboxes = await AnnotationSummaryRepository.get_bboxes_for_images(
        pool["conn"], _ids(pool), max_per_image=cap
    )
    assert len(bboxes[pool["shared"]["dense"]]) == cap
    # The under-cap image is unaffected by the cap chosen for its neighbour.
    assert len(bboxes[pool["shared"]["sparse"]]) == min(3, cap)


@pytest.mark.parametrize("cap", [1, 4, 9])
async def test_dense_polygons_return_exactly_the_cap(pool, cap):
    polygons = await AnnotationSummaryRepository.get_polygons_for_images(
        pool["conn"], _ids(pool), max_per_image=cap
    )
    assert len(polygons[pool["shared"]["dense"]]) == cap
    assert len(polygons[pool["shared"]["sparse"]]) == 1


async def test_truncation_flags_match_the_returned_lengths(pool):
    """``_enrich_image`` derives the flags from ``len(geometry) >= limit``; the lengths must support that.

    The cap being in SQL must not change which images the gallery labels as partial: capped images
    come back at exactly the limit (flag true), uncapped ones strictly below it (flag false).
    """
    bbox_limit, polygon_limit = 5, 4
    summaries = await AnnotationSummaryRepository.get_summary_for_images(
        pool["conn"],
        _ids(pool),
        max_bboxes_per_image=bbox_limit,
        max_polygons_per_image=polygon_limit,
    )

    dense = summaries[pool["shared"]["dense"]]
    assert len(dense["bboxes"]) >= bbox_limit
    assert len(dense["polygons"]) >= polygon_limit

    sparse = summaries[pool["shared"]["sparse"]]
    assert len(sparse["bboxes"]) < bbox_limit
    assert len(sparse["polygons"]) < polygon_limit


# ============================================================================
# Counts are never capped
# ============================================================================
async def test_counts_stay_exact_under_any_cap(pool):
    """The badge beside the overlay counts every annotation, not the ones that survived the cap."""
    for cap in (1, 5, 1000):
        summaries = await AnnotationSummaryRepository.get_summary_for_images(
            pool["conn"],
            _ids(pool),
            max_bboxes_per_image=cap,
            max_polygons_per_image=cap,
        )
        for key, (n_detections, n_segmentations) in pool["seeded"].items():
            summary = summaries[pool["shared"][key]]
            assert summary["detection_count"] == n_detections, (key, cap)
            assert summary["segmentation_count"] == n_segmentations, (key, cap)

    counts = await AnnotationSummaryRepository.get_counts_for_images(pool["conn"], _ids(pool))
    assert counts[pool["shared"]["dense"]] == {"detection_count": 12, "segmentation_count": 9}
    assert counts[pool["shared"]["bare"]] == {"detection_count": 0, "segmentation_count": 0}


async def test_counts_are_returned_with_geometry_switched_off(pool):
    summaries = await AnnotationSummaryRepository.get_summary_for_images(
        pool["conn"], _ids(pool), include_bboxes=False, include_polygons=False
    )
    dense = summaries[pool["shared"]["dense"]]
    assert dense["detection_count"] == 12
    assert dense["segmentation_count"] == 9
    assert dense["bboxes"] is None
    assert dense["polygons"] is None


# ============================================================================
# The bbox array is one array shared by both sources
# ============================================================================
async def test_bbox_array_mixes_detections_and_segmentation_bboxes(pool):
    """The cap applies to the combined array, detections first — not once per source."""
    uncapped = await AnnotationSummaryRepository.get_bboxes_for_images(
        pool["conn"], _ids(pool), max_per_image=1000
    )
    dense = uncapped[pool["shared"]["dense"]]
    assert len(dense) == 21  # 12 detections + 9 segmentation bboxes in one array

    # A cap that lands inside the detections leaves no room for any segmentation bbox, and a cap
    # above the detection count admits the rest from the segmentations.
    at_ten = await AnnotationSummaryRepository.get_bboxes_for_images(
        pool["conn"], _ids(pool), max_per_image=10
    )
    assert len(at_ten[pool["shared"]["dense"]]) == 10
    assert at_ten[pool["shared"]["dense"]] == dense[:10]

    at_sixteen = await AnnotationSummaryRepository.get_bboxes_for_images(
        pool["conn"], _ids(pool), max_per_image=16
    )
    assert at_sixteen[pool["shared"]["dense"]] == dense[:16]
    # Past the 12 detections, the tail of the array is segmentation bboxes.
    assert len(at_sixteen[pool["shared"]["dense"]]) == 16


async def test_segmentation_without_cached_bbox_is_excluded_from_bboxes_only(pool):
    """A polygon with no cached bbox still draws as a polygon; it just has no box to show."""
    await pool["conn"].execute(
        insert(segmentations).values(
            image_id=pool["job_images"]["sparse"],
            label_id=pool["label_id"],
            polygon=_polygon(99),
        )
    )
    bboxes = await AnnotationSummaryRepository.get_bboxes_for_images(
        pool["conn"], _ids(pool), max_per_image=100
    )
    polygons = await AnnotationSummaryRepository.get_polygons_for_images(
        pool["conn"], _ids(pool), max_per_image=50
    )
    assert len(bboxes[pool["shared"]["sparse"]]) == 3
    assert len(polygons[pool["shared"]["sparse"]]) == 2


async def test_shape_payload_is_unchanged(pool):
    bboxes = await AnnotationSummaryRepository.get_bboxes_for_images(
        pool["conn"], _ids(pool), max_per_image=100
    )
    polygons = await AnnotationSummaryRepository.get_polygons_for_images(
        pool["conn"], _ids(pool), max_per_image=50
    )
    bbox = bboxes[pool["shared"]["sparse"]][0]
    assert set(bbox) == {
        "x_min",
        "y_min",
        "x_max",
        "y_max",
        "label_color",
        "label_name",
        "label_id",
        "confidence",
        "source",
    }
    assert bbox["label_color"] == "#123456"
    assert bbox["label_name"] == "label"
    assert bbox["label_id"] == str(pool["label_id"])
    assert bbox["source"] == "manual"

    polygon = polygons[pool["shared"]["sparse"]][0]
    assert set(polygon) == {
        "points",
        "label_color",
        "label_name",
        "label_id",
        "confidence",
        "source",
    }
    assert polygon["points"] == _polygon(0)


async def test_dense_polygon_points_survive_the_simplifier(pool):
    """The point-count simplifier is independent of the row cap and still runs."""
    polygons = await AnnotationSummaryRepository.get_polygons_for_images(
        pool["conn"], _ids(pool), max_per_image=50, max_points_per_polygon=4
    )
    points = polygons[pool["shared"]["sparse"]][0]["points"]
    assert len(points) <= POLYGON_POINTS // 2


# ============================================================================
# Stability
# ============================================================================
async def test_capped_subset_is_stable_across_identical_calls(pool):
    """Two requests for the same dense image must return the same shapes in the same order."""
    first_b = await AnnotationSummaryRepository.get_bboxes_for_images(
        pool["conn"], _ids(pool), max_per_image=7
    )
    second_b = await AnnotationSummaryRepository.get_bboxes_for_images(
        pool["conn"], _ids(pool), max_per_image=7
    )
    assert first_b == second_b

    first_p = await AnnotationSummaryRepository.get_polygons_for_images(
        pool["conn"], _ids(pool), max_per_image=3
    )
    second_p = await AnnotationSummaryRepository.get_polygons_for_images(
        pool["conn"], _ids(pool), max_per_image=3
    )
    assert first_p == second_p


async def test_a_larger_cap_extends_the_smaller_one(pool):
    """The cap is a prefix of a stable order, so raising it only appends."""
    small = await AnnotationSummaryRepository.get_bboxes_for_images(
        pool["conn"], _ids(pool), max_per_image=4
    )
    large = await AnnotationSummaryRepository.get_bboxes_for_images(
        pool["conn"], _ids(pool), max_per_image=15
    )
    assert large[pool["shared"]["dense"]][:4] == small[pool["shared"]["dense"]]

    small_p = await AnnotationSummaryRepository.get_polygons_for_images(
        pool["conn"], _ids(pool), max_per_image=2
    )
    large_p = await AnnotationSummaryRepository.get_polygons_for_images(
        pool["conn"], _ids(pool), max_per_image=6
    )
    assert large_p[pool["shared"]["dense"]][:2] == small_p[pool["shared"]["dense"]]


async def test_empty_input_short_circuits(pool):
    assert await AnnotationSummaryRepository.get_bboxes_for_images(pool["conn"], []) == {}
    assert await AnnotationSummaryRepository.get_polygons_for_images(pool["conn"], []) == {}
    assert await AnnotationSummaryRepository.get_summary_for_images(pool["conn"], []) == {}
