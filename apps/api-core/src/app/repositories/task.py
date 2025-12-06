"""Repository layer for Task data access."""

from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import delete, func, insert, select, update
from sqlalchemy.ext.asyncio import AsyncConnection

from app.models.job import jobs
from app.models.task import tasks


class TaskRepository:
    """Async repository for task operations."""

    @staticmethod
    async def get_by_id(connection: AsyncConnection, task_id: UUID) -> dict | None:
        """Get task by ID."""
        stmt = select(tasks).where(tasks.c.id == task_id)
        result = await connection.execute(stmt)
        row = result.fetchone()
        return dict(row._mapping) if row else None

    @staticmethod
    async def list_for_project(
        connection: AsyncConnection,
        project_id: UUID,
        status: str | None = None,
    ) -> list[dict]:
        """List all tasks for a project."""
        stmt = select(tasks).where(tasks.c.project_id == project_id)
        
        if status:
            stmt = stmt.where(tasks.c.status == status)
        
        stmt = stmt.order_by(tasks.c.created_at.desc())
        result = await connection.execute(stmt)
        return [dict(row._mapping) for row in result.fetchall()]

    @staticmethod
    async def list_for_user(
        connection: AsyncConnection,
        user_id: UUID,
        status: str | None = None,
    ) -> list[dict]:
        """List tasks assigned to a user."""
        stmt = select(tasks).where(tasks.c.assignee_id == user_id)
        
        if status:
            stmt = stmt.where(tasks.c.status == status)
        
        stmt = stmt.order_by(tasks.c.created_at.desc())
        result = await connection.execute(stmt)
        return [dict(row._mapping) for row in result.fetchall()]

    @staticmethod
    async def create(connection: AsyncConnection, project_id: UUID, data: dict) -> dict:
        """Create a new task."""
        data["project_id"] = project_id
        stmt = insert(tasks).values(**data).returning(tasks)
        result = await connection.execute(stmt)
        row = result.fetchone()
        return dict(row._mapping)

    @staticmethod
    async def update(connection: AsyncConnection, task_id: UUID, data: dict) -> dict | None:
        """Update a task."""
        data["updated_at"] = datetime.now(timezone.utc)
        stmt = update(tasks).where(tasks.c.id == task_id).values(**data).returning(tasks)
        result = await connection.execute(stmt)
        row = result.fetchone()
        return dict(row._mapping) if row else None

    @staticmethod
    async def delete(connection: AsyncConnection, task_id: UUID) -> bool:
        """Delete a task (cascade deletes jobs)."""
        stmt = delete(tasks).where(tasks.c.id == task_id)
        result = await connection.execute(stmt)
        return result.rowcount > 0

    @staticmethod
    async def get_job_count(connection: AsyncConnection, task_id: UUID) -> int:
        """Get count of jobs in task."""
        stmt = select(func.count()).select_from(jobs).where(jobs.c.task_id == task_id)
        result = await connection.execute(stmt)
        return result.scalar() or 0

    @staticmethod
    async def increment_version(connection: AsyncConnection, task_id: UUID) -> None:
        """Increment task version (called on annotation changes)."""
        stmt = (
            update(tasks)
            .where(tasks.c.id == task_id)
            .values(
                version=tasks.c.version + 1,
                updated_at=datetime.now(timezone.utc),
            )
        )
        await connection.execute(stmt)

    @staticmethod
    async def update_image_counts(
        connection: AsyncConnection,
        task_id: UUID,
        total: int,
        annotated: int,
    ) -> None:
        """Update cached image counts."""
        stmt = (
            update(tasks)
            .where(tasks.c.id == task_id)
            .values(
                total_images=total,
                annotated_images=annotated,
                updated_at=datetime.now(timezone.utc),
            )
        )
        await connection.execute(stmt)
