"""SQLAlchemy Core model for Tasks."""

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
# TASKS (Logical grouping of images)
# ============================================================================
tasks = Table(
    "tasks",
    metadata,
    Column(
        "id",
        Integer,
        primary_key=True,
        autoincrement=True,
        comment="Auto-incrementing primary key",
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
        comment="Task name",
    ),
    Column(
        "description",
        Text,
        nullable=True,
        comment="Task description",
    ),
    Column(
        "assignee_id",
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        comment="Assigned user",
    ),
    Column(
        "status",
        String(20),
        nullable=False,
        server_default=text("'pending'"),
        comment="Status: pending, in_progress, completed, review, approved",
    ),
    Column(
        "is_archived",
        Boolean,
        nullable=False,
        server_default=text("false"),
        comment="Whether task is archived",
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
    Index("ix_tasks_project_id", "project_id"),
    Index("ix_tasks_assignee_id", "assignee_id"),
    Index("ix_tasks_status", "status"),
)
