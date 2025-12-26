"""Pydantic schemas for Data Management (Shared Images, Tags, Project Images)."""

from datetime import datetime
from typing import Literal
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
    already_existed: list[str] = Field(
        default_factory=list, description="Paths that already existed"
    )
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

    category_id: UUID | None = Field(None, description="Optional category ID")


class TagUpdate(BaseModel):
    """Schema for updating a tag."""

    name: str | None = Field(None, min_length=1, max_length=100)
    description: str | None = None
    color: str | None = Field(None, pattern=r"^#[0-9A-Fa-f]{6}$")
    category_id: UUID | None = Field(None, description="Optional category ID")


class TagResponse(BaseModel):
    """Tag response schema."""

    id: UUID
    project_id: int
    category_id: UUID | None = None
    name: str
    description: str | None = None
    color: str
    created_by: UUID | None = None
    created_at: datetime
    usage_count: int | None = None


# ============================================================================
# Tag Category Schemas
# ============================================================================
class TagCategoryBase(BaseModel):
    """Base schema for tag categories."""

    name: str = Field(..., min_length=1, max_length=100, description="Category name")
    display_name: str | None = Field(None, max_length=255, description="Display name for UI")
    color: str = Field(
        default="#6B7280",
        pattern=r"^#[0-9A-Fa-f]{6}$",
        description="Hex color for UI (inherited by tags)",
    )
    sidebar_order: int = Field(default=0, description="Order in sidebar display")


class TagCategoryCreate(TagCategoryBase):
    """Schema for creating a tag category."""

    pass


class TagCategoryUpdate(BaseModel):
    """Schema for updating a tag category."""

    name: str | None = Field(None, min_length=1, max_length=100)
    display_name: str | None = None
    color: str | None = Field(None, pattern=r"^#[0-9A-Fa-f]{6}$")
    sidebar_order: int | None = None


class TagCategoryResponse(BaseModel):
    """Tag category response schema."""

    id: UUID | None = None  # None for virtual "uncategorized" category
    project_id: int
    name: str
    display_name: str | None = None
    color: str
    sidebar_order: int
    created_by: UUID | None = None
    created_at: datetime | None = None  # None for virtual categories
    tag_count: int | None = None
    tags: list["TagResponse"] = Field(default_factory=list)


class TagCategoryReorderRequest(BaseModel):
    """Schema for reordering tag categories."""

    category_orders: list[dict] = Field(
        ...,
        min_length=1,
        max_length=100,
        description="List of {id: UUID, sidebar_order: int}",
    )


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
    excluded_tag_ids: list[UUID] | None = Field(None, description="Exclude images with these tags")
    include_match_mode: Literal["AND", "OR"] | None = Field(default="OR", description="Match mode for included tags")
    exclude_match_mode: Literal["AND", "OR"] | None = Field(default="OR", description="Match mode for excluded tags")
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
    label_name: str | None = Field(None, description="Label name for display")


class PolygonPreview(BaseModel):
    """Polygon preview for thumbnail overlay."""

    points: list[list[float]] = Field(
        ..., description="List of [x, y] normalized coordinates (0-1)"
    )
    label_color: str = Field(default="#10B981", description="Label color for rendering")
    label_name: str | None = Field(None, description="Label name for display")


class AnnotationSummary(BaseModel):
    """Lightweight annotation summary for thumbnails."""

    detection_count: int = Field(default=0, description="Number of detection annotations")
    segmentation_count: int = Field(default=0, description="Number of segmentation annotations")
    bboxes: list[BboxPreview] | None = Field(None, description="Simplified bboxes for overlay")
    polygons: list[PolygonPreview] | None = Field(None, description="Polygon data for segmentations")


# ============================================================================
# Job Association Schemas (for image-job relationships)
# ============================================================================
class JobAssociationInfo(BaseModel):
    """Job and task information for a shared image."""

    job_id: int
    job_status: str = Field(
        ..., description="Job status: pending, assigned, in_progress, completed, etc."
    )
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

    images: list[SharedImageWithAnnotations]
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
    split: Literal["train", "val", "test"] | None = Field(
        None, description="Dataset split: train, val, test, or null (none)"
    )
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


# ============================================================================
# Attribute Schemas (FiftyOne-style categorized attributes)
# ============================================================================
class AttributeSchemaBase(BaseModel):
    """Base schema for attribute schemas."""

    name: str = Field(..., min_length=1, max_length=100, description="Attribute name")
    display_name: str | None = Field(None, max_length=255, description="Display name")
    field_type: str = Field(
        ...,
        pattern=r"^(categorical|numeric|boolean|string)$",
        description="Field type: categorical, numeric, boolean, string",
    )
    allowed_values: list[str] | None = Field(
        None, description="Allowed values for categorical fields"
    )
    default_value: str | None = Field(None, max_length=255, description="Default value")
    min_value: float | None = Field(None, description="Minimum value for numeric fields")
    max_value: float | None = Field(None, description="Maximum value for numeric fields")
    unit: str | None = Field(None, max_length=50, description="Unit for numeric fields")
    color: str = Field(
        default="#6B7280",
        pattern=r"^#[0-9A-Fa-f]{6}$",
        description="Hex color for UI",
    )
    icon: str | None = Field(None, max_length=50, description="Icon name for UI")
    sidebar_order: int = Field(default=0, description="Order in sidebar")
    is_filterable: bool = Field(default=True, description="Show in sidebar filter")
    is_visible: bool = Field(default=True, description="Visible in UI")


class AttributeSchemaCreate(AttributeSchemaBase):
    """Schema for creating an attribute schema."""

    pass


class AttributeSchemaUpdate(BaseModel):
    """Schema for updating an attribute schema."""

    name: str | None = Field(None, min_length=1, max_length=100)
    display_name: str | None = None
    field_type: str | None = Field(None, pattern=r"^(categorical|numeric|boolean|string)$")
    allowed_values: list[str] | None = None
    default_value: str | None = None
    min_value: float | None = None
    max_value: float | None = None
    unit: str | None = None
    color: str | None = Field(None, pattern=r"^#[0-9A-Fa-f]{6}$")
    icon: str | None = None
    sidebar_order: int | None = None
    is_filterable: bool | None = None
    is_visible: bool | None = None


class AttributeSchemaResponse(AttributeSchemaBase):
    """Attribute schema response."""

    id: UUID
    project_id: int
    created_by: UUID | None = None
    created_at: datetime


class ImageAttributeBase(BaseModel):
    """Base schema for image attributes."""

    attribute_schema_id: UUID = Field(..., description="Attribute schema ID")
    value_categorical: str | None = Field(None, max_length=255)
    value_numeric: float | None = None
    value_boolean: bool | None = None
    value_string: str | None = None
    value_json: dict | None = None
    confidence: float | None = Field(None, ge=0, le=1, description="Confidence score")
    source: str = Field(default="manual", max_length=50, description="Source")


class ImageAttributeSet(BaseModel):
    """Schema for setting an attribute value on an image."""

    attribute_schema_id: UUID
    value: str | float | bool | dict | None = Field(
        ..., description="Value (type must match field_type)"
    )
    confidence: float | None = Field(None, ge=0, le=1)
    source: str = Field(default="manual", max_length=50)


class BulkAttributeSet(BaseModel):
    """Schema for bulk setting attributes on multiple images."""

    shared_image_ids: list[UUID] = Field(..., min_length=1, max_length=500, description="Image IDs")
    attribute_schema_id: UUID
    value: str | float | bool | dict | None = Field(..., description="Value to set on all images")
    source: str = Field(default="manual", max_length=50)


class ImageAttributeResponse(BaseModel):
    """Image attribute response."""

    id: UUID
    project_id: int
    shared_image_id: UUID
    attribute_schema_id: UUID
    value_categorical: str | None = None
    value_numeric: float | None = None
    value_boolean: bool | None = None
    value_string: str | None = None
    value_json: dict | None = None
    confidence: float | None = None
    source: str
    created_by: UUID | None = None
    created_at: datetime
    updated_at: datetime


# ============================================================================
# Sidebar Aggregation Schemas (FiftyOne-style sidebar)
# ============================================================================
class TagCount(BaseModel):
    """Tag with usage count for sidebar."""

    id: UUID
    name: str
    color: str
    count: int


class CategoricalValueCount(BaseModel):
    """Categorical value with count."""

    value: str
    count: int


class CategoricalAggregation(BaseModel):
    """Aggregation for a categorical attribute."""

    schema_id: UUID
    name: str
    display_name: str | None
    color: str
    values: list[CategoricalValueCount]


class HistogramBucket(BaseModel):
    """Histogram bucket for numeric fields."""

    bucket_start: float
    bucket_end: float
    count: int


class NumericAggregation(BaseModel):
    """Aggregation for a numeric attribute."""

    schema_id: UUID
    name: str
    display_name: str | None
    min_value: float
    max_value: float
    mean: float
    histogram: list[HistogramBucket]


class SizeDistribution(BaseModel):
    """Image size distribution."""

    small: int = Field(default=0, description="<0.5 megapixels")
    medium: int = Field(default=0, description="0.5-2 megapixels")
    large: int = Field(default=0, description=">2 megapixels")


class ComputedFieldsAggregation(BaseModel):
    """Computed fields aggregation."""

    size_distribution: SizeDistribution = Field(default_factory=SizeDistribution)
    width_stats: NumericAggregation | None = None
    height_stats: NumericAggregation | None = None
    file_size_stats: NumericAggregation | None = None


class SidebarAggregationResponse(BaseModel):
    """Response for sidebar aggregation endpoint."""

    total_images: int
    filtered_images: int
    tags: list[TagCount] = Field(default_factory=list)
    categorical_attributes: list[CategoricalAggregation] = Field(default_factory=list)
    numeric_attributes: list[NumericAggregation] = Field(default_factory=list)
    computed: ComputedFieldsAggregation = Field(default_factory=ComputedFieldsAggregation)


# Rebuild models to resolve forward references
SharedImageResponse.model_rebuild()
SharedImageWithAnnotations.model_rebuild()
TagCategoryResponse.model_rebuild()
