"""SQLAlchemy Core model for Jobs."""

from sqlalchemy import (
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
from sqlalchemy.dialects.postgresql import UUID

from app.helpers.database import metadata

# ============================================================================
# JOBS (Chunked work units from Task)
# ============================================================================
jobs = Table(
    "jobs",
    metadata,
    Column(
        "id",
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
        comment="UUID primary key",
    ),
    Column(
        "task_id",
        UUID(as_uuid=True),
        ForeignKey("tasks.id", ondelete="CASCADE"),
        nullable=False,
        comment="Parent task",
    ),
    Column(
        "sequence_number",
        Integer,
        nullable=False,
        comment="Order within task",
    ),
    Column(
        "assignee_id",
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        comment="Assigned annotator",
    ),
    Column(
        "status",
        String(20),
        nullable=False,
        server_default=text("'pending'"),
        comment="Status: pending, assigned, in_progress, completed, review, approved, rejected",
    ),
    Column(
        "is_approved",
        Boolean,
        nullable=False,
        server_default=text("false"),
        comment="QA approval status",
    ),
    Column(
        "approved_by",
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        comment="User who approved",
    ),
    Column(
        "approved_at",
        DateTime(timezone=True),
        nullable=True,
        comment="Approval timestamp",
    ),
    Column(
        "rejection_reason",
        Text,
        nullable=True,
        comment="Reason for rejection",
    ),
    Column(
        "version",
        Integer,
        nullable=False,
        server_default=text("1"),
        comment="Auto-incrementing version on annotation changes",
    ),
    Column(
        "total_images",
        Integer,
        nullable=False,
        server_default=text("0"),
        comment="Total image count (cached)",
    ),
    Column(
        "annotated_images",
        Integer,
        nullable=False,
        server_default=text("0"),
        comment="Annotated image count (cached)",
    ),
    Column(
        "started_at",
        DateTime(timezone=True),
        nullable=True,
        comment="When work started",
    ),
    Column(
        "completed_at",
        DateTime(timezone=True),
        nullable=True,
        comment="When work completed",
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
    Index("ix_jobs_task_id", "task_id"),
    Index("ix_jobs_assignee_id", "assignee_id"),
    Index("ix_jobs_status", "status"),
    Index("ix_jobs_unique", "task_id", "sequence_number", unique=True),
)
