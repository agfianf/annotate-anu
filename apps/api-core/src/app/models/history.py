"""SQLAlchemy Core models for Annotation History (Event Sourcing)."""

from sqlalchemy import (
    Column,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Table,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID

from app.helpers.database import metadata

# ============================================================================
# ANNOTATION EVENTS (Event Sourcing)
# ============================================================================
annotation_events = Table(
    "annotation_events",
    metadata,
    Column(
        "id",
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    ),
    Column(
        "target_type",
        String(20),
        nullable=False,
        comment="Type: tag, detection, segmentation, keypoint",
    ),
    Column(
        "target_id",
        UUID(as_uuid=True),
        nullable=False,
        comment="ID of the annotation",
    ),
    Column(
        "image_id",
        UUID(as_uuid=True),
        ForeignKey("images.id", ondelete="CASCADE"),
        nullable=False,
    ),
    Column(
        "event_type",
        String(20),
        nullable=False,
        comment="Type: create, update, delete, bulk_create, bulk_delete, import, model_prediction",
    ),
    Column(
        "previous_state",
        JSONB,
        nullable=True,
        comment="State before change (null for create)",
    ),
    Column(
        "new_state",
        JSONB,
        nullable=True,
        comment="State after change (null for delete)",
    ),
    Column(
        "actor_id",
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    ),
    Column(
        "actor_type",
        String(50),
        nullable=False,
        server_default=text("'user'"),
        comment="Type: user, model, system",
    ),
    Column(
        "job_version",
        Integer,
        nullable=False,
        comment="Job version at time of event",
    ),
    Column(
        "task_version",
        Integer,
        nullable=False,
        comment="Task version at time of event",
    ),
    Column(
        "metadata",
        JSONB,
        nullable=True,
        server_default=text("'{}'::jsonb"),
        comment="Additional event metadata",
    ),
    Column(
        "created_at",
        DateTime(timezone=True),
        nullable=False,
        server_default=text("now()"),
    ),
    # Indexes
    Index("ix_annotation_events_image_id", "image_id"),
    Index("ix_annotation_events_created_at", "created_at"),
    Index("ix_annotation_events_job_version", "image_id", "job_version"),
)

# ============================================================================
# VERSION SNAPSHOTS (Periodic snapshots for fast reconstruction)
# ============================================================================
version_snapshots = Table(
    "version_snapshots",
    metadata,
    Column(
        "id",
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    ),
    Column(
        "job_id",
        Integer,
        ForeignKey("jobs.id", ondelete="CASCADE"),
        nullable=False,
    ),
    Column(
        "version",
        Integer,
        nullable=False,
        comment="Version number",
    ),
    Column(
        "snapshot_s3_key",
        String(1024),
        nullable=True,
        comment="S3 path for large snapshots",
    ),
    Column(
        "annotations_snapshot",
        JSONB,
        nullable=True,
        comment="Inline snapshot for small datasets",
    ),
    Column(
        "image_count",
        Integer,
        nullable=False,
    ),
    Column(
        "annotation_count",
        Integer,
        nullable=False,
    ),
    Column(
        "created_by",
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    ),
    Column(
        "created_at",
        DateTime(timezone=True),
        nullable=False,
        server_default=text("now()"),
    ),
    # Indexes
    Index("ix_version_snapshots_job_id", "job_id"),
    Index("ix_version_snapshots_unique", "job_id", "version", unique=True),
)
