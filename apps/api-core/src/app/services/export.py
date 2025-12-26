"""Export service for generating dataset exports."""

import csv
import io
import json
import logging
import os
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncConnection

from app.config import settings
from app.models.annotation import detections, image_tags, segmentations
from app.models.data_management import (
    project_images,
    shared_image_tags,
    shared_images,
    tag_categories,
    tags,
)
from app.models.image import images
from app.models.job import jobs
from app.models.project import labels
from app.models.task import tasks
from app.repositories.activity import ProjectActivityRepository
from app.repositories.export import ExportRepository
from app.schemas.export import (
    ClassificationMappingConfig,
    ExportCreate,
    ExportPreview,
    ExportSummary,
    FilterSnapshot,
    ModeOptions,
)


logger = logging.getLogger(__name__)


class ExportService:
    """Service for handling export operations."""

    async def preview_export(
        self,
        connection: AsyncConnection,
        project_id: int,
        export_config: ExportCreate,
    ) -> ExportPreview:
        """Generate preview counts without creating export."""
        # Query filtered images
        image_data = await self._query_filtered_images(
            connection, project_id, export_config.filter_snapshot
        )

        image_count = len(image_data)
        image_ids = [img["id"] for img in image_data]

        # Get annotation counts
        annotation_counts = {}
        class_counts = {}
        split_counts = {"train": 0, "val": 0, "test": 0, "none": 0}
        warnings = []

        if export_config.export_mode == "classification":
            # Count image_tags
            tag_count = await self._count_image_tags(connection, image_ids)
            annotation_counts["classification"] = tag_count
            class_counts = await self._get_class_counts_for_classification(
                connection, project_id, image_ids, export_config.classification_config
            )

        elif export_config.export_mode == "detection":
            # Count detections
            det_count, det_class_counts = await self._count_detections(
                connection,
                project_id,
                image_ids,
                export_config.mode_options,
            )
            annotation_counts["detection"] = det_count
            class_counts = det_class_counts

            # Check if include_bbox_from_segmentation
            if (
                export_config.mode_options
                and export_config.mode_options.include_bbox_from_segmentation
            ):
                seg_bbox_count = await self._count_segmentation_bboxes(
                    connection, project_id, image_ids, export_config.mode_options
                )
                annotation_counts["detection_from_segmentation"] = seg_bbox_count

        elif export_config.export_mode == "segmentation":
            # Count segmentations
            seg_count, seg_class_counts = await self._count_segmentations(
                connection,
                project_id,
                image_ids,
                export_config.mode_options,
            )
            annotation_counts["segmentation"] = seg_count
            class_counts = seg_class_counts

            # Check if convert_bbox_to_segmentation
            if (
                export_config.mode_options
                and export_config.mode_options.convert_bbox_to_segmentation
            ):
                bbox_seg_count = await self._count_detection_as_segmentation(
                    connection, project_id, image_ids, export_config.mode_options
                )
                annotation_counts["segmentation_from_detection"] = bbox_seg_count

        # Get split counts
        split_counts = await self._get_split_counts(connection, image_ids)

        # Generate warnings
        if image_count == 0:
            warnings.append("No images match the current filter")
        if sum(annotation_counts.values()) == 0:
            warnings.append("No annotations found for the selected images")

        images_without_annotations = await self._count_images_without_annotations(
            connection, project_id, image_ids, export_config.export_mode
        )
        if images_without_annotations > 0:
            warnings.append(f"{images_without_annotations} images have no annotations")

        return ExportPreview(
            image_count=image_count,
            annotation_counts=annotation_counts,
            class_counts=class_counts,
            split_counts=split_counts,
            warnings=warnings,
        )

    async def create_export(
        self,
        connection: AsyncConnection,
        project_id: int,
        export_config: ExportCreate,
        user_id: UUID | None = None,
    ) -> dict:
        """Create export record and queue background job."""
        # Get next version number for this project+mode
        version_number = await ExportRepository.get_next_version_number(
            connection, project_id, export_config.export_mode.value
        )

        # Generate name if not provided
        # Format: "Detection Export v3", "Classification Export v1", etc.
        name = export_config.name
        if not name:
            mode_label = export_config.export_mode.value.title()
            name = f"{mode_label} Export v{version_number}"

        # Create export record
        # Note: Use mode='json' to serialize UUIDs to strings for JSONB columns
        export_data = await ExportRepository.create(
            connection,
            project_id=project_id,
            export_mode=export_config.export_mode.value,
            output_format=export_config.output_format.value,
            filter_snapshot=export_config.filter_snapshot.model_dump(mode='json'),
            name=name,
            version_number=version_number,
            include_images=export_config.include_images,
            saved_filter_id=export_config.saved_filter_id,
            classification_config=(
                export_config.classification_config.model_dump(mode='json')
                if export_config.classification_config
                else None
            ),
            mode_options=(
                export_config.mode_options.model_dump(mode='json')
                if export_config.mode_options
                else None
            ),
            version_mode=export_config.version_mode.value,
            version_value=export_config.version_value,
            message=export_config.message,
            user_id=user_id,
        )

        # Log activity for export creation
        try:
            await ProjectActivityRepository.create(
                connection,
                project_id=project_id,
                actor_id=user_id,
                actor_name=None,  # Will be populated by router
                data={
                    "entity_type": "export",
                    "entity_id": export_data["id"],
                    "entity_name": name,
                    "action": "created",
                    "new_data": {
                        "mode": export_config.export_mode.value,
                        "format": export_config.output_format.value,
                        "version": version_number,
                    },
                },
            )
        except Exception as e:
            logger.warning(f"Failed to log export activity: {e}")

        # Queue Celery task (import here to avoid circular imports)
        try:
            from app.tasks.export import generate_export_task

            generate_export_task.delay(str(export_data["id"]))
        except ImportError:
            logger.warning("Celery task not available, export will remain pending")

        return export_data

    async def _query_filtered_images(
        self,
        connection: AsyncConnection,
        project_id: int,
        filters: FilterSnapshot,
    ) -> list[dict]:
        """Query images matching the filter."""
        # Base query - join project_images with shared_images
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

        # Apply tag filters
        if filters.tag_ids:
            if filters.include_match_mode == "OR":
                # Any of the tags
                subquery = (
                    select(shared_image_tags.c.shared_image_id)
                    .where(shared_image_tags.c.tag_id.in_(filters.tag_ids))
                    .distinct()
                )
                query = query.where(shared_images.c.id.in_(subquery))
            else:
                # All of the tags (AND)
                for tag_id in filters.tag_ids:
                    subquery = select(shared_image_tags.c.shared_image_id).where(
                        shared_image_tags.c.tag_id == tag_id
                    )
                    query = query.where(shared_images.c.id.in_(subquery))

        # Apply excluded tag filters
        if filters.excluded_tag_ids:
            if filters.exclude_match_mode == "OR":
                # Exclude if has ANY of these tags
                subquery = (
                    select(shared_image_tags.c.shared_image_id)
                    .where(shared_image_tags.c.tag_id.in_(filters.excluded_tag_ids))
                    .distinct()
                )
                query = query.where(shared_images.c.id.notin_(subquery))
            else:
                # Exclude only if has ALL of these tags
                subquery = (
                    select(shared_image_tags.c.shared_image_id)
                    .where(shared_image_tags.c.tag_id.in_(filters.excluded_tag_ids))
                    .group_by(shared_image_tags.c.shared_image_id)
                    .having(
                        func.count(shared_image_tags.c.tag_id)
                        == len(filters.excluded_tag_ids)
                    )
                )
                query = query.where(shared_images.c.id.notin_(subquery))

        # Apply task/job filters
        if filters.task_ids or filters.job_id:
            # Join through images -> jobs -> tasks
            job_query = (
                select(images.c.shared_image_id)
                .join(jobs, images.c.job_id == jobs.c.id)
                .where(images.c.shared_image_id.isnot(None))
            )
            if filters.job_id:
                job_query = job_query.where(jobs.c.id == filters.job_id)
            if filters.task_ids:
                job_query = job_query.where(jobs.c.task_id.in_(filters.task_ids))
            query = query.where(shared_images.c.id.in_(job_query))

        # Apply filepath filters
        if filters.filepath_paths:
            # OR logic for paths
            from sqlalchemy import or_

            path_conditions = [
                shared_images.c.file_path.like(f"{path}%")
                for path in filters.filepath_paths
            ]
            query = query.where(or_(*path_conditions))

        # Apply image UID filter
        if filters.image_uids:
            query = query.where(shared_images.c.id.in_(filters.image_uids))

        # Apply dimension filters
        if filters.width_min:
            query = query.where(shared_images.c.width >= filters.width_min)
        if filters.width_max:
            query = query.where(shared_images.c.width <= filters.width_max)
        if filters.height_min:
            query = query.where(shared_images.c.height >= filters.height_min)
        if filters.height_max:
            query = query.where(shared_images.c.height <= filters.height_max)

        # Apply file size filters
        if filters.file_size_min:
            query = query.where(shared_images.c.file_size_bytes >= filters.file_size_min)
        if filters.file_size_max:
            query = query.where(shared_images.c.file_size_bytes <= filters.file_size_max)

        # Apply annotation status filter
        if filters.is_annotated is not None:
            # Check if image has any detections or segmentations
            ann_subquery = (
                select(images.c.shared_image_id)
                .where(images.c.shared_image_id.isnot(None))
                .where(images.c.is_annotated == True)  # noqa: E712
                .distinct()
            )
            if filters.is_annotated:
                query = query.where(shared_images.c.id.in_(ann_subquery))
            else:
                query = query.where(shared_images.c.id.notin_(ann_subquery))

        result = await connection.execute(query)
        return [dict(row._mapping) for row in result.fetchall()]

    async def _count_image_tags(
        self,
        connection: AsyncConnection,
        image_ids: list[UUID],
    ) -> int:
        """Count image tags for given images."""
        if not image_ids:
            return 0

        # Need to map shared_image_ids to image_ids in images table
        subquery = (
            select(images.c.id)
            .where(images.c.shared_image_id.in_(image_ids))
        )
        stmt = (
            select(func.count())
            .select_from(image_tags)
            .where(image_tags.c.image_id.in_(subquery))
        )
        result = await connection.execute(stmt)
        return result.scalar() or 0

    async def _count_detections(
        self,
        connection: AsyncConnection,
        project_id: int,
        image_ids: list[UUID],
        mode_options: ModeOptions | None,
    ) -> tuple[int, dict[str, int]]:
        """Count detections and get per-label counts."""
        if not image_ids:
            return 0, {}

        # Map shared_image_ids to image_ids
        subquery = select(images.c.id).where(images.c.shared_image_id.in_(image_ids))

        # Base query
        query = select(
            labels.c.name,
            func.count().label("count"),
        ).select_from(
            detections.join(labels, detections.c.label_id == labels.c.id)
        ).where(
            detections.c.image_id.in_(subquery)
        )

        # Apply label filter if specified
        if mode_options and mode_options.label_filter:
            query = query.where(detections.c.label_id.in_(mode_options.label_filter))

        query = query.group_by(labels.c.name)

        result = await connection.execute(query)
        class_counts = {row.name: row.count for row in result.fetchall()}
        total = sum(class_counts.values())

        return total, class_counts

    async def _count_segmentations(
        self,
        connection: AsyncConnection,
        project_id: int,
        image_ids: list[UUID],
        mode_options: ModeOptions | None,
    ) -> tuple[int, dict[str, int]]:
        """Count segmentations and get per-label counts."""
        if not image_ids:
            return 0, {}

        # Map shared_image_ids to image_ids
        subquery = select(images.c.id).where(images.c.shared_image_id.in_(image_ids))

        # Base query
        query = select(
            labels.c.name,
            func.count().label("count"),
        ).select_from(
            segmentations.join(labels, segmentations.c.label_id == labels.c.id)
        ).where(
            segmentations.c.image_id.in_(subquery)
        )

        # Apply label filter if specified
        if mode_options and mode_options.label_filter:
            query = query.where(segmentations.c.label_id.in_(mode_options.label_filter))

        query = query.group_by(labels.c.name)

        result = await connection.execute(query)
        class_counts = {row.name: row.count for row in result.fetchall()}
        total = sum(class_counts.values())

        return total, class_counts

    async def _count_segmentation_bboxes(
        self,
        connection: AsyncConnection,
        project_id: int,
        image_ids: list[UUID],
        mode_options: ModeOptions | None,
    ) -> int:
        """Count segmentation bboxes (for detection mode with conversion)."""
        if not image_ids:
            return 0

        subquery = select(images.c.id).where(images.c.shared_image_id.in_(image_ids))
        query = (
            select(func.count())
            .select_from(segmentations)
            .where(segmentations.c.image_id.in_(subquery))
        )

        if mode_options and mode_options.label_filter:
            query = query.where(segmentations.c.label_id.in_(mode_options.label_filter))

        result = await connection.execute(query)
        return result.scalar() or 0

    async def _count_detection_as_segmentation(
        self,
        connection: AsyncConnection,
        project_id: int,
        image_ids: list[UUID],
        mode_options: ModeOptions | None,
    ) -> int:
        """Count detections that can be converted to segmentation."""
        if not image_ids:
            return 0

        subquery = select(images.c.id).where(images.c.shared_image_id.in_(image_ids))
        query = (
            select(func.count())
            .select_from(detections)
            .where(detections.c.image_id.in_(subquery))
        )

        if mode_options and mode_options.label_filter:
            query = query.where(detections.c.label_id.in_(mode_options.label_filter))

        result = await connection.execute(query)
        return result.scalar() or 0

    async def _get_class_counts_for_classification(
        self,
        connection: AsyncConnection,
        project_id: int,
        image_ids: list[UUID],
        classification_config: ClassificationMappingConfig | None,
    ) -> dict[str, int]:
        """Get class counts for classification export."""
        if not image_ids:
            return {}

        # Map shared_image_ids to image_ids in images table
        subquery = select(images.c.id).where(images.c.shared_image_id.in_(image_ids))

        # Query image_tags with labels
        query = (
            select(labels.c.name, func.count().label("count"))
            .select_from(image_tags.join(labels, image_tags.c.label_id == labels.c.id))
            .where(image_tags.c.image_id.in_(subquery))
            .group_by(labels.c.name)
        )

        result = await connection.execute(query)
        return {row.name: row.count for row in result.fetchall()}

    async def _get_split_counts(
        self,
        connection: AsyncConnection,
        image_ids: list[UUID],
    ) -> dict[str, int]:
        """Get counts per task split."""
        if not image_ids:
            return {"train": 0, "val": 0, "test": 0, "none": 0}

        # Query images -> jobs -> tasks to get splits
        query = (
            select(
                func.coalesce(tasks.c.split, "none").label("split"),
                func.count(func.distinct(images.c.shared_image_id)).label("count"),
            )
            .select_from(
                images.join(jobs, images.c.job_id == jobs.c.id).join(
                    tasks, jobs.c.task_id == tasks.c.id
                )
            )
            .where(images.c.shared_image_id.in_(image_ids))
            .group_by(tasks.c.split)
        )

        result = await connection.execute(query)
        counts = {"train": 0, "val": 0, "test": 0, "none": 0}
        for row in result.fetchall():
            split_key = row.split if row.split else "none"
            counts[split_key] = row.count

        return counts

    async def _count_images_without_annotations(
        self,
        connection: AsyncConnection,
        project_id: int,
        image_ids: list[UUID],
        export_mode: str,
    ) -> int:
        """Count images without annotations for the given mode."""
        if not image_ids:
            return 0

        # Map shared_image_ids to image_ids
        subquery = (
            select(images.c.id, images.c.shared_image_id)
            .where(images.c.shared_image_id.in_(image_ids))
        )

        if export_mode == "detection":
            # Images with at least one detection
            ann_subquery = select(detections.c.image_id).distinct()
        elif export_mode == "segmentation":
            # Images with at least one segmentation
            ann_subquery = select(segmentations.c.image_id).distinct()
        else:
            # Classification - images with at least one image_tag
            ann_subquery = select(image_tags.c.image_id).distinct()

        # Count images NOT in annotated set
        count_query = (
            select(func.count())
            .select_from(subquery.subquery())
            .where(subquery.c.id.notin_(ann_subquery))
        )

        result = await connection.execute(count_query)
        return result.scalar() or 0


# Builder functions for export generation (called by Celery task)


def build_coco_json(
    images_data: list[dict],
    annotations_data: list[dict],
    labels_data: list[dict],
    export_mode: str,
    include_bbox_from_seg: bool = False,
    include_bbox_alongside_seg: bool = False,
) -> dict:
    """Build COCO JSON format."""
    # Build categories
    categories = []
    label_id_to_idx = {}
    for idx, label in enumerate(labels_data, start=1):
        label_id_to_idx[str(label["id"])] = idx
        categories.append({
            "id": idx,
            "name": label["name"],
            "supercategory": "",
        })

    # Build images
    coco_images = []
    image_id_map = {}  # shared_image_id -> coco_id
    for idx, img in enumerate(images_data, start=1):
        image_id_map[str(img["id"])] = idx
        coco_images.append({
            "id": idx,
            "file_name": img["file_path"],
            "width": img.get("width", 0),
            "height": img.get("height", 0),
        })

    # Build annotations
    coco_annotations = []
    ann_idx = 1
    for ann in annotations_data:
        img_id = image_id_map.get(str(ann.get("shared_image_id")))
        if not img_id:
            continue

        cat_id = label_id_to_idx.get(str(ann["label_id"]))
        if not cat_id:
            continue

        # Get image dimensions for denormalization
        img_data = next(
            (i for i in images_data if str(i["id"]) == str(ann.get("shared_image_id"))),
            None,
        )
        if not img_data:
            continue

        width = img_data.get("width", 1)
        height = img_data.get("height", 1)

        if export_mode == "detection" or ann.get("type") == "detection":
            # Detection - bbox format
            x_min = ann["x_min"] * width
            y_min = ann["y_min"] * height
            x_max = ann["x_max"] * width
            y_max = ann["y_max"] * height
            bbox = [x_min, y_min, x_max - x_min, y_max - y_min]
            area = (x_max - x_min) * (y_max - y_min)

            coco_annotations.append({
                "id": ann_idx,
                "image_id": img_id,
                "category_id": cat_id,
                "bbox": bbox,
                "area": area,
                "iscrowd": 0,
            })
            ann_idx += 1

        elif export_mode == "segmentation" or ann.get("type") == "segmentation":
            # Segmentation - polygon format
            polygon = ann.get("polygon", [])
            if polygon:
                # Convert normalized polygon to pixel coordinates
                segmentation = []
                for point in polygon:
                    segmentation.extend([point[0] * width, point[1] * height])

                # Calculate bbox from polygon
                xs = [p[0] * width for p in polygon]
                ys = [p[1] * height for p in polygon]
                x_min, x_max = min(xs), max(xs)
                y_min, y_max = min(ys), max(ys)
                bbox = [x_min, y_min, x_max - x_min, y_max - y_min]

                # Calculate area using shoelace formula
                area = abs(
                    sum(
                        polygon[i][0] * polygon[(i + 1) % len(polygon)][1]
                        - polygon[(i + 1) % len(polygon)][0] * polygon[i][1]
                        for i in range(len(polygon))
                    )
                    / 2
                ) * width * height

                coco_ann = {
                    "id": ann_idx,
                    "image_id": img_id,
                    "category_id": cat_id,
                    "segmentation": [segmentation],
                    "area": area,
                    "iscrowd": 0,
                }

                if include_bbox_alongside_seg:
                    coco_ann["bbox"] = bbox

                coco_annotations.append(coco_ann)
                ann_idx += 1

    return {
        "info": {
            "description": "Exported from Annotate ANU",
            "version": "1.0",
            "year": datetime.now().year,
            "date_created": datetime.now(timezone.utc).isoformat(),
        },
        "licenses": [],
        "images": coco_images,
        "annotations": coco_annotations,
        "categories": categories,
    }


def build_classification_manifest(
    images_data: list[dict],
    class_assignments: dict[str, str],  # image_id -> class_name
    split_assignments: dict[str, str],  # image_id -> split
) -> str:
    """Build classification manifest as CSV."""
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["file_path", "class_name", "split"])

    for img in images_data:
        img_id = str(img["id"])
        class_name = class_assignments.get(img_id, "")
        split = split_assignments.get(img_id, "none")
        writer.writerow([img["file_path"], class_name, split])

    return output.getvalue()


def create_export_zip(
    export_dir: Path,
    export_id: str,
    content: dict | str,
    output_format: str,
    include_images: bool = False,
    images_data: list[dict] | None = None,
) -> tuple[Path, int]:
    """Create export ZIP file and return path and size."""
    # Ensure export directory exists
    export_dir.mkdir(parents=True, exist_ok=True)

    zip_path = export_dir / f"export_{export_id}.zip"

    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        if output_format == "coco_json":
            # Write COCO JSON
            zf.writestr("annotations.json", json.dumps(content, indent=2))
        elif output_format == "manifest_csv":
            # Write CSV manifest
            zf.writestr("manifest.csv", content)

        # Write metadata
        metadata = {
            "export_id": export_id,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "format": output_format,
        }
        zf.writestr("metadata.json", json.dumps(metadata, indent=2))

        # Include images if requested
        if include_images and images_data:
            for img in images_data:
                src_path = settings.SHARE_ROOT / img["file_path"]
                if src_path.exists():
                    zf.write(src_path, f"images/{img['file_path']}")

    size = zip_path.stat().st_size
    return zip_path, size
