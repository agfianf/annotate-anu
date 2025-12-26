"""Repository layer for Export and SavedFilter data access."""

from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import delete, func, insert, select, update
from sqlalchemy.ext.asyncio import AsyncConnection

from app.models.export import exports, saved_filters


class SavedFilterRepository:
    """Async repository for saved filter operations."""

    @staticmethod
    async def create(
        connection: AsyncConnection,
        project_id: int,
        name: str,
        filter_config: dict,
        description: str | None = None,
        user_id: UUID | None = None,
    ) -> dict:
        """Create a new saved filter."""
        data = {
            "project_id": project_id,
            "name": name,
            "description": description,
            "filter_config": filter_config,
            "created_by": user_id,
        }
        stmt = insert(saved_filters).values(**data).returning(saved_filters)
        result = await connection.execute(stmt)
        row = result.fetchone()
        return dict(row._mapping) if row else {}

    @staticmethod
    async def get_by_id(
        connection: AsyncConnection,
        filter_id: UUID,
    ) -> dict | None:
        """Get a saved filter by ID."""
        stmt = select(saved_filters).where(saved_filters.c.id == filter_id)
        result = await connection.execute(stmt)
        row = result.fetchone()
        return dict(row._mapping) if row else None

    @staticmethod
    async def get_by_name(
        connection: AsyncConnection,
        project_id: int,
        name: str,
    ) -> dict | None:
        """Get a saved filter by name within a project."""
        stmt = select(saved_filters).where(
            saved_filters.c.project_id == project_id,
            saved_filters.c.name == name,
        )
        result = await connection.execute(stmt)
        row = result.fetchone()
        return dict(row._mapping) if row else None

    @staticmethod
    async def list_for_project(
        connection: AsyncConnection,
        project_id: int,
    ) -> list[dict]:
        """List all saved filters for a project."""
        stmt = (
            select(saved_filters)
            .where(saved_filters.c.project_id == project_id)
            .order_by(saved_filters.c.name)
        )
        result = await connection.execute(stmt)
        return [dict(row._mapping) for row in result.fetchall()]

    @staticmethod
    async def update(
        connection: AsyncConnection,
        filter_id: UUID,
        **data,
    ) -> dict | None:
        """Update a saved filter."""
        data["updated_at"] = datetime.now(timezone.utc)
        stmt = (
            update(saved_filters)
            .where(saved_filters.c.id == filter_id)
            .values(**data)
            .returning(saved_filters)
        )
        result = await connection.execute(stmt)
        row = result.fetchone()
        return dict(row._mapping) if row else None

    @staticmethod
    async def delete(
        connection: AsyncConnection,
        filter_id: UUID,
    ) -> bool:
        """Delete a saved filter."""
        stmt = delete(saved_filters).where(saved_filters.c.id == filter_id)
        result = await connection.execute(stmt)
        return result.rowcount > 0


class ExportRepository:
    """Async repository for export operations."""

    @staticmethod
    async def create(
        connection: AsyncConnection,
        project_id: int,
        export_mode: str,
        output_format: str,
        filter_snapshot: dict,
        name: str | None = None,
        version_number: int | None = None,
        include_images: bool = False,
        saved_filter_id: UUID | None = None,
        classification_config: dict | None = None,
        mode_options: dict | None = None,
        version_mode: str = "latest",
        version_value: str | None = None,
        message: str | None = None,
        user_id: UUID | None = None,
    ) -> dict:
        """Create a new export record."""
        data = {
            "project_id": project_id,
            "export_mode": export_mode,
            "output_format": output_format,
            "name": name,
            "version_number": version_number,
            "include_images": include_images,
            "filter_snapshot": filter_snapshot,
            "saved_filter_id": saved_filter_id,
            "classification_config": classification_config,
            "mode_options": mode_options,
            "version_mode": version_mode,
            "version_value": version_value,
            "message": message,
            "created_by": user_id,
            "status": "pending",
        }
        stmt = insert(exports).values(**data).returning(exports)
        result = await connection.execute(stmt)
        row = result.fetchone()
        return dict(row._mapping) if row else {}

    @staticmethod
    async def get_by_id(
        connection: AsyncConnection,
        export_id: UUID,
    ) -> dict | None:
        """Get an export by ID."""
        stmt = select(exports).where(exports.c.id == export_id)
        result = await connection.execute(stmt)
        row = result.fetchone()
        return dict(row._mapping) if row else None

    @staticmethod
    async def list_for_project(
        connection: AsyncConnection,
        project_id: int,
        page: int = 1,
        page_size: int = 20,
        status: str | None = None,
        export_mode: str | None = None,
    ) -> tuple[list[dict], int]:
        """List exports for a project with pagination and optional filters."""
        # Base query
        base_query = select(exports).where(exports.c.project_id == project_id)

        # Apply filters
        if status:
            base_query = base_query.where(exports.c.status == status)
        if export_mode:
            base_query = base_query.where(exports.c.export_mode == export_mode)

        # Count total
        count_stmt = select(func.count()).select_from(base_query.subquery())
        total = (await connection.execute(count_stmt)).scalar() or 0

        # Get page
        stmt = (
            base_query.order_by(exports.c.created_at.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
        result = await connection.execute(stmt)
        items = [dict(row._mapping) for row in result.fetchall()]

        return items, total

    @staticmethod
    async def update_status(
        connection: AsyncConnection,
        export_id: UUID,
        status: str,
        artifact_path: str | None = None,
        artifact_size_bytes: int | None = None,
        error_message: str | None = None,
        summary: dict | None = None,
    ) -> dict | None:
        """Update export status and results."""
        data = {"status": status}

        if artifact_path is not None:
            data["artifact_path"] = artifact_path
        if artifact_size_bytes is not None:
            data["artifact_size_bytes"] = artifact_size_bytes
        if error_message is not None:
            data["error_message"] = error_message
        if summary is not None:
            data["summary"] = summary

        # Set completed_at for terminal states
        if status in ("completed", "failed"):
            data["completed_at"] = datetime.now(timezone.utc)

        stmt = (
            update(exports)
            .where(exports.c.id == export_id)
            .values(**data)
            .returning(exports)
        )
        result = await connection.execute(stmt)
        row = result.fetchone()
        return dict(row._mapping) if row else None

    @staticmethod
    async def delete(
        connection: AsyncConnection,
        export_id: UUID,
    ) -> bool:
        """Delete an export record."""
        stmt = delete(exports).where(exports.c.id == export_id)
        result = await connection.execute(stmt)
        return result.rowcount > 0

    @staticmethod
    async def get_latest_for_project(
        connection: AsyncConnection,
        project_id: int,
        export_mode: str | None = None,
    ) -> dict | None:
        """Get the most recent export for a project."""
        stmt = (
            select(exports)
            .where(exports.c.project_id == project_id)
            .order_by(exports.c.created_at.desc())
            .limit(1)
        )
        if export_mode:
            stmt = stmt.where(exports.c.export_mode == export_mode)

        result = await connection.execute(stmt)
        row = result.fetchone()
        return dict(row._mapping) if row else None

    @staticmethod
    async def count_by_status(
        connection: AsyncConnection,
        project_id: int,
    ) -> dict[str, int]:
        """Get count of exports by status for a project."""
        stmt = (
            select(exports.c.status, func.count().label("count"))
            .where(exports.c.project_id == project_id)
            .group_by(exports.c.status)
        )
        result = await connection.execute(stmt)
        return {row.status: row.count for row in result.fetchall()}

    @staticmethod
    async def get_next_version_number(
        connection: AsyncConnection,
        project_id: int,
        export_mode: str,
    ) -> int:
        """Get the next version number for a project+mode combination."""
        stmt = select(func.coalesce(func.max(exports.c.version_number), 0) + 1).where(
            exports.c.project_id == project_id,
            exports.c.export_mode == export_mode,
        )
        result = await connection.execute(stmt)
        return result.scalar() or 1
