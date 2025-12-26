"""Pydantic schemas for Export functionality."""

from datetime import datetime
from enum import Enum
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field


# ============================================================================
# Enums
# ============================================================================
class ExportMode(str, Enum):
    """Export mode types."""

    CLASSIFICATION = "classification"
    DETECTION = "detection"
    SEGMENTATION = "segmentation"


class ExportOutputFormat(str, Enum):
    """Export output format types."""

    COCO_JSON = "coco_json"
    MANIFEST_CSV = "manifest_csv"
    IMAGE_FOLDER = "image_folder"


class VersionMode(str, Enum):
    """Version selection mode."""

    LATEST = "latest"
    JOB_VERSION = "job_version"
    TIMESTAMP = "timestamp"


class ClassificationMappingMode(str, Enum):
    """Classification mapping mode."""

    CATEGORIZED = "categorized"  # Auto-map from tag category
    FREE_FORM = "free_form"  # Manual dropdown mapping


class ExportStatus(str, Enum):
    """Export status."""

    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


# ============================================================================
# Configuration Schemas
# ============================================================================
class ClassificationMappingConfig(BaseModel):
    """Classification mapping configuration."""

    mode: ClassificationMappingMode = Field(
        ..., description="Mapping mode: categorized or free_form"
    )
    category_id: UUID | None = Field(
        None, description="Tag category ID for categorized mode"
    )
    class_mapping: dict[str, list[str]] | None = Field(
        None,
        description="Manual class mapping for free_form mode: class_name -> [tag_ids]",
    )


class ModeOptions(BaseModel):
    """Mode-specific options."""

    # Detection mode options
    include_bbox_from_segmentation: bool = Field(
        default=False, description="Include bboxes converted from segmentations"
    )

    # Segmentation mode options
    include_bbox_alongside_segmentation: bool = Field(
        default=False, description="Include bbox alongside segmentation polygons"
    )
    convert_bbox_to_segmentation: bool = Field(
        default=False, description="Convert detection bboxes to polygon segmentations"
    )

    # Common options
    label_filter: list[UUID] | None = Field(
        None, description="Filter by specific annotation label IDs"
    )


class FilterSnapshot(BaseModel):
    """Complete filter state for export (the recipe)."""

    # Tag filters
    tag_ids: list[UUID] | None = Field(None, description="Include tags")
    excluded_tag_ids: list[UUID] | None = Field(None, description="Exclude tags")
    include_match_mode: Literal["AND", "OR"] = Field(
        default="OR", description="Match mode for included tags"
    )
    exclude_match_mode: Literal["AND", "OR"] = Field(
        default="OR", description="Match mode for excluded tags"
    )

    # Scope filters
    task_ids: list[int] | None = Field(None, description="Filter by task IDs")
    job_id: int | None = Field(None, description="Filter by job ID")
    is_annotated: bool | None = Field(None, description="Filter by annotation status")

    # Path filters
    filepath_paths: list[str] | None = Field(None, description="Filter by directory paths")
    image_uids: list[UUID] | None = Field(None, description="Filter by specific image UIDs")

    # Metadata filters
    width_min: int | None = Field(None, ge=0, description="Minimum image width")
    width_max: int | None = Field(None, ge=0, description="Maximum image width")
    height_min: int | None = Field(None, ge=0, description="Minimum image height")
    height_max: int | None = Field(None, ge=0, description="Maximum image height")
    file_size_min: int | None = Field(None, ge=0, description="Minimum file size in bytes")
    file_size_max: int | None = Field(None, ge=0, description="Maximum file size in bytes")


# ============================================================================
# Saved Filter Schemas
# ============================================================================
class SavedFilterCreate(BaseModel):
    """Schema for creating a saved filter."""

    name: str = Field(..., min_length=1, max_length=255, description="Filter name")
    description: str | None = Field(None, max_length=1000, description="Optional description")
    filter_config: FilterSnapshot = Field(..., description="Filter configuration")


class SavedFilterUpdate(BaseModel):
    """Schema for updating a saved filter."""

    name: str | None = Field(None, min_length=1, max_length=255)
    description: str | None = None
    filter_config: FilterSnapshot | None = None


class SavedFilterResponse(BaseModel):
    """Saved filter response schema."""

    id: UUID
    project_id: int
    name: str
    description: str | None = None
    filter_config: dict  # Returns as dict for flexibility
    created_by: UUID | None = None
    created_at: datetime
    updated_at: datetime


# ============================================================================
# Export Schemas
# ============================================================================
class ExportCreate(BaseModel):
    """Schema for creating an export."""

    export_mode: ExportMode = Field(..., description="Export mode")
    output_format: ExportOutputFormat = Field(..., description="Output format")
    include_images: bool = Field(default=False, description="Include image files in export")

    # Filter
    filter_snapshot: FilterSnapshot = Field(..., description="Filter configuration")
    saved_filter_id: UUID | None = Field(
        None, description="Reference to saved filter if used"
    )

    # Mode-specific configuration
    classification_config: ClassificationMappingConfig | None = Field(
        None, description="Classification mapping config (for classification mode)"
    )
    mode_options: ModeOptions | None = Field(
        None, description="Mode-specific options"
    )

    # Version
    version_mode: VersionMode = Field(
        default=VersionMode.LATEST, description="Version selection mode"
    )
    version_value: str | None = Field(
        None, description="Version number or ISO timestamp"
    )

    # User-provided name (optional, auto-generated if not provided)
    name: str | None = Field(
        None, max_length=255, description="Export name (auto-generated if not provided)"
    )

    # User message
    message: str | None = Field(None, max_length=1000, description="Export description")


class ExportSummary(BaseModel):
    """Export summary counts."""

    image_count: int = Field(..., description="Total images exported")
    annotation_count: int = Field(..., description="Total annotations exported")
    class_counts: dict[str, int] = Field(
        default_factory=dict, description="Counts per class/label"
    )
    split_counts: dict[str, int] = Field(
        default_factory=dict, description="Counts per split (train/val/test)"
    )


class ExportResponse(BaseModel):
    """Export response schema."""

    id: UUID
    project_id: int
    name: str | None = None
    version_number: int | None = None
    export_mode: str
    output_format: str
    include_images: bool
    filter_snapshot: dict
    saved_filter_id: UUID | None = None
    classification_config: dict | None = None
    mode_options: dict | None = None
    version_mode: str
    version_value: str | None = None
    status: str
    artifact_path: str | None = None
    artifact_size_bytes: int | None = None
    message: str | None = None
    error_message: str | None = None
    summary: ExportSummary | None = None
    created_by: UUID | None = None
    created_at: datetime
    completed_at: datetime | None = None


class ExportListResponse(BaseModel):
    """Paginated list of exports."""

    exports: list[ExportResponse]
    total: int
    page: int
    page_size: int


# ============================================================================
# Export Preview Schemas
# ============================================================================
class ExportPreview(BaseModel):
    """Preview of export before creation."""

    image_count: int = Field(..., description="Number of images matching filter")
    annotation_counts: dict[str, int] = Field(
        default_factory=dict,
        description="Annotation counts by type (detection, segmentation, classification)",
    )
    class_counts: dict[str, int] = Field(
        default_factory=dict, description="Counts per class/label"
    )
    split_counts: dict[str, int] = Field(
        default_factory=dict, description="Counts per split (train/val/test/none)"
    )
    warnings: list[str] = Field(
        default_factory=list, description="Warnings (e.g., 'X images have no annotations')"
    )


# ============================================================================
# Classification Options Schemas
# ============================================================================
class ClassificationOptionsResponse(BaseModel):
    """Available classification options for export wizard."""

    categories: list[dict] = Field(
        default_factory=list,
        description="Tag categories with their tags",
    )
    labels: list[dict] = Field(
        default_factory=list,
        description="Annotation labels available for classification",
    )
