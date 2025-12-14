"""Repository layer for Tag data access (project-scoped)."""

from uuid import UUID

from sqlalchemy import delete, func, insert, select, update
from sqlalchemy.ext.asyncio import AsyncConnection
from sqlalchemy.exc import IntegrityError

from app.models.data_management import shared_image_tags, tags


class TagRepository:
    """Async repository for project-scoped tag operations."""

    @staticmethod
    async def get_by_id(connection: AsyncConnection, tag_id: UUID, project_id: int) -> dict | None:
        """Get tag by ID within a project."""
        stmt = select(tags).where(tags.c.id == tag_id, tags.c.project_id == project_id)
        result = await connection.execute(stmt)
        row = result.fetchone()
        return dict(row._mapping) if row else None

    @staticmethod
    async def get_by_name(connection: AsyncConnection, name: str, project_id: int) -> dict | None:
        """Get tag by name within a project."""
        stmt = select(tags).where(tags.c.name == name, tags.c.project_id == project_id)
        result = await connection.execute(stmt)
        row = result.fetchone()
        return dict(row._mapping) if row else None

    @staticmethod
    async def list_for_project(
        connection: AsyncConnection,
        project_id: int,
        search: str | None = None,
    ) -> list[dict]:
        """List all tags for a project with optional search."""
        stmt = select(tags).where(tags.c.project_id == project_id)

        if search:
            stmt = stmt.where(tags.c.name.ilike(f"%{search}%"))

        stmt = stmt.order_by(tags.c.name)
        result = await connection.execute(stmt)
        return [dict(row._mapping) for row in result.fetchall()]

    @staticmethod
    async def list_with_usage_count(
        connection: AsyncConnection,
        project_id: int,
        search: str | None = None,
    ) -> list[dict]:
        """List all tags for a project with usage count."""
        # Subquery for usage count (filtered by project_id)
        usage_subquery = (
            select(
                shared_image_tags.c.tag_id,
                func.count().label("usage_count"),
            )
            .where(shared_image_tags.c.project_id == project_id)
            .group_by(shared_image_tags.c.tag_id)
            .subquery()
        )

        stmt = (
            select(
                tags,
                func.coalesce(usage_subquery.c.usage_count, 0).label("usage_count"),
            )
            .outerjoin(usage_subquery, tags.c.id == usage_subquery.c.tag_id)
            .where(tags.c.project_id == project_id)
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
    async def create(connection: AsyncConnection, project_id: int, data: dict) -> dict:
        """Create a new tag within a project."""
        data["project_id"] = project_id
        try:
            stmt = insert(tags).values(**data).returning(tags)
            result = await connection.execute(stmt)
            row = result.fetchone()
            return dict(row._mapping)
        except IntegrityError:
            raise ValueError(f"Tag '{data.get('name')}' already exists in this project")

    @staticmethod
    async def update(connection: AsyncConnection, tag_id: UUID, project_id: int, data: dict) -> dict | None:
        """Update a tag within a project."""
        stmt = (
            update(tags)
            .where(tags.c.id == tag_id, tags.c.project_id == project_id)
            .values(**data)
            .returning(tags)
        )
        result = await connection.execute(stmt)
        row = result.fetchone()
        return dict(row._mapping) if row else None

    @staticmethod
    async def delete(connection: AsyncConnection, tag_id: UUID, project_id: int) -> bool:
        """Delete a tag from a project."""
        stmt = delete(tags).where(tags.c.id == tag_id, tags.c.project_id == project_id)
        result = await connection.execute(stmt)
        return result.rowcount > 0

    @staticmethod
    async def get_usage_count(connection: AsyncConnection, tag_id: UUID, project_id: int) -> int:
        """Get the number of images using this tag in a project."""
        stmt = (
            select(func.count())
            .select_from(shared_image_tags)
            .where(shared_image_tags.c.tag_id == tag_id, shared_image_tags.c.project_id == project_id)
        )
        result = await connection.execute(stmt)
        return result.scalar() or 0
