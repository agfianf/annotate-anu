"""Repository layer for Project Activity data access."""

from uuid import UUID

from sqlalchemy import delete, func, insert, select
from sqlalchemy.ext.asyncio import AsyncConnection

from app.models.activity import project_activity


class ProjectActivityRepository:
    """Async repository for project activity operations."""

    @staticmethod
    async def list_for_project(
        connection: AsyncConnection,
        project_id: UUID,
        limit: int = 365,
        offset: int = 0,
    ) -> list[dict]:
        """List activity for a project, ordered by most recent first."""
        query = (
            select(project_activity)
            .where(project_activity.c.project_id == project_id)
            .order_by(project_activity.c.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
        result = await connection.execute(query)
        return [dict(row._mapping) for row in result.fetchall()]

    @staticmethod
    async def count_for_project(
        connection: AsyncConnection,
        project_id: UUID,
    ) -> int:
        """Count total activity entries for a project."""
        query = select(func.count()).where(
            project_activity.c.project_id == project_id
        )
        result = await connection.execute(query)
        return result.scalar() or 0

    @staticmethod
    async def create(
        connection: AsyncConnection,
        project_id: UUID,
        actor_id: UUID | None,
        actor_name: str | None,
        data: dict,
    ) -> dict:
        """Create a new activity entry."""
        insert_data = {
            "project_id": project_id,
            "entity_type": data["entity_type"],
            "entity_id": data["entity_id"],
            "entity_name": data.get("entity_name"),
            "action": data["action"],
            "actor_id": actor_id,
            "actor_name": actor_name,
            "previous_data": data.get("previous_data"),
            "new_data": data.get("new_data"),
        }
        query = insert(project_activity).values(**insert_data).returning(project_activity)
        result = await connection.execute(query)
        row = result.fetchone()
        return dict(row._mapping) if row else {}

    @staticmethod
    async def cleanup_old(
        connection: AsyncConnection,
        project_id: UUID,
        keep_count: int = 365,
    ) -> int:
        """Delete oldest entries beyond keep_count for a project."""
        # Get the ID of the Nth newest entry
        subquery = (
            select(project_activity.c.id)
            .where(project_activity.c.project_id == project_id)
            .order_by(project_activity.c.created_at.desc())
            .limit(keep_count)
        )
        
        # Delete entries not in the keep list
        delete_query = delete(project_activity).where(
            project_activity.c.project_id == project_id,
            ~project_activity.c.id.in_(subquery),
        )
        result = await connection.execute(delete_query)
        return result.rowcount
