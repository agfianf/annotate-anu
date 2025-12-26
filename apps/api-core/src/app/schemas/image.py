"""Pydantic schemas for Images."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class ImageCreate(BaseModel):
    """Schema for creating an image record."""

    filename: str = Field(..., max_length=512, description="Original filename")
    s3_key: str = Field(..., max_length=1024, description="S3 path")
    s3_bucket: str = Field(default="annotate-anu", max_length=255)
    width: int = Field(..., gt=0, description="Image width")
    height: int = Field(..., gt=0, description="Image height")
    thumbnail_s3_key: str | None = None
    file_size_bytes: int | None = None
    mime_type: str | None = None
    checksum_sha256: str | None = None
    metadata: dict | None = None
    sequence_number: int = Field(..., ge=0, description="Order within job")


class ImageBulkCreate(BaseModel):
    """Schema for bulk image creation."""

    images: list[ImageCreate] = Field(..., min_length=1, max_length=1000)


class ImageUpdate(BaseModel):
    """Schema for updating an image."""

    metadata: dict | None = None
    sequence_number: int | None = None


class ImageResponse(BaseModel):
    """Image response schema."""

    id: UUID
    job_id: int
    filename: str
    s3_key: str
    s3_bucket: str
    width: int
    height: int
    thumbnail_s3_key: str | None
    file_size_bytes: int | None
    mime_type: str | None
    checksum_sha256: str | None
    metadata: dict | None
    sequence_number: int
    is_annotated: bool
    shared_image_id: UUID | None = Field(None, description="Reference to shared image registry")
    created_at: datetime
    updated_at: datetime


class ImageListResponse(BaseModel):
    """Paginated image list response."""

    images: list[ImageResponse]
    total: int
    page: int
    page_size: int
