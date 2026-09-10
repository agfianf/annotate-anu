"""Repository layer for storage connection data access.

Reads are always scoped by the caller's access. There is deliberately no unscoped
`get_by_id` here: a lookup by id alone is exactly the hole that let any authenticated
user browse and delete every registered bucket in the install.
"""

from collections.abc import Sequence
from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import ColumnElement, delete, insert, or_, select, update
from sqlalchemy.ext.asyncio import AsyncConnection

from app.models.project import project_members, projects
from app.models.storage import storage_connections


class StorageConnectionRepository:
    """Async repository for storage connection operations."""

    @staticmethod
    def access_clause(user_id: UUID, allowed_member_roles: Sequence[str]) -> ColumnElement[bool]:
        """Build the SQL predicate for the rows a non-admin user may reach.

        Parameters
        ----------
        user_id : UUID
            Current user
        allowed_member_roles : Sequence[str]
            Project member roles that satisfy the action being performed

        Returns
        -------
        ColumnElement[bool]
            Predicate to AND into any statement over storage_connections
        """
        owned_projects = select(projects.c.id).where(projects.c.owner_id == user_id)
        member_projects = select(project_members.c.project_id).where(
            project_members.c.user_id == user_id,
            project_members.c.role.in_(allowed_member_roles),
        )
        # A connection with a NULL project_id has no membership to derive access from, so
        # its creator is the only non-admin who reaches it: `IN` against NULL evaluates to
        # NULL, never true, leaving created_by as the only branch that can match. A row
        # whose creator was deleted (created_by is ON DELETE SET NULL) and that has no
        # project therefore becomes admin-only, which is the safe direction to fail.
        return or_(
            storage_connections.c.created_by == user_id,
            storage_connections.c.project_id.in_(owned_projects),
            storage_connections.c.project_id.in_(member_projects),
        )

    @staticmethod
    async def list_accessible(
        connection: AsyncConnection,
        access_clause: ColumnElement[bool] | None,
        project_id: int | None = None,
    ) -> list[dict]:
        """List connections the caller may see, filtered in SQL.

        Parameters
        ----------
        connection : AsyncConnection
            Database connection
        access_clause : ColumnElement[bool] | None
            Predicate from :meth:`access_clause`, or None for an admin (sees everything)
        project_id : int | None
            Optional narrowing to one project

        Returns
        -------
        list[dict]
            Matching connection rows
        """
        stmt = select(storage_connections).order_by(storage_connections.c.created_at.desc())
        if access_clause is not None:
            stmt = stmt.where(access_clause)
        if project_id is not None:
            stmt = stmt.where(storage_connections.c.project_id == project_id)
        result = await connection.execute(stmt)
        return [dict(row) for row in result.mappings().all()]

    @staticmethod
    async def get_accessible(
        connection: AsyncConnection,
        connection_id: UUID,
        access_clause: ColumnElement[bool] | None,
    ) -> dict | None:
        """Fetch one connection the caller may reach.

        Parameters
        ----------
        connection : AsyncConnection
            Database connection
        connection_id : UUID
            Connection to fetch
        access_clause : ColumnElement[bool] | None
            Predicate from :meth:`access_clause`, or None for an admin

        Returns
        -------
        dict | None
            The row, or None when it is missing or out of reach — the caller must not
            distinguish the two cases
        """
        stmt = select(storage_connections).where(storage_connections.c.id == connection_id)
        if access_clause is not None:
            stmt = stmt.where(access_clause)
        result = await connection.execute(stmt)
        row = result.mappings().first()
        return dict(row) if row else None

    @staticmethod
    async def create(connection: AsyncConnection, data: dict) -> dict:
        """Insert a connection and return the stored row.

        Parameters
        ----------
        connection : AsyncConnection
            Database connection
        data : dict
            Column values, with the secret already encrypted

        Returns
        -------
        dict
            Inserted row
        """
        stmt = insert(storage_connections).values(**data).returning(storage_connections)
        result = await connection.execute(stmt)
        return dict(result.mappings().first())

    @staticmethod
    async def delete(connection: AsyncConnection, connection_id: UUID) -> bool:
        """Delete a connection.

        Parameters
        ----------
        connection : AsyncConnection
            Database connection
        connection_id : UUID
            Connection to delete

        Returns
        -------
        bool
            Whether a row was removed
        """
        stmt = delete(storage_connections).where(storage_connections.c.id == connection_id)
        result = await connection.execute(stmt)
        return result.rowcount > 0

    @staticmethod
    async def record_check(
        connection: AsyncConnection,
        connection_id: UUID,
        message: str,
    ) -> None:
        """Store the outcome of a reachability check.

        Parameters
        ----------
        connection : AsyncConnection
            Database connection
        connection_id : UUID
            Connection that was checked
        message : str
            Status text to record
        """
        stmt = (
            update(storage_connections)
            .where(storage_connections.c.id == connection_id)
            .values(last_checked_at=datetime.now(timezone.utc), last_status=message)
        )
        await connection.execute(stmt)
