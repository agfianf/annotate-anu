"""Aggregates over an image scope expressed as a subquery instead of a materialised id list.

`ProjectImageRepository.filtered_image_ids_subquery` already describes "the images matching these filters" as a statement. Everything here consumes that statement directly, so a sidebar panel over 150 000 matching images costs one `IN (SELECT ...)` instead of 150 000 bound parameters per statement — the whole point of not fetching the ids into Python first.

These replace `ProjectImageRepository.get_numeric_stats` and `get_size_distribution`, which took a materialised id list and have been removed. The old `get_numeric_stats` guarded its list with `if filtered_image_ids:`, which conflated "no filter" with "the filter matched nothing" and which no SQLAlchemy 2.0 construct could pass anyway — `bool()` on a `Select`, a `Subquery` or a `ScalarSelect` raises `TypeError`. This module is the single home for these aggregates.

One convention throughout, the same one `AnalyticsRepository` states: `None` means "no filter applied" and widens an aggregate to the whole project pool, while a scope that matches no rows means "the filter matched nothing" and narrows it to zero. The two must never collapse into each other, or a filter with no matches silently reports the unfiltered distribution.
"""

from sqlalchemy import Select, case, func, literal, select
from sqlalchemy.ext.asyncio import AsyncConnection

from app.models.data_management import project_images, shared_images
from app.repositories.project_image import ProjectImageRepository
from app.schemas.image_filters import ImageFilterParams

#: Shape every numeric aggregate returns when nothing is in range.
EMPTY_NUMERIC_STATS: dict = {"min_value": 0, "max_value": 0, "mean": 0, "histogram": []}

#: Shape `size_distribution` returns when nothing is in range.
EMPTY_SIZE_DISTRIBUTION: dict = {"small": 0, "medium": 0, "large": 0}


def scope_ids(ids_query: Select) -> Select:
    """An ``IN``-able projection of a scope, isolated from the enclosing query's FROM list.

    Wrapping the scope in ``.subquery()`` before selecting from it is what stops SQLAlchemy auto-correlating it against an outer query that mentions the same tables (`shared_images`, `project_images`). A correlated scope silently degenerates into a per-row identity test, which reads as "the filter did nothing" rather than as an error. `AnalyticsRepository` uses the same two-step spelling for the same reason.
    """
    return select(ids_query.subquery().c.id)


class ImageScopeRepository:
    """Counts and distributions over an image scope, computed in SQL."""

    @staticmethod
    def filtered_scope(
        project_id: int,
        filters: ImageFilterParams,
        excluded_image_ids: list | None = None,
    ) -> Select:
        """The images matching ``filters`` minus ``excluded_image_ids``, as a statement.

        The statement form of what `ProjectImageRepository.resolve_filtered_image_ids` returns as a list. A bulk action takes this rather than the list so the size of the match set stops deciding how much data crosses into Python.
        """
        ids_query = ProjectImageRepository.filtered_image_ids_subquery(project_id, filters)
        if excluded_image_ids:
            ids_query = ids_query.where(shared_images.c.id.notin_(excluded_image_ids))
        return ids_query

    @staticmethod
    async def count_scope(connection: AsyncConnection, ids_query: Select) -> int:
        """How many images the scope matches. One statement, no ids in Python."""
        stmt = select(func.count()).select_from(ids_query.subquery())
        return (await connection.execute(stmt)).scalar() or 0

    @staticmethod
    async def size_distribution(
        connection: AsyncConnection,
        project_id: int,
        ids_query: Select | None = None,
    ) -> dict:
        """Megapixel buckets — small (<0.5MP), medium (0.5-2MP), large (>2MP) — over the scope.

        ``ids_query`` is ``None`` for "no filter", in which case the buckets cover the whole pool.
        """
        megapixels = shared_images.c.width * shared_images.c.height

        stmt = (
            select(
                func.sum(case((megapixels < 500000, 1), else_=0)).label("small"),
                func.sum(
                    case((megapixels >= 500000, 1), else_=0)
                    * case((megapixels < 2000000, 1), else_=0)
                ).label("medium"),
                func.sum(case((megapixels >= 2000000, 1), else_=0)).label("large"),
            )
            .select_from(shared_images)
            .join(project_images, shared_images.c.id == project_images.c.shared_image_id)
            .where(project_images.c.project_id == project_id)
            .where(shared_images.c.width.isnot(None))
            .where(shared_images.c.height.isnot(None))
        )
        if ids_query is not None:
            stmt = stmt.where(project_images.c.shared_image_id.in_(scope_ids(ids_query)))

        row = (await connection.execute(stmt)).fetchone()
        if not row:
            return dict(EMPTY_SIZE_DISTRIBUTION)
        return {
            "small": int(row.small or 0),
            "medium": int(row.medium or 0),
            "large": int(row.large or 0),
        }

    @staticmethod
    async def numeric_column_stats(
        connection: AsyncConnection,
        project_id: int,
        column,
        ids_query: Select | None = None,
        num_buckets: int = 20,
    ) -> dict:
        """Min, max, mean, and an equal-width histogram of a `shared_images` column over the scope.

        Same answer as `ProjectImageRepository.get_numeric_stats`, reached without materialising the scope. ``column`` is a `shared_images` column (`width`, `height`, `file_size_bytes`); ``ids_query`` is ``None`` for "no filter".
        """
        base_where = [
            project_images.c.project_id == project_id,
            column.isnot(None),
        ]
        if ids_query is not None:
            base_where.append(project_images.c.shared_image_id.in_(scope_ids(ids_query)))

        stats_stmt = (
            select(
                func.min(column).label("min_value"),
                func.max(column).label("max_value"),
                func.avg(column).label("mean"),
                func.count().label("total"),
            )
            .select_from(project_images)
            .join(shared_images, project_images.c.shared_image_id == shared_images.c.id)
            .where(*base_where)
        )
        stats = (await connection.execute(stats_stmt)).fetchone()

        if not stats or stats.total == 0:
            return dict(EMPTY_NUMERIC_STATS)

        min_val = float(stats.min_value)
        max_val = float(stats.max_value)
        mean_val = float(stats.mean)

        if min_val == max_val:
            histogram = [{"bucket_start": min_val, "bucket_end": max_val, "count": stats.total}]
        else:
            bucket_width = (max_val - min_val) / num_buckets
            # literal() keeps the bounds as SQL literals rather than bound parameters, and the same
            # expression object is reused in SELECT and GROUP BY: two separately built expressions
            # bind their own placeholders, which Postgres refuses to treat as one grouping key.
            bucket_expr = func.floor((column - literal(min_val)) / literal(bucket_width))
            histogram_stmt = (
                select(
                    bucket_expr.label("bucket"),
                    func.count().label("count"),
                )
                .select_from(project_images)
                .join(shared_images, project_images.c.shared_image_id == shared_images.c.id)
                .where(*base_where)
                .group_by(bucket_expr)
                .order_by("bucket")
            )
            histogram = []
            for row in (await connection.execute(histogram_stmt)).fetchall():
                bucket_idx = int(row.bucket) if row.bucket is not None else 0
                bucket_idx = min(bucket_idx, num_buckets - 1)  # Clamp to last bucket
                bucket_start = min_val + bucket_idx * bucket_width
                histogram.append(
                    {
                        "bucket_start": bucket_start,
                        "bucket_end": bucket_start + bucket_width,
                        "count": row.count,
                    }
                )

        return {
            "min_value": min_val,
            "max_value": max_val,
            "mean": mean_val,
            "histogram": histogram,
        }
