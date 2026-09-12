"""Export service for generating dataset exports."""

import csv
import io
import json
import logging
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from uuid import UUID

from sqlalchemy import Select, func, select
from sqlalchemy.ext.asyncio import AsyncConnection

from app.config import settings
from app.models.annotation import detections, image_tags, segmentations
from app.models.data_management import (
    tag_categories,
    tags,
)
from app.models.image import images
from app.models.job import jobs
from app.models.project import labels, projects
from app.models.task import tasks
from app.models.user import users
from app.repositories.activity import ProjectActivityRepository
from app.repositories.annotation_write import TABLES as ANNOTATION_TABLES
from app.repositories.export import ExportRepository
from app.repositories.project_image import IMAGE_ORDER_BY, ProjectImageRepository
from app.schemas.export import (
    ClassificationMappingConfig,
    ExportCreate,
    ExportPreview,
    ExportScope,
    FilterSnapshot,
    ModeOptions,
)

logger = logging.getLogger(__name__)


def as_filter_snapshot(filter_snapshot: FilterSnapshot | dict) -> FilterSnapshot:
    """Coerce a stored snapshot dict into the canonical contract.

    Export records keep their snapshot as JSONB, so the background task reads back a plain dict. Validating it here means the dict and the request model resolve through exactly one filter implementation.
    """
    if isinstance(filter_snapshot, FilterSnapshot):
        return filter_snapshot
    return FilterSnapshot.model_validate(filter_snapshot or {})


async def query_export_images(
    connection: AsyncConnection,
    project_id: int,
    filter_snapshot: FilterSnapshot | dict,
) -> list[dict]:
    """The images an export covers, in the gallery's own order.

    This is the only definition of export membership. It resolves through `ProjectImageRepository.build_filtered_query`, the same builder the explore endpoint and the analytics aggregates use, so a preview, an exported manifest, and the gallery page the user was looking at describe the same set. Ordered by `IMAGE_ORDER_BY` so a manifest's row order is stable between two exports of an unchanged project.
    """
    stmt = ProjectImageRepository.build_filtered_query(
        project_id, as_filter_snapshot(filter_snapshot)
    ).order_by(*IMAGE_ORDER_BY)
    result = await connection.execute(stmt)
    return [dict(row._mapping) for row in result.fetchall()]


async def count_export_images(
    connection: AsyncConnection,
    project_id: int,
    filter_snapshot: FilterSnapshot | dict,
) -> int:
    """How many images the filter snapshot matches, counted in SQL.

    Same membership rule as :func:`query_export_images`, projecting only ids so nothing but the count crosses the wire. This is what `preview_export` reports: a preview is four integers and a warning list, so it must never pay for the rows the export itself writes.
    """
    base_query = ProjectImageRepository.filtered_image_ids_subquery(
        project_id, as_filter_snapshot(filter_snapshot)
    )
    stmt = select(func.count()).select_from(base_query.subquery())
    return (await connection.execute(stmt)).scalar() or 0


#: The annotation kind that decides whether an image counts as annotated, per export mode.
#:
#: Keyed by mode rather than by a project-wide "is annotated" flag on purpose: a classification
#: export is about `image_tags`, and an image covered in detections still exports an empty class
#: for it. Whatever the general annotated predicate elsewhere comes to mean, an export's warning
#: has to be about the kind of annotation that export writes.
#:
#: Values are keys of `AnnotationWriteRepository.TABLES`, not tables: that mapping is the one
#: definition of which table each annotation kind is written to, and the one
#: `ProjectImageRepository.has_any_annotation` builds the general annotated predicate from.
#: Naming the tables again here is exactly the drift that produced the `is_annotated` bug —
#: a fifth annotation kind must reach every reader by being added in one place.
ANNOTATION_KIND_BY_EXPORT_MODE = {
    "detection": "detections",
    "segmentation": "segmentations",
    "classification": "tags",
}

#: Every mode must name a kind the write repository actually knows, or the warning would
#: quietly describe the wrong table. Checked at import so a rename fails loudly, here.
assert set(ANNOTATION_KIND_BY_EXPORT_MODE.values()) <= set(ANNOTATION_TABLES)


def annotated_shared_image_ids(export_mode: str) -> Select:
    """Shared images carrying at least one annotation of this export's kind.

    Annotations hang off job images (`images.id`), so an image is annotated when any of its job rows has a row in the mode's annotation table. Projected as `shared_image_id` so callers can join it to the exported set.
    """
    kind = ANNOTATION_KIND_BY_EXPORT_MODE.get(export_mode, "tags")
    annotation_table = ANNOTATION_TABLES[kind]
    return (
        select(images.c.shared_image_id)
        .select_from(
            images.join(annotation_table, annotation_table.c.image_id == images.c.id),
        )
        .where(images.c.shared_image_id.isnot(None))
        .distinct()
    )


def exported_job_image_ids(project_id: int, filter_snapshot: FilterSnapshot | dict) -> Select:
    """The `images.id` rows belonging to the exported shared images, as a subquery.

    Annotation tables key on job images, so every per-annotation aggregate has to cross this bridge. Building it from `filtered_image_ids_subquery` keeps the aggregate anchored to the canonical filtered set instead of to a list of ids fetched into Python first.
    """
    return select(images.c.id).where(
        images.c.shared_image_id.in_(
            ProjectImageRepository.filtered_image_ids_subquery(
                project_id, as_filter_snapshot(filter_snapshot)
            )
        )
    )


def describe_filter_scope(filter_snapshot: FilterSnapshot | dict) -> list[str]:
    """Names of the constraints that actually narrow the set, in contract order.

    Match modes are reported only when the tag list they govern is present, since on their own they constrain nothing.
    """
    snapshot = as_filter_snapshot(filter_snapshot)
    empty = FilterSnapshot()
    active: list[str] = []
    for name in snapshot.__class__.model_fields:
        value = getattr(snapshot, name)
        if value == getattr(empty, name):
            continue
        if name == "include_match_mode" and not snapshot.tag_ids:
            continue
        if name == "exclude_match_mode" and not snapshot.excluded_tag_ids:
            continue
        if value in ([], ""):
            continue
        active.append(name)
    return active


async def resolve_export_metadata(
    connection: AsyncConnection,
    project_id: int,
    filter_snapshot: dict,
    mode_options: dict | None,
    user_id: UUID | None,
) -> dict:
    """
    Resolve all IDs in filter/config to human-readable metadata.
    This captures point-in-time state for versioning and self-documenting exports.
    """
    resolved = {
        "tags": [],
        "excluded_tags": [],
        "labels": [],
        "created_by": None,
        "project": None,
        "filter_summary": {
            "tag_count": 0,
            "excluded_tag_count": 0,
            "label_count": 0,
            "include_match_mode": filter_snapshot.get("include_match_mode", "OR"),
            "exclude_match_mode": filter_snapshot.get("exclude_match_mode", "OR"),
        },
    }

    # 1. Resolve included tags (with category info)
    tag_ids = filter_snapshot.get("tag_ids", [])
    if tag_ids:
        tag_query = (
            select(
                tags.c.id,
                tags.c.name,
                tags.c.color,
                tags.c.category_id,
                tag_categories.c.name.label("category_name"),
                tag_categories.c.color.label("category_color"),
            )
            .select_from(tags.join(tag_categories, tags.c.category_id == tag_categories.c.id))
            .where(tags.c.id.in_(tag_ids))
        )
        result = await connection.execute(tag_query)
        for row in result.mappings():
            resolved["tags"].append(
                {
                    "id": str(row["id"]),
                    "name": row["name"],
                    "color": row["color"],
                    "category_id": str(row["category_id"]),
                    "category_name": row["category_name"],
                    "category_color": row["category_color"],
                }
            )
        resolved["filter_summary"]["tag_count"] = len(resolved["tags"])

    # 2. Resolve excluded tags (with category info)
    excluded_tag_ids = filter_snapshot.get("excluded_tag_ids", [])
    if excluded_tag_ids:
        tag_query = (
            select(
                tags.c.id,
                tags.c.name,
                tags.c.color,
                tags.c.category_id,
                tag_categories.c.name.label("category_name"),
                tag_categories.c.color.label("category_color"),
            )
            .select_from(tags.join(tag_categories, tags.c.category_id == tag_categories.c.id))
            .where(tags.c.id.in_(excluded_tag_ids))
        )
        result = await connection.execute(tag_query)
        for row in result.mappings():
            resolved["excluded_tags"].append(
                {
                    "id": str(row["id"]),
                    "name": row["name"],
                    "color": row["color"],
                    "category_id": str(row["category_id"]),
                    "category_name": row["category_name"],
                    "category_color": row["category_color"],
                }
            )
        resolved["filter_summary"]["excluded_tag_count"] = len(resolved["excluded_tags"])

    # 3. Resolve labels from mode_options.label_filter
    label_ids = []
    if mode_options and mode_options.get("label_filter"):
        label_ids = mode_options["label_filter"]
    if label_ids:
        label_query = select(labels.c.id, labels.c.name, labels.c.color).where(
            labels.c.id.in_(label_ids)
        )
        result = await connection.execute(label_query)
        for row in result.mappings():
            resolved["labels"].append(
                {
                    "id": str(row["id"]),
                    "name": row["name"],
                    "color": row["color"],
                }
            )
        resolved["filter_summary"]["label_count"] = len(resolved["labels"])

    # 4. Resolve user info
    if user_id:
        user_query = select(users.c.id, users.c.email, users.c.full_name).where(
            users.c.id == user_id
        )
        result = await connection.execute(user_query)
        user_row = result.mappings().first()
        if user_row:
            resolved["created_by"] = {
                "id": str(user_row["id"]),
                "email": user_row["email"],
                "full_name": user_row["full_name"],
            }

    # 5. Resolve project info
    project_query = select(projects.c.id, projects.c.name).where(projects.c.id == project_id)
    result = await connection.execute(project_query)
    project_row = result.mappings().first()
    if project_row:
        resolved["project"] = {
            "id": project_row["id"],
            "name": project_row["name"],
        }

    return resolved


class ExportService:
    """Service for handling export operations."""

    async def preview_export(
        self,
        connection: AsyncConnection,
        project_id: int,
        export_config: ExportCreate,
    ) -> ExportPreview:
        """Counts for an export that has not been created yet, aggregated in SQL.

        Every number here is a `SELECT count(...)` against `ProjectImageRepository.filtered_image_ids_subquery` — the same membership rule `query_export_images` resolves for the export itself. The preview used to fetch every matching `shared_images` row and then pass the ids back as five `IN` lists, so previewing a 100 000-image export moved 100 000 rows over the wire to produce four integers. The execution path in `app.tasks.export` still materialises rows, because it writes them.
        """
        filters = export_config.filter_snapshot
        image_count = await count_export_images(connection, project_id, filters)

        # Get annotation counts
        annotation_counts = {}
        class_counts = {}
        split_counts = {"train": 0, "val": 0, "test": 0, "none": 0}
        warnings = []

        if export_config.export_mode == "classification":
            # Count image_tags
            tag_count = await self._count_image_tags(connection, project_id, filters)
            annotation_counts["classification"] = tag_count
            class_counts = await self._get_class_counts_for_classification(
                connection, project_id, filters, export_config.classification_config
            )

        elif export_config.export_mode == "detection":
            # Count detections
            det_count, det_class_counts = await self._count_detections(
                connection,
                project_id,
                filters,
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
                    connection, project_id, filters, export_config.mode_options
                )
                annotation_counts["detection_from_segmentation"] = seg_bbox_count

        elif export_config.export_mode == "segmentation":
            # Count segmentations
            seg_count, seg_class_counts = await self._count_segmentations(
                connection,
                project_id,
                filters,
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
                    connection, project_id, filters, export_config.mode_options
                )
                annotation_counts["segmentation_from_detection"] = bbox_seg_count

        # Get split counts
        split_counts = await self._get_split_counts(connection, project_id, filters)

        # Generate warnings
        if image_count == 0:
            warnings.append("No images match the current filter")
        if sum(annotation_counts.values()) == 0:
            warnings.append("No annotations found for the selected images")

        images_without_annotations = await self._count_images_without_annotations(
            connection, project_id, filters, export_config.export_mode
        )
        if images_without_annotations > 0:
            warnings.append(f"{images_without_annotations} images have no annotations")

        active_filters = describe_filter_scope(export_config.filter_snapshot)

        return ExportPreview(
            image_count=image_count,
            scope=ExportScope(
                image_count=image_count,
                active_filters=active_filters,
                is_whole_project=not active_filters,
                filters=export_config.filter_snapshot,
            ),
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

        # Resolve metadata (human-readable names for versioning)
        filter_snapshot_dict = export_config.filter_snapshot.model_dump(mode="json")
        mode_options_dict = (
            export_config.mode_options.model_dump(mode="json")
            if export_config.mode_options
            else None
        )
        resolved_metadata = await resolve_export_metadata(
            connection,
            project_id,
            filter_snapshot_dict,
            mode_options_dict,
            user_id,
        )

        # Create export record
        # Note: Use mode='json' to serialize UUIDs to strings for JSONB columns
        export_data = await ExportRepository.create(
            connection,
            project_id=project_id,
            export_mode=export_config.export_mode.value,
            output_format=export_config.output_format.value,
            filter_snapshot=filter_snapshot_dict,
            name=name,
            version_number=version_number,
            include_images=export_config.include_images,
            saved_filter_id=export_config.saved_filter_id,
            classification_config=(
                export_config.classification_config.model_dump(mode="json")
                if export_config.classification_config
                else None
            ),
            mode_options=mode_options_dict,
            version_mode=export_config.version_mode.value,
            version_value=export_config.version_value,
            message=export_config.message,
            resolved_metadata=resolved_metadata,
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

    async def _count_image_tags(
        self,
        connection: AsyncConnection,
        project_id: int,
        filters: FilterSnapshot,
    ) -> int:
        """Count image tags across the exported images."""
        subquery = exported_job_image_ids(project_id, filters)
        stmt = (
            select(func.count()).select_from(image_tags).where(image_tags.c.image_id.in_(subquery))
        )
        result = await connection.execute(stmt)
        return result.scalar() or 0

    async def _count_detections(
        self,
        connection: AsyncConnection,
        project_id: int,
        filters: FilterSnapshot,
        mode_options: ModeOptions | None,
    ) -> tuple[int, dict[str, int]]:
        """Count detections and get per-label counts."""
        subquery = exported_job_image_ids(project_id, filters)

        # Base query
        query = (
            select(
                labels.c.name,
                func.count().label("count"),
            )
            .select_from(detections.join(labels, detections.c.label_id == labels.c.id))
            .where(detections.c.image_id.in_(subquery))
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
        filters: FilterSnapshot,
        mode_options: ModeOptions | None,
    ) -> tuple[int, dict[str, int]]:
        """Count segmentations and get per-label counts."""
        subquery = exported_job_image_ids(project_id, filters)

        # Base query
        query = (
            select(
                labels.c.name,
                func.count().label("count"),
            )
            .select_from(segmentations.join(labels, segmentations.c.label_id == labels.c.id))
            .where(segmentations.c.image_id.in_(subquery))
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
        filters: FilterSnapshot,
        mode_options: ModeOptions | None,
    ) -> int:
        """Count segmentation bboxes (for detection mode with conversion)."""
        subquery = exported_job_image_ids(project_id, filters)
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
        filters: FilterSnapshot,
        mode_options: ModeOptions | None,
    ) -> int:
        """Count detections that can be converted to segmentation."""
        subquery = exported_job_image_ids(project_id, filters)
        query = (
            select(func.count()).select_from(detections).where(detections.c.image_id.in_(subquery))
        )

        if mode_options and mode_options.label_filter:
            query = query.where(detections.c.label_id.in_(mode_options.label_filter))

        result = await connection.execute(query)
        return result.scalar() or 0

    async def _get_class_counts_for_classification(
        self,
        connection: AsyncConnection,
        project_id: int,
        filters: FilterSnapshot,
        classification_config: ClassificationMappingConfig | None,
    ) -> dict[str, int]:
        """Get class counts for classification export."""
        subquery = exported_job_image_ids(project_id, filters)

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
        project_id: int,
        filters: FilterSnapshot,
    ) -> dict[str, int]:
        """Get counts per task split."""
        exported_ids = ProjectImageRepository.filtered_image_ids_subquery(
            project_id, as_filter_snapshot(filters)
        )

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
            .where(images.c.shared_image_id.in_(exported_ids))
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
        filters: FilterSnapshot,
        export_mode: str,
    ) -> int:
        """How many of the exported images carry no annotation of this export's kind.

        Counted over `shared_images.id` from the canonical filtered set, not over `images` rows. Counting job images answered a different question twice over: a pool image with no `images` row was invisible to the warning even though the export writes it, and an image reached by two jobs was counted twice. The fixture makes the gap concrete — six images are exported, one is annotated, and the job-image version reported one unannotated image instead of five.

        The exported set and the annotated set are each materialised once and joined, so neither can be re-derived into a second, independently aliased copy of itself — which is how this query previously cross-joined the export with itself. The outer join also keeps a NULL `shared_image_id` from swallowing the result, as `NOT IN` over a nullable column would.
        """
        exported_images = ProjectImageRepository.filtered_image_ids_subquery(
            project_id, as_filter_snapshot(filters)
        ).subquery()
        annotated = annotated_shared_image_ids(export_mode).subquery()

        count_query = (
            select(func.count())
            .select_from(
                exported_images.outerjoin(
                    annotated, annotated.c.shared_image_id == exported_images.c.id
                )
            )
            .where(annotated.c.shared_image_id.is_(None))
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
    export_metadata: dict | None = None,
) -> dict:
    """Build COCO JSON format with embedded export configuration."""
    # Build categories
    categories = []
    label_id_to_idx = {}
    for idx, label in enumerate(labels_data, start=1):
        label_id_to_idx[str(label["id"])] = idx
        categories.append(
            {
                "id": idx,
                "name": label["name"],
                "supercategory": "",
            }
        )

    # Build images
    coco_images = []
    image_id_map = {}  # shared_image_id -> coco_id
    for idx, img in enumerate(images_data, start=1):
        image_id_map[str(img["id"])] = idx
        coco_images.append(
            {
                "id": idx,
                "file_name": img["file_path"],
                "width": img.get("width", 0),
                "height": img.get("height", 0),
            }
        )

    # One dict lookup per annotation instead of a scan over images_data
    images_by_id = {str(img["id"]): img for img in images_data}

    # Build annotations
    coco_annotations = []
    ann_idx = 1
    for ann in annotations_data:
        shared_image_id = str(ann.get("shared_image_id"))
        img_id = image_id_map.get(shared_image_id)
        if not img_id:
            continue

        cat_id = label_id_to_idx.get(str(ann["label_id"]))
        if not cat_id:
            continue

        # Get image dimensions for denormalization
        img_data = images_by_id.get(shared_image_id)
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

            coco_annotations.append(
                {
                    "id": ann_idx,
                    "image_id": img_id,
                    "category_id": cat_id,
                    "bbox": bbox,
                    "area": area,
                    "iscrowd": 0,
                }
            )
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
                area = (
                    abs(
                        sum(
                            polygon[i][0] * polygon[(i + 1) % len(polygon)][1]
                            - polygon[(i + 1) % len(polygon)][0] * polygon[i][1]
                            for i in range(len(polygon))
                        )
                        / 2
                    )
                    * width
                    * height
                )

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

    # Build info section with export configuration
    info = {
        "description": "Exported from Annotate ANU",
        "version": "1.0",
        "year": datetime.now().year,
        "date_created": datetime.now(timezone.utc).isoformat(),
    }

    # Add contributor if available
    if export_metadata and export_metadata.get("created_by"):
        user = export_metadata["created_by"]
        info["contributor"] = f"{user.get('full_name', '')} <{user.get('email', '')}>"

    # Add export_config with all metadata for self-documenting exports
    if export_metadata:
        info["export_config"] = {
            "export_id": export_metadata.get("export_id"),
            "version_number": export_metadata.get("version_number"),
            "export_mode": export_metadata.get("export_mode"),
            "output_format": export_metadata.get("output_format"),
            "include_images": export_metadata.get("include_images"),
            "project": export_metadata.get("project"),
            "filter": {
                "tags": export_metadata.get("tags", []),
                "excluded_tags": export_metadata.get("excluded_tags", []),
                "include_match_mode": export_metadata.get("filter_summary", {}).get(
                    "include_match_mode", "OR"
                ),
                "exclude_match_mode": export_metadata.get("filter_summary", {}).get(
                    "exclude_match_mode", "OR"
                ),
            },
            "labels": export_metadata.get("labels", []),
            "splits": export_metadata.get("splits"),
            "statistics": export_metadata.get("statistics"),
        }

    return {
        "info": info,
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


def build_yolo_from_coco(coco: dict, task: str, split_assignments: dict | None = None) -> dict:
    """Convert an already-built COCO payload into YOLO label files.

    Parameters
    ----------
    coco : dict
        COCO structure with images, annotations and categories
    task : str
        'detect' for boxes, 'segment' for polygons
    split_assignments : dict | None
        image id (as str) -> train/val/test; anything unassigned goes to train

    Returns
    -------
    dict
        label_files keyed by "<split>/<stem>.txt", plus class names and counts
    """
    categories = sorted(coco.get("categories", []), key=lambda c: c["id"])
    class_index = {c["id"]: i for i, c in enumerate(categories)}
    names = [c["name"] for c in categories]

    images_by_id = {img["id"]: img for img in coco.get("images", [])}
    lines_by_image: dict[int, list[str]] = {img_id: [] for img_id in images_by_id}

    for ann in coco.get("annotations", []):
        img = images_by_id.get(ann["image_id"])
        if not img:
            continue
        width = img.get("width") or 0
        height = img.get("height") or 0
        if width <= 0 or height <= 0:
            continue

        cls = class_index.get(ann.get("category_id"))
        if cls is None:
            continue

        if task == "segment" and ann.get("segmentation"):
            polygon = ann["segmentation"][0] if ann["segmentation"] else []
            if len(polygon) < 6:
                continue
            coords = []
            for i in range(0, len(polygon) - 1, 2):
                coords.append(f"{min(max(polygon[i] / width, 0.0), 1.0):.6f}")
                coords.append(f"{min(max(polygon[i + 1] / height, 0.0), 1.0):.6f}")
            lines_by_image[img["id"]].append(f"{cls} " + " ".join(coords))
        elif ann.get("bbox"):
            x, y, w, h = ann["bbox"]
            if w <= 0 or h <= 0:
                continue
            xc = min(max((x + w / 2) / width, 0.0), 1.0)
            yc = min(max((y + h / 2) / height, 0.0), 1.0)
            nw = min(max(w / width, 0.0), 1.0)
            nh = min(max(h / height, 0.0), 1.0)
            lines_by_image[img["id"]].append(f"{cls} {xc:.6f} {yc:.6f} {nw:.6f} {nh:.6f}")

    splits = split_assignments or {}
    label_files: dict[str, str] = {}
    image_splits: dict[str, str] = {}
    counts = {"train": 0, "val": 0, "test": 0}

    for img_id, img in images_by_id.items():
        file_path = img["file_name"]
        stem = Path(file_path).stem
        split = splits.get(str(img_id)) or splits.get(file_path) or "train"
        if split not in counts:
            split = "train"
        counts[split] += 1
        label_files[f"{split}/{stem}.txt"] = "\n".join(lines_by_image.get(img_id, []))
        image_splits[file_path] = split

    return {
        "label_files": label_files,
        "image_splits": image_splits,
        "names": names,
        "counts": counts,
        "task": task,
    }


def build_yolo_data_yaml(names: list[str], counts: dict) -> str:
    """data.yaml pointing at whichever splits actually got images."""
    lines = ["path: .", "train: images/train"]
    lines.append(f"val: images/{'val' if counts.get('val') else 'train'}")
    if counts.get("test"):
        lines.append("test: images/test")
    lines.append("")
    lines.append("names:")
    for i, name in enumerate(names):
        lines.append(f"  {i}: {name}")
    lines.append("")
    return "\n".join(lines)


def create_export_zip(
    export_dir: Path,
    export_id: str,
    content: dict | str,
    output_format: str,
    include_images: bool = False,
    images_data: list[dict] | None = None,
    split_assignments: dict | None = None,
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
        elif output_format in ("yolo_detect", "yolo_seg"):
            task = "segment" if output_format == "yolo_seg" else "detect"
            yolo = build_yolo_from_coco(content, task, split_assignments)
            for rel, body in yolo["label_files"].items():
                zf.writestr(f"labels/{rel}", body)
            zf.writestr("data.yaml", build_yolo_data_yaml(yolo["names"], yolo["counts"]))
            zf.writestr("classes.txt", "\n".join(yolo["names"]))

        # Write metadata
        metadata = {
            "export_id": export_id,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "format": output_format,
        }
        zf.writestr("metadata.json", json.dumps(metadata, indent=2))

        # Include images if requested
        if include_images and images_data:
            yolo_splits = (
                build_yolo_from_coco(content, "detect", split_assignments)["image_splits"]
                if output_format in ("yolo_detect", "yolo_seg")
                else {}
            )
            for img in images_data:
                src_path = settings.SHARE_ROOT / img["file_path"]
                if not src_path.exists():
                    continue
                if yolo_splits:
                    split = yolo_splits.get(img["file_path"], "train")
                    zf.write(src_path, f"images/{split}/{Path(img['file_path']).name}")
                else:
                    zf.write(src_path, f"images/{img['file_path']}")

    size = zip_path.stat().st_size
    return zip_path, size
