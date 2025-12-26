"""Repository layer for Annotation data access."""

from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import delete, func, insert, select, update
from sqlalchemy.ext.asyncio import AsyncConnection

from app.models.annotation import detections, image_tags, keypoints, segmentations
from app.models.image import images
from app.models.project import labels


class ImageTagRepository:
    """Async repository for image tag operations."""

    @staticmethod
    async def get_by_id(connection: AsyncConnection, tag_id: UUID) -> dict | None:
        stmt = select(image_tags).where(image_tags.c.id == tag_id)
        result = await connection.execute(stmt)
        row = result.fetchone()
        return dict(row._mapping) if row else None

    @staticmethod
    async def list_for_image(connection: AsyncConnection, image_id: UUID) -> list[dict]:
        stmt = select(image_tags).where(image_tags.c.image_id == image_id)
        result = await connection.execute(stmt)
        return [dict(row._mapping) for row in result.fetchall()]

    @staticmethod
    async def create(connection: AsyncConnection, image_id: UUID, data: dict) -> dict:
        data["image_id"] = image_id
        stmt = insert(image_tags).values(**data).returning(image_tags)
        result = await connection.execute(stmt)
        return dict(result.fetchone()._mapping)

    @staticmethod
    async def create_bulk(
        connection: AsyncConnection,
        image_id: UUID,
        items: list[dict],
    ) -> list[dict]:
        created = []
        for item in items:
            item["image_id"] = image_id
            stmt = insert(image_tags).values(**item).returning(image_tags)
            result = await connection.execute(stmt)
            created.append(dict(result.fetchone()._mapping))
        return created

    @staticmethod
    async def delete(connection: AsyncConnection, tag_id: UUID) -> bool:
        stmt = delete(image_tags).where(image_tags.c.id == tag_id)
        result = await connection.execute(stmt)
        return result.rowcount > 0

    @staticmethod
    async def delete_bulk(connection: AsyncConnection, ids: list[UUID]) -> int:
        stmt = delete(image_tags).where(image_tags.c.id.in_(ids))
        result = await connection.execute(stmt)
        return result.rowcount


class DetectionRepository:
    """Async repository for detection operations."""

    @staticmethod
    async def get_by_id(connection: AsyncConnection, detection_id: UUID) -> dict | None:
        stmt = select(detections).where(detections.c.id == detection_id)
        result = await connection.execute(stmt)
        row = result.fetchone()
        return dict(row._mapping) if row else None

    @staticmethod
    async def list_for_image(connection: AsyncConnection, image_id: UUID) -> list[dict]:
        stmt = select(detections).where(detections.c.image_id == image_id)
        result = await connection.execute(stmt)
        return [dict(row._mapping) for row in result.fetchall()]

    @staticmethod
    async def create(connection: AsyncConnection, image_id: UUID, data: dict) -> dict:
        data["image_id"] = image_id
        stmt = insert(detections).values(**data).returning(detections)
        result = await connection.execute(stmt)
        return dict(result.fetchone()._mapping)

    @staticmethod
    async def create_bulk(
        connection: AsyncConnection,
        image_id: UUID,
        items: list[dict],
    ) -> list[dict]:
        created = []
        for item in items:
            item["image_id"] = image_id
            stmt = insert(detections).values(**item).returning(detections)
            result = await connection.execute(stmt)
            created.append(dict(result.fetchone()._mapping))
        return created

    @staticmethod
    async def update(
        connection: AsyncConnection,
        detection_id: UUID,
        data: dict,
    ) -> dict | None:
        data["updated_at"] = datetime.now(timezone.utc)
        stmt = (
            update(detections)
            .where(detections.c.id == detection_id)
            .values(**data)
            .returning(detections)
        )
        result = await connection.execute(stmt)
        row = result.fetchone()
        return dict(row._mapping) if row else None

    @staticmethod
    async def delete(connection: AsyncConnection, detection_id: UUID) -> bool:
        stmt = delete(detections).where(detections.c.id == detection_id)
        result = await connection.execute(stmt)
        return result.rowcount > 0

    @staticmethod
    async def delete_bulk(connection: AsyncConnection, ids: list[UUID]) -> int:
        stmt = delete(detections).where(detections.c.id.in_(ids))
        result = await connection.execute(stmt)
        return result.rowcount


class SegmentationRepository:
    """Async repository for segmentation operations."""

    @staticmethod
    async def get_by_id(connection: AsyncConnection, seg_id: UUID) -> dict | None:
        stmt = select(segmentations).where(segmentations.c.id == seg_id)
        result = await connection.execute(stmt)
        row = result.fetchone()
        return dict(row._mapping) if row else None

    @staticmethod
    async def list_for_image(connection: AsyncConnection, image_id: UUID) -> list[dict]:
        stmt = select(segmentations).where(segmentations.c.image_id == image_id)
        result = await connection.execute(stmt)
        return [dict(row._mapping) for row in result.fetchall()]

    @staticmethod
    async def create(connection: AsyncConnection, image_id: UUID, data: dict) -> dict:
        data["image_id"] = image_id
        stmt = insert(segmentations).values(**data).returning(segmentations)
        result = await connection.execute(stmt)
        return dict(result.fetchone()._mapping)

    @staticmethod
    async def create_bulk(
        connection: AsyncConnection,
        image_id: UUID,
        items: list[dict],
    ) -> list[dict]:
        created = []
        for item in items:
            item["image_id"] = image_id
            stmt = insert(segmentations).values(**item).returning(segmentations)
            result = await connection.execute(stmt)
            created.append(dict(result.fetchone()._mapping))
        return created

    @staticmethod
    async def update(
        connection: AsyncConnection,
        seg_id: UUID,
        data: dict,
    ) -> dict | None:
        data["updated_at"] = datetime.now(timezone.utc)
        stmt = (
            update(segmentations)
            .where(segmentations.c.id == seg_id)
            .values(**data)
            .returning(segmentations)
        )
        result = await connection.execute(stmt)
        row = result.fetchone()
        return dict(row._mapping) if row else None

    @staticmethod
    async def delete(connection: AsyncConnection, seg_id: UUID) -> bool:
        stmt = delete(segmentations).where(segmentations.c.id == seg_id)
        result = await connection.execute(stmt)
        return result.rowcount > 0

    @staticmethod
    async def delete_bulk(connection: AsyncConnection, ids: list[UUID]) -> int:
        stmt = delete(segmentations).where(segmentations.c.id.in_(ids))
        result = await connection.execute(stmt)
        return result.rowcount


class KeypointRepository:
    """Async repository for keypoint operations."""

    @staticmethod
    async def get_by_id(connection: AsyncConnection, kp_id: UUID) -> dict | None:
        stmt = select(keypoints).where(keypoints.c.id == kp_id)
        result = await connection.execute(stmt)
        row = result.fetchone()
        return dict(row._mapping) if row else None

    @staticmethod
    async def list_for_image(connection: AsyncConnection, image_id: UUID) -> list[dict]:
        stmt = select(keypoints).where(keypoints.c.image_id == image_id)
        result = await connection.execute(stmt)
        return [dict(row._mapping) for row in result.fetchall()]

    @staticmethod
    async def create(connection: AsyncConnection, image_id: UUID, data: dict) -> dict:
        data["image_id"] = image_id
        stmt = insert(keypoints).values(**data).returning(keypoints)
        result = await connection.execute(stmt)
        return dict(result.fetchone()._mapping)

    @staticmethod
    async def update(
        connection: AsyncConnection,
        kp_id: UUID,
        data: dict,
    ) -> dict | None:
        data["updated_at"] = datetime.now(timezone.utc)
        stmt = (
            update(keypoints)
            .where(keypoints.c.id == kp_id)
            .values(**data)
            .returning(keypoints)
        )
        result = await connection.execute(stmt)
        row = result.fetchone()
        return dict(row._mapping) if row else None

    @staticmethod
    async def delete(connection: AsyncConnection, kp_id: UUID) -> bool:
        stmt = delete(keypoints).where(keypoints.c.id == kp_id)
        result = await connection.execute(stmt)
        return result.rowcount > 0


class AnnotationSummaryRepository:
    """Repository for annotation summary queries (for gallery overlay).

    Note: This repository accepts shared_image_ids and joins through the images
    table to find annotations. Annotations are stored on job images (images table)
    which reference shared_images via shared_image_id.
    """

    @staticmethod
    async def get_counts_for_images(
        connection: AsyncConnection,
        shared_image_ids: list[UUID],
    ) -> dict[UUID, dict]:
        """
        Get detection and segmentation counts for multiple shared images.
        Returns a dict mapping shared_image_id -> {detection_count, segmentation_count}

        Joins through images table to find annotations on job images that
        reference the given shared images.
        """
        if not shared_image_ids:
            return {}

        # Count detections per shared_image (via images table)
        det_stmt = (
            select(
                images.c.shared_image_id,
                func.count(detections.c.id).label("count"),
            )
            .select_from(
                detections.join(images, detections.c.image_id == images.c.id)
            )
            .where(images.c.shared_image_id.in_(shared_image_ids))
            .group_by(images.c.shared_image_id)
        )
        det_result = await connection.execute(det_stmt)
        det_counts = {row.shared_image_id: row.count for row in det_result.fetchall()}

        # Count segmentations per shared_image (via images table)
        seg_stmt = (
            select(
                images.c.shared_image_id,
                func.count(segmentations.c.id).label("count"),
            )
            .select_from(
                segmentations.join(images, segmentations.c.image_id == images.c.id)
            )
            .where(images.c.shared_image_id.in_(shared_image_ids))
            .group_by(images.c.shared_image_id)
        )
        seg_result = await connection.execute(seg_stmt)
        seg_counts = {row.shared_image_id: row.count for row in seg_result.fetchall()}

        # Combine counts
        result = {}
        for shared_image_id in shared_image_ids:
            result[shared_image_id] = {
                "detection_count": det_counts.get(shared_image_id, 0),
                "segmentation_count": seg_counts.get(shared_image_id, 0),
            }
        return result

    @staticmethod
    async def get_bboxes_for_images(
        connection: AsyncConnection,
        shared_image_ids: list[UUID],
        max_per_image: int = 100,
    ) -> dict[UUID, list[dict]]:
        """
        Get bounding boxes with label colors and names for multiple shared images.
        Returns a dict mapping shared_image_id -> list of bbox dicts.

        Each bbox dict contains: x_min, y_min, x_max, y_max, label_color, label_name
        Coordinates are already normalized (0-1).

        Joins through images table to find annotations on job images that
        reference the given shared images.
        """
        if not shared_image_ids:
            return {}

        # Query detections with label color and name (join with images and labels tables)
        det_stmt = (
            select(
                images.c.shared_image_id,
                detections.c.x_min,
                detections.c.y_min,
                detections.c.x_max,
                detections.c.y_max,
                labels.c.color.label("label_color"),
                labels.c.name.label("label_name"),
            )
            .select_from(
                detections
                .join(images, detections.c.image_id == images.c.id)
                .join(labels, detections.c.label_id == labels.c.id)
            )
            .where(images.c.shared_image_id.in_(shared_image_ids))
        )
        det_result = await connection.execute(det_stmt)
        det_rows = det_result.fetchall()

        # Query segmentations with cached bbox, label color and name
        seg_stmt = (
            select(
                images.c.shared_image_id,
                segmentations.c.bbox_x_min,
                segmentations.c.bbox_y_min,
                segmentations.c.bbox_x_max,
                segmentations.c.bbox_y_max,
                labels.c.color.label("label_color"),
                labels.c.name.label("label_name"),
            )
            .select_from(
                segmentations
                .join(images, segmentations.c.image_id == images.c.id)
                .join(labels, segmentations.c.label_id == labels.c.id)
            )
            .where(images.c.shared_image_id.in_(shared_image_ids))
            .where(segmentations.c.bbox_x_min.isnot(None))  # Only include if bbox is cached
        )
        seg_result = await connection.execute(seg_stmt)
        seg_rows = seg_result.fetchall()

        # Group bboxes by shared_image_id
        result: dict[UUID, list[dict]] = {sid: [] for sid in shared_image_ids}

        # Add detection bboxes
        for row in det_rows:
            if len(result[row.shared_image_id]) < max_per_image:
                result[row.shared_image_id].append({
                    "x_min": row.x_min,
                    "y_min": row.y_min,
                    "x_max": row.x_max,
                    "y_max": row.y_max,
                    "label_color": row.label_color or "#10B981",
                    "label_name": row.label_name,
                })

        # Add segmentation bboxes
        for row in seg_rows:
            if len(result[row.shared_image_id]) < max_per_image:
                result[row.shared_image_id].append({
                    "x_min": row.bbox_x_min,
                    "y_min": row.bbox_y_min,
                    "x_max": row.bbox_x_max,
                    "y_max": row.bbox_y_max,
                    "label_color": row.label_color or "#10B981",
                    "label_name": row.label_name,
                })

        return result

    @staticmethod
    async def get_polygons_for_images(
        connection: AsyncConnection,
        shared_image_ids: list[UUID],
        max_per_image: int = 50,
        max_points_per_polygon: int = 100,
    ) -> dict[UUID, list[dict]]:
        """
        Get polygon data with label colors and names for multiple shared images.
        Returns a dict mapping shared_image_id -> list of polygon dicts.

        Each polygon dict contains: points, label_color, label_name
        Polygon points are normalized (0-1) coordinates.

        Joins through images table to find annotations on job images that
        reference the given shared images.
        """
        if not shared_image_ids:
            return {}

        # Query segmentations with polygon data, label color and name
        seg_stmt = (
            select(
                images.c.shared_image_id,
                segmentations.c.polygon,
                labels.c.color.label("label_color"),
                labels.c.name.label("label_name"),
            )
            .select_from(
                segmentations
                .join(images, segmentations.c.image_id == images.c.id)
                .join(labels, segmentations.c.label_id == labels.c.id)
            )
            .where(images.c.shared_image_id.in_(shared_image_ids))
            .where(segmentations.c.polygon.isnot(None))
        )
        seg_result = await connection.execute(seg_stmt)
        seg_rows = seg_result.fetchall()

        # Group polygons by shared_image_id
        result: dict[UUID, list[dict]] = {sid: [] for sid in shared_image_ids}

        for row in seg_rows:
            if len(result[row.shared_image_id]) < max_per_image:
                polygon_points = row.polygon
                # Simplify if too many points (for performance)
                if polygon_points and len(polygon_points) > max_points_per_polygon:
                    step = max(1, len(polygon_points) // max_points_per_polygon)
                    polygon_points = polygon_points[::step]

                result[row.shared_image_id].append({
                    "points": polygon_points or [],
                    "label_color": row.label_color or "#10B981",
                    "label_name": row.label_name,
                })

        return result

    @staticmethod
    async def get_summary_for_images(
        connection: AsyncConnection,
        shared_image_ids: list[UUID],
        include_bboxes: bool = True,
        include_polygons: bool = True,
        max_bboxes_per_image: int = 100,
        max_polygons_per_image: int = 50,
    ) -> dict[UUID, dict]:
        """
        Get full annotation summary for multiple shared images.
        Returns a dict mapping shared_image_id -> {detection_count, segmentation_count, bboxes, polygons}

        Joins through images table to find annotations on job images that
        reference the given shared images.
        """
        if not shared_image_ids:
            return {}

        # Get counts
        counts = await AnnotationSummaryRepository.get_counts_for_images(
            connection, shared_image_ids
        )

        # Get bboxes if requested
        bboxes = {}
        if include_bboxes:
            bboxes = await AnnotationSummaryRepository.get_bboxes_for_images(
                connection, shared_image_ids, max_bboxes_per_image
            )

        # Get polygons if requested
        polygons = {}
        if include_polygons:
            polygons = await AnnotationSummaryRepository.get_polygons_for_images(
                connection, shared_image_ids, max_polygons_per_image
            )

        # Combine into summary
        result = {}
        for shared_image_id in shared_image_ids:
            count_data = counts.get(shared_image_id, {"detection_count": 0, "segmentation_count": 0})
            result[shared_image_id] = {
                "detection_count": count_data["detection_count"],
                "segmentation_count": count_data["segmentation_count"],
                "bboxes": bboxes.get(shared_image_id, []) if include_bboxes else None,
                "polygons": polygons.get(shared_image_id, []) if include_polygons else None,
            }
        return result
