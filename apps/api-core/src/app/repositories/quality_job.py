"""Repository layer for Quality Jobs data access."""

from datetime import datetime, timezone
from typing import Literal
from uuid import UUID

from sqlalchemy import func, insert, select, update
from sqlalchemy.ext.asyncio import AsyncConnection

from app.models.image_quality import quality_jobs


QualityJobStatus = Literal["pending", "processing", "completed", "failed", "cancelled"]


class QualityJobRepository:
    """Async repository for quality job operations."""

    @staticmethod
    async def create(
        connection: AsyncConnection,
        project_id: int,
        total_images: int,
        celery_task_id: str | None = None,
    ) -> dict:
        """Create a new quality processing job."""
        stmt = (
            insert(quality_jobs)
            .values(
                project_id=project_id,
                total_images=total_images,
                status="pending",
                celery_task_id=celery_task_id,
            )
            .returning(quality_jobs)
        )
        result = await connection.execute(stmt)
        return dict(result.fetchone()._mapping)

    @staticmethod
    async def get_by_id(connection: AsyncConnection, job_id: UUID) -> dict | None:
        """Get a quality job by ID."""
        stmt = select(quality_jobs).where(quality_jobs.c.id == job_id)
        result = await connection.execute(stmt)
        row = result.fetchone()
        return dict(row._mapping) if row else None

    @staticmethod
    async def get_active_for_project(
        connection: AsyncConnection, project_id: int
    ) -> dict | None:
        """Get the active (pending/processing) quality job for a project."""
        stmt = (
            select(quality_jobs)
            .where(quality_jobs.c.project_id == project_id)
            .where(quality_jobs.c.status.in_(["pending", "processing"]))
            .order_by(quality_jobs.c.created_at.desc())
            .limit(1)
        )
        result = await connection.execute(stmt)
        row = result.fetchone()
        return dict(row._mapping) if row else None

    @staticmethod
    async def get_latest_for_project(
        connection: AsyncConnection, project_id: int
    ) -> dict | None:
        """Get the most recent quality job for a project."""
        stmt = (
            select(quality_jobs)
            .where(quality_jobs.c.project_id == project_id)
            .order_by(quality_jobs.c.created_at.desc())
            .limit(1)
        )
        result = await connection.execute(stmt)
        row = result.fetchone()
        return dict(row._mapping) if row else None

    @staticmethod
    async def update_status(
        connection: AsyncConnection,
        job_id: UUID,
        status: QualityJobStatus,
        error_message: str | None = None,
    ) -> dict | None:
        """Update the status of a quality job."""
        data: dict = {
            "status": status,
            "updated_at": datetime.now(timezone.utc),
        }
        if error_message:
            data["error_message"] = error_message
        if status == "processing":
            data["started_at"] = datetime.now(timezone.utc)
        if status in ("completed", "failed", "cancelled"):
            data["completed_at"] = datetime.now(timezone.utc)

        stmt = (
            update(quality_jobs)
            .where(quality_jobs.c.id == job_id)
            .values(**data)
            .returning(quality_jobs)
        )
        result = await connection.execute(stmt)
        row = result.fetchone()
        return dict(row._mapping) if row else None

    @staticmethod
    async def update_progress(
        connection: AsyncConnection,
        job_id: UUID,
        processed_count: int,
        failed_count: int,
    ) -> dict | None:
        """Update the progress counters of a quality job."""
        stmt = (
            update(quality_jobs)
            .where(quality_jobs.c.id == job_id)
            .values(
                processed_count=processed_count,
                failed_count=failed_count,
                updated_at=datetime.now(timezone.utc),
            )
            .returning(quality_jobs)
        )
        result = await connection.execute(stmt)
        row = result.fetchone()
        return dict(row._mapping) if row else None

    @staticmethod
    async def update_celery_task_id(
        connection: AsyncConnection,
        job_id: UUID,
        celery_task_id: str,
    ) -> dict | None:
        """Update the Celery task ID for a quality job."""
        stmt = (
            update(quality_jobs)
            .where(quality_jobs.c.id == job_id)
            .values(
                celery_task_id=celery_task_id,
                updated_at=datetime.now(timezone.utc),
            )
            .returning(quality_jobs)
        )
        result = await connection.execute(stmt)
        row = result.fetchone()
        return dict(row._mapping) if row else None

    @staticmethod
    async def get_jobs_for_project(
        connection: AsyncConnection,
        project_id: int,
        limit: int = 10,
    ) -> list[dict]:
        """Get recent quality jobs for a project."""
        stmt = (
            select(quality_jobs)
            .where(quality_jobs.c.project_id == project_id)
            .order_by(quality_jobs.c.created_at.desc())
            .limit(limit)
        )
        result = await connection.execute(stmt)
        return [dict(row._mapping) for row in result.fetchall()]
