"""Annotation ownership, validation, and bulk synchronization."""

from uuid import UUID

from fastapi import HTTPException
from pydantic import ValidationError

from app.repositories.annotation import (
    DetectionRepository,
    ImageTagRepository,
    KeypointRepository,
    SegmentationRepository,
)
from app.repositories.annotation_write import AnnotationWriteRepository
from app.repositories.image import ImageRepository
from app.repositories.job import JobRepository
from app.schemas.annotation import (
    DetectionCreate,
    ImageTagCreate,
    KeypointCreate,
    SegmentationCreate,
)

READERS = {
    "tags": ImageTagRepository,
    "detections": DetectionRepository,
    "segmentations": SegmentationRepository,
    "keypoints": KeypointRepository,
}
CREATE_SCHEMAS = {
    "tags": ImageTagCreate,
    "detections": DetectionCreate,
    "segmentations": SegmentationCreate,
    "keypoints": KeypointCreate,
}


class AnnotationService:
    @staticmethod
    async def get_image(connection, image_id: UUID) -> dict:
        image = await ImageRepository.get_by_id(connection, image_id)
        if not image:
            raise HTTPException(404, "Image not found")
        return image

    @staticmethod
    async def list_for_image(connection, image_id: UUID) -> dict:
        return {
            kind: await repo.list_for_image(connection, image_id) for kind, repo in READERS.items()
        }

    @staticmethod
    async def validate_labels(connection, project_id: int, items: list[dict]) -> None:
        label_ids = {UUID(str(item["label_id"])) for item in items if item.get("label_id")}
        found = await AnnotationWriteRepository.labels_in_project(connection, project_id, label_ids)
        if found != label_ids:
            raise HTTPException(404, "Label not found")

    @staticmethod
    async def create_many(connection, image: dict, kind: str, items: list[dict]) -> list[dict]:
        await AnnotationService.validate_labels(connection, image["_project_id"], items)
        if kind == "tags":
            items = [
                {key: value for key, value in item.items() if key != "attributes"} for item in items
            ]
        return await AnnotationWriteRepository.create_many(connection, kind, image["id"], items)

    @staticmethod
    async def update(connection, image: dict, kind: str, item_id: UUID, data: dict) -> dict:
        await AnnotationService.validate_labels(connection, image["_project_id"], [data])
        if kind == "tags":
            data = {key: value for key, value in data.items() if key != "attributes"}
        if not data:
            row = await READERS[kind].get_by_id(connection, item_id)
            if row and row["image_id"] == image["id"]:
                return row
        else:
            row = await AnnotationWriteRepository.update_one(
                connection, kind, image["id"], item_id, data
            )
            if row:
                return row
        raise HTTPException(404, "Annotation not found")

    @staticmethod
    async def delete_many(connection, image: dict, kind: str, ids: list[UUID]) -> int:
        return await AnnotationWriteRepository.delete_many(connection, kind, image["id"], ids)

    @staticmethod
    async def refresh_status(connection, job_id: int, image_ids: list[UUID]) -> None:
        await AnnotationWriteRepository.refresh_image_status(connection, image_ids)
        await JobRepository.refresh_annotation_counts(connection, job_id)

    @staticmethod
    async def sync(connection, job: dict, payload) -> dict:
        total_ops = 0
        synced_images = []
        created_ids = {}
        for image_id, data in payload.images.items():
            image = await AnnotationService.get_image(connection, image_id)
            if image["job_id"] != job["id"]:
                raise HTTPException(404, "Image not found")
            image["_project_id"] = job["_project"]["id"]
            image_ops = 0
            for kind, schema in CREATE_SCHEMAS.items():
                changes = getattr(data, kind)
                if changes is None:
                    continue
                try:
                    creates = [schema.model_validate(item).model_dump() for item in changes.created]
                    updates = [
                        (UUID(str(item["id"])), schema.model_validate(item).model_dump())
                        for item in changes.updated
                    ]
                except (ValidationError, ValueError, KeyError) as exc:
                    raise HTTPException(422, f"Invalid {kind} sync data") from exc

                if creates:
                    rows = await AnnotationService.create_many(connection, image, kind, creates)
                    for row in rows:
                        frontend_id = (row.get("attributes") or {}).get("frontendId")
                        if frontend_id:
                            created_ids[frontend_id] = str(row["id"])
                    image_ops += len(rows)
                for item_id, values in updates:
                    await AnnotationService.update(connection, image, kind, item_id, values)
                    image_ops += 1
                image_ops += await AnnotationService.delete_many(
                    connection, image, kind, changes.deleted
                )
            # An already-deleted annotation is an acknowledged, idempotent delete.
            synced_images.append(str(image_id))
            total_ops += image_ops
        if synced_images:
            await AnnotationService.refresh_status(connection, job["id"], list(payload.images))
        return {
            "synced_images": synced_images,
            "total_operations": total_ops,
            "created_ids": created_ids,
        }
