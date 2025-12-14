"""Repository layer for SharedImageTag (junction) data access - project-scoped."""

from uuid import UUID

from sqlalchemy import delete, insert, select
from sqlalchemy.ext.asyncio import AsyncConnection

from app.models.data_management import shared_image_tags, shared_images, tags


class SharedImageTagRepository:
    """Async repository for project-scoped shared image tag operations."""

    @staticmethod
    async def add_tag(
        connection: AsyncConnection,
        project_id: int,
        shared_image_id: UUID,
        tag_id: UUID,
        user_id: UUID | None = None,
    ) -> dict | None:
        """Add a tag to an image in a project. Returns None if already exists."""
        # Check if already exists
        existing = await SharedImageTagRepository.get_link(
            connection, project_id, shared_image_id, tag_id
        )
        if existing:
            return existing

        data = {
            "project_id": project_id,
            "shared_image_id": shared_image_id,
            "tag_id": tag_id,
            "created_by": user_id,
        }
        stmt = insert(shared_image_tags).values(**data).returning(shared_image_tags)
        result = await connection.execute(stmt)
        row = result.fetchone()
        return dict(row._mapping) if row else None

    @staticmethod
    async def remove_tag(
        connection: AsyncConnection,
        project_id: int,
        shared_image_id: UUID,
        tag_id: UUID,
    ) -> bool:
        """Remove a tag from an image in a project."""
        stmt = delete(shared_image_tags).where(
            shared_image_tags.c.project_id == project_id,
            shared_image_tags.c.shared_image_id == shared_image_id,
            shared_image_tags.c.tag_id == tag_id,
        )
        result = await connection.execute(stmt)
        return result.rowcount > 0

    @staticmethod
    async def get_link(
        connection: AsyncConnection,
        project_id: int,
        shared_image_id: UUID,
        tag_id: UUID,
    ) -> dict | None:
        """Get the link between image and tag in a project."""
        stmt = select(shared_image_tags).where(
            shared_image_tags.c.project_id == project_id,
            shared_image_tags.c.shared_image_id == shared_image_id,
            shared_image_tags.c.tag_id == tag_id,
        )
        result = await connection.execute(stmt)
        row = result.fetchone()
        return dict(row._mapping) if row else None

    @staticmethod
    async def get_tags_for_image(
        connection: AsyncConnection,
        project_id: int,
        shared_image_id: UUID,
    ) -> list[dict]:
        """Get all tags for an image in a project."""
        stmt = (
            select(tags)
            .join(shared_image_tags, tags.c.id == shared_image_tags.c.tag_id)
            .where(
                shared_image_tags.c.project_id == project_id,
                shared_image_tags.c.shared_image_id == shared_image_id,
            )
            .order_by(tags.c.name)
        )
        result = await connection.execute(stmt)
        return [dict(row._mapping) for row in result.fetchall()]

    @staticmethod
    async def get_images_for_tag(
        connection: AsyncConnection,
        project_id: int,
        tag_id: UUID,
        page: int = 1,
        page_size: int = 50,
    ) -> tuple[list[dict], int]:
        """Get all images with a specific tag in a project."""
        from sqlalchemy import func

        # Base query
        base_query = (
            select(shared_images)
            .join(shared_image_tags, shared_images.c.id == shared_image_tags.c.shared_image_id)
            .where(
                shared_image_tags.c.project_id == project_id,
                shared_image_tags.c.tag_id == tag_id,
            )
        )

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
    async def bulk_add_tags(
        connection: AsyncConnection,
        project_id: int,
        shared_image_ids: list[UUID],
        tag_ids: list[UUID],
        user_id: UUID | None = None,
    ) -> int:
        """Bulk add tags to multiple images in a project. Returns count of new links created."""
        count = 0
        for image_id in shared_image_ids:
            for tag_id in tag_ids:
                result = await SharedImageTagRepository.add_tag(
                    connection, project_id, image_id, tag_id, user_id
                )
                if result:
                    count += 1
        return count

    @staticmethod
    async def bulk_remove_tags(
        connection: AsyncConnection,
        project_id: int,
        shared_image_ids: list[UUID],
        tag_ids: list[UUID],
    ) -> int:
        """Bulk remove tags from multiple images in a project. Returns count of links removed."""
        count = 0
        for image_id in shared_image_ids:
            for tag_id in tag_ids:
                removed = await SharedImageTagRepository.remove_tag(
                    connection, project_id, image_id, tag_id
                )
                if removed:
                    count += 1
        return count

    @staticmethod
    async def clear_image_tags(
        connection: AsyncConnection,
        project_id: int,
        shared_image_id: UUID,
    ) -> int:
        """Remove all tags from an image in a project."""
        stmt = delete(shared_image_tags).where(
            shared_image_tags.c.project_id == project_id,
            shared_image_tags.c.shared_image_id == shared_image_id,
        )
        result = await connection.execute(stmt)
        return result.rowcount
