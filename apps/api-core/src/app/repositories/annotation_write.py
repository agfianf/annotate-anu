"""Scoped, batched annotation writes and status queries."""

from datetime import datetime, timezone
from itertools import groupby
from uuid import UUID

from sqlalchemy import delete, insert, or_, select, update
from sqlalchemy.ext.asyncio import AsyncConnection

from app.models.annotation import detections, image_tags, keypoints, segmentations
from app.models.image import images
from app.models.project import labels

TABLES = {
    "tags": image_tags,
    "detections": detections,
    "segmentations": segmentations,
    "keypoints": keypoints,
}


class AnnotationWriteRepository:
    @staticmethod
    async def labels_in_project(connection, project_id: int, label_ids: set[UUID]) -> set[UUID]:
        if not label_ids:
            return set()
        result = await connection.execute(
            select(labels.c.id).where(labels.c.project_id == project_id, labels.c.id.in_(label_ids))
        )
        return set(result.scalars())

    @staticmethod
    async def create_many(connection, kind: str, image_id: UUID, items: list[dict]) -> list[dict]:
        table = TABLES[kind]
        created = []
        # Consecutive groups preserve input order and omitted-column defaults.
        for _, group in groupby(items, key=lambda item: tuple(sorted(item))):
            rows = list(group)
            for start in range(0, len(rows), 500):
                stmt = (
                    insert(table)
                    .values([{**item, "image_id": image_id} for item in rows[start : start + 500]])
                    .returning(table)
                )
                result = await connection.execute(stmt)
                created.extend(dict(row) for row in result.mappings())
        return created

    @staticmethod
    async def update_one(connection, kind: str, image_id: UUID, item_id: UUID, data: dict):
        table = TABLES[kind]
        values = dict(data)
        if "updated_at" in table.c:
            values["updated_at"] = datetime.now(timezone.utc)
        result = await connection.execute(
            update(table)
            .where(table.c.id == item_id, table.c.image_id == image_id)
            .values(**values)
            .returning(table)
        )
        row = result.mappings().first()
        return dict(row) if row else None

    @staticmethod
    async def delete_many(connection, kind: str, image_id: UUID, ids: list[UUID]) -> int:
        table = TABLES[kind]
        count = 0
        for start in range(0, len(ids), 10000):
            result = await connection.execute(
                delete(table).where(
                    table.c.image_id == image_id, table.c.id.in_(ids[start : start + 10000])
                )
            )
            count += result.rowcount
        return count

    @staticmethod
    async def refresh_image_status(connection: AsyncConnection, image_ids: list[UUID]) -> None:
        has_annotations = or_(
            *[
                select(table.c.id).where(table.c.image_id == images.c.id).exists()
                for table in TABLES.values()
            ]
        )
        for start in range(0, len(image_ids), 10000):
            await connection.execute(
                update(images)
                .where(images.c.id.in_(image_ids[start : start + 10000]))
                .values(is_annotated=has_annotations)
            )
