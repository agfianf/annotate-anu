"""Schemas for job-level annotation sync."""

from uuid import UUID

from pydantic import BaseModel, Field

from app.schemas.annotation import (
    BulkDetectionCreate,
    BulkSegmentationCreate,
    DetectionCreate,
    KeypointCreate,
    SegmentationCreate,
    ImageTagCreate,
)

# We need to define "Sync" versions that include creates, updates, and deletes
# Since the existing "Bulk*Create" only have 'tags', 'detections' list fields, we might need new structures
# or reuse the existing granular schemas more cleverly.

# Let's define specific sync structures for each type
class TagSync(BaseModel):
    created: list[dict] = Field(default_factory=list) # payload for creates
    updated: list[dict] = Field(default_factory=list) # payload for updates (with IDs)
    deleted: list[UUID] = Field(default_factory=list) # IDs to delete

class DetectionSync(BaseModel):
    created: list[dict] = Field(default_factory=list)
    updated: list[dict] = Field(default_factory=list)
    deleted: list[UUID] = Field(default_factory=list)

class SegmentationSync(BaseModel):
    created: list[dict] = Field(default_factory=list)
    updated: list[dict] = Field(default_factory=list)
    deleted: list[UUID] = Field(default_factory=list)

class KeypointSync(BaseModel):
    created: list[dict] = Field(default_factory=list)
    updated: list[dict] = Field(default_factory=list)
    deleted: list[UUID] = Field(default_factory=list)

class ImageSyncData(BaseModel):
    """Sync data for a single image."""
    tags: TagSync | None = None
    detections: DetectionSync | None = None
    segmentations: SegmentationSync | None = None
    keypoints: KeypointSync | None = None

class JobSyncRequest(BaseModel):
    """Bulk sync request for a job."""
    images: dict[UUID, ImageSyncData]
