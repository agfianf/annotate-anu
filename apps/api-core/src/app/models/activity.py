"""SQLAlchemy Core model for Project Activity (Change Tracking)."""

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
# PROJECT ACTIVITY (Change Tracking for Tasks/Jobs)
# ============================================================================
project_activity = Table(
    "project_activity",
    metadata,
    Column(
        "id",
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
        comment="UUID primary key",
    ),
    Column(
        "project_id",
        Integer,
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False,
        comment="Parent project",
    ),
    Column(
        "entity_type",
        String(20),
        nullable=False,
        comment="Type: task, job, label, member, project",
    ),
    Column(
        "entity_id",
        UUID(as_uuid=True),
        nullable=False,
        comment="ID of the affected entity",
    ),
    Column(
        "entity_name",
        String(255),
        nullable=True,
        comment="Name of the entity at time of action",
    ),
    Column(
        "action",
        String(30),
        nullable=False,
        comment="Action: created, updated, deleted, status_changed, assigned",
    ),
    Column(
        "actor_id",
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        comment="User who performed the action",
    ),
    Column(
        "actor_name",
        String(255),
        nullable=True,
        comment="Denormalized actor name for display",
    ),
    Column(
        "previous_data",
        JSONB,
        nullable=True,
        comment="State before change (null for create)",
    ),
    Column(
        "new_data",
        JSONB,
        nullable=True,
        comment="State after change (null for delete)",
    ),
    Column(
        "created_at",
        DateTime(timezone=True),
        nullable=False,
        server_default=text("now()"),
    ),
    # Indexes
    Index("ix_project_activity_project_id", "project_id"),
    Index("ix_project_activity_created_at", "created_at"),
    Index("ix_project_activity_entity", "project_id", "entity_type", "entity_id"),
)
