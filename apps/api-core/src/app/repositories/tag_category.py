"""Repository layer for TagCategory data access (project-scoped)."""

from uuid import UUID

from sqlalchemy import delete, func, insert, select, update
from sqlalchemy.ext.asyncio import AsyncConnection
from sqlalchemy.exc import IntegrityError

from app.models.data_management import tag_categories, tags


class TagCategoryRepository:
    """Async repository for project-scoped tag category operations."""

    @staticmethod
    async def get_by_id(
        connection: AsyncConnection, category_id: UUID, project_id: int
    ) -> dict | None:
        """Get tag category by ID within a project."""
        stmt = select(tag_categories).where(
            tag_categories.c.id == category_id,
            tag_categories.c.project_id == project_id,
        )
        result = await connection.execute(stmt)
        row = result.fetchone()
        return dict(row._mapping) if row else None

    @staticmethod
    async def get_by_name(
        connection: AsyncConnection, name: str, project_id: int
    ) -> dict | None:
        """Get tag category by name within a project."""
        stmt = select(tag_categories).where(
            tag_categories.c.name == name,
            tag_categories.c.project_id == project_id,
        )
        result = await connection.execute(stmt)
        row = result.fetchone()
        return dict(row._mapping) if row else None

    @staticmethod
    async def list_for_project(
        connection: AsyncConnection,
        project_id: int,
        include_tags: bool = False,
    ) -> list[dict]:
        """List all tag categories for a project with optional nested tags."""
        stmt = (
            select(tag_categories)
            .where(tag_categories.c.project_id == project_id)
            .order_by(tag_categories.c.sidebar_order, tag_categories.c.name)
        )
        result = await connection.execute(stmt)
        categories = [dict(row._mapping) for row in result.fetchall()]

        if include_tags:
            # Fetch all tags for the project
            tags_stmt = (
                select(tags)
                .where(tags.c.project_id == project_id)
                .order_by(tags.c.name)
            )
            tags_result = await connection.execute(tags_stmt)
            all_tags = [dict(row._mapping) for row in tags_result.fetchall()]

            # Group tags by category
            category_tags: dict[str, list[dict]] = {}
            uncategorized_tags: list[dict] = []

            for tag in all_tags:
                cat_id = str(tag.get("category_id")) if tag.get("category_id") else None
                if cat_id:
                    if cat_id not in category_tags:
                        category_tags[cat_id] = []
                    category_tags[cat_id].append(tag)
                else:
                    uncategorized_tags.append(tag)

            # Attach tags to categories
            for category in categories:
                cat_id = str(category["id"])
                category["tags"] = category_tags.get(cat_id, [])

            # Add uncategorized tags as a virtual category (if any)
            if uncategorized_tags:
                categories.append(
                    {
                        "id": None,
                        "project_id": project_id,
                        "name": "uncategorized",
                        "display_name": "Uncategorized",
                        "color": "#6B7280",
                        "sidebar_order": 999,
                        "created_by": None,
                        "created_at": None,
                        "tags": uncategorized_tags,
                    }
                )

        return categories

    @staticmethod
    async def list_with_tag_count(
        connection: AsyncConnection,
        project_id: int,
    ) -> list[dict]:
        """List all tag categories for a project with tag count."""
        # Subquery for tag count
        tag_count_subquery = (
            select(
                tags.c.category_id,
                func.count().label("tag_count"),
            )
            .where(tags.c.project_id == project_id)
            .group_by(tags.c.category_id)
            .subquery()
        )

        stmt = (
            select(
                tag_categories,
                func.coalesce(tag_count_subquery.c.tag_count, 0).label("tag_count"),
            )
            .outerjoin(
                tag_count_subquery,
                tag_categories.c.id == tag_count_subquery.c.category_id,
            )
            .where(tag_categories.c.project_id == project_id)
            .order_by(tag_categories.c.sidebar_order, tag_categories.c.name)
        )
        result = await connection.execute(stmt)
        return [dict(row._mapping) for row in result.fetchall()]

    @staticmethod
    async def create(
        connection: AsyncConnection, project_id: int, data: dict
    ) -> dict:
        """Create a new tag category within a project."""
        data["project_id"] = project_id
        try:
            stmt = insert(tag_categories).values(**data).returning(tag_categories)
            result = await connection.execute(stmt)
            row = result.fetchone()
            return dict(row._mapping)
        except IntegrityError:
            raise ValueError(
                f"Tag category '{data.get('name')}' already exists in this project"
            )

    @staticmethod
    async def update(
        connection: AsyncConnection,
        category_id: UUID,
        project_id: int,
        data: dict,
    ) -> dict | None:
        """Update a tag category within a project."""
        stmt = (
            update(tag_categories)
            .where(
                tag_categories.c.id == category_id,
                tag_categories.c.project_id == project_id,
            )
            .values(**data)
            .returning(tag_categories)
        )
        result = await connection.execute(stmt)
        row = result.fetchone()
        return dict(row._mapping) if row else None

    @staticmethod
    async def delete(
        connection: AsyncConnection, category_id: UUID, project_id: int
    ) -> bool:
        """Delete a tag category from a project.

        Note: Tags with this category_id will have their category_id set to NULL
        (due to ON DELETE SET NULL foreign key constraint).
        """
        stmt = delete(tag_categories).where(
            tag_categories.c.id == category_id,
            tag_categories.c.project_id == project_id,
        )
        result = await connection.execute(stmt)
        return result.rowcount > 0

    @staticmethod
    async def get_tag_count(
        connection: AsyncConnection, category_id: UUID, project_id: int
    ) -> int:
        """Get the number of tags in this category."""
        stmt = (
            select(func.count())
            .select_from(tags)
            .where(
                tags.c.category_id == category_id,
                tags.c.project_id == project_id,
            )
        )
        result = await connection.execute(stmt)
        return result.scalar() or 0

    @staticmethod
    async def reorder(
        connection: AsyncConnection,
        project_id: int,
        category_orders: list[dict],
    ) -> list[dict]:
        """Update sidebar order for multiple categories.

        Args:
            category_orders: List of {"id": UUID, "sidebar_order": int}
        """
        updated = []
        for order_data in category_orders:
            stmt = (
                update(tag_categories)
                .where(
                    tag_categories.c.id == order_data["id"],
                    tag_categories.c.project_id == project_id,
                )
                .values(sidebar_order=order_data["sidebar_order"])
                .returning(tag_categories)
            )
            result = await connection.execute(stmt)
            row = result.fetchone()
            if row:
                updated.append(dict(row._mapping))
        return updated
