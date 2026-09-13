"""Pydantic schemas for Export functionality."""

from datetime import datetime
from enum import Enum
from uuid import UUID

from pydantic import BaseModel, Field

from app.schemas.image_filters import ImageFilterParams


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
    YOLO_DETECT = "yolo_detect"
    YOLO_SEG = "yolo_seg"


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


class ExportSortBy(str, Enum):
    """Export list sort field."""

    CREATED_AT = "created_at"
    VERSION_NUMBER = "version_number"


class SortOrder(str, Enum):
    """Sort order."""

    ASC = "asc"
    DESC = "desc"


# ============================================================================
# Configuration Schemas
# ============================================================================
class ClassificationMappingConfig(BaseModel):
    """Classification mapping configuration."""

    mode: ClassificationMappingMode = Field(
        ..., description="Mapping mode: categorized or free_form"
    )
    category_id: UUID | None = Field(None, description="Tag category ID for categorized mode")
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


class FilterSnapshot(ImageFilterParams):
    """Complete filter state for export (the recipe).

    This is the canonical `ImageFilterParams` contract, not a copy of part of it. The snapshot the export stores therefore describes exactly the image set the gallery was showing, and `ProjectImageRepository.build_filtered_query` resolves both. It used to declare its own 16 fields by hand, which is how the export silently covered a different subset from the gallery's 46-field filter; adding a field to `ImageFilterParams` must keep reaching the export, so do not reintroduce a hand-written field list here.

    Snapshots written by older clients still validate: every field they carried is present in the contract under the same name, and everything else defaults to "no constraint".
    """


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
    saved_filter_id: UUID | None = Field(None, description="Reference to saved filter if used")

    # Mode-specific configuration
    classification_config: ClassificationMappingConfig | None = Field(
        None, description="Classification mapping config (for classification mode)"
    )
    mode_options: ModeOptions | None = Field(None, description="Mode-specific options")

    # Version
    version_mode: VersionMode = Field(
        default=VersionMode.LATEST, description="Version selection mode"
    )
    version_value: str | None = Field(None, description="Version number or ISO timestamp")

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
    class_counts: dict[str, int] = Field(default_factory=dict, description="Counts per class/label")
    split_counts: dict[str, int] = Field(
        default_factory=dict, description="Counts per split (train/val/test)"
    )


class CreatedByUser(BaseModel):
    """User info for created_by field."""

    id: UUID
    email: str
    full_name: str


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
    resolved_metadata: dict | None = Field(
        None,
        description="Resolved metadata with human-readable names for tags, labels, user, project",
    )
    created_by: UUID | None = None
    created_by_user: CreatedByUser | None = None
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
class ExportScope(BaseModel):
    """The image set an export covers, resolved from its filter snapshot.

    Resolved by the same query the export execution runs, so the count shown before an export is created is the count the export will write, up to changes made to the project in between. `active_filters` names the constraints that actually narrowed the set, so the preview can spell the scope out instead of leaving the user to trust that the gallery's filters travelled with it.
    """

    image_count: int = Field(..., description="Images matching the snapshot right now")
    active_filters: list[str] = Field(
        default_factory=list,
        description="Names of the filter fields that are set, in contract order",
    )
    is_whole_project: bool = Field(
        ..., description="True when no filter is set and the export covers the whole project pool"
    )
    filters: FilterSnapshot = Field(
        ..., description="The canonical filter set that was resolved, as stored on the export"
    )


class ExportPreview(BaseModel):
    """Preview of export before creation."""

    image_count: int = Field(..., description="Number of images matching filter")
    scope: ExportScope | None = Field(
        default=None,
        description="Resolved scope: the same filter set and image count the export execution will use",
    )
    annotation_counts: dict[str, int] = Field(
        default_factory=dict,
        description="Annotation counts by type (detection, segmentation, classification)",
    )
    class_counts: dict[str, int] = Field(default_factory=dict, description="Counts per class/label")
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
