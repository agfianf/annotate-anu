"""SQL aggregates over the canonical filtered image set.

Every method here answers a question about the images matching an `ImageFilterParams`, and answers it in the database. The analytics panels used to answer the same questions by materialising up to 10 000 filtered images and counting them in Python, which silently truncated any project larger than that: a panel would describe the first 10 000 matches and label the number as the whole filtered set. Aggregating in SQL is what removes that cap, rather than raising it.

Two conventions hold throughout:

- **Membership comes from one place.** Each aggregate restricts itself to `ProjectImageRepository.filtered_image_ids_subquery`, the same statement the gallery pages over and the export resolves, so an analytics number and a gallery count describe the same images.
- **Facet counts are "current results".** A tag count, a histogram bucket, a quality bucket — each counts matching images *after* every active filter, including a filter on the facet's own field. Narrowing the quality range therefore shrinks the quality histogram. This is the only reading under which the panel totals equal the gallery's matching count; a "results with this facet's own filter removed" reading would not sum to it.
- **Zero is zero.** An aggregate over an empty match set returns zeros, never the project total. Distinguishing "nothing matched" from "no filter applied" is the whole point of taking the filter through to the aggregate.

Sampling is used only where a per-row payload has to reach the browser (scatter points, heatmap points). Those methods say so in their name and return the sample size alongside the exact total they were drawn from; nothing that is presented as a count is ever sampled.
"""

from typing import Sequence
from uuid import UUID

from sqlalchemy import Column, Float, Numeric, Select, func, literal, select
from sqlalchemy.ext.asyncio import AsyncConnection

from app.models.annotation import detections, segmentations
from app.models.data_management import shared_image_tags, shared_images
from app.models.image import images
from app.models.image_quality import image_quality_metrics
from app.repositories.project_image import ProjectImageRepository
from app.schemas.analytics import QualityMetricsAverages
from app.schemas.image_filters import ImageFilterParams

#: Quality issue names the image quality pipeline can record.
QUALITY_ISSUES = ("blur", "low_brightness", "high_brightness", "low_contrast", "duplicate")

#: The quality columns to average, keyed by the ``QualityMetricsAverages`` field each one fills.
#:
#: Derived from the schema rather than written out, because a hand-written rename is exactly what
#: broke here: the aggregates were labelled ``avg_sharpness``/``avg_overall``/… while the schema
#: declares ``sharpness``/``overall_quality``/…, so Pydantic dropped every key as unknown and the
#: panel rendered eight ``None``s over real data. Reading the labels off the schema means the two
#: cannot drift: rename a field and the label follows, and adding a field with no matching metrics
#: column raises ``KeyError`` at import time instead of silently returning ``None`` at runtime.
QUALITY_AVERAGE_COLUMNS: dict[str, Column] = {
    field: image_quality_metrics.c[field] for field in QualityMetricsAverages.model_fields
}


def _filtered_ids(project_id: int, filters: ImageFilterParams) -> Select:
    return ProjectImageRepository.filtered_image_ids_subquery(project_id, filters)


def _discrete_median_fraction(n: int) -> float:
    """The percentile that makes ``percentile_disc`` pick ``sorted(values)[n // 2]``.

    The analytics panels have always reported the upper of the two middle values for an even count, because they took `sorted(values)[n // 2]` in Python. `percentile_disc(0.5)` picks the lower one, so moving the median into SQL would have shifted every panel's median by one element for no reason. This picks the percentile that lands on the same element as before.
    """
    return (n // 2 + 0.5) / n


async def _scalars(connection: AsyncConnection, stmt: Select) -> dict:
    row = (await connection.execute(stmt)).mappings().first()
    return dict(row) if row else {}


class AnalyticsRepository:
    """Aggregates for the analytics panels, computed over the filtered image set in SQL."""

    # ------------------------------------------------------------------
    # Membership
    # ------------------------------------------------------------------
    @staticmethod
    async def count_images(
        connection: AsyncConnection, project_id: int, filters: ImageFilterParams
    ) -> int:
        """How many images match ``filters``. Zero matches returns 0, never the project total."""
        stmt = select(func.count()).select_from(_filtered_ids(project_id, filters).subquery())
        return (await connection.execute(stmt)).scalar() or 0

    # ------------------------------------------------------------------
    # Tags
    # ------------------------------------------------------------------
    @staticmethod
    async def tag_image_counts(
        connection: AsyncConnection, project_id: int, filters: ImageFilterParams
    ) -> list[tuple[UUID, int]]:
        """(tag id, matching images carrying it), most used first.

        Counts distinct images, so a tag applied twice to one image counts once — the same number the per-image tag maps produced.
        """
        ids = _filtered_ids(project_id, filters).subquery()
        stmt = (
            select(
                shared_image_tags.c.tag_id,
                func.count(func.distinct(shared_image_tags.c.shared_image_id)).label("count"),
            )
            .where(shared_image_tags.c.project_id == project_id)
            .where(shared_image_tags.c.shared_image_id.in_(select(ids.c.id)))
            .group_by(shared_image_tags.c.tag_id)
            .order_by(func.count(func.distinct(shared_image_tags.c.shared_image_id)).desc())
        )
        result = await connection.execute(stmt)
        return [(row.tag_id, row.count) for row in result.fetchall()]

    # ------------------------------------------------------------------
    # Dimensions
    # ------------------------------------------------------------------
    @staticmethod
    async def dimension_summary(
        connection: AsyncConnection, project_id: int, filters: ImageFilterParams
    ) -> dict:
        """Width, height, and aspect-ratio extremes, means, medians, and spread.

        Only images with a positive width and height are measured; `measured_images` says how many that was, so a caller can tell "no dimension data" from "no matches".
        """
        ids = _filtered_ids(project_id, filters).subquery()
        measured = (
            select(
                shared_images.c.width.label("width"),
                shared_images.c.height.label("height"),
                (shared_images.c.width.cast(Float) / shared_images.c.height).label("ratio"),
                func.greatest(shared_images.c.width, shared_images.c.height).label("dimension"),
            )
            .where(shared_images.c.id.in_(select(ids.c.id)))
            .where(shared_images.c.width > 0)
            .where(shared_images.c.height > 0)
            .subquery()
        )

        bounds = await _scalars(
            connection,
            select(
                func.count().label("measured_images"),
                func.min(measured.c.width).label("min_width"),
                func.max(measured.c.width).label("max_width"),
                func.min(measured.c.height).label("min_height"),
                func.max(measured.c.height).label("max_height"),
                func.min(measured.c.dimension).label("min_dimension"),
                func.max(measured.c.dimension).label("max_dimension"),
                func.min(measured.c.ratio).label("min_ratio"),
                func.max(measured.c.ratio).label("max_ratio"),
                func.avg(measured.c.width).label("avg_width"),
                func.avg(measured.c.height).label("avg_height"),
                func.stddev_samp(measured.c.width).label("stddev_width"),
                func.stddev_samp(measured.c.height).label("stddev_height"),
            ),
        )

        summary = {
            "measured_images": bounds.get("measured_images", 0) or 0,
            "min_width": bounds.get("min_width") or 0,
            "max_width": bounds.get("max_width") or 0,
            "min_height": bounds.get("min_height") or 0,
            "max_height": bounds.get("max_height") or 0,
            "min_dimension": bounds.get("min_dimension") or 0,
            "max_dimension": bounds.get("max_dimension") or 0,
            "min_ratio": float(bounds["min_ratio"]) if bounds.get("min_ratio") is not None else 0.0,
            "max_ratio": float(bounds["max_ratio"]) if bounds.get("max_ratio") is not None else 0.0,
            "avg_width": float(bounds["avg_width"]) if bounds.get("avg_width") is not None else 0.0,
            "avg_height": float(bounds["avg_height"])
            if bounds.get("avg_height") is not None
            else 0.0,
            "stddev_width": float(bounds["stddev_width"])
            if bounds.get("stddev_width") is not None
            else 0.0,
            "stddev_height": float(bounds["stddev_height"])
            if bounds.get("stddev_height") is not None
            else 0.0,
            "median_width": 0,
            "median_height": 0,
            "median_ratio": 1.0,
        }

        if summary["measured_images"]:
            fraction = _discrete_median_fraction(summary["measured_images"])
            medians = await _scalars(
                connection,
                select(
                    func.percentile_disc(fraction)
                    .within_group(measured.c.width.asc())
                    .label("median_width"),
                    func.percentile_disc(fraction)
                    .within_group(measured.c.height.asc())
                    .label("median_height"),
                    func.percentile_disc(fraction)
                    .within_group(measured.c.ratio.asc())
                    .label("median_ratio"),
                ),
            )
            summary["median_width"] = medians.get("median_width") or 0
            summary["median_height"] = medians.get("median_height") or 0
            summary["median_ratio"] = (
                float(medians["median_ratio"]) if medians.get("median_ratio") is not None else 1.0
            )

        return summary

    @staticmethod
    async def dimension_bucket_counts(
        connection: AsyncConnection,
        project_id: int,
        filters: ImageFilterParams,
        bins: Sequence[tuple[int, int]],
    ) -> list[int]:
        """Counts of ``max(width, height)`` per bin, half-open except for the last bin.

        Matches the histogram rule the panels already used: `bin_min <= value < bin_max`, with the top bin closing on the maximum so the widest image is counted.
        """
        if not bins:
            return []
        ids = _filtered_ids(project_id, filters).subquery()
        dimension = func.greatest(shared_images.c.width, shared_images.c.height)
        top = bins[-1][1]
        columns = []
        for index, (low, high) in enumerate(bins):
            upper = (dimension < high) if high < top else (dimension <= high)
            columns.append(func.count().filter((dimension >= low) & upper).label(f"bucket_{index}"))
        stmt = (
            select(*columns)
            .select_from(shared_images)
            .where(shared_images.c.id.in_(select(ids.c.id)))
            .where(shared_images.c.width > 0)
            .where(shared_images.c.height > 0)
        )
        row = await _scalars(connection, stmt)
        return [row.get(f"bucket_{index}", 0) or 0 for index in range(len(bins))]

    @staticmethod
    async def aspect_ratio_bucket_counts(
        connection: AsyncConnection,
        project_id: int,
        filters: ImageFilterParams,
        bins: Sequence[tuple[float, float]],
        rounding: int | None = 3,
    ) -> list[int]:
        """Counts of ``width / height`` per bin, using the same half-open rule.

        ``rounding`` reproduces the panels' habit of binning a rounded ratio; pass ``None`` to bin the exact value.
        """
        if not bins:
            return []
        ids = _filtered_ids(project_id, filters).subquery()
        ratio = shared_images.c.width.cast(Float) / shared_images.c.height
        if rounding is not None:
            ratio = func.round(ratio.cast(Numeric), rounding)
        top = bins[-1][1]
        columns = []
        for index, (low, high) in enumerate(bins):
            upper = (ratio < high) if high < top else (ratio <= high)
            columns.append(func.count().filter((ratio >= low) & upper).label(f"bucket_{index}"))
        stmt = (
            select(*columns)
            .select_from(shared_images)
            .where(shared_images.c.id.in_(select(ids.c.id)))
            .where(shared_images.c.width > 0)
            .where(shared_images.c.height > 0)
        )
        row = await _scalars(connection, stmt)
        return [row.get(f"bucket_{index}", 0) or 0 for index in range(len(bins))]

    @staticmethod
    async def aspect_ratio_shape_counts(
        connection: AsyncConnection, project_id: int, filters: ImageFilterParams
    ) -> dict:
        """Portrait / square / landscape / ultra-wide counts over the matching images."""
        ids = _filtered_ids(project_id, filters).subquery()
        ratio = shared_images.c.width.cast(Float) / shared_images.c.height
        stmt = (
            select(
                func.count().filter(ratio < 0.9).label("portrait"),
                func.count().filter((ratio >= 0.9) & (ratio <= 1.1)).label("square"),
                func.count().filter((ratio > 1.1) & (ratio <= 2.0)).label("landscape"),
                func.count().filter(ratio > 2.0).label("ultra_wide"),
            )
            .select_from(shared_images)
            .where(shared_images.c.id.in_(select(ids.c.id)))
            .where(shared_images.c.width > 0)
            .where(shared_images.c.height > 0)
        )
        row = await _scalars(connection, stmt)
        return {
            key: row.get(key, 0) or 0 for key in ("portrait", "square", "landscape", "ultra_wide")
        }

    @staticmethod
    async def dimension_scatter_sample(
        connection: AsyncConnection,
        project_id: int,
        filters: ImageFilterParams,
        limit: int = 500,
    ) -> list[dict]:
        """At most ``limit`` width/height points for the scatter plot.

        A **systematic sample**: the matching images are taken in the gallery's own order and every *k*-th one is kept, where *k* is chosen so the result fits the limit. Deterministic, so two loads of the same unchanged filter draw the same points. The caller owns saying how many of how many are plotted; the summary statistics beside the plot are exact and come from `dimension_summary`, not from this sample.
        """
        ids = _filtered_ids(project_id, filters).subquery()
        measured = (
            select(
                shared_images.c.id,
                shared_images.c.width,
                shared_images.c.height,
                func.row_number()
                .over(order_by=(shared_images.c.filename.asc(), shared_images.c.id.asc()))
                .label("position"),
            )
            .where(shared_images.c.id.in_(select(ids.c.id)))
            .where(shared_images.c.width > 0)
            .where(shared_images.c.height > 0)
            .subquery()
        )
        total = (await connection.execute(select(func.count()).select_from(measured))).scalar() or 0
        if total == 0:
            return []
        step = max(1, total // limit)
        stmt = (
            select(measured.c.id, measured.c.width, measured.c.height)
            .where((measured.c.position - 1) % step == 0)
            .order_by(measured.c.position)
            .limit(limit)
        )
        result = await connection.execute(stmt)
        return [
            {
                "image_id": str(row.id),
                "width": row.width,
                "height": row.height,
                "aspect_ratio": round(row.width / row.height, 3),
            }
            for row in result.fetchall()
        ]

    # ------------------------------------------------------------------
    # File size
    # ------------------------------------------------------------------
    @staticmethod
    async def file_size_summary(
        connection: AsyncConnection, project_id: int, filters: ImageFilterParams
    ) -> dict:
        """Min, max, mean, and median file size over matching images that record one."""
        ids = _filtered_ids(project_id, filters).subquery()
        sized = (
            select(shared_images.c.file_size_bytes.label("bytes"))
            .where(shared_images.c.id.in_(select(ids.c.id)))
            .where(shared_images.c.file_size_bytes.isnot(None))
            .subquery()
        )
        bounds = await _scalars(
            connection,
            select(
                func.count().label("measured_images"),
                func.min(sized.c.bytes).label("min"),
                func.max(sized.c.bytes).label("max"),
                func.avg(sized.c.bytes).label("avg"),
            ),
        )
        measured = bounds.get("measured_images", 0) or 0
        if not measured:
            return {"measured_images": 0, "min": 0, "max": 0, "avg": 0.0, "median": 0}

        median_row = await _scalars(
            connection,
            select(
                func.percentile_disc(_discrete_median_fraction(measured))
                .within_group(sized.c.bytes.asc())
                .label("median")
            ),
        )
        return {
            "measured_images": measured,
            "min": bounds.get("min") or 0,
            "max": bounds.get("max") or 0,
            "avg": float(bounds["avg"]) if bounds.get("avg") is not None else 0.0,
            "median": median_row.get("median") or 0,
        }

    # ------------------------------------------------------------------
    # Annotations
    # ------------------------------------------------------------------
    @staticmethod
    def _per_image_annotation_counts(project_id: int, filters: ImageFilterParams):
        """One row per matching image: its detection count, segmentation count, and their sum.

        Images with no annotations are kept with zeros, which is what makes the coverage percentage and the "0 objects" density bucket correct rather than merely absent.
        """
        ids = _filtered_ids(project_id, filters).subquery()
        detection_counts = (
            select(
                images.c.shared_image_id.label("shared_image_id"),
                func.count(detections.c.id).label("count"),
            )
            .select_from(detections.join(images, detections.c.image_id == images.c.id))
            .where(images.c.shared_image_id.in_(select(ids.c.id)))
            .group_by(images.c.shared_image_id)
            .subquery()
        )
        segmentation_counts = (
            select(
                images.c.shared_image_id.label("shared_image_id"),
                func.count(segmentations.c.id).label("count"),
            )
            .select_from(segmentations.join(images, segmentations.c.image_id == images.c.id))
            .where(images.c.shared_image_id.in_(select(ids.c.id)))
            .group_by(images.c.shared_image_id)
            .subquery()
        )
        detection_count = func.coalesce(detection_counts.c.count, 0)
        segmentation_count = func.coalesce(segmentation_counts.c.count, 0)
        return (
            select(
                ids.c.id.label("id"),
                detection_count.label("detection_count"),
                segmentation_count.label("segmentation_count"),
                (detection_count + segmentation_count).label("object_count"),
            )
            .select_from(
                ids.outerjoin(
                    detection_counts, ids.c.id == detection_counts.c.shared_image_id
                ).outerjoin(segmentation_counts, ids.c.id == segmentation_counts.c.shared_image_id)
            )
            .subquery()
        )

    @staticmethod
    async def annotation_coverage(
        connection: AsyncConnection,
        project_id: int,
        filters: ImageFilterParams,
        density_buckets: Sequence[tuple[str, int, int]],
    ) -> dict:
        """Coverage, object totals, and the density histogram, over every matching image.

        ``density_buckets`` are inclusive on both ends, as the panel's "0 / 1 / 2-5 / 6-10 / 11-20 / 21+" buckets are.
        """
        per_image = AnalyticsRepository._per_image_annotation_counts(project_id, filters)
        columns = [
            func.count().label("total_images"),
            func.count().filter(per_image.c.object_count > 0).label("annotated_images"),
            func.coalesce(func.sum(per_image.c.object_count), 0).label("total_objects"),
            func.avg(per_image.c.object_count).label("avg_objects"),
        ]
        for index, (_, low, high) in enumerate(density_buckets):
            columns.append(
                func.count()
                .filter((per_image.c.object_count >= low) & (per_image.c.object_count <= high))
                .label(f"bucket_{index}")
            )
        row = await _scalars(connection, select(*columns).select_from(per_image))

        total_images = row.get("total_images", 0) or 0
        result = {
            "total_images": total_images,
            "annotated_images": row.get("annotated_images", 0) or 0,
            "total_objects": row.get("total_objects", 0) or 0,
            "avg_objects_per_image": float(row["avg_objects"])
            if row.get("avg_objects") is not None
            else 0.0,
            "median_objects_per_image": 0,
            "density_histogram": [
                {
                    "bucket": name,
                    "count": row.get(f"bucket_{index}", 0) or 0,
                    "min": low,
                    "max": high,
                }
                for index, (name, low, high) in enumerate(density_buckets)
            ],
        }
        result["unannotated_images"] = total_images - result["annotated_images"]
        result["coverage_percentage"] = (
            round(result["annotated_images"] / total_images * 100, 2) if total_images else 0.0
        )
        result["avg_objects_per_image"] = round(result["avg_objects_per_image"], 2)

        if total_images:
            median_row = await _scalars(
                connection,
                select(
                    func.percentile_disc(_discrete_median_fraction(total_images))
                    .within_group(per_image.c.object_count.asc())
                    .label("median")
                ).select_from(per_image),
            )
            result["median_objects_per_image"] = median_row.get("median") or 0
        return result

    @staticmethod
    async def annotation_count_values(
        connection: AsyncConnection,
        project_id: int,
        filters: ImageFilterParams,
        kind: str,
    ) -> list[int]:
        """Per-image annotation counts for ``kind`` (``bbox`` or ``polygon``), one entry per matching image.

        Returned as a list because the dynamic-binning helper the panels use needs the values to choose its bins. One integer per image, so this stays small next to the image rows the handlers used to fetch.
        """
        per_image = AnalyticsRepository._per_image_annotation_counts(project_id, filters)
        column = {
            "bbox": per_image.c.detection_count,
            "polygon": per_image.c.segmentation_count,
            "object": per_image.c.object_count,
        }[kind]
        result = await connection.execute(select(column).select_from(per_image))
        return [row[0] for row in result.fetchall()]

    @staticmethod
    async def annotation_spatial_summary(
        connection: AsyncConnection,
        project_id: int,
        filters: ImageFilterParams,
        grid_size: int = 10,
    ) -> dict:
        """Exact heatmap grid, centre of mass, spread, and annotation total.

        Every annotation on every matching image is counted; nothing here is sampled. Centres come from detection boxes and from segmentation bounding boxes, the two sources the previous in-Python version used.
        """
        ids = _filtered_ids(project_id, filters).subquery()
        detection_centres = (
            select(
                ((detections.c.x_min + detections.c.x_max) / 2).label("x"),
                ((detections.c.y_min + detections.c.y_max) / 2).label("y"),
            )
            .select_from(detections.join(images, detections.c.image_id == images.c.id))
            .where(images.c.shared_image_id.in_(select(ids.c.id)))
        )
        segmentation_centres = (
            select(
                ((segmentations.c.bbox_x_min + segmentations.c.bbox_x_max) / 2).label("x"),
                ((segmentations.c.bbox_y_min + segmentations.c.bbox_y_max) / 2).label("y"),
            )
            .select_from(segmentations.join(images, segmentations.c.image_id == images.c.id))
            .where(images.c.shared_image_id.in_(select(ids.c.id)))
            .where(segmentations.c.bbox_x_min.isnot(None))
            .where(segmentations.c.bbox_x_max.isnot(None))
            .where(segmentations.c.bbox_y_min.isnot(None))
            .where(segmentations.c.bbox_y_max.isnot(None))
        )
        centres = detection_centres.union_all(segmentation_centres).subquery()

        totals = await _scalars(
            connection,
            select(
                func.count().label("total_annotations"),
                func.avg(centres.c.x).label("center_x"),
                func.avg(centres.c.y).label("center_y"),
                func.stddev_samp(centres.c.x).label("x_std"),
                func.stddev_samp(centres.c.y).label("y_std"),
            ).select_from(centres),
        )
        total_annotations = totals.get("total_annotations", 0) or 0
        grid = [[0] * grid_size for _ in range(grid_size)]
        if total_annotations == 0:
            return {
                "total_annotations": 0,
                "center_of_mass": {"x": 0.5, "y": 0.5},
                "spread": {"x_std": 0.0, "y_std": 0.0},
                "grid_density": grid,
                "grid_size": grid_size,
                "max_cell_count": 0,
            }

        def cell(column):
            return func.least(
                func.greatest(func.floor(column * literal(grid_size)).cast(Float), 0.0),
                float(grid_size - 1),
            ).cast(Float)

        cell_stmt = (
            select(
                cell(centres.c.x).label("grid_x"),
                cell(centres.c.y).label("grid_y"),
                func.count().label("count"),
            )
            .select_from(centres)
            .group_by("grid_x", "grid_y")
        )
        for row in (await connection.execute(cell_stmt)).fetchall():
            grid[int(row.grid_y)][int(row.grid_x)] += row.count

        return {
            "total_annotations": total_annotations,
            "center_of_mass": {
                "x": round(float(totals["center_x"]), 4),
                "y": round(float(totals["center_y"]), 4),
            },
            "spread": {
                "x_std": round(float(totals["x_std"]), 4)
                if totals.get("x_std") is not None
                else 0.0,
                "y_std": round(float(totals["y_std"]), 4)
                if totals.get("y_std") is not None
                else 0.0,
            },
            "grid_density": grid,
            "grid_size": grid_size,
            "max_cell_count": max(max(row) for row in grid),
        }

    @staticmethod
    async def annotation_center_sample(
        connection: AsyncConnection,
        project_id: int,
        filters: ImageFilterParams,
        limit: int = 500,
    ) -> list[dict]:
        """At most ``limit`` annotation centres for the scatter overlay.

        A **systematic sample** over the annotations of the matching images, taken in a stable order and keeping every *k*-th centre. The grid density, centre of mass, spread, and total beside it are exact and come from `annotation_spatial_summary`; only the plotted dots are a sample.
        """
        ids = _filtered_ids(project_id, filters).subquery()
        detection_centres = (
            select(
                ((detections.c.x_min + detections.c.x_max) / 2).label("x"),
                ((detections.c.y_min + detections.c.y_max) / 2).label("y"),
                detections.c.id.label("annotation_id"),
            )
            .select_from(detections.join(images, detections.c.image_id == images.c.id))
            .where(images.c.shared_image_id.in_(select(ids.c.id)))
        )
        segmentation_centres = (
            select(
                ((segmentations.c.bbox_x_min + segmentations.c.bbox_x_max) / 2).label("x"),
                ((segmentations.c.bbox_y_min + segmentations.c.bbox_y_max) / 2).label("y"),
                segmentations.c.id.label("annotation_id"),
            )
            .select_from(segmentations.join(images, segmentations.c.image_id == images.c.id))
            .where(images.c.shared_image_id.in_(select(ids.c.id)))
            .where(segmentations.c.bbox_x_min.isnot(None))
            .where(segmentations.c.bbox_x_max.isnot(None))
            .where(segmentations.c.bbox_y_min.isnot(None))
            .where(segmentations.c.bbox_y_max.isnot(None))
        )
        centres = detection_centres.union_all(segmentation_centres).subquery()
        ordered = select(
            centres.c.x,
            centres.c.y,
            func.row_number().over(order_by=centres.c.annotation_id.asc()).label("position"),
        ).subquery()

        total = (await connection.execute(select(func.count()).select_from(ordered))).scalar() or 0
        if total == 0:
            return []
        step = max(1, total // limit)
        stmt = (
            select(ordered.c.x, ordered.c.y)
            .where((ordered.c.position - 1) % step == 0)
            .order_by(ordered.c.position)
            .limit(limit)
        )
        result = await connection.execute(stmt)
        return [{"x": float(row.x), "y": float(row.y), "weight": 1} for row in result.fetchall()]

    # ------------------------------------------------------------------
    # Quality metrics
    # ------------------------------------------------------------------
    @staticmethod
    async def quality_status_counts(
        connection: AsyncConnection, project_id: int, filters: ImageFilterParams
    ) -> dict[str, int]:
        """How many matching images sit in each quality-computation status."""
        ids = _filtered_ids(project_id, filters).subquery()
        stmt = (
            select(image_quality_metrics.c.status, func.count().label("count"))
            .where(image_quality_metrics.c.shared_image_id.in_(select(ids.c.id)))
            .group_by(image_quality_metrics.c.status)
        )
        result = await connection.execute(stmt)
        return {row.status: row.count for row in result.fetchall()}

    @staticmethod
    async def quality_averages(
        connection: AsyncConnection, project_id: int, filters: ImageFilterParams
    ) -> dict:
        """Mean of each quality metric over matching images whose metrics finished computing.

        Keys are ``QualityMetricsAverages`` field names, so the result loads into that schema
        unchanged — see :data:`QUALITY_AVERAGE_COLUMNS` for why the labels are derived and not typed.
        """
        ids = _filtered_ids(project_id, filters).subquery()
        stmt = (
            select(
                *(
                    func.avg(column).label(field)
                    for field, column in QUALITY_AVERAGE_COLUMNS.items()
                )
            )
            .where(image_quality_metrics.c.shared_image_id.in_(select(ids.c.id)))
            .where(image_quality_metrics.c.status == "completed")
        )
        row = await _scalars(connection, stmt)
        return {key: (float(value) if value is not None else None) for key, value in row.items()}

    @staticmethod
    async def quality_metric_histogram(
        connection: AsyncConnection,
        project_id: int,
        filters: ImageFilterParams,
        metric: str,
        buckets: Sequence[tuple[str, float, float]],
    ) -> list[int]:
        """Bucket counts for one quality metric over matching images with completed metrics.

        Buckets are half-open (`min <= value < max`), except that a bucket ending at 1.0 also counts exactly 1.0 — the rule the panels already applied.
        """
        column = image_quality_metrics.c[metric]
        ids = _filtered_ids(project_id, filters).subquery()
        columns = []
        for index, (_, low, high) in enumerate(buckets):
            upper = (column <= high) if high == 1.0 else (column < high)
            columns.append(func.count().filter((column >= low) & upper).label(f"bucket_{index}"))
        stmt = (
            select(*columns)
            .select_from(image_quality_metrics)
            .where(image_quality_metrics.c.shared_image_id.in_(select(ids.c.id)))
            .where(image_quality_metrics.c.status == "completed")
            .where(column.isnot(None))
        )
        row = await _scalars(connection, stmt)
        return [row.get(f"bucket_{index}", 0) or 0 for index in range(len(buckets))]

    @staticmethod
    async def quality_issue_counts(
        connection: AsyncConnection, project_id: int, filters: ImageFilterParams
    ) -> dict[str, int]:
        """How many matching images carry each quality issue."""
        ids = _filtered_ids(project_id, filters).subquery()
        columns = [
            func.count()
            .filter(image_quality_metrics.c.issues.contains([issue]))
            .label(f"issue_{index}")
            for index, issue in enumerate(QUALITY_ISSUES)
        ]
        stmt = (
            select(*columns)
            .select_from(image_quality_metrics)
            .where(image_quality_metrics.c.shared_image_id.in_(select(ids.c.id)))
            .where(image_quality_metrics.c.status == "completed")
        )
        row = await _scalars(connection, stmt)
        return {
            issue: row.get(f"issue_{index}", 0) or 0 for index, issue in enumerate(QUALITY_ISSUES)
        }

    @staticmethod
    async def flagged_images(
        connection: AsyncConnection,
        project_id: int,
        filters: ImageFilterParams,
        limit: int = 20,
    ) -> list[dict]:
        """Worst-quality matching images that have at least one issue, lowest score first.

        Restricted to the filtered set. The previous version listed the project's flagged images regardless of the filters, so the panel's examples could be images the gallery was not showing.
        """
        ids = _filtered_ids(project_id, filters).subquery()
        stmt = (
            select(
                image_quality_metrics.c.shared_image_id,
                image_quality_metrics.c.issues,
                image_quality_metrics.c.sharpness,
                image_quality_metrics.c.brightness,
                image_quality_metrics.c.overall_quality,
                shared_images.c.file_path,
                shared_images.c.filename,
            )
            .select_from(
                image_quality_metrics.join(
                    shared_images, image_quality_metrics.c.shared_image_id == shared_images.c.id
                )
            )
            .where(image_quality_metrics.c.shared_image_id.in_(select(ids.c.id)))
            .where(image_quality_metrics.c.status == "completed")
            .where(func.jsonb_array_length(image_quality_metrics.c.issues) > 0)
            .order_by(
                image_quality_metrics.c.overall_quality.asc(),
                image_quality_metrics.c.shared_image_id.asc(),
            )
            .limit(limit)
        )
        result = await connection.execute(stmt)
        return [dict(row._mapping) for row in result.fetchall()]
