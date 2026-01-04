"""Pydantic schemas for Annotations (Tags, Detections, Segmentations, Keypoints)."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


# ============================================================================
# Image Tags (Classification)
# ============================================================================
class ImageTagCreate(BaseModel):
    """Schema for creating an image tag (classification)."""

    label_id: UUID = Field(..., description="Label to apply")
    confidence: float = Field(1.0, ge=0.0, le=1.0, description="Confidence score")
    source: str = Field("manual", max_length=50, description="Source: manual, model:<id>, import")
    attributes: dict | None = Field(None, description="Per-annotation attributes")


class ImageTagResponse(BaseModel):
    """Image tag response schema."""

    id: UUID
    image_id: UUID
    label_id: UUID
    confidence: float
    source: str
    attributes: dict | None
    created_at: datetime
    updated_at: datetime


# ============================================================================
# Detections (Bounding Boxes)
# ============================================================================
class DetectionCreate(BaseModel):
    """Schema for creating a detection (bounding box)."""

    label_id: UUID = Field(..., description="Label for this detection")
    x_min: float = Field(..., ge=0, le=1, description="Left edge (0-1)")
    y_min: float = Field(..., ge=0, le=1, description="Top edge (0-1)")
    x_max: float = Field(..., ge=0, le=1, description="Right edge (0-1)")
    y_max: float = Field(..., ge=0, le=1, description="Bottom edge (0-1)")
    rotation: float = Field(0.0, ge=0, lt=360, description="Rotation degrees")
    confidence: float = Field(1.0, ge=0.0, le=1.0)
    source: str = Field("manual", max_length=50, description="Source: manual, model:<id>, import")
    attributes: dict | None = None


class DetectionUpdate(BaseModel):
    """Schema for updating a detection."""

    label_id: UUID | None = None
    x_min: float | None = None
    y_min: float | None = None
    x_max: float | None = None
    y_max: float | None = None
    rotation: float | None = None
    confidence: float | None = None
    attributes: dict | None = None


class DetectionResponse(BaseModel):
    """Detection response schema."""

    id: UUID
    image_id: UUID
    label_id: UUID
    x_min: float
    y_min: float
    x_max: float
    y_max: float
    rotation: float | None
    confidence: float | None
    source: str
    attributes: dict | None
    created_at: datetime
    updated_at: datetime


# ============================================================================
# Segmentations (Polygons/Masks)
# ============================================================================
class SegmentationCreate(BaseModel):
    """Schema for creating a segmentation."""

    label_id: UUID = Field(..., description="Label for this segmentation")
    format: str = Field(default="polygon", description="Format: polygon, rle, bitmap")
    polygon: list[list[float]] | None = Field(
        None, description="[[x1,y1], [x2,y2], ...] normalized coordinates"
    )
    rle: dict | None = Field(None, description="RLE-encoded mask")
    area: float | None = None
    confidence: float = Field(1.0, ge=0.0, le=1.0)
    source: str = Field("manual", max_length=50, description="Source: manual, model:<id>, import")
    attributes: dict | None = None


class SegmentationUpdate(BaseModel):
    """Schema for updating a segmentation."""

    label_id: UUID | None = None
    polygon: list[list[float]] | None = None
    rle: dict | None = None
    area: float | None = None
    confidence: float | None = None
    attributes: dict | None = None


class SegmentationResponse(BaseModel):
    """Segmentation response schema."""

    id: UUID
    image_id: UUID
    label_id: UUID
    format: str
    polygon: list[list[float]] | None
    rle: dict | None
    area: float | None
    confidence: float | None
    source: str
    attributes: dict | None
    created_at: datetime
    updated_at: datetime


# ============================================================================
# Keypoints
# ============================================================================
class KeypointCreate(BaseModel):
    """Schema for creating keypoints."""

    label_id: UUID = Field(..., description="Label for keypoints")
    skeleton_id: UUID | None = Field(None, description="Pose skeleton definition")
    points: list[dict] = Field(..., description="[{name, x, y, visibility}, ...]")
    confidence: float = Field(1.0, ge=0.0, le=1.0)
    source: str = Field("manual", max_length=50, description="Source: manual, model:<id>, import")
    attributes: dict | None = None


class KeypointUpdate(BaseModel):
    """Schema for updating keypoints."""

    points: list[dict] | None = None
    confidence: float | None = None
    attributes: dict | None = None


class KeypointResponse(BaseModel):
    """Keypoint response schema."""

    id: UUID
    image_id: UUID
    label_id: UUID
    skeleton_id: UUID | None
    points: list[dict]
    confidence: float | None
    source: str
    attributes: dict | None
    created_at: datetime
    updated_at: datetime


# ============================================================================
# Bulk Operations
# ============================================================================
class BulkTagCreate(BaseModel):
    """Bulk create image tags."""

    tags: list[ImageTagCreate] = Field(..., min_length=1, max_length=1000)


class BulkDetectionCreate(BaseModel):
    """Bulk create detections."""

    detections: list[DetectionCreate] = Field(..., min_length=1, max_length=1000)


class BulkSegmentationCreate(BaseModel):
    """Bulk create segmentations."""

    segmentations: list[SegmentationCreate] = Field(..., min_length=1, max_length=500)


class BulkAnnotationDelete(BaseModel):
    """Bulk delete annotations."""

    ids: list[UUID] = Field(..., min_length=1, max_length=1000)


# ============================================================================
# Image Annotations (Combined Response)
# ============================================================================
class ImageAnnotationsResponse(BaseModel):
    """All annotations for an image."""

    image_id: UUID
    tags: list[ImageTagResponse] = []
    detections: list[DetectionResponse] = []
    segmentations: list[SegmentationResponse] = []
    keypoints: list[KeypointResponse] = []
