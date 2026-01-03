"""Repository layer for ProjectImage (project pool) data access."""

from uuid import UUID

from sqlalchemy import delete, func, insert, literal, select
from sqlalchemy.ext.asyncio import AsyncConnection

from app.models.data_management import project_images, shared_image_tags, shared_images, tags
from app.models.image import images
from app.models.image_quality import image_quality_metrics
from app.models.job import jobs
from app.models.task import tasks
from app.models.annotation import detections, segmentations


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
        stmt = (
            base_query.order_by(shared_images.c.filename)
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
        excluded_tag_ids: list[UUID] | None = None,
        include_match_mode: str = "OR",
        exclude_match_mode: str = "OR",
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
        """
        Explore images with combined filtering.
        Supports filtering by tags, task/job hierarchy, annotation status, search, and metadata.
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
            base_query = base_query.where(shared_images.c.filename.ilike(f"%{search}%"))

        # Metadata Filters
        if width_min is not None:
            base_query = base_query.where(shared_images.c.width >= width_min)
        if width_max is not None:
            base_query = base_query.where(shared_images.c.width <= width_max)

        if height_min is not None:
            base_query = base_query.where(shared_images.c.height >= height_min)
        if height_max is not None:
            base_query = base_query.where(shared_images.c.height <= height_max)

        if file_size_min is not None:
            base_query = base_query.where(shared_images.c.file_size_bytes >= file_size_min)
        if file_size_max is not None:
            base_query = base_query.where(shared_images.c.file_size_bytes <= file_size_max)

        if aspect_ratio_min is not None:
            base_query = base_query.where(shared_images.c.aspect_ratio >= aspect_ratio_min)
        if aspect_ratio_max is not None:
            base_query = base_query.where(shared_images.c.aspect_ratio <= aspect_ratio_max)

        # Object count filtering (detections + segmentations)
        if object_count_min is not None or object_count_max is not None:
            # Subquery to count total annotations per shared_image
            det_count = (
                select(
                    images.c.shared_image_id,
                    func.count(detections.c.id).label("det_count")
                )
                .select_from(detections.join(images, detections.c.image_id == images.c.id))
                .where(images.c.shared_image_id.in_(select(shared_images.c.id)))
                .group_by(images.c.shared_image_id)
                .subquery()
            )

            seg_count = (
                select(
                    images.c.shared_image_id,
                    func.count(segmentations.c.id).label("seg_count")
                )
                .select_from(segmentations.join(images, segmentations.c.image_id == images.c.id))
                .where(images.c.shared_image_id.in_(select(shared_images.c.id)))
                .group_by(images.c.shared_image_id)
                .subquery()
            )

            # Join both counts and filter
            total_count = (
                func.coalesce(det_count.c.det_count, 0) +
                func.coalesce(seg_count.c.seg_count, 0)
            )

            base_query = (
                base_query
                .outerjoin(det_count, shared_images.c.id == det_count.c.shared_image_id)
                .outerjoin(seg_count, shared_images.c.id == seg_count.c.shared_image_id)
            )

            if object_count_min is not None:
                base_query = base_query.where(total_count >= object_count_min)
            if object_count_max is not None:
                base_query = base_query.where(total_count <= object_count_max)

        # BBox count filtering (detections only)
        if bbox_count_min is not None or bbox_count_max is not None:
            bbox_count_subquery = (
                select(
                    images.c.shared_image_id,
                    func.count(detections.c.id).label("bbox_cnt")
                )
                .select_from(detections.join(images, detections.c.image_id == images.c.id))
                .where(images.c.shared_image_id.in_(select(shared_images.c.id)))
                .group_by(images.c.shared_image_id)
                .subquery()
            )

            bbox_cnt = func.coalesce(bbox_count_subquery.c.bbox_cnt, 0)
            base_query = base_query.outerjoin(
                bbox_count_subquery, shared_images.c.id == bbox_count_subquery.c.shared_image_id
            )

            if bbox_count_min is not None:
                base_query = base_query.where(bbox_cnt >= bbox_count_min)
            if bbox_count_max is not None:
                base_query = base_query.where(bbox_cnt <= bbox_count_max)

        # Polygon count filtering (segmentations only)
        if polygon_count_min is not None or polygon_count_max is not None:
            polygon_count_subquery = (
                select(
                    images.c.shared_image_id,
                    func.count(segmentations.c.id).label("polygon_cnt")
                )
                .select_from(segmentations.join(images, segmentations.c.image_id == images.c.id))
                .where(images.c.shared_image_id.in_(select(shared_images.c.id)))
                .group_by(images.c.shared_image_id)
                .subquery()
            )

            polygon_cnt = func.coalesce(polygon_count_subquery.c.polygon_cnt, 0)
            base_query = base_query.outerjoin(
                polygon_count_subquery, shared_images.c.id == polygon_count_subquery.c.shared_image_id
            )

            if polygon_count_min is not None:
                base_query = base_query.where(polygon_cnt >= polygon_count_min)
            if polygon_count_max is not None:
                base_query = base_query.where(polygon_cnt <= polygon_count_max)

        if filepath_pattern:
            # Convert glob-style wildcards to SQL LIKE
            # * -> %
            # ? -> _
            sql_pattern = filepath_pattern.replace("*", "%").replace("?", "_")
            if "%" not in sql_pattern and "_" not in sql_pattern:
                # If no wildcards, assume partial match or exact? User prompt says "filepath search".
                # FilepathFilter component says "Supports wildcards".
                # If they type "/foo/bar", they probably mean exact or prefix?
                # Let's default to partial match if no wildcard, or exact?
                # Usually standard filtering is 'contains' if no wildcard.
                # But filepath_pattern implies specific pattern.
                # If I type "*.jpg", I get "%".jpg".
                pass
            base_query = base_query.where(shared_images.c.file_path.ilike(sql_pattern))

        # Filter by directory paths (OR logic - match ANY path)
        if filepath_paths and len(filepath_paths) > 0:
            from sqlalchemy import or_
            path_conditions = [
                shared_images.c.file_path.like(f"{path}/%") for path in filepath_paths
            ]
            base_query = base_query.where(or_(*path_conditions))

        # Filter by image UUIDs
        if image_uids and len(image_uids) > 0:
            base_query = base_query.where(shared_images.c.id.in_(image_uids))

        # Quality metric filters - join with image_quality_metrics if any quality filter is set
        has_quality_filter = any([
            quality_min is not None, quality_max is not None,
            sharpness_min is not None, sharpness_max is not None,
            brightness_min is not None, brightness_max is not None,
            contrast_min is not None, contrast_max is not None,
            uniqueness_min is not None, uniqueness_max is not None,
            red_min is not None, red_max is not None,
            green_min is not None, green_max is not None,
            blue_min is not None, blue_max is not None,
            issues is not None and len(issues) > 0,
        ])

        if has_quality_filter:
            # Use subquery to filter by quality metrics
            quality_subquery = (
                select(image_quality_metrics.c.shared_image_id)
                .where(image_quality_metrics.c.status == "completed")
            )

            if quality_min is not None:
                quality_subquery = quality_subquery.where(
                    image_quality_metrics.c.overall_quality >= quality_min
                )
            if quality_max is not None:
                quality_subquery = quality_subquery.where(
                    image_quality_metrics.c.overall_quality <= quality_max
                )
            if sharpness_min is not None:
                quality_subquery = quality_subquery.where(
                    image_quality_metrics.c.sharpness >= sharpness_min
                )
            if sharpness_max is not None:
                quality_subquery = quality_subquery.where(
                    image_quality_metrics.c.sharpness <= sharpness_max
                )
            if brightness_min is not None:
                quality_subquery = quality_subquery.where(
                    image_quality_metrics.c.brightness >= brightness_min
                )
            if brightness_max is not None:
                quality_subquery = quality_subquery.where(
                    image_quality_metrics.c.brightness <= brightness_max
                )
            if contrast_min is not None:
                quality_subquery = quality_subquery.where(
                    image_quality_metrics.c.contrast >= contrast_min
                )
            if contrast_max is not None:
                quality_subquery = quality_subquery.where(
                    image_quality_metrics.c.contrast <= contrast_max
                )
            if uniqueness_min is not None:
                quality_subquery = quality_subquery.where(
                    image_quality_metrics.c.uniqueness >= uniqueness_min
                )
            if uniqueness_max is not None:
                quality_subquery = quality_subquery.where(
                    image_quality_metrics.c.uniqueness <= uniqueness_max
                )
            # RGB channel filters
            if red_min is not None:
                quality_subquery = quality_subquery.where(
                    image_quality_metrics.c.red_avg >= red_min
                )
            if red_max is not None:
                quality_subquery = quality_subquery.where(
                    image_quality_metrics.c.red_avg <= red_max
                )
            if green_min is not None:
                quality_subquery = quality_subquery.where(
                    image_quality_metrics.c.green_avg >= green_min
                )
            if green_max is not None:
                quality_subquery = quality_subquery.where(
                    image_quality_metrics.c.green_avg <= green_max
                )
            if blue_min is not None:
                quality_subquery = quality_subquery.where(
                    image_quality_metrics.c.blue_avg >= blue_min
                )
            if blue_max is not None:
                quality_subquery = quality_subquery.where(
                    image_quality_metrics.c.blue_avg <= blue_max
                )
            # Issues filter - find images containing any of the specified issues
            if issues and len(issues) > 0:
                from sqlalchemy import or_
                # Use PostgreSQL JSONB ?| operator (contains any of array elements)
                # For each issue, check if it's in the issues array
                issue_conditions = [
                    image_quality_metrics.c.issues.contains([issue])
                    for issue in issues
                ]
                quality_subquery = quality_subquery.where(or_(*issue_conditions))

            base_query = base_query.where(shared_images.c.id.in_(quality_subquery))

        # Apply exclude filter FIRST (fail-fast)
        if excluded_tag_ids and len(excluded_tag_ids) > 0:
            if exclude_match_mode == "OR":
                # Hide images with ANY excluded tag
                exclude_subquery = (
                    select(shared_image_tags.c.shared_image_id)
                    .where(shared_image_tags.c.tag_id.in_(excluded_tag_ids))
                    .distinct()
                )
                base_query = base_query.where(shared_images.c.id.notin_(exclude_subquery))
            else:  # AND mode
                # Hide images with ALL excluded tags
                # Images with count(excluded_tags) == len(excluded_tag_ids) should be excluded
                exclude_subquery = (
                    select(shared_image_tags.c.shared_image_id)
                    .where(shared_image_tags.c.tag_id.in_(excluded_tag_ids))
                    .group_by(shared_image_tags.c.shared_image_id)
                    .having(func.count(shared_image_tags.c.tag_id) == len(excluded_tag_ids))
                )
                base_query = base_query.where(shared_images.c.id.notin_(exclude_subquery))

        # Then apply include filter
        if tag_ids and len(tag_ids) > 0:
            if include_match_mode == "OR":
                # Show images with ANY included tag
                include_subquery = (
                    select(shared_image_tags.c.shared_image_id)
                    .where(shared_image_tags.c.tag_id.in_(tag_ids))
                    .distinct()
                )
                base_query = base_query.where(shared_images.c.id.in_(include_subquery))
            else:  # AND mode
                # Show images with ALL included tags (existing logic)
                for tag_id in tag_ids:
                    subquery = select(shared_image_tags.c.shared_image_id).where(
                        shared_image_tags.c.tag_id == tag_id
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
                # Count actual annotations using subquery join approach
                from sqlalchemy import or_
                # Get shared_image_ids that have annotations in this job
                annotated_in_job = (
                    select(images.c.shared_image_id)
                    .select_from(
                        images
                        .outerjoin(detections, detections.c.image_id == images.c.id)
                        .outerjoin(segmentations, segmentations.c.image_id == images.c.id)
                    )
                    .where(images.c.job_id == job_id)
                    .where(images.c.shared_image_id.isnot(None))
                    .where(or_(detections.c.id.isnot(None), segmentations.c.id.isnot(None)))
                    .distinct()
                )
                if is_annotated:
                    base_query = base_query.where(shared_images.c.id.in_(annotated_in_job))
                else:
                    base_query = base_query.where(shared_images.c.id.notin_(annotated_in_job))

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
                # Get shared_image_ids that have annotations in selected tasks
                from sqlalchemy import or_
                annotated_in_tasks = (
                    select(images.c.shared_image_id)
                    .select_from(
                        images
                        .join(jobs, images.c.job_id == jobs.c.id)
                        .outerjoin(detections, detections.c.image_id == images.c.id)
                        .outerjoin(segmentations, segmentations.c.image_id == images.c.id)
                    )
                    .where(jobs.c.task_id.in_(task_ids))
                    .where(images.c.shared_image_id.isnot(None))
                    .where(or_(detections.c.id.isnot(None), segmentations.c.id.isnot(None)))
                    .distinct()
                )
                if is_annotated:
                    base_query = base_query.where(shared_images.c.id.in_(annotated_in_tasks))
                else:
                    base_query = base_query.where(shared_images.c.id.notin_(annotated_in_tasks))

        # Handle is_annotated filter when no task/job filter is specified (All Tasks)
        elif is_annotated is not None:
            # Check annotations across ALL images linked to shared_images
            from sqlalchemy import or_
            annotated_shared_ids = (
                select(images.c.shared_image_id)
                .select_from(
                    images
                    .outerjoin(detections, detections.c.image_id == images.c.id)
                    .outerjoin(segmentations, segmentations.c.image_id == images.c.id)
                )
                .where(images.c.shared_image_id.isnot(None))
                .where(or_(detections.c.id.isnot(None), segmentations.c.id.isnot(None)))
                .distinct()
            )
            if is_annotated:
                base_query = base_query.where(shared_images.c.id.in_(annotated_shared_ids))
            else:
                base_query = base_query.where(shared_images.c.id.notin_(annotated_shared_ids))

        # Count total
        count_stmt = select(func.count()).select_from(base_query.subquery())
        total = (await connection.execute(count_stmt)).scalar() or 0

        # Get page
        stmt = (
            base_query.order_by(shared_images.c.filename)
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
        result = await connection.execute(stmt)
        items = [dict(row._mapping) for row in result.fetchall()]

        return items, total

    @staticmethod
    async def get_size_distribution(
        connection: AsyncConnection,
        project_id: int,
    ) -> dict:
        """
        Get image size distribution for sidebar.
        Categories: small (<0.5MP), medium (0.5-2MP), large (>2MP)
        """
        from sqlalchemy import case

        # Calculate megapixels: width * height
        megapixels = shared_images.c.width * shared_images.c.height

        stmt = (
            select(
                func.sum(case((megapixels < 500000, 1), else_=0)).label("small"),
                func.sum(
                    case((megapixels >= 500000, 1), else_=0)
                    * case((megapixels < 2000000, 1), else_=0)
                ).label("medium"),
                func.sum(case((megapixels >= 2000000, 1), else_=0)).label("large"),
            )
            .select_from(shared_images)
            .join(project_images, shared_images.c.id == project_images.c.shared_image_id)
            .where(project_images.c.project_id == project_id)
            .where(shared_images.c.width.isnot(None))
            .where(shared_images.c.height.isnot(None))
        )

        result = await connection.execute(stmt)
        row = result.fetchone()

        if row:
            return {
                "small": int(row.small or 0),
                "medium": int(row.medium or 0),
                "large": int(row.large or 0),
            }
        return {"small": 0, "medium": 0, "large": 0}

    @staticmethod
    async def get_numeric_stats(
        connection: AsyncConnection,
        project_id: int,
        column,
        filtered_image_ids: list[UUID] | None = None,
        num_buckets: int = 20,
    ) -> dict:
        """Get aggregated stats for a numeric column (width, height, file_size)."""
        # Base query joins project_images to shared_images (where the columns usually are)
        # Note: 'column' argument should be shared_images.c.width etc.

        base_where = [
            project_images.c.project_id == project_id,
            column.isnot(None),
        ]

        if filtered_image_ids:
            base_where.append(project_images.c.shared_image_id.in_(filtered_image_ids))

        # Get min, max, avg
        stats_stmt = (
            select(
                func.min(column).label("min_value"),
                func.max(column).label("max_value"),
                func.avg(column).label("mean"),
                func.count().label("total"),
            )
            .select_from(project_images)
            .join(shared_images, project_images.c.shared_image_id == shared_images.c.id)
            .where(*base_where)
        )

        stats_result = await connection.execute(stats_stmt)
        stats = stats_result.fetchone()

        if not stats or stats.total == 0:
            return {
                "min_value": 0,
                "max_value": 0,
                "mean": 0,
                "histogram": [],
            }

        min_val = float(stats.min_value)
        max_val = float(stats.max_value)
        mean_val = float(stats.mean)

        # Build histogram
        if min_val == max_val:
            histogram = [{"bucket_start": min_val, "bucket_end": max_val, "count": stats.total}]
        else:
            bucket_width = (max_val - min_val) / num_buckets
            # Use literal() to ensure values are treated as SQL literals, not parameters
            bucket_expr = func.floor((column - literal(min_val)) / literal(bucket_width))
            histogram_stmt = (
                select(
                    bucket_expr.label("bucket"),
                    func.count().label("count"),
                )
                .select_from(project_images)
                .join(shared_images, project_images.c.shared_image_id == shared_images.c.id)
                .where(*base_where)
                .group_by(bucket_expr)
                .order_by("bucket")
            )

            hist_result = await connection.execute(histogram_stmt)
            histogram = []
            for row in hist_result.fetchall():
                bucket_idx = int(row.bucket) if row.bucket is not None else 0
                bucket_idx = min(bucket_idx, num_buckets - 1)  # Clamp to last bucket
                bucket_start = min_val + bucket_idx * bucket_width
                bucket_end = bucket_start + bucket_width
                histogram.append(
                    {
                        "bucket_start": bucket_start,
                        "bucket_end": bucket_end,
                        "count": row.count,
                    }
                )

        return {
            "min_value": min_val,
            "max_value": max_val,
            "mean": mean_val,
            "histogram": histogram,
        }
