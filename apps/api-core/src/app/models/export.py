"""SQLAlchemy Core models for Export functionality."""

from sqlalchemy import (
    BigInteger,
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Table,
    Text,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID

from app.helpers.database import metadata


# ============================================================================
# SAVED FILTERS (Reusable filter configurations)
# ============================================================================
saved_filters = Table(
    "saved_filters",
    metadata,
    Column(
        "id",
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
        comment="Unique identifier",
    ),
    Column(
        "project_id",
        Integer,
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False,
        comment="Parent project",
    ),
    Column(
        "name",
        String(255),
        nullable=False,
        comment="Filter name",
    ),
    Column(
        "description",
        Text,
        nullable=True,
        comment="Optional description",
    ),
    Column(
        "filter_config",
        JSONB,
        nullable=False,
        comment="Complete filter specification (tag_ids, task_ids, etc.)",
    ),
    Column(
        "created_by",
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        comment="User who created the filter",
    ),
    Column(
        "created_at",
        DateTime(timezone=True),
        nullable=False,
        server_default=text("now()"),
    ),
    Column(
        "updated_at",
        DateTime(timezone=True),
        nullable=False,
        server_default=text("now()"),
    ),
    # Indexes
    Index("ix_saved_filters_project_id", "project_id"),
    Index("ix_saved_filters_unique_name", "project_id", "name", unique=True),
)


# ============================================================================
# EXPORTS (Export history and artifacts)
# ============================================================================
exports = Table(
    "exports",
    metadata,
    Column(
        "id",
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
        comment="Unique identifier",
    ),
    Column(
        "project_id",
        Integer,
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False,
        comment="Parent project",
    ),
    # Export configuration
    Column(
        "export_mode",
        String(20),
        nullable=False,
        comment="Export mode: classification, detection, segmentation",
    ),
    Column(
        "output_format",
        String(50),
        nullable=False,
        comment="Output format: coco_json, manifest_csv, image_folder",
    ),
    Column(
        "include_images",
        Boolean,
        nullable=False,
        server_default=text("false"),
        comment="Whether to include image files in export",
    ),
    # Filter snapshot (the recipe - stored for reproducibility)
    Column(
        "filter_snapshot",
        JSONB,
        nullable=False,
        comment="Complete filter state at export time",
    ),
    Column(
        "saved_filter_id",
        UUID(as_uuid=True),
        ForeignKey("saved_filters.id", ondelete="SET NULL"),
        nullable=True,
        comment="Reference to saved filter if used",
    ),
    # Classification mapping (for classification mode)
    Column(
        "classification_config",
        JSONB,
        nullable=True,
        comment="Classification mapping: mode (categorized/free_form), class assignments",
    ),
    # Mode-specific options
    Column(
        "mode_options",
        JSONB,
        nullable=True,
        comment="Mode options: include_bbox_from_seg, convert_bbox_to_seg, label_filter",
    ),
    # Version selection
    Column(
        "version_mode",
        String(20),
        nullable=False,
        server_default=text("'latest'"),
        comment="Version mode: latest, job_version, timestamp",
    ),
    Column(
        "version_value",
        String(50),
        nullable=True,
        comment="Version number or ISO timestamp (for job_version/timestamp modes)",
    ),
    # Results
    Column(
        "status",
        String(20),
        nullable=False,
        server_default=text("'pending'"),
        comment="Status: pending, processing, completed, failed",
    ),
    Column(
        "artifact_path",
        String(1024),
        nullable=True,
        comment="Path to export artifact on filesystem",
    ),
    Column(
        "artifact_size_bytes",
        BigInteger,
        nullable=True,
        comment="Size of export artifact in bytes",
    ),
    Column(
        "name",
        String(255),
        nullable=True,
        comment="Export name (auto-generated or user-provided)",
    ),
    Column(
        "version_number",
        Integer,
        nullable=True,
        comment="Auto-incrementing version number per project+mode",
    ),
    Column(
        "message",
        Text,
        nullable=True,
        comment="User-provided message or description",
    ),
    Column(
        "error_message",
        Text,
        nullable=True,
        comment="Error message if export failed",
    ),
    # Summary counts
    Column(
        "summary",
        JSONB,
        nullable=True,
        comment="Summary: image_count, annotation_count, class_counts, split_counts",
    ),
    # Resolved metadata (human-readable names for versioning/diff)
    Column(
        "resolved_metadata",
        JSONB,
        nullable=True,
        comment="Resolved metadata: tags/labels with names, user info, project info for versioning",
    ),
    # Metadata
    Column(
        "created_by",
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        comment="User who created the export",
    ),
    Column(
        "created_at",
        DateTime(timezone=True),
        nullable=False,
        server_default=text("now()"),
    ),
    Column(
        "completed_at",
        DateTime(timezone=True),
        nullable=True,
        comment="When export completed (success or failure)",
    ),
    # Indexes
    Index("ix_exports_project_id", "project_id"),
    Index("ix_exports_status", "status"),
    Index("ix_exports_created_at", "created_at"),
    Index("ix_exports_project_mode_version", "project_id", "export_mode", "version_number"),
)
