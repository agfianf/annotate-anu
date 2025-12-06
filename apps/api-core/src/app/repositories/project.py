"""Repository layer for Project, Label, and ProjectMember data access."""

from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import delete, func, insert, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncConnection

from app.models.project import labels, project_members, projects
from app.models.task import tasks


class ProjectRepository:
    """Async repository for project operations."""

    @staticmethod
    async def get_by_id(connection: AsyncConnection, project_id: UUID) -> dict | None:
        """Get project by ID."""
        stmt = select(projects).where(projects.c.id == project_id)
        result = await connection.execute(stmt)
        row = result.fetchone()
        return dict(row._mapping) if row else None

    @staticmethod
    async def get_by_slug(connection: AsyncConnection, slug: str) -> dict | None:
        """Get project by slug."""
        stmt = select(projects).where(projects.c.slug == slug)
        result = await connection.execute(stmt)
        row = result.fetchone()
        return dict(row._mapping) if row else None

    @staticmethod
    async def list_for_user(
        connection: AsyncConnection,
        user_id: UUID,
        include_archived: bool = False,
    ) -> list[dict]:
        """List projects user has access to (owner or member)."""
        # Get projects where user is owner
        owner_query = select(projects).where(projects.c.owner_id == user_id)
        
        # Get projects where user is a member
        member_query = (
            select(projects)
            .join(project_members, project_members.c.project_id == projects.c.id)
            .where(project_members.c.user_id == user_id)
        )
        
        # Apply archived filter before union (CompoundSelect doesn't support .where())
        if not include_archived:
            owner_query = owner_query.where(projects.c.is_archived == False)  # noqa: E712
            member_query = member_query.where(projects.c.is_archived == False)  # noqa: E712
        
        # Union both queries
        combined = owner_query.union(member_query).order_by(projects.c.created_at.desc())
        
        result = await connection.execute(combined)
        return [dict(row._mapping) for row in result.fetchall()]

    @staticmethod
    async def create(connection: AsyncConnection, data: dict) -> dict:
        """Create a new project."""
        try:
            stmt = insert(projects).values(**data).returning(projects)
            result = await connection.execute(stmt)
            row = result.fetchone()
            return dict(row._mapping)
        except IntegrityError:
            raise ValueError(f"Project with slug '{data.get('slug')}' already exists")

    @staticmethod
    async def update(connection: AsyncConnection, project_id: UUID, data: dict) -> dict | None:
        """Update a project."""
        data["updated_at"] = datetime.now(timezone.utc)
        stmt = (
            update(projects)
            .where(projects.c.id == project_id)
            .values(**data)
            .returning(projects)
        )
        result = await connection.execute(stmt)
        row = result.fetchone()
        return dict(row._mapping) if row else None

    @staticmethod
    async def delete(connection: AsyncConnection, project_id: UUID) -> bool:
        """Delete a project (cascade deletes tasks, jobs, etc.)."""
        stmt = delete(projects).where(projects.c.id == project_id)
        result = await connection.execute(stmt)
        return result.rowcount > 0

    @staticmethod
    async def get_task_count(connection: AsyncConnection, project_id: UUID) -> int:
        """Get count of tasks in project."""
        stmt = select(func.count()).select_from(tasks).where(tasks.c.project_id == project_id)
        result = await connection.execute(stmt)
        return result.scalar() or 0


class LabelRepository:
    """Async repository for label operations."""

    @staticmethod
    async def get_by_id(connection: AsyncConnection, label_id: UUID) -> dict | None:
        """Get label by ID."""
        stmt = select(labels).where(labels.c.id == label_id)
        result = await connection.execute(stmt)
        row = result.fetchone()
        return dict(row._mapping) if row else None

    @staticmethod
    async def list_for_project(connection: AsyncConnection, project_id: UUID) -> list[dict]:
        """List all labels for a project."""
        stmt = (
            select(labels)
            .where(labels.c.project_id == project_id)
            .order_by(labels.c.name)
        )
        result = await connection.execute(stmt)
        return [dict(row._mapping) for row in result.fetchall()]

    @staticmethod
    async def create(connection: AsyncConnection, project_id: UUID, data: dict) -> dict:
        """Create a new label."""
        data["project_id"] = project_id
        try:
            stmt = insert(labels).values(**data).returning(labels)
            result = await connection.execute(stmt)
            row = result.fetchone()
            return dict(row._mapping)
        except IntegrityError:
            raise ValueError(f"Label '{data.get('name')}' already exists in this project")

    @staticmethod
    async def update(connection: AsyncConnection, label_id: UUID, data: dict) -> dict | None:
        """Update a label."""
        stmt = update(labels).where(labels.c.id == label_id).values(**data).returning(labels)
        result = await connection.execute(stmt)
        row = result.fetchone()
        return dict(row._mapping) if row else None

    @staticmethod
    async def delete(connection: AsyncConnection, label_id: UUID) -> bool:
        """Delete a label."""
        stmt = delete(labels).where(labels.c.id == label_id)
        result = await connection.execute(stmt)
        return result.rowcount > 0


class ProjectMemberRepository:
    """Async repository for project member operations."""

    @staticmethod
    async def get_by_id(connection: AsyncConnection, member_id: UUID) -> dict | None:
        """Get member by ID."""
        stmt = select(project_members).where(project_members.c.id == member_id)
        result = await connection.execute(stmt)
        row = result.fetchone()
        return dict(row._mapping) if row else None

    @staticmethod
    async def get_by_project_and_user(
        connection: AsyncConnection,
        project_id: UUID,
        user_id: UUID,
    ) -> dict | None:
        """Get membership for a user in a project."""
        stmt = select(project_members).where(
            project_members.c.project_id == project_id,
            project_members.c.user_id == user_id,
        )
        result = await connection.execute(stmt)
        row = result.fetchone()
        return dict(row._mapping) if row else None

    @staticmethod
    async def list_for_project(connection: AsyncConnection, project_id: UUID) -> list[dict]:
        """List all members of a project."""
        stmt = (
            select(project_members)
            .where(project_members.c.project_id == project_id)
            .order_by(project_members.c.created_at)
        )
        result = await connection.execute(stmt)
        return [dict(row._mapping) for row in result.fetchall()]

    @staticmethod
    async def get_member_count(connection: AsyncConnection, project_id: UUID) -> int:
        """Get count of members in project."""
        stmt = (
            select(func.count())
            .select_from(project_members)
            .where(project_members.c.project_id == project_id)
        )
        result = await connection.execute(stmt)
        return result.scalar() or 0

    @staticmethod
    async def create(connection: AsyncConnection, project_id: UUID, data: dict) -> dict:
        """Add a member to a project."""
        data["project_id"] = project_id
        data["updated_at"] = datetime.now(timezone.utc)
        try:
            stmt = insert(project_members).values(**data).returning(project_members)
            result = await connection.execute(stmt)
            row = result.fetchone()
            return dict(row._mapping)
        except IntegrityError:
            raise ValueError("User is already a member of this project")

    @staticmethod
    async def update(connection: AsyncConnection, member_id: UUID, data: dict) -> dict | None:
        """Update a member's role or permissions."""
        data["updated_at"] = datetime.now(timezone.utc)
        stmt = (
            update(project_members)
            .where(project_members.c.id == member_id)
            .values(**data)
            .returning(project_members)
        )
        result = await connection.execute(stmt)
        row = result.fetchone()
        return dict(row._mapping) if row else None

    @staticmethod
    async def delete(connection: AsyncConnection, member_id: UUID) -> bool:
        """Remove a member from a project."""
        stmt = delete(project_members).where(project_members.c.id == member_id)
        result = await connection.execute(stmt)
        return result.rowcount > 0
