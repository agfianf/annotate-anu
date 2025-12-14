"""Repository layer for ProjectImage (project pool) data access."""

from uuid import UUID

from sqlalchemy import delete, func, insert, select
from sqlalchemy.ext.asyncio import AsyncConnection

from app.models.data_management import project_images, shared_image_tags, shared_images, tags
from app.models.image import images
from app.models.job import jobs
from app.models.task import tasks


class ProjectImageRepository:
    """Async repository for project image pool operations."""

    @staticmethod
    async def add_to_pool(
        connection: AsyncConnection,
        project_id: int,
        shared_image_id: UUID,
        user_id: UUID | None = None,
    ) -> dict | None:
        """Add an image to project pool. Returns None if already exists."""
        # Check if already exists
        existing = await ProjectImageRepository.is_in_pool(
            connection, project_id, shared_image_id
        )
        if existing:
            return await ProjectImageRepository.get_link(
                connection, project_id, shared_image_id
            )

        data = {
            "project_id": project_id,
            "shared_image_id": shared_image_id,
            "added_by": user_id,
        }
        stmt = insert(project_images).values(**data).returning(project_images)
        result = await connection.execute(stmt)
        row = result.fetchone()
        return dict(row._mapping) if row else None

    @staticmethod
    async def remove_from_pool(
        connection: AsyncConnection,
        project_id: int,
        shared_image_id: UUID,
    ) -> bool:
        """Remove an image from project pool."""
        stmt = delete(project_images).where(
            project_images.c.project_id == project_id,
            project_images.c.shared_image_id == shared_image_id,
        )
        result = await connection.execute(stmt)
        return result.rowcount > 0

    @staticmethod
    async def get_link(
        connection: AsyncConnection,
        project_id: int,
        shared_image_id: UUID,
    ) -> dict | None:
        """Get the link between project and image."""
        stmt = select(project_images).where(
            project_images.c.project_id == project_id,
            project_images.c.shared_image_id == shared_image_id,
        )
        result = await connection.execute(stmt)
        row = result.fetchone()
        return dict(row._mapping) if row else None

    @staticmethod
    async def is_in_pool(
        connection: AsyncConnection,
        project_id: int,
        shared_image_id: UUID,
    ) -> bool:
        """Check if image is in project pool."""
        stmt = select(func.count()).select_from(project_images).where(
            project_images.c.project_id == project_id,
            project_images.c.shared_image_id == shared_image_id,
        )
        result = await connection.execute(stmt)
        count = result.scalar() or 0
        return count > 0

    @staticmethod
    async def list_for_project(
        connection: AsyncConnection,
        project_id: int,
        page: int = 1,
        page_size: int = 50,
        tag_ids: list[UUID] | None = None,
        search: str | None = None,
    ) -> tuple[list[dict], int]:
        """List images in project pool with pagination and filtering."""
        # Base query - join shared_images
        base_query = (
            select(shared_images)
            .join(project_images, shared_images.c.id == project_images.c.shared_image_id)
            .where(project_images.c.project_id == project_id)
        )

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
            .order_by(shared_images.c.filename)
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
        result = await connection.execute(stmt)
        items = [dict(row._mapping) for row in result.fetchall()]

        return items, total

    @staticmethod
    async def bulk_add_to_pool(
        connection: AsyncConnection,
        project_id: int,
        shared_image_ids: list[UUID],
        user_id: UUID | None = None,
    ) -> int:
        """Bulk add images to project pool. Returns count of new images added."""
        count = 0
        for image_id in shared_image_ids:
            existing = await ProjectImageRepository.is_in_pool(
                connection, project_id, image_id
            )
            if not existing:
                await ProjectImageRepository.add_to_pool(
                    connection, project_id, image_id, user_id
                )
                count += 1
        return count

    @staticmethod
    async def bulk_remove_from_pool(
        connection: AsyncConnection,
        project_id: int,
        shared_image_ids: list[UUID],
    ) -> int:
        """Bulk remove images from project pool. Returns count removed."""
        count = 0
        for image_id in shared_image_ids:
            removed = await ProjectImageRepository.remove_from_pool(
                connection, project_id, image_id
            )
            if removed:
                count += 1
        return count

    @staticmethod
    async def get_pool_count(
        connection: AsyncConnection,
        project_id: int,
    ) -> int:
        """Get total count of images in project pool."""
        stmt = (
            select(func.count())
            .select_from(project_images)
            .where(project_images.c.project_id == project_id)
        )
        result = await connection.execute(stmt)
        return result.scalar() or 0

    @staticmethod
    async def get_available_for_task(
        connection: AsyncConnection,
        project_id: int,
        exclude_task_ids: list[int] | None = None,
    ) -> list[dict]:
        """Get images in pool that are not yet assigned to specified tasks."""
        # Get all images in pool
        pool_query = (
            select(shared_images)
            .join(project_images, shared_images.c.id == project_images.c.shared_image_id)
            .where(project_images.c.project_id == project_id)
        )

        if exclude_task_ids:
            # Get images already in tasks
            used_subquery = (
                select(images.c.shared_image_id)
                .join(jobs, images.c.job_id == jobs.c.id)
                .join(tasks, jobs.c.task_id == tasks.c.id)
                .where(tasks.c.id.in_(exclude_task_ids))
                .where(images.c.shared_image_id.isnot(None))
            )
            pool_query = pool_query.where(
                shared_images.c.id.notin_(used_subquery)
            )

        pool_query = pool_query.order_by(shared_images.c.filename)
        result = await connection.execute(pool_query)
        return [dict(row._mapping) for row in result.fetchall()]

    @staticmethod
    async def explore(
        connection: AsyncConnection,
        project_id: int,
        page: int = 1,
        page_size: int = 50,
        tag_ids: list[UUID] | None = None,
        task_ids: list[int] | None = None,
        job_id: int | None = None,
        is_annotated: bool | None = None,
        search: str | None = None,
    ) -> tuple[list[dict], int]:
        """
        Explore images with combined filtering.
        Supports filtering by tags, task/job hierarchy, annotation status, and search.

        Args:
            task_ids: Filter by multiple task IDs (OR logic - images in ANY of the tasks)
        """
        # Base query - start with project pool
        base_query = (
            select(
                shared_images,
                project_images.c.created_at.label("added_to_pool_at"),
            )
            .join(project_images, shared_images.c.id == project_images.c.shared_image_id)
            .where(project_images.c.project_id == project_id)
        )

        if search:
            base_query = base_query.where(
                shared_images.c.filename.ilike(f"%{search}%")
            )

        if tag_ids:
            for tag_id in tag_ids:
                subquery = (
                    select(shared_image_tags.c.shared_image_id)
                    .where(shared_image_tags.c.tag_id == tag_id)
                )
                base_query = base_query.where(shared_images.c.id.in_(subquery))

        # Filter by task/job hierarchy
        if job_id is not None:
            # Filter to images in specific job
            job_images_subquery = (
                select(images.c.shared_image_id)
                .where(images.c.job_id == job_id)
                .where(images.c.shared_image_id.isnot(None))
            )
            base_query = base_query.where(shared_images.c.id.in_(job_images_subquery))

            if is_annotated is not None:
                # Need to check annotation status in job's images
                annotated_subquery = (
                    select(images.c.shared_image_id)
                    .where(images.c.job_id == job_id)
                    .where(images.c.is_annotated == is_annotated)
                    .where(images.c.shared_image_id.isnot(None))
                )
                base_query = base_query.where(shared_images.c.id.in_(annotated_subquery))

        elif task_ids is not None and len(task_ids) > 0:
            # Filter to images in ANY of the specified tasks (OR logic)
            task_images_subquery = (
                select(images.c.shared_image_id)
                .join(jobs, images.c.job_id == jobs.c.id)
                .where(jobs.c.task_id.in_(task_ids))
                .where(images.c.shared_image_id.isnot(None))
            )
            base_query = base_query.where(shared_images.c.id.in_(task_images_subquery))

            if is_annotated is not None:
                annotated_subquery = (
                    select(images.c.shared_image_id)
                    .join(jobs, images.c.job_id == jobs.c.id)
                    .where(jobs.c.task_id.in_(task_ids))
                    .where(images.c.is_annotated == is_annotated)
                    .where(images.c.shared_image_id.isnot(None))
                )
                base_query = base_query.where(shared_images.c.id.in_(annotated_subquery))

        # Count total
        count_stmt = select(func.count()).select_from(base_query.subquery())
        total = (await connection.execute(count_stmt)).scalar() or 0

        # Get page
        stmt = (
            base_query
            .order_by(shared_images.c.filename)
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
        result = await connection.execute(stmt)
        items = [dict(row._mapping) for row in result.fetchall()]

        return items, total
