"""Repository layer for ProjectImage (project pool) data access."""

from uuid import UUID

from sqlalchemy import Select, delete, func, insert, or_, select
from sqlalchemy.ext.asyncio import AsyncConnection

from app.models.annotation import detections, segmentations
from app.models.data_management import project_images, shared_image_tags, shared_images
from app.models.image import images
from app.models.image_quality import image_quality_metrics
from app.models.job import jobs
from app.models.task import tasks
from app.repositories.annotation_write import TABLES as ANNOTATION_TABLES
from app.schemas.image_filters import ImageFilterParams, MatchMode

#: Ordering for every paged or ordered image query. Filenames repeat across directories, so
#: the id tie-breaker is what makes page boundaries stable and prevents rows appearing twice
#: or not at all during a paginated walk.
IMAGE_ORDER_BY = (shared_images.c.filename.asc(), shared_images.c.id.asc())


def has_any_annotation():
    """SQL predicate: this job image (``images`` row) carries an annotation of any kind.

    This is the canonical definition of "annotated", shared by the gallery, export, and
    analytics. It is built from ``AnnotationWriteRepository.TABLES`` — the same mapping
    ``AnnotationWriteRepository.refresh_image_status`` uses to maintain the
    ``images.is_annotated`` column — so the filter cannot drift from the column it names.
    It reads the four tables directly rather than the cached column, which means it is also
    correct for rows whose column has not been refreshed yet.

    Deliberately *not* limited to detections and segmentations: a classification project
    annotates by writing an ``image_tags`` row and a pose project by writing a
    ``keypoints`` row, and both are annotated images.
    """
    return or_(
        *[
            select(table.c.id).where(table.c.image_id == images.c.id).exists()
            for table in ANNOTATION_TABLES.values()
        ]
    )


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
        existing = await ProjectImageRepository.is_in_pool(connection, project_id, shared_image_id)
        if existing:
            return await ProjectImageRepository.get_link(connection, project_id, shared_image_id)

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
        stmt = (
            select(func.count())
            .select_from(project_images)
            .where(
                project_images.c.project_id == project_id,
                project_images.c.shared_image_id == shared_image_id,
            )
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
            base_query = base_query.where(shared_images.c.filename.ilike(f"%{search}%"))

        if tag_ids:
            # Filter by tags - image must have ALL specified tags
            for tag_id in tag_ids:
                subquery = select(shared_image_tags.c.shared_image_id).where(
                    shared_image_tags.c.tag_id == tag_id
                )
                base_query = base_query.where(shared_images.c.id.in_(subquery))

        # Count total
        count_stmt = select(func.count()).select_from(base_query.subquery())
        total = (await connection.execute(count_stmt)).scalar() or 0

        # Get page
        stmt = base_query.order_by(*IMAGE_ORDER_BY).offset((page - 1) * page_size).limit(page_size)
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
            existing = await ProjectImageRepository.is_in_pool(connection, project_id, image_id)
            if not existing:
                await ProjectImageRepository.add_to_pool(connection, project_id, image_id, user_id)
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
            pool_query = pool_query.where(shared_images.c.id.notin_(used_subquery))

        pool_query = pool_query.order_by(*IMAGE_ORDER_BY)
        result = await connection.execute(pool_query)
        return [dict(row._mapping) for row in result.fetchall()]

    @staticmethod
    def build_filtered_query(project_id: int, filters: ImageFilterParams) -> Select:
        """Single definition of which shared_images match a filter set. Used by explore, export, and analytics.

        Returns an unordered, unpaged ``SELECT`` over ``shared_images`` (plus the pool's ``added_to_pool_at``) restricted to the given project's pool and to the images the filters accept. Callers add their own ordering, paging, or aggregation; order paged queries by ``IMAGE_ORDER_BY`` so page boundaries are stable.

        The returned statement yields one row per image. Wrapping it in ``select(func.count()).select_from(query.subquery())`` therefore counts matching images, and ``filtered_image_ids_subquery`` yields exactly the same set as ids.
        """
        base_query = (
            select(
                shared_images,
                project_images.c.created_at.label("added_to_pool_at"),
            )
            .join(project_images, shared_images.c.id == project_images.c.shared_image_id)
            .where(project_images.c.project_id == project_id)
        )
        return ProjectImageRepository._apply_filters(base_query, filters)

    @staticmethod
    def filtered_image_ids_subquery(project_id: int, filters: ImageFilterParams) -> Select:
        """The image ids matching ``filters``, as a statement to aggregate against in SQL.

        Same membership rule as :meth:`build_filtered_query`, projecting only ``shared_images.id`` so callers can join, count, or ``IN``-match without materialising the ids in Python.
        """
        base_query = (
            select(shared_images.c.id)
            .select_from(shared_images)
            .join(project_images, shared_images.c.id == project_images.c.shared_image_id)
            .where(project_images.c.project_id == project_id)
        )
        return ProjectImageRepository._apply_filters(base_query, filters)

    @staticmethod
    async def resolve_filtered_image_ids(
        connection: AsyncConnection,
        project_id: int,
        filters: ImageFilterParams,
        excluded_image_ids: list[UUID] | None = None,
        limit: int | None = None,
    ) -> list[UUID]:
        """Materialise the ids matching ``filters``, minus ``excluded_image_ids``.

        Membership is resolved when this runs, not when the user made the selection. ``limit`` caps how many ids are fetched; the caller is responsible for treating a full result as "too many to act on".
        """
        stmt = ProjectImageRepository.filtered_image_ids_subquery(project_id, filters)
        if excluded_image_ids:
            stmt = stmt.where(shared_images.c.id.notin_(excluded_image_ids))
        stmt = stmt.order_by(*IMAGE_ORDER_BY)
        if limit is not None:
            stmt = stmt.limit(limit)
        result = await connection.execute(stmt)
        return [row[0] for row in result.fetchall()]

    @staticmethod
    def _apply_filters(base_query: Select, filters: ImageFilterParams) -> Select:
        """Apply every membership filter to a query already scoped to a project's pool."""
        if filters.search:
            base_query = base_query.where(shared_images.c.filename.ilike(f"%{filters.search}%"))

        # Metadata Filters
        if filters.width_min is not None:
            base_query = base_query.where(shared_images.c.width >= filters.width_min)
        if filters.width_max is not None:
            base_query = base_query.where(shared_images.c.width <= filters.width_max)

        if filters.height_min is not None:
            base_query = base_query.where(shared_images.c.height >= filters.height_min)
        if filters.height_max is not None:
            base_query = base_query.where(shared_images.c.height <= filters.height_max)

        if filters.file_size_min is not None:
            base_query = base_query.where(shared_images.c.file_size_bytes >= filters.file_size_min)
        if filters.file_size_max is not None:
            base_query = base_query.where(shared_images.c.file_size_bytes <= filters.file_size_max)

        if filters.aspect_ratio_min is not None:
            base_query = base_query.where(shared_images.c.aspect_ratio >= filters.aspect_ratio_min)
        if filters.aspect_ratio_max is not None:
            base_query = base_query.where(shared_images.c.aspect_ratio <= filters.aspect_ratio_max)

        # Object count filtering (detections + segmentations)
        if filters.object_count_min is not None or filters.object_count_max is not None:
            # Subquery to count total annotations per shared_image
            det_count = (
                select(images.c.shared_image_id, func.count(detections.c.id).label("det_count"))
                .select_from(detections.join(images, detections.c.image_id == images.c.id))
                .where(images.c.shared_image_id.in_(select(shared_images.c.id)))
                .group_by(images.c.shared_image_id)
                .subquery()
            )

            seg_count = (
                select(images.c.shared_image_id, func.count(segmentations.c.id).label("seg_count"))
                .select_from(segmentations.join(images, segmentations.c.image_id == images.c.id))
                .where(images.c.shared_image_id.in_(select(shared_images.c.id)))
                .group_by(images.c.shared_image_id)
                .subquery()
            )

            # Join both counts and filter
            total_count = func.coalesce(det_count.c.det_count, 0) + func.coalesce(
                seg_count.c.seg_count, 0
            )

            base_query = base_query.outerjoin(
                det_count, shared_images.c.id == det_count.c.shared_image_id
            ).outerjoin(seg_count, shared_images.c.id == seg_count.c.shared_image_id)

            if filters.object_count_min is not None:
                base_query = base_query.where(total_count >= filters.object_count_min)
            if filters.object_count_max is not None:
                base_query = base_query.where(total_count <= filters.object_count_max)

        # BBox count filtering (detections only)
        if filters.bbox_count_min is not None or filters.bbox_count_max is not None:
            bbox_count_subquery = (
                select(images.c.shared_image_id, func.count(detections.c.id).label("bbox_cnt"))
                .select_from(detections.join(images, detections.c.image_id == images.c.id))
                .where(images.c.shared_image_id.in_(select(shared_images.c.id)))
                .group_by(images.c.shared_image_id)
                .subquery()
            )

            bbox_cnt = func.coalesce(bbox_count_subquery.c.bbox_cnt, 0)
            base_query = base_query.outerjoin(
                bbox_count_subquery, shared_images.c.id == bbox_count_subquery.c.shared_image_id
            )

            if filters.bbox_count_min is not None:
                base_query = base_query.where(bbox_cnt >= filters.bbox_count_min)
            if filters.bbox_count_max is not None:
                base_query = base_query.where(bbox_cnt <= filters.bbox_count_max)

        # Polygon count filtering (segmentations only)
        if filters.polygon_count_min is not None or filters.polygon_count_max is not None:
            polygon_count_subquery = (
                select(
                    images.c.shared_image_id, func.count(segmentations.c.id).label("polygon_cnt")
                )
                .select_from(segmentations.join(images, segmentations.c.image_id == images.c.id))
                .where(images.c.shared_image_id.in_(select(shared_images.c.id)))
                .group_by(images.c.shared_image_id)
                .subquery()
            )

            polygon_cnt = func.coalesce(polygon_count_subquery.c.polygon_cnt, 0)
            base_query = base_query.outerjoin(
                polygon_count_subquery,
                shared_images.c.id == polygon_count_subquery.c.shared_image_id,
            )

            if filters.polygon_count_min is not None:
                base_query = base_query.where(polygon_cnt >= filters.polygon_count_min)
            if filters.polygon_count_max is not None:
                base_query = base_query.where(polygon_cnt <= filters.polygon_count_max)

        if filters.filepath_pattern:
            # Convert glob-style wildcards to SQL LIKE: * -> %, ? -> _
            # A pattern without a wildcard stays an exact match, which is what the
            # filepath filter's "supports wildcards" hint implies.
            sql_pattern = filters.filepath_pattern.replace("*", "%").replace("?", "_")
            base_query = base_query.where(shared_images.c.file_path.ilike(sql_pattern))

        # Filter by directory paths (OR logic - match ANY path)
        if filters.filepath_paths and len(filters.filepath_paths) > 0:
            path_conditions = [
                shared_images.c.file_path.like(f"{path}/%") for path in filters.filepath_paths
            ]
            base_query = base_query.where(or_(*path_conditions))

        # Filter by image UUIDs
        if filters.image_uids and len(filters.image_uids) > 0:
            base_query = base_query.where(shared_images.c.id.in_(filters.image_uids))

        # Quality metric filters - join with image_quality_metrics if any quality filter is set
        has_quality_filter = any(
            [
                filters.quality_min is not None,
                filters.quality_max is not None,
                filters.sharpness_min is not None,
                filters.sharpness_max is not None,
                filters.brightness_min is not None,
                filters.brightness_max is not None,
                filters.contrast_min is not None,
                filters.contrast_max is not None,
                filters.uniqueness_min is not None,
                filters.uniqueness_max is not None,
                filters.red_min is not None,
                filters.red_max is not None,
                filters.green_min is not None,
                filters.green_max is not None,
                filters.blue_min is not None,
                filters.blue_max is not None,
                filters.issues is not None and len(filters.issues) > 0,
            ]
        )

        if has_quality_filter:
            # Use subquery to filter by quality metrics
            quality_subquery = select(image_quality_metrics.c.shared_image_id).where(
                image_quality_metrics.c.status == "completed"
            )

            metric_bounds = (
                (image_quality_metrics.c.overall_quality, filters.quality_min, filters.quality_max),
                (image_quality_metrics.c.sharpness, filters.sharpness_min, filters.sharpness_max),
                (
                    image_quality_metrics.c.brightness,
                    filters.brightness_min,
                    filters.brightness_max,
                ),
                (image_quality_metrics.c.contrast, filters.contrast_min, filters.contrast_max),
                (
                    image_quality_metrics.c.uniqueness,
                    filters.uniqueness_min,
                    filters.uniqueness_max,
                ),
                (image_quality_metrics.c.red_avg, filters.red_min, filters.red_max),
                (image_quality_metrics.c.green_avg, filters.green_min, filters.green_max),
                (image_quality_metrics.c.blue_avg, filters.blue_min, filters.blue_max),
            )
            for column, minimum, maximum in metric_bounds:
                if minimum is not None:
                    quality_subquery = quality_subquery.where(column >= minimum)
                if maximum is not None:
                    quality_subquery = quality_subquery.where(column <= maximum)

            # Issues filter - find images containing any of the specified issues
            if filters.issues and len(filters.issues) > 0:
                issue_conditions = [
                    image_quality_metrics.c.issues.contains([issue]) for issue in filters.issues
                ]
                quality_subquery = quality_subquery.where(or_(*issue_conditions))

            base_query = base_query.where(shared_images.c.id.in_(quality_subquery))

        # Apply exclude filter FIRST (fail-fast)
        if filters.excluded_tag_ids and len(filters.excluded_tag_ids) > 0:
            if filters.exclude_match_mode == "OR":
                # Hide images with ANY excluded tag
                exclude_subquery = (
                    select(shared_image_tags.c.shared_image_id)
                    .where(shared_image_tags.c.tag_id.in_(filters.excluded_tag_ids))
                    .distinct()
                )
                base_query = base_query.where(shared_images.c.id.notin_(exclude_subquery))
            else:  # AND mode
                # Hide images with ALL excluded tags
                # Images with count(excluded_tags) == len(excluded_tag_ids) should be excluded
                exclude_subquery = (
                    select(shared_image_tags.c.shared_image_id)
                    .where(shared_image_tags.c.tag_id.in_(filters.excluded_tag_ids))
                    .group_by(shared_image_tags.c.shared_image_id)
                    .having(func.count(shared_image_tags.c.tag_id) == len(filters.excluded_tag_ids))
                )
                base_query = base_query.where(shared_images.c.id.notin_(exclude_subquery))

        # Then apply include filter
        if filters.tag_ids and len(filters.tag_ids) > 0:
            if filters.include_match_mode == "OR":
                # Show images with ANY included tag
                include_subquery = (
                    select(shared_image_tags.c.shared_image_id)
                    .where(shared_image_tags.c.tag_id.in_(filters.tag_ids))
                    .distinct()
                )
                base_query = base_query.where(shared_images.c.id.in_(include_subquery))
            else:  # AND mode
                # Show images with ALL included tags
                for tag_id in filters.tag_ids:
                    subquery = select(shared_image_tags.c.shared_image_id).where(
                        shared_image_tags.c.tag_id == tag_id
                    )
                    base_query = base_query.where(shared_images.c.id.in_(subquery))

        # Filter by task/job hierarchy
        if filters.job_id is not None:
            # Filter to images in specific job
            job_images_subquery = (
                select(images.c.shared_image_id)
                .where(images.c.job_id == filters.job_id)
                .where(images.c.shared_image_id.isnot(None))
            )
            base_query = base_query.where(shared_images.c.id.in_(job_images_subquery))

            if filters.is_annotated is not None:
                # Get shared_image_ids that have annotations in this job
                annotated_in_job = (
                    select(images.c.shared_image_id)
                    .where(images.c.job_id == filters.job_id)
                    .where(images.c.shared_image_id.isnot(None))
                    .where(has_any_annotation())
                    .distinct()
                )
                if filters.is_annotated:
                    base_query = base_query.where(shared_images.c.id.in_(annotated_in_job))
                else:
                    base_query = base_query.where(shared_images.c.id.notin_(annotated_in_job))

        elif filters.task_ids is not None and len(filters.task_ids) > 0:
            # Filter to images in ANY of the specified tasks (OR logic)
            task_images_subquery = (
                select(images.c.shared_image_id)
                .join(jobs, images.c.job_id == jobs.c.id)
                .where(jobs.c.task_id.in_(filters.task_ids))
                .where(images.c.shared_image_id.isnot(None))
            )
            base_query = base_query.where(shared_images.c.id.in_(task_images_subquery))

            if filters.is_annotated is not None:
                # Get shared_image_ids that have annotations in selected tasks
                annotated_in_tasks = (
                    select(images.c.shared_image_id)
                    .select_from(images.join(jobs, images.c.job_id == jobs.c.id))
                    .where(jobs.c.task_id.in_(filters.task_ids))
                    .where(images.c.shared_image_id.isnot(None))
                    .where(has_any_annotation())
                    .distinct()
                )
                if filters.is_annotated:
                    base_query = base_query.where(shared_images.c.id.in_(annotated_in_tasks))
                else:
                    base_query = base_query.where(shared_images.c.id.notin_(annotated_in_tasks))

        # Handle is_annotated filter when no task/job filter is specified (All Tasks)
        elif filters.is_annotated is not None:
            # Check annotations across ALL images linked to shared_images
            annotated_shared_ids = (
                select(images.c.shared_image_id)
                .where(images.c.shared_image_id.isnot(None))
                .where(has_any_annotation())
                .distinct()
            )
            if filters.is_annotated:
                base_query = base_query.where(shared_images.c.id.in_(annotated_shared_ids))
            else:
                base_query = base_query.where(shared_images.c.id.notin_(annotated_shared_ids))

        return base_query

    @staticmethod
    async def explore(
        connection: AsyncConnection,
        project_id: int,
        page: int = 1,
        page_size: int = 50,
        filters: ImageFilterParams | None = None,
        tag_ids: list[UUID] | None = None,
        excluded_tag_ids: list[UUID] | None = None,
        include_match_mode: MatchMode = "OR",
        exclude_match_mode: MatchMode = "OR",
        task_ids: list[int] | None = None,
        job_id: int | None = None,
        is_annotated: bool | None = None,
        search: str | None = None,
        # Dimension filters
        width_min: int | None = None,
        width_max: int | None = None,
        height_min: int | None = None,
        height_max: int | None = None,
        file_size_min: int | None = None,
        file_size_max: int | None = None,
        aspect_ratio_min: float | None = None,
        aspect_ratio_max: float | None = None,
        object_count_min: int | None = None,
        object_count_max: int | None = None,
        bbox_count_min: int | None = None,
        bbox_count_max: int | None = None,
        polygon_count_min: int | None = None,
        polygon_count_max: int | None = None,
        filepath_pattern: str | None = None,
        filepath_paths: list[str] | None = None,
        image_uids: list[UUID] | None = None,
        # Quality metric filters
        quality_min: float | None = None,
        quality_max: float | None = None,
        sharpness_min: float | None = None,
        sharpness_max: float | None = None,
        brightness_min: float | None = None,
        brightness_max: float | None = None,
        contrast_min: float | None = None,
        contrast_max: float | None = None,
        uniqueness_min: float | None = None,
        uniqueness_max: float | None = None,
        # RGB channel filters
        red_min: float | None = None,
        red_max: float | None = None,
        green_min: float | None = None,
        green_max: float | None = None,
        blue_min: float | None = None,
        blue_max: float | None = None,
        # Quality issues filter
        issues: list[str] | None = None,
    ) -> tuple[list[dict], int]:
        """Explore images with combined filtering, one page at a time.

        Pass ``filters`` to describe the image set with the canonical contract; the individual filter keyword arguments are the older spelling of the same thing and are assembled into an ``ImageFilterParams`` when ``filters`` is not given. Results are ordered by ``IMAGE_ORDER_BY`` so page boundaries are stable across requests.
        """
        if filters is None:
            filters = ImageFilterParams(
                tag_ids=tag_ids,
                excluded_tag_ids=excluded_tag_ids,
                include_match_mode=include_match_mode,
                exclude_match_mode=exclude_match_mode,
                task_ids=task_ids,
                job_id=job_id,
                is_annotated=is_annotated,
                search=search,
                width_min=width_min,
                width_max=width_max,
                height_min=height_min,
                height_max=height_max,
                file_size_min=file_size_min,
                file_size_max=file_size_max,
                aspect_ratio_min=aspect_ratio_min,
                aspect_ratio_max=aspect_ratio_max,
                object_count_min=object_count_min,
                object_count_max=object_count_max,
                bbox_count_min=bbox_count_min,
                bbox_count_max=bbox_count_max,
                polygon_count_min=polygon_count_min,
                polygon_count_max=polygon_count_max,
                filepath_pattern=filepath_pattern,
                filepath_paths=filepath_paths,
                image_uids=image_uids,
                quality_min=quality_min,
                quality_max=quality_max,
                sharpness_min=sharpness_min,
                sharpness_max=sharpness_max,
                brightness_min=brightness_min,
                brightness_max=brightness_max,
                contrast_min=contrast_min,
                contrast_max=contrast_max,
                uniqueness_min=uniqueness_min,
                uniqueness_max=uniqueness_max,
                red_min=red_min,
                red_max=red_max,
                green_min=green_min,
                green_max=green_max,
                blue_min=blue_min,
                blue_max=blue_max,
                issues=issues,
            )

        base_query = ProjectImageRepository.build_filtered_query(project_id, filters)

        # Count total
        count_stmt = select(func.count()).select_from(base_query.subquery())
        total = (await connection.execute(count_stmt)).scalar() or 0

        # Get page
        stmt = base_query.order_by(*IMAGE_ORDER_BY).offset((page - 1) * page_size).limit(page_size)
        result = await connection.execute(stmt)
        items = [dict(row._mapping) for row in result.fetchall()]

        return items, total
