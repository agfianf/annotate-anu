"""Repository layer for Job data access."""

from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import delete, func, insert, select, update
from sqlalchemy.ext.asyncio import AsyncConnection

from app.models.image import images
from app.models.job import jobs
from app.models.user import users


class JobRepository:
    """Async repository for job operations."""

    @staticmethod
    async def get_by_id(connection: AsyncConnection, job_id: int) -> dict | None:
        """Get job by ID."""
        stmt = select(jobs).where(jobs.c.id == job_id)
        result = await connection.execute(stmt)
        row = result.fetchone()
        return dict(row._mapping) if row else None

    @staticmethod
    async def list_for_task(
        connection: AsyncConnection,
        task_id: int,
        status: str | None = None,
        include_archived: bool = False,
    ) -> list[dict]:
        """List all jobs for a task."""
        stmt = (
            select(jobs, users.c.email, users.c.username, users.c.full_name)
            .outerjoin(users, jobs.c.assignee_id == users.c.id)
            .where(jobs.c.task_id == task_id)
        )
        
        if not include_archived:
            stmt = stmt.where(jobs.c.is_archived == False)  # noqa: E712
        
        if status:
            stmt = stmt.where(jobs.c.status == status)
        
        stmt = stmt.order_by(jobs.c.sequence_number)
        result = await connection.execute(stmt)
        
        job_list = []
        for row in result.fetchall():
            row_dict = dict(row._mapping)
            # manually construct nested user object
            if row_dict.get("assignee_id"):
                row_dict["assignee"] = {
                    "id": row_dict["assignee_id"],
                    "email": row_dict["email"],
                    "username": row_dict["username"],
                    "full_name": row_dict["full_name"],
                }
            job_list.append(row_dict)
            
        return job_list

    @staticmethod
    async def list_for_user(
        connection: AsyncConnection,
        user_id: UUID,
        status: str | None = None,
        include_archived: bool = False,
    ) -> list[dict]:
        """List jobs assigned to a user."""
        stmt = select(jobs).where(jobs.c.assignee_id == user_id)
        
        if not include_archived:
            stmt = stmt.where(jobs.c.is_archived == False)  # noqa: E712
        
        if status:
            stmt = stmt.where(jobs.c.status == status)
        
        stmt = stmt.order_by(jobs.c.created_at.desc())
        result = await connection.execute(stmt)
        return [dict(row._mapping) for row in result.fetchall()]

    @staticmethod
    async def create(connection: AsyncConnection, task_id: int, data: dict) -> dict:
        """Create a new job."""
        data["task_id"] = task_id
        stmt = insert(jobs).values(**data).returning(jobs)
        result = await connection.execute(stmt)
        row = result.fetchone()
        return dict(row._mapping)

    @staticmethod
    async def create_bulk(
        connection: AsyncConnection,
        task_id: int,
        job_count: int,
    ) -> list[dict]:
        """Create multiple jobs for a task (chunking)."""
        created_jobs = []
        for i in range(job_count):
            data = {"task_id": task_id, "sequence_number": i}
            stmt = insert(jobs).values(**data).returning(jobs)
            result = await connection.execute(stmt)
            row = result.fetchone()
            created_jobs.append(dict(row._mapping))
        return created_jobs

    @staticmethod
    async def update(connection: AsyncConnection, job_id: int, data: dict) -> dict | None:
        """Update a job."""
        data["updated_at"] = datetime.now(timezone.utc)
        stmt = update(jobs).where(jobs.c.id == job_id).values(**data).returning(jobs)
        result = await connection.execute(stmt)
        row = result.fetchone()
        return dict(row._mapping) if row else None

    @staticmethod
    async def delete(connection: AsyncConnection, job_id: int) -> bool:
        """Delete a job."""
        stmt = delete(jobs).where(jobs.c.id == job_id)
        result = await connection.execute(stmt)
        return result.rowcount > 0

    @staticmethod
    async def get_image_count(connection: AsyncConnection, job_id: int) -> int:
        """Get count of images in job."""
        stmt = select(func.count()).select_from(images).where(images.c.job_id == job_id)
        result = await connection.execute(stmt)
        return result.scalar() or 0

    @staticmethod
    async def increment_version(connection: AsyncConnection, job_id: int) -> None:
        """Increment job version (called on annotation changes)."""
        stmt = (
            update(jobs)
            .where(jobs.c.id == job_id)
            .values(
                version=jobs.c.version + 1,
                updated_at=datetime.now(timezone.utc),
            )
        )
        await connection.execute(stmt)

    @staticmethod
    async def start_work(connection: AsyncConnection, job_id: int) -> dict | None:
        """Mark job as started."""
        data = {
            "status": "in_progress",
            "started_at": datetime.now(timezone.utc),
            "updated_at": datetime.now(timezone.utc),
        }
        stmt = update(jobs).where(jobs.c.id == job_id).values(**data).returning(jobs)
        result = await connection.execute(stmt)
        row = result.fetchone()
        return dict(row._mapping) if row else None

    @staticmethod
    async def complete_work(connection: AsyncConnection, job_id: int) -> dict | None:
        """Mark job as completed."""
        data = {
            "status": "completed",
            "completed_at": datetime.now(timezone.utc),
            "updated_at": datetime.now(timezone.utc),
        }
        stmt = update(jobs).where(jobs.c.id == job_id).values(**data).returning(jobs)
        result = await connection.execute(stmt)
        row = result.fetchone()
        return dict(row._mapping) if row else None

    @staticmethod
    async def approve(
        connection: AsyncConnection,
        job_id: int,
        approved_by: UUID,
        is_approved: bool,
        rejection_reason: str | None = None,
    ) -> dict | None:
        """Approve or reject a job."""
        data = {
            "is_approved": is_approved,
            "approved_by": approved_by,
            "approved_at": datetime.now(timezone.utc),
            "status": "approved" if is_approved else "rejected",
            "rejection_reason": rejection_reason if not is_approved else None,
            "updated_at": datetime.now(timezone.utc),
        }
        stmt = update(jobs).where(jobs.c.id == job_id).values(**data).returning(jobs)
        result = await connection.execute(stmt)
        row = result.fetchone()
        return dict(row._mapping) if row else None

    @staticmethod
    async def assign(
        connection: AsyncConnection,
        job_id: int,
        assignee_id: UUID,
    ) -> dict | None:
        """Assign a job to a user. Updates status to 'assigned' if pending."""
        # Get current job to check status
        current = await JobRepository.get_by_id(connection, job_id)
        if not current:
            return None
        
        data = {
            "assignee_id": assignee_id,
            "updated_at": datetime.now(timezone.utc),
        }
        
        # Only change status to assigned if currently pending
        if current["status"] == "pending":
            data["status"] = "assigned"
        
        stmt = update(jobs).where(jobs.c.id == job_id).values(**data).returning(jobs)
        result = await connection.execute(stmt)
        row = result.fetchone()
        return dict(row._mapping) if row else None

    @staticmethod
    async def unassign(connection: AsyncConnection, job_id: int) -> dict | None:
        """Remove assignment from a job. Reverts status to 'pending' if 'assigned'."""
        current = await JobRepository.get_by_id(connection, job_id)
        if not current:
            return None
        
        data = {
            "assignee_id": None,
            "updated_at": datetime.now(timezone.utc),
        }
        
        # Only revert status if currently assigned (not in_progress or further)
        if current["status"] == "assigned":
            data["status"] = "pending"
        
        stmt = update(jobs).where(jobs.c.id == job_id).values(**data).returning(jobs)
        result = await connection.execute(stmt)
        row = result.fetchone()
        return dict(row._mapping) if row else None

