"""Repository layer for Annotation data access."""

from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import delete, insert, select, update
from sqlalchemy.ext.asyncio import AsyncConnection

from app.models.annotation import detections, image_tags, keypoints, segmentations


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
