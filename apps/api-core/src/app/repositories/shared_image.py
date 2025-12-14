"""Repository layer for SharedImage data access."""

from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import delete, func, insert, select, update
from sqlalchemy.ext.asyncio import AsyncConnection

from app.models.data_management import shared_images, shared_image_tags, tags


class SharedImageRepository:
    """Async repository for shared image operations."""

    @staticmethod
    async def get_by_id(connection: AsyncConnection, image_id: UUID) -> dict | None:
        """Get shared image by ID."""
        stmt = select(shared_images).where(shared_images.c.id == image_id)
        result = await connection.execute(stmt)
        row = result.fetchone()
        return dict(row._mapping) if row else None

    @staticmethod
    async def get_by_file_path(connection: AsyncConnection, file_path: str) -> dict | None:
        """Get shared image by file path."""
        stmt = select(shared_images).where(shared_images.c.file_path == file_path)
        result = await connection.execute(stmt)
        row = result.fetchone()
        return dict(row._mapping) if row else None

    @staticmethod
    async def get_by_checksum(connection: AsyncConnection, checksum: str) -> dict | None:
        """Find image by checksum (for deduplication)."""
        stmt = select(shared_images).where(shared_images.c.checksum_sha256 == checksum)
        result = await connection.execute(stmt)
        row = result.fetchone()
        return dict(row._mapping) if row else None

    @staticmethod
    async def list_all(
        connection: AsyncConnection,
        page: int = 1,
        page_size: int = 50,
        search: str | None = None,
        tag_ids: list[UUID] | None = None,
    ) -> tuple[list[dict], int]:
        """List all shared images with pagination and filtering."""
        # Base query
        base_query = select(shared_images)

        if search:
            base_query = base_query.where(
                shared_images.c.filename.ilike(f"%{search}%")
            )

        if tag_ids:
            # Filter by tags - image must have ALL specified tags
            for tag_id in tag_ids:
                subquery = (
                    select(shared_image_tags.c.shared_image_id)
                    .where(shared_image_tags.c.tag_id == tag_id)
                )
                base_query = base_query.where(shared_images.c.id.in_(subquery))

        # Count total
        count_stmt = select(func.count()).select_from(base_query.subquery())
        total = (await connection.execute(count_stmt)).scalar() or 0

        # Get page
        stmt = (
            base_query
            .order_by(shared_images.c.created_at.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
        result = await connection.execute(stmt)
        items = [dict(row._mapping) for row in result.fetchall()]

        return items, total

    @staticmethod
    async def create(connection: AsyncConnection, data: dict) -> dict:
        """Register a new shared image."""
        stmt = insert(shared_images).values(**data).returning(shared_images)
        result = await connection.execute(stmt)
        row = result.fetchone()
        return dict(row._mapping)

    @staticmethod
    async def create_bulk(connection: AsyncConnection, image_list: list[dict]) -> list[dict]:
        """Bulk register shared images."""
        created = []
        for data in image_list:
            # Check if already exists
            existing = await SharedImageRepository.get_by_file_path(connection, data["file_path"])
            if existing:
                created.append(existing)
            else:
                stmt = insert(shared_images).values(**data).returning(shared_images)
                result = await connection.execute(stmt)
                row = result.fetchone()
                created.append(dict(row._mapping))
        return created

    @staticmethod
    async def update(connection: AsyncConnection, image_id: UUID, data: dict) -> dict | None:
        """Update a shared image."""
        data["updated_at"] = datetime.now(timezone.utc)
        stmt = (
            update(shared_images)
            .where(shared_images.c.id == image_id)
            .values(**data)
            .returning(shared_images)
        )
        result = await connection.execute(stmt)
        row = result.fetchone()
        return dict(row._mapping) if row else None

    @staticmethod
    async def delete(connection: AsyncConnection, image_id: UUID) -> bool:
        """Delete a shared image."""
        stmt = delete(shared_images).where(shared_images.c.id == image_id)
        result = await connection.execute(stmt)
        return result.rowcount > 0

    @staticmethod
    async def get_tags(connection: AsyncConnection, image_id: UUID, project_id: int) -> list[dict]:
        """Get all tags for a shared image in a specific project context."""
        stmt = (
            select(tags)
            .join(shared_image_tags, tags.c.id == shared_image_tags.c.tag_id)
            .where(
                shared_image_tags.c.shared_image_id == image_id,
                shared_image_tags.c.project_id == project_id,
            )
            .order_by(tags.c.name)
        )
        result = await connection.execute(stmt)
        return [dict(row._mapping) for row in result.fetchall()]

    @staticmethod
    async def exists_by_paths(
        connection: AsyncConnection,
        file_paths: list[str],
    ) -> dict[str, UUID]:
        """Check which file paths already exist and return their IDs."""
        if not file_paths:
            return {}

        stmt = (
            select(shared_images.c.file_path, shared_images.c.id)
            .where(shared_images.c.file_path.in_(file_paths))
        )
        result = await connection.execute(stmt)
        return {row.file_path: row.id for row in result.fetchall()}

    @staticmethod
    async def get_associated_jobs(
        connection: AsyncConnection,
        shared_image_id: UUID,
    ) -> list[dict]:
        """Get all jobs and tasks that include this shared image."""
        from app.models.image import images
        from app.models.job import jobs
        from app.models.task import tasks
        from app.models.user import users

        stmt = (
            select(
                jobs.c.id.label('job_id'),
                jobs.c.status.label('job_status'),
                jobs.c.sequence_number.label('job_sequence'),
                jobs.c.is_archived.label('job_is_archived'),
                tasks.c.id.label('task_id'),
                tasks.c.name.label('task_name'),
                tasks.c.status.label('task_status'),
                tasks.c.is_archived.label('task_is_archived'),
                jobs.c.assignee_id,
                users.c.email.label('assignee_email'),
            )
            .join(jobs, images.c.job_id == jobs.c.id)
            .join(tasks, jobs.c.task_id == tasks.c.id)
            .outerjoin(users, jobs.c.assignee_id == users.c.id)
            .where(images.c.shared_image_id == shared_image_id)
            .order_by(tasks.c.id, jobs.c.sequence_number)
        )

        result = await connection.execute(stmt)
        return [dict(row._mapping) for row in result.fetchall()]
