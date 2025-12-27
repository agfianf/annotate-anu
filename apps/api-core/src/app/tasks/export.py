"""Celery task for generating exports."""

import asyncio
import json
import logging
from pathlib import Path
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncConnection

from app.config import settings
from app.helpers.database import get_async_engine
from app.models.annotation import detections, image_tags, segmentations
from app.models.data_management import project_images, shared_images
from app.models.image import images
from app.models.job import jobs
from app.models.project import labels
from app.models.task import tasks
from app.repositories.activity import ProjectActivityRepository
from app.repositories.export import ExportRepository
from app.services.export import (
    build_classification_manifest,
    build_coco_json,
    create_export_zip,
)
from app.tasks.main import celery_app


logger = logging.getLogger(__name__)


@celery_app.task(bind=True, max_retries=3, default_retry_delay=60)
def generate_export_task(self, export_id: str) -> dict:
    """Background task to generate export artifact.

    Args:
        export_id: UUID string of the export record

    Returns:
        dict with status and artifact path
    """
    logger.info(f"Starting export generation for {export_id}")

    # Run the async export generation in an event loop
    try:
        result = asyncio.run(_generate_export_async(export_id))
        return result
    except Exception as e:
        logger.exception(f"Export generation failed for {export_id}: {e}")
        # Update status to failed
        asyncio.run(_update_export_status(export_id, "failed", error_message=str(e)))
        raise self.retry(exc=e)


async def _generate_export_async(export_id: str) -> dict:
    """Async implementation of export generation."""
    engine = get_async_engine()

    async with engine.connect() as connection:
        # Load export configuration
        export_data = await ExportRepository.get_by_id(connection, UUID(export_id))
        if not export_data:
            raise ValueError(f"Export {export_id} not found")

        # Update status to processing
        await ExportRepository.update_status(connection, UUID(export_id), "processing")
        await connection.commit()

        project_id = export_data["project_id"]
        export_mode = export_data["export_mode"]
        output_format = export_data["output_format"]
        filter_snapshot = export_data["filter_snapshot"]
        classification_config = export_data.get("classification_config")
        mode_options = export_data.get("mode_options") or {}
        include_images = export_data["include_images"]
        resolved_metadata = export_data.get("resolved_metadata") or {}

        try:
            # Query filtered images
            images_data = await _query_images_for_export(
                connection, project_id, filter_snapshot
            )

            if not images_data:
                raise ValueError("No images match the filter criteria")

            image_ids = [img["id"] for img in images_data]

            # Get labels for the project
            labels_data = await _get_project_labels(connection, project_id)

            # Generate export content based on mode
            if export_mode == "classification":
                # Build classification manifest
                class_assignments = await _get_classification_assignments(
                    connection, image_ids, classification_config
                )
                split_assignments = await _get_split_assignments(connection, image_ids)
                content = build_classification_manifest(
                    images_data, class_assignments, split_assignments
                )
                class_counts = {}
                for class_name in class_assignments.values():
                    class_counts[class_name] = class_counts.get(class_name, 0) + 1

            elif export_mode == "detection":
                # Build COCO JSON for detections
                annotations = await _get_detections_for_export(
                    connection,
                    image_ids,
                    mode_options.get("label_filter"),
                    mode_options.get("include_bbox_from_segmentation", False),
                )
                # Enhance resolved_metadata with export-specific data
                export_metadata = {
                    **resolved_metadata,
                    "export_id": export_id,
                    "version_number": export_data.get("version_number"),
                    "export_mode": export_mode,
                    "output_format": output_format,
                    "include_images": include_images,
                }
                content = build_coco_json(
                    images_data,
                    annotations,
                    labels_data,
                    "detection",
                    export_metadata=export_metadata,
                )
                class_counts = {}
                for ann in annotations:
                    label_name = next(
                        (l["name"] for l in labels_data if str(l["id"]) == str(ann["label_id"])),
                        "unknown",
                    )
                    class_counts[label_name] = class_counts.get(label_name, 0) + 1

            elif export_mode == "segmentation":
                # Build COCO JSON for segmentations
                annotations = await _get_segmentations_for_export(
                    connection,
                    image_ids,
                    mode_options.get("label_filter"),
                    mode_options.get("convert_bbox_to_segmentation", False),
                )
                # Enhance resolved_metadata with export-specific data
                export_metadata = {
                    **resolved_metadata,
                    "export_id": export_id,
                    "version_number": export_data.get("version_number"),
                    "export_mode": export_mode,
                    "output_format": output_format,
                    "include_images": include_images,
                }
                content = build_coco_json(
                    images_data,
                    annotations,
                    labels_data,
                    "segmentation",
                    include_bbox_alongside_seg=mode_options.get(
                        "include_bbox_alongside_segmentation", False
                    ),
                    export_metadata=export_metadata,
                )
                class_counts = {}
                for ann in annotations:
                    label_name = next(
                        (l["name"] for l in labels_data if str(l["id"]) == str(ann["label_id"])),
                        "unknown",
                    )
                    class_counts[label_name] = class_counts.get(label_name, 0) + 1

            else:
                raise ValueError(f"Unknown export mode: {export_mode}")

            # Create export directory
            export_dir = settings.EXPORT_ROOT / str(project_id) / export_id
            export_dir.mkdir(parents=True, exist_ok=True)

            # Create ZIP file
            zip_path, zip_size = create_export_zip(
                export_dir,
                export_id,
                content,
                output_format,
                include_images=include_images,
                images_data=images_data if include_images else None,
            )

            # Get split counts
            split_assignments = await _get_split_assignments(connection, image_ids)
            split_counts = {"train": 0, "val": 0, "test": 0, "none": 0}
            for split in split_assignments.values():
                split_counts[split] = split_counts.get(split, 0) + 1

            # Build summary
            summary = {
                "image_count": len(images_data),
                "annotation_count": len(annotations) if export_mode != "classification" else len(class_assignments),
                "class_counts": class_counts,
                "split_counts": split_counts,
            }

            # Update export with results
            artifact_path = str(zip_path.relative_to(settings.EXPORT_ROOT))
            await ExportRepository.update_status(
                connection,
                UUID(export_id),
                "completed",
                artifact_path=artifact_path,
                artifact_size_bytes=zip_size,
                summary=summary,
            )

            # Log activity for export completion
            try:
                export_name = export_data.get("name") or f"{export_mode} export"
                await ProjectActivityRepository.create(
                    connection,
                    project_id=project_id,
                    actor_id=None,  # System action
                    actor_name="System",
                    data={
                        "entity_type": "export",
                        "entity_id": UUID(export_id),
                        "entity_name": export_name,
                        "action": "completed",
                        "new_data": {
                            "status": "completed",
                            "image_count": summary["image_count"],
                            "annotation_count": summary["annotation_count"],
                            "size_bytes": zip_size,
                        },
                    },
                )
            except Exception as e:
                logger.warning(f"Failed to log export completion activity: {e}")

            await connection.commit()

            logger.info(f"Export {export_id} completed successfully: {artifact_path}")
            return {"status": "completed", "artifact_path": artifact_path, "size": zip_size}

        except Exception as e:
            logger.exception(f"Export generation failed: {e}")
            await ExportRepository.update_status(
                connection, UUID(export_id), "failed", error_message=str(e)
            )

            # Log activity for export failure
            try:
                export_name = export_data.get("name") or f"{export_mode} export"
                await ProjectActivityRepository.create(
                    connection,
                    project_id=project_id,
                    actor_id=None,  # System action
                    actor_name="System",
                    data={
                        "entity_type": "export",
                        "entity_id": UUID(export_id),
                        "entity_name": export_name,
                        "action": "failed",
                        "new_data": {
                            "status": "failed",
                            "error": str(e)[:500],  # Limit error message length
                        },
                    },
                )
            except Exception as log_err:
                logger.warning(f"Failed to log export failure activity: {log_err}")

            await connection.commit()
            raise


async def _update_export_status(
    export_id: str, status: str, error_message: str | None = None
) -> None:
    """Update export status."""
    engine = get_async_engine()
    async with engine.connect() as connection:
        await ExportRepository.update_status(
            connection, UUID(export_id), status, error_message=error_message
        )
        await connection.commit()


async def _query_images_for_export(
    connection: AsyncConnection,
    project_id: int,
    filter_snapshot: dict,
) -> list[dict]:
    """Query images for export based on filter snapshot."""
    from sqlalchemy import func, or_
    from app.models.data_management import shared_image_tags

    # Base query
    query = (
        select(
            shared_images.c.id,
            shared_images.c.file_path,
            shared_images.c.filename,
            shared_images.c.width,
            shared_images.c.height,
        )
        .join(
            project_images,
            shared_images.c.id == project_images.c.shared_image_id,
        )
        .where(project_images.c.project_id == project_id)
    )

    # Apply filters from snapshot
    tag_ids = filter_snapshot.get("tag_ids")
    excluded_tag_ids = filter_snapshot.get("excluded_tag_ids")
    include_match_mode = filter_snapshot.get("include_match_mode", "OR")
    exclude_match_mode = filter_snapshot.get("exclude_match_mode", "OR")
    task_ids = filter_snapshot.get("task_ids")
    job_id = filter_snapshot.get("job_id")
    is_annotated = filter_snapshot.get("is_annotated")
    filepath_paths = filter_snapshot.get("filepath_paths")
    image_uids = filter_snapshot.get("image_uids")
    file_size_min = filter_snapshot.get("file_size_min")
    file_size_max = filter_snapshot.get("file_size_max")

    # Tag filters
    if tag_ids:
        tag_uuids = [UUID(t) if isinstance(t, str) else t for t in tag_ids]
        if include_match_mode == "OR":
            subquery = (
                select(shared_image_tags.c.shared_image_id)
                .where(shared_image_tags.c.tag_id.in_(tag_uuids))
                .distinct()
            )
            query = query.where(shared_images.c.id.in_(subquery))
        else:
            for tag_id in tag_uuids:
                subquery = select(shared_image_tags.c.shared_image_id).where(
                    shared_image_tags.c.tag_id == tag_id
                )
                query = query.where(shared_images.c.id.in_(subquery))

    if excluded_tag_ids:
        excluded_uuids = [UUID(t) if isinstance(t, str) else t for t in excluded_tag_ids]
        if exclude_match_mode == "OR":
            subquery = (
                select(shared_image_tags.c.shared_image_id)
                .where(shared_image_tags.c.tag_id.in_(excluded_uuids))
                .distinct()
            )
            query = query.where(shared_images.c.id.notin_(subquery))
        else:
            subquery = (
                select(shared_image_tags.c.shared_image_id)
                .where(shared_image_tags.c.tag_id.in_(excluded_uuids))
                .group_by(shared_image_tags.c.shared_image_id)
                .having(func.count() == len(excluded_uuids))
            )
            query = query.where(shared_images.c.id.notin_(subquery))

    # Task/job filters
    if task_ids or job_id:
        job_query = (
            select(images.c.shared_image_id)
            .join(jobs, images.c.job_id == jobs.c.id)
            .where(images.c.shared_image_id.isnot(None))
        )
        if job_id:
            job_query = job_query.where(jobs.c.id == job_id)
        if task_ids:
            job_query = job_query.where(jobs.c.task_id.in_(task_ids))
        query = query.where(shared_images.c.id.in_(job_query))

    # Filepath filters
    if filepath_paths:
        path_conditions = [
            shared_images.c.file_path.like(f"{path}%") for path in filepath_paths
        ]
        query = query.where(or_(*path_conditions))

    # Image UID filter
    if image_uids:
        uid_list = [UUID(u) if isinstance(u, str) else u for u in image_uids]
        query = query.where(shared_images.c.id.in_(uid_list))

    # File size filters
    if file_size_min is not None:
        query = query.where(shared_images.c.file_size_bytes >= file_size_min)
    if file_size_max is not None:
        query = query.where(shared_images.c.file_size_bytes <= file_size_max)

    # Dimension filters
    if filter_snapshot.get("width_min"):
        query = query.where(shared_images.c.width >= filter_snapshot["width_min"])
    if filter_snapshot.get("width_max"):
        query = query.where(shared_images.c.width <= filter_snapshot["width_max"])
    if filter_snapshot.get("height_min"):
        query = query.where(shared_images.c.height >= filter_snapshot["height_min"])
    if filter_snapshot.get("height_max"):
        query = query.where(shared_images.c.height <= filter_snapshot["height_max"])

    # Annotation status filter
    if is_annotated is not None:
        annotated_subquery = (
            select(images.c.shared_image_id)
            .where(images.c.shared_image_id.isnot(None))
            .where(images.c.is_annotated == True)  # noqa: E712
            .distinct()
        )
        if is_annotated:
            query = query.where(shared_images.c.id.in_(annotated_subquery))
        else:
            query = query.where(shared_images.c.id.notin_(annotated_subquery))

    result = await connection.execute(query)
    return [dict(row._mapping) for row in result.fetchall()]


async def _get_project_labels(
    connection: AsyncConnection,
    project_id: int,
) -> list[dict]:
    """Get all labels for a project."""
    query = select(labels).where(labels.c.project_id == project_id)
    result = await connection.execute(query)
    return [dict(row._mapping) for row in result.fetchall()]


async def _get_classification_assignments(
    connection: AsyncConnection,
    image_ids: list[UUID],
    classification_config: dict | None,
) -> dict[str, str]:
    """Get class assignments for images."""
    # Map shared_image_ids to images table
    subquery = select(images.c.id, images.c.shared_image_id).where(
        images.c.shared_image_id.in_(image_ids)
    )

    # Query image_tags with labels
    query = (
        select(
            images.c.shared_image_id,
            labels.c.name,
        )
        .select_from(
            image_tags.join(labels, image_tags.c.label_id == labels.c.id).join(
                images, image_tags.c.image_id == images.c.id
            )
        )
        .where(images.c.shared_image_id.in_(image_ids))
    )

    result = await connection.execute(query)
    assignments = {}
    for row in result.fetchall():
        # For single-label, take the first one
        img_id = str(row.shared_image_id)
        if img_id not in assignments:
            assignments[img_id] = row.name

    return assignments


async def _get_split_assignments(
    connection: AsyncConnection,
    image_ids: list[UUID],
) -> dict[str, str]:
    """Get split assignments for images based on task split."""
    from sqlalchemy import func

    query = (
        select(
            images.c.shared_image_id,
            func.coalesce(tasks.c.split, "none").label("split"),
        )
        .select_from(
            images.join(jobs, images.c.job_id == jobs.c.id).join(
                tasks, jobs.c.task_id == tasks.c.id
            )
        )
        .where(images.c.shared_image_id.in_(image_ids))
    )

    result = await connection.execute(query)
    return {str(row.shared_image_id): row.split or "none" for row in result.fetchall()}


async def _get_detections_for_export(
    connection: AsyncConnection,
    image_ids: list[UUID],
    label_filter: list[str] | None = None,
    include_from_segmentation: bool = False,
) -> list[dict]:
    """Get detections for export."""
    # Map shared_image_ids to image_ids
    subquery = select(images.c.id, images.c.shared_image_id).where(
        images.c.shared_image_id.in_(image_ids)
    )

    # Query detections
    query = (
        select(
            detections.c.id,
            detections.c.label_id,
            detections.c.x_min,
            detections.c.y_min,
            detections.c.x_max,
            detections.c.y_max,
            images.c.shared_image_id,
        )
        .select_from(detections.join(images, detections.c.image_id == images.c.id))
        .where(images.c.shared_image_id.in_(image_ids))
    )

    if label_filter:
        label_uuids = [UUID(l) if isinstance(l, str) else l for l in label_filter]
        query = query.where(detections.c.label_id.in_(label_uuids))

    result = await connection.execute(query)
    annotations = [dict(row._mapping) | {"type": "detection"} for row in result.fetchall()]

    # Add segmentations as bboxes if requested
    if include_from_segmentation:
        seg_query = (
            select(
                segmentations.c.id,
                segmentations.c.label_id,
                segmentations.c.bbox_x_min.label("x_min"),
                segmentations.c.bbox_y_min.label("y_min"),
                segmentations.c.bbox_x_max.label("x_max"),
                segmentations.c.bbox_y_max.label("y_max"),
                images.c.shared_image_id,
            )
            .select_from(segmentations.join(images, segmentations.c.image_id == images.c.id))
            .where(images.c.shared_image_id.in_(image_ids))
            .where(segmentations.c.bbox_x_min.isnot(None))
        )

        if label_filter:
            seg_query = seg_query.where(segmentations.c.label_id.in_(label_uuids))

        seg_result = await connection.execute(seg_query)
        annotations.extend(
            [dict(row._mapping) | {"type": "detection"} for row in seg_result.fetchall()]
        )

    return annotations


async def _get_segmentations_for_export(
    connection: AsyncConnection,
    image_ids: list[UUID],
    label_filter: list[str] | None = None,
    include_from_detection: bool = False,
) -> list[dict]:
    """Get segmentations for export."""
    # Map shared_image_ids to image_ids
    subquery = select(images.c.id, images.c.shared_image_id).where(
        images.c.shared_image_id.in_(image_ids)
    )

    # Query segmentations
    query = (
        select(
            segmentations.c.id,
            segmentations.c.label_id,
            segmentations.c.polygon,
            segmentations.c.bbox_x_min,
            segmentations.c.bbox_y_min,
            segmentations.c.bbox_x_max,
            segmentations.c.bbox_y_max,
            images.c.shared_image_id,
        )
        .select_from(segmentations.join(images, segmentations.c.image_id == images.c.id))
        .where(images.c.shared_image_id.in_(image_ids))
        .where(segmentations.c.polygon.isnot(None))
    )

    if label_filter:
        label_uuids = [UUID(l) if isinstance(l, str) else l for l in label_filter]
        query = query.where(segmentations.c.label_id.in_(label_uuids))

    result = await connection.execute(query)
    annotations = [dict(row._mapping) | {"type": "segmentation"} for row in result.fetchall()]

    # Add detections as bbox-polygons if requested
    if include_from_detection:
        det_query = (
            select(
                detections.c.id,
                detections.c.label_id,
                detections.c.x_min,
                detections.c.y_min,
                detections.c.x_max,
                detections.c.y_max,
                images.c.shared_image_id,
            )
            .select_from(detections.join(images, detections.c.image_id == images.c.id))
            .where(images.c.shared_image_id.in_(image_ids))
        )

        if label_filter:
            det_query = det_query.where(detections.c.label_id.in_(label_uuids))

        det_result = await connection.execute(det_query)
        for row in det_result.fetchall():
            row_dict = dict(row._mapping)
            # Convert bbox to polygon (4 corners)
            x_min, y_min = row_dict["x_min"], row_dict["y_min"]
            x_max, y_max = row_dict["x_max"], row_dict["y_max"]
            row_dict["polygon"] = [
                [x_min, y_min],
                [x_max, y_min],
                [x_max, y_max],
                [x_min, y_max],
            ]
            row_dict["bbox_x_min"] = x_min
            row_dict["bbox_y_min"] = y_min
            row_dict["bbox_x_max"] = x_max
            row_dict["bbox_y_max"] = y_max
            row_dict["type"] = "segmentation"
            annotations.append(row_dict)

    return annotations
