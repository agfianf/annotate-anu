"""Pydantic schemas for Data Management (Shared Images, Tags, Project Images)."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


# ============================================================================
# Shared Image Schemas
# ============================================================================
class SharedImageBase(BaseModel):
    """Base schema for shared images."""

    file_path: str = Field(..., max_length=1024, description="Relative path from SHARE_ROOT")
    filename: str = Field(..., max_length=512, description="Original filename")
    width: int | None = Field(None, description="Image width in pixels")
    height: int | None = Field(None, description="Image height in pixels")
    file_size_bytes: int | None = Field(None, description="File size in bytes")
    mime_type: str | None = Field(None, max_length=100, description="MIME type")


class SharedImageCreate(SharedImageBase):
    """Schema for registering a shared image."""

    checksum_sha256: str | None = Field(None, max_length=64, description="SHA256 checksum")
    metadata: dict | None = Field(None, description="Custom metadata")


class SharedImageUpdate(BaseModel):
    """Schema for updating a shared image."""

    width: int | None = None
    height: int | None = None
    file_size_bytes: int | None = None
    mime_type: str | None = None
    checksum_sha256: str | None = None
    metadata: dict | None = None


class SharedImageResponse(SharedImageBase):
    """Shared image response schema."""

    id: UUID
    checksum_sha256: str | None = None
    metadata: dict | None = None
    registered_by: UUID | None = None
    created_at: datetime
    updated_at: datetime
    thumbnail_url: str | None = None
    tags: list["TagResponse"] = Field(default_factory=list)


class SharedImageBulkRegister(BaseModel):
    """Schema for bulk registering file paths as shared images."""

    file_paths: list[str] = Field(
        ...,
        min_length=1,
        max_length=1000,
        description="List of file paths to register",
    )


class SharedImageBulkRegisterResponse(BaseModel):
    """Response for bulk registration."""

    registered: list[SharedImageResponse]
    already_existed: list[str] = Field(default_factory=list, description="Paths that already existed")
    failed: list[str] = Field(default_factory=list, description="Paths that failed to register")
    total_registered: int
    total_already_existed: int
    total_failed: int


# ============================================================================
# Tag Schemas
# ============================================================================
class TagBase(BaseModel):
    """Base schema for tags."""

    name: str = Field(..., min_length=1, max_length=100, description="Tag name")
    description: str | None = Field(None, max_length=500, description="Optional description")
    color: str = Field(
        default="#6B7280",
        pattern=r"^#[0-9A-Fa-f]{6}$",
        description="Hex color for UI",
    )


class TagCreate(TagBase):
    """Schema for creating a tag."""

    pass


class TagUpdate(BaseModel):
    """Schema for updating a tag."""

    name: str | None = Field(None, min_length=1, max_length=100)
    description: str | None = None
    color: str | None = Field(None, pattern=r"^#[0-9A-Fa-f]{6}$")


class TagResponse(BaseModel):
    """Tag response schema."""

    id: UUID
    name: str
    description: str | None = None
    color: str
    created_by: UUID | None = None
    created_at: datetime
    usage_count: int | None = None


# ============================================================================
# Shared Image Tags (Tagging) Schemas
# ============================================================================
class AddTagsRequest(BaseModel):
    """Schema for adding tags to an image."""

    tag_ids: list[UUID] = Field(..., min_length=1, max_length=50, description="Tag IDs to add")


class RemoveTagsRequest(BaseModel):
    """Schema for removing tags from an image."""

    tag_ids: list[UUID] = Field(..., min_length=1, max_length=50, description="Tag IDs to remove")


class BulkTagRequest(BaseModel):
    """Schema for bulk tagging multiple images."""

    shared_image_ids: list[UUID] = Field(
        ...,
        min_length=1,
        max_length=500,
        description="Image IDs to tag",
    )
    tag_ids: list[UUID] = Field(
        ...,
        min_length=1,
        max_length=50,
        description="Tag IDs to add",
    )


class BulkTagResponse(BaseModel):
    """Response for bulk tagging."""

    tags_added: int
    images_affected: int


# ============================================================================
# Project Image Pool Schemas
# ============================================================================
class ProjectImageAdd(BaseModel):
    """Schema for adding images to project pool."""

    shared_image_ids: list[UUID] = Field(
        ...,
        min_length=1,
        max_length=500,
        description="Image IDs to add to pool",
    )


class ProjectImageRemove(BaseModel):
    """Schema for removing images from project pool."""

    shared_image_ids: list[UUID] = Field(
        ...,
        min_length=1,
        max_length=500,
        description="Image IDs to remove from pool",
    )


class ProjectPoolResponse(BaseModel):
    """Response for project image pool operations."""

    project_id: int
    total_images: int
    images_added: int = 0
    images_removed: int = 0


class ProjectPoolListResponse(BaseModel):
    """Paginated list of project pool images."""

    project_id: int
    images: list[SharedImageResponse]
    total: int
    page: int
    page_size: int


# ============================================================================
# Explore/Filter Schemas
# ============================================================================
class ExploreFilter(BaseModel):
    """Filter options for exploring images."""

    tag_ids: list[UUID] | None = Field(None, description="Filter by tag IDs")
    task_ids: list[int] | None = Field(None, description="Filter by task IDs (multi-select)")
    job_id: int | None = Field(None, description="Filter by job ID")
    is_annotated: bool | None = Field(None, description="Filter by annotation status")
    search: str | None = Field(None, max_length=255, description="Search filename")


# ============================================================================
# Annotation Preview Schemas (for thumbnails)
# ============================================================================
class BboxPreview(BaseModel):
    """Minimal bbox for thumbnail overlay."""

    x_min: float = Field(..., ge=0, le=1, description="Normalized x_min (0-1)")
    y_min: float = Field(..., ge=0, le=1, description="Normalized y_min (0-1)")
    x_max: float = Field(..., ge=0, le=1, description="Normalized x_max (0-1)")
    y_max: float = Field(..., ge=0, le=1, description="Normalized y_max (0-1)")
    label_color: str = Field(default="#10B981", description="Label color for rendering")


class AnnotationSummary(BaseModel):
    """Lightweight annotation summary for thumbnails."""

    detection_count: int = Field(default=0, description="Number of detection annotations")
    segmentation_count: int = Field(default=0, description="Number of segmentation annotations")
    bboxes: list[BboxPreview] | None = Field(None, description="Simplified bboxes for overlay")


# ============================================================================
# Job Association Schemas (for image-job relationships)
# ============================================================================
class JobAssociationInfo(BaseModel):
    """Job and task information for a shared image."""

    job_id: int
    job_status: str = Field(..., description="Job status: pending, assigned, in_progress, completed, etc.")
    job_sequence: int = Field(..., description="Sequence number within task")
    job_is_archived: bool
    task_id: int
    task_name: str
    task_status: str
    task_is_archived: bool
    assignee_id: UUID | None = None
    assignee_email: str | None = None


class SharedImageWithAnnotations(SharedImageBase):
    """Shared image response with annotation summary."""

    id: UUID
    checksum_sha256: str | None = None
    metadata: dict | None = None
    registered_by: UUID | None = None
    created_at: datetime
    updated_at: datetime
    thumbnail_url: str | None = None
    tags: list["TagResponse"] = Field(default_factory=list)
    annotation_summary: AnnotationSummary | None = None


class ExploreResponse(BaseModel):
    """Response for explore endpoint."""

    images: list[SharedImageResponse]
    total: int
    page: int
    page_size: int
    filters_applied: dict = Field(default_factory=dict)


# ============================================================================
# Task Creation with File Paths
# ============================================================================
class TaskCreateWithFilePaths(BaseModel):
    """Schema for creating a task with file paths from file share."""

    name: str = Field(..., max_length=255, description="Task name")
    description: str | None = Field(None, description="Task description")
    assignee_id: UUID | None = Field(None, description="Default assignee for jobs")
    chunk_size: int = Field(default=25, ge=1, le=500, description="Images per job (1-500)")
    distribution_order: str = Field(
        default="sequential",
        description="Image distribution: 'sequential' or 'random'",
    )
    file_paths: list[str] = Field(
        ...,
        min_length=1,
        max_length=10000,
        description="List of file paths to include",
    )

    def model_post_init(self, __context) -> None:
        if self.distribution_order not in ("sequential", "random"):
            raise ValueError("distribution_order must be 'sequential' or 'random'")


# Rebuild models to resolve forward references
SharedImageResponse.model_rebuild()
SharedImageWithAnnotations.model_rebuild()
