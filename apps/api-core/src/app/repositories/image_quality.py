"""Repository layer for Image Quality Metrics data access."""

from datetime import datetime, timezone
from typing import Literal
from uuid import UUID

from sqlalchemy import delete, func, insert, select, update
from sqlalchemy.ext.asyncio import AsyncConnection

from app.models.image_quality import image_quality_metrics
from app.models.data_management import project_images, shared_images


QualityStatus = Literal["pending", "processing", "completed", "failed"]


class ImageQualityRepository:
    """Async repository for image quality metrics operations."""

    @staticmethod
    async def get_by_id(connection: AsyncConnection, metric_id: UUID) -> dict | None:
        """Get quality metrics by ID."""
        stmt = select(image_quality_metrics).where(image_quality_metrics.c.id == metric_id)
        result = await connection.execute(stmt)
        row = result.fetchone()
        return dict(row._mapping) if row else None

    @staticmethod
    async def get_by_shared_image_id(
        connection: AsyncConnection, shared_image_id: UUID
    ) -> dict | None:
        """Get quality metrics by shared image ID."""
        stmt = select(image_quality_metrics).where(
            image_quality_metrics.c.shared_image_id == shared_image_id
        )
        result = await connection.execute(stmt)
        row = result.fetchone()
        return dict(row._mapping) if row else None

    @staticmethod
    async def bulk_get_by_shared_image_ids(
        connection: AsyncConnection, shared_image_ids: list[UUID]
    ) -> dict[UUID, dict]:
        """Get quality metrics for multiple shared images."""
        if not shared_image_ids:
            return {}
        stmt = select(image_quality_metrics).where(
            image_quality_metrics.c.shared_image_id.in_(shared_image_ids)
        )
        result = await connection.execute(stmt)
        return {row.shared_image_id: dict(row._mapping) for row in result.fetchall()}

    @staticmethod
    async def create(
        connection: AsyncConnection,
        shared_image_id: UUID,
        status: QualityStatus = "pending",
    ) -> dict:
        """Create a pending quality metrics record for a shared image."""
        stmt = (
            insert(image_quality_metrics)
            .values(shared_image_id=shared_image_id, status=status)
            .returning(image_quality_metrics)
        )
        result = await connection.execute(stmt)
        return dict(result.fetchone()._mapping)

    @staticmethod
    async def bulk_create_pending(
        connection: AsyncConnection, shared_image_ids: list[UUID]
    ) -> list[dict]:
        """Create pending quality metrics records for multiple shared images."""
        if not shared_image_ids:
            return []

        created = []
        for sid in shared_image_ids:
            # Check if already exists
            existing = await ImageQualityRepository.get_by_shared_image_id(connection, sid)
            if existing:
                created.append(existing)
            else:
                stmt = (
                    insert(image_quality_metrics)
                    .values(shared_image_id=sid, status="pending")
                    .returning(image_quality_metrics)
                )
                result = await connection.execute(stmt)
                created.append(dict(result.fetchone()._mapping))
        return created

    @staticmethod
    async def update_metrics(
        connection: AsyncConnection,
        shared_image_id: UUID,
        metrics_data: dict,
    ) -> dict | None:
        """Update quality metrics for a shared image."""
        metrics_data["updated_at"] = datetime.now(timezone.utc)
        stmt = (
            update(image_quality_metrics)
            .where(image_quality_metrics.c.shared_image_id == shared_image_id)
            .values(**metrics_data)
            .returning(image_quality_metrics)
        )
        result = await connection.execute(stmt)
        row = result.fetchone()
        return dict(row._mapping) if row else None

    @staticmethod
    async def update_status(
        connection: AsyncConnection,
        shared_image_id: UUID,
        status: QualityStatus,
        error_message: str | None = None,
    ) -> dict | None:
        """Update the status of a quality metrics record."""
        data = {
            "status": status,
            "updated_at": datetime.now(timezone.utc),
        }
        if error_message:
            data["error_message"] = error_message
        if status == "completed":
            data["computed_at"] = datetime.now(timezone.utc)

        stmt = (
            update(image_quality_metrics)
            .where(image_quality_metrics.c.shared_image_id == shared_image_id)
            .values(**data)
            .returning(image_quality_metrics)
        )
        result = await connection.execute(stmt)
        row = result.fetchone()
        return dict(row._mapping) if row else None

    @staticmethod
    async def get_pending_for_project(
        connection: AsyncConnection,
        project_id: int,
        limit: int = 100,
    ) -> list[dict]:
        """Get pending quality metrics for a project (for background processing)."""
        stmt = (
            select(image_quality_metrics, shared_images.c.file_path)
            .join(shared_images, image_quality_metrics.c.shared_image_id == shared_images.c.id)
            .join(project_images, shared_images.c.id == project_images.c.shared_image_id)
            .where(project_images.c.project_id == project_id)
            .where(image_quality_metrics.c.status == "pending")
            .limit(limit)
        )
        result = await connection.execute(stmt)
        return [dict(row._mapping) for row in result.fetchall()]

    @staticmethod
    async def get_images_without_metrics(
        connection: AsyncConnection,
        project_id: int,
        limit: int = 100,
    ) -> list[dict]:
        """Get shared images in a project that don't have quality metrics."""
        subq = select(image_quality_metrics.c.shared_image_id)
        stmt = (
            select(shared_images.c.id, shared_images.c.file_path)
            .join(project_images, shared_images.c.id == project_images.c.shared_image_id)
            .where(project_images.c.project_id == project_id)
            .where(~shared_images.c.id.in_(subq))
            .limit(limit)
        )
        result = await connection.execute(stmt)
        return [dict(row._mapping) for row in result.fetchall()]

    @staticmethod
    async def get_statistics_for_project(
        connection: AsyncConnection,
        project_id: int,
        shared_image_ids: list[UUID] | None = None,
    ) -> dict:
        """Get quality metrics statistics for a project (or filtered subset)."""
        # Build base query joining to project_images
        base_query = (
            select(image_quality_metrics)
            .join(project_images, image_quality_metrics.c.shared_image_id == project_images.c.shared_image_id)
            .where(project_images.c.project_id == project_id)
        )

        if shared_image_ids:
            base_query = base_query.where(
                image_quality_metrics.c.shared_image_id.in_(shared_image_ids)
            )

        # Get status counts
        status_stmt = (
            select(
                image_quality_metrics.c.status,
                func.count().label("count"),
            )
            .select_from(image_quality_metrics)
            .join(project_images, image_quality_metrics.c.shared_image_id == project_images.c.shared_image_id)
            .where(project_images.c.project_id == project_id)
        )
        if shared_image_ids:
            status_stmt = status_stmt.where(
                image_quality_metrics.c.shared_image_id.in_(shared_image_ids)
            )
        status_stmt = status_stmt.group_by(image_quality_metrics.c.status)

        status_result = await connection.execute(status_stmt)
        status_counts = {row.status: row.count for row in status_result.fetchall()}

        # Get aggregate metrics (only for completed)
        agg_stmt = (
            select(
                func.avg(image_quality_metrics.c.sharpness).label("avg_sharpness"),
                func.avg(image_quality_metrics.c.brightness).label("avg_brightness"),
                func.avg(image_quality_metrics.c.contrast).label("avg_contrast"),
                func.avg(image_quality_metrics.c.uniqueness).label("avg_uniqueness"),
                func.avg(image_quality_metrics.c.red_avg).label("avg_red"),
                func.avg(image_quality_metrics.c.green_avg).label("avg_green"),
                func.avg(image_quality_metrics.c.blue_avg).label("avg_blue"),
                func.avg(image_quality_metrics.c.overall_quality).label("avg_overall"),
            )
            .select_from(image_quality_metrics)
            .join(project_images, image_quality_metrics.c.shared_image_id == project_images.c.shared_image_id)
            .where(project_images.c.project_id == project_id)
            .where(image_quality_metrics.c.status == "completed")
        )
        if shared_image_ids:
            agg_stmt = agg_stmt.where(
                image_quality_metrics.c.shared_image_id.in_(shared_image_ids)
            )

        agg_result = await connection.execute(agg_stmt)
        agg_row = agg_result.fetchone()

        return {
            "status_counts": {
                "pending": status_counts.get("pending", 0),
                "processing": status_counts.get("processing", 0),
                "completed": status_counts.get("completed", 0),
                "failed": status_counts.get("failed", 0),
            },
            "averages": {
                "sharpness": float(agg_row.avg_sharpness) if agg_row.avg_sharpness else None,
                "brightness": float(agg_row.avg_brightness) if agg_row.avg_brightness else None,
                "contrast": float(agg_row.avg_contrast) if agg_row.avg_contrast else None,
                "uniqueness": float(agg_row.avg_uniqueness) if agg_row.avg_uniqueness else None,
                "red_avg": float(agg_row.avg_red) if agg_row.avg_red else None,
                "green_avg": float(agg_row.avg_green) if agg_row.avg_green else None,
                "blue_avg": float(agg_row.avg_blue) if agg_row.avg_blue else None,
                "overall_quality": float(agg_row.avg_overall) if agg_row.avg_overall else None,
            },
        }

    @staticmethod
    async def get_quality_distribution(
        connection: AsyncConnection,
        project_id: int,
        shared_image_ids: list[UUID] | None = None,
    ) -> list[dict]:
        """Get quality score distribution for histograms.

        Returns list of completed metrics with their scores.
        """
        stmt = (
            select(
                image_quality_metrics.c.shared_image_id,
                image_quality_metrics.c.sharpness,
                image_quality_metrics.c.brightness,
                image_quality_metrics.c.contrast,
                image_quality_metrics.c.uniqueness,
                image_quality_metrics.c.red_avg,
                image_quality_metrics.c.green_avg,
                image_quality_metrics.c.blue_avg,
                image_quality_metrics.c.overall_quality,
                image_quality_metrics.c.issues,
            )
            .join(project_images, image_quality_metrics.c.shared_image_id == project_images.c.shared_image_id)
            .where(project_images.c.project_id == project_id)
            .where(image_quality_metrics.c.status == "completed")
        )
        if shared_image_ids:
            stmt = stmt.where(image_quality_metrics.c.shared_image_id.in_(shared_image_ids))

        result = await connection.execute(stmt)
        return [dict(row._mapping) for row in result.fetchall()]

    @staticmethod
    async def get_flagged_images(
        connection: AsyncConnection,
        project_id: int,
        issue_types: list[str] | None = None,
        limit: int = 50,
    ) -> list[dict]:
        """Get images with quality issues."""
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
            .join(shared_images, image_quality_metrics.c.shared_image_id == shared_images.c.id)
            .join(project_images, shared_images.c.id == project_images.c.shared_image_id)
            .where(project_images.c.project_id == project_id)
            .where(image_quality_metrics.c.status == "completed")
            .where(func.jsonb_array_length(image_quality_metrics.c.issues) > 0)
            .order_by(image_quality_metrics.c.overall_quality.asc())
            .limit(limit)
        )

        result = await connection.execute(stmt)
        return [dict(row._mapping) for row in result.fetchall()]

    @staticmethod
    async def get_duplicate_groups(
        connection: AsyncConnection,
        project_id: int,
    ) -> list[list[UUID]]:
        """Get groups of duplicate images based on perceptual hash."""
        stmt = (
            select(
                image_quality_metrics.c.perceptual_hash,
                func.array_agg(image_quality_metrics.c.shared_image_id).label("image_ids"),
                func.count().label("count"),
            )
            .join(project_images, image_quality_metrics.c.shared_image_id == project_images.c.shared_image_id)
            .where(project_images.c.project_id == project_id)
            .where(image_quality_metrics.c.status == "completed")
            .where(image_quality_metrics.c.perceptual_hash.isnot(None))
            .group_by(image_quality_metrics.c.perceptual_hash)
            .having(func.count() > 1)
        )

        result = await connection.execute(stmt)
        return [list(row.image_ids) for row in result.fetchall()]

    @staticmethod
    async def delete_by_shared_image_id(
        connection: AsyncConnection, shared_image_id: UUID
    ) -> bool:
        """Delete quality metrics for a shared image."""
        stmt = delete(image_quality_metrics).where(
            image_quality_metrics.c.shared_image_id == shared_image_id
        )
        result = await connection.execute(stmt)
        return result.rowcount > 0

    @staticmethod
    async def count_images_without_metrics(
        connection: AsyncConnection, project_id: int
    ) -> int:
        """Count images in project that don't have quality metrics records.

        Uses COUNT(*) aggregate for accurate counting (not limit=1).
        """
        subq = select(image_quality_metrics.c.shared_image_id)
        stmt = (
            select(func.count())
            .select_from(shared_images)
            .join(project_images, shared_images.c.id == project_images.c.shared_image_id)
            .where(project_images.c.project_id == project_id)
            .where(~shared_images.c.id.in_(subq))
        )
        result = await connection.execute(stmt)
        return result.scalar() or 0

    @staticmethod
    async def count_pending_for_project(
        connection: AsyncConnection, project_id: int
    ) -> int:
        """Count pending quality metrics for a project.

        Uses COUNT(*) aggregate for accurate counting (not limit=1).
        """
        stmt = (
            select(func.count())
            .select_from(image_quality_metrics)
            .join(
                project_images,
                image_quality_metrics.c.shared_image_id == project_images.c.shared_image_id,
            )
            .where(project_images.c.project_id == project_id)
            .where(image_quality_metrics.c.status == "pending")
        )
        result = await connection.execute(stmt)
        return result.scalar() or 0

    @staticmethod
    async def count_processing_for_project(
        connection: AsyncConnection, project_id: int
    ) -> int:
        """Count currently processing quality metrics for a project."""
        stmt = (
            select(func.count())
            .select_from(image_quality_metrics)
            .join(
                project_images,
                image_quality_metrics.c.shared_image_id == project_images.c.shared_image_id,
            )
            .where(project_images.c.project_id == project_id)
            .where(image_quality_metrics.c.status == "processing")
        )
        result = await connection.execute(stmt)
        return result.scalar() or 0

    @staticmethod
    async def count_total_for_project(
        connection: AsyncConnection, project_id: int
    ) -> int:
        """Count total images in project (for quality job total)."""
        stmt = (
            select(func.count())
            .select_from(project_images)
            .where(project_images.c.project_id == project_id)
        )
        result = await connection.execute(stmt)
        return result.scalar() or 0
