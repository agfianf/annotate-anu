"""Repository layer for Tag data access."""

from uuid import UUID

from sqlalchemy import delete, func, insert, select, update
from sqlalchemy.ext.asyncio import AsyncConnection

from app.models.data_management import shared_image_tags, tags


class TagRepository:
    """Async repository for tag operations."""

    @staticmethod
    async def get_by_id(connection: AsyncConnection, tag_id: UUID) -> dict | None:
        """Get tag by ID."""
        stmt = select(tags).where(tags.c.id == tag_id)
        result = await connection.execute(stmt)
        row = result.fetchone()
        return dict(row._mapping) if row else None

    @staticmethod
    async def get_by_name(connection: AsyncConnection, name: str) -> dict | None:
        """Get tag by name."""
        stmt = select(tags).where(tags.c.name == name)
        result = await connection.execute(stmt)
        row = result.fetchone()
        return dict(row._mapping) if row else None

    @staticmethod
    async def list_all(
        connection: AsyncConnection,
        search: str | None = None,
    ) -> list[dict]:
        """List all tags with optional search."""
        stmt = select(tags)

        if search:
            stmt = stmt.where(tags.c.name.ilike(f"%{search}%"))

        stmt = stmt.order_by(tags.c.name)
        result = await connection.execute(stmt)
        return [dict(row._mapping) for row in result.fetchall()]

    @staticmethod
    async def list_with_usage_count(
        connection: AsyncConnection,
        search: str | None = None,
    ) -> list[dict]:
        """List all tags with usage count."""
        # Subquery for usage count
        usage_subquery = (
            select(
                shared_image_tags.c.tag_id,
                func.count().label("usage_count"),
            )
            .group_by(shared_image_tags.c.tag_id)
            .subquery()
        )

        stmt = (
            select(
                tags,
                func.coalesce(usage_subquery.c.usage_count, 0).label("usage_count"),
            )
            .outerjoin(usage_subquery, tags.c.id == usage_subquery.c.tag_id)
        )

        if search:
            stmt = stmt.where(tags.c.name.ilike(f"%{search}%"))

        stmt = stmt.order_by(tags.c.name)
        result = await connection.execute(stmt)

        items = []
        for row in result.fetchall():
            item = dict(row._mapping)
            items.append(item)
        return items

    @staticmethod
    async def create(connection: AsyncConnection, data: dict) -> dict:
        """Create a new tag."""
        stmt = insert(tags).values(**data).returning(tags)
        result = await connection.execute(stmt)
        row = result.fetchone()
        return dict(row._mapping)

    @staticmethod
    async def update(connection: AsyncConnection, tag_id: UUID, data: dict) -> dict | None:
        """Update a tag."""
        stmt = (
            update(tags)
            .where(tags.c.id == tag_id)
            .values(**data)
            .returning(tags)
        )
        result = await connection.execute(stmt)
        row = result.fetchone()
        return dict(row._mapping) if row else None

    @staticmethod
    async def delete(connection: AsyncConnection, tag_id: UUID) -> bool:
        """Delete a tag."""
        stmt = delete(tags).where(tags.c.id == tag_id)
        result = await connection.execute(stmt)
        return result.rowcount > 0

    @staticmethod
    async def get_usage_count(connection: AsyncConnection, tag_id: UUID) -> int:
        """Get the number of images using this tag."""
        stmt = (
            select(func.count())
            .select_from(shared_image_tags)
            .where(shared_image_tags.c.tag_id == tag_id)
        )
        result = await connection.execute(stmt)
        return result.scalar() or 0
