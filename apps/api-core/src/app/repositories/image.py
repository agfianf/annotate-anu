"""Repository layer for Image data access."""

from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import delete, func, insert, select, update
from sqlalchemy.ext.asyncio import AsyncConnection

from app.models.image import images


class ImageRepository:
    """Async repository for image operations."""

    @staticmethod
    async def get_by_id(connection: AsyncConnection, image_id: UUID) -> dict | None:
        """Get image by ID."""
        stmt = select(images).where(images.c.id == image_id)
        result = await connection.execute(stmt)
        row = result.fetchone()
        return dict(row._mapping) if row else None

    @staticmethod
    async def list_for_job(
        connection: AsyncConnection,
        job_id: int,
        page: int = 1,
        page_size: int = 50,
        annotated_only: bool | None = None,
    ) -> tuple[list[dict], int]:
        """List images for a job with pagination."""
        # Base query
        base_query = select(images).where(images.c.job_id == job_id)
        
        if annotated_only is not None:
            base_query = base_query.where(images.c.is_annotated == annotated_only)
        
        # Count total
        count_stmt = select(func.count()).select_from(base_query.subquery())
        total = (await connection.execute(count_stmt)).scalar() or 0
        
        # Get page
        stmt = (
            base_query
            .order_by(images.c.sequence_number)
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
        result = await connection.execute(stmt)
        items = [dict(row._mapping) for row in result.fetchall()]
        
        return items, total

    @staticmethod
    async def create(connection: AsyncConnection, job_id: int, data: dict) -> dict:
        """Create a new image."""
        data["job_id"] = job_id
        stmt = insert(images).values(**data).returning(images)
        result = await connection.execute(stmt)
        row = result.fetchone()
        return dict(row._mapping)

    @staticmethod
    async def create_bulk(
        connection: AsyncConnection,
        job_id: int,
        image_list: list[dict],
    ) -> list[dict]:
        """Bulk create images for a job."""
        created_images = []
        for data in image_list:
            data["job_id"] = job_id
            stmt = insert(images).values(**data).returning(images)
            result = await connection.execute(stmt)
            row = result.fetchone()
            created_images.append(dict(row._mapping))
        return created_images

    @staticmethod
    async def update(connection: AsyncConnection, image_id: UUID, data: dict) -> dict | None:
        """Update an image."""
        data["updated_at"] = datetime.now(timezone.utc)
        stmt = update(images).where(images.c.id == image_id).values(**data).returning(images)
        result = await connection.execute(stmt)
        row = result.fetchone()
        return dict(row._mapping) if row else None

    @staticmethod
    async def delete(connection: AsyncConnection, image_id: UUID) -> bool:
        """Delete an image."""
        stmt = delete(images).where(images.c.id == image_id)
        result = await connection.execute(stmt)
        return result.rowcount > 0

    @staticmethod
    async def mark_annotated(
        connection: AsyncConnection,
        image_id: UUID,
        is_annotated: bool = True,
    ) -> None:
        """Mark image as annotated."""
        stmt = (
            update(images)
            .where(images.c.id == image_id)
            .values(
                is_annotated=is_annotated,
                updated_at=datetime.now(timezone.utc),
            )
        )
        await connection.execute(stmt)

    @staticmethod
    async def get_annotation_stats(
        connection: AsyncConnection,
        job_id: int,
    ) -> tuple[int, int]:
        """Get total and annotated image counts for a job."""
        total_stmt = (
            select(func.count())
            .select_from(images)
            .where(images.c.job_id == job_id)
        )
        annotated_stmt = (
            select(func.count())
            .select_from(images)
            .where(images.c.job_id == job_id, images.c.is_annotated == True)  # noqa: E712
        )
        
        total = (await connection.execute(total_stmt)).scalar() or 0
        annotated = (await connection.execute(annotated_stmt)).scalar() or 0
        
        return total, annotated
