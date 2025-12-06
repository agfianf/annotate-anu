"""SQLAlchemy Core models for Projects, ProjectMembers, and Labels."""

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Index,
    String,
    Table,
    Text,
    text,
)
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, UUID

from app.helpers.database import metadata

# ============================================================================
# PROJECTS
# ============================================================================
projects = Table(
    "projects",
    metadata,
    Column(
        "id",
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
        comment="UUID primary key",
    ),
    Column(
        "name",
        String(255),
        nullable=False,
        comment="Project display name",
    ),
    Column(
        "slug",
        String(255),
        unique=True,
        nullable=False,
        comment="URL-safe project identifier",
    ),
    Column(
        "description",
        Text,
        nullable=True,
        comment="Project description",
    ),
    Column(
        "readme",
        Text,
        nullable=True,
        comment="Markdown readme content",
    ),
    Column(
        "annotation_types",
        ARRAY(String(50)),
        nullable=False,
        server_default=text("'{classification}'"),
        comment="Enabled annotation types",
    ),
    Column(
        "owner_id",
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        comment="Project owner",
    ),
    Column(
        "storage_prefix",
        String(512),
        nullable=True,
        comment="S3/MinIO prefix for this project",
    ),
    Column(
        "is_archived",
        Boolean,
        nullable=False,
        server_default=text("false"),
        comment="Whether project is archived",
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
    Index("ix_projects_slug", "slug"),
    Index("ix_projects_owner_id", "owner_id"),
)

# ============================================================================
# PROJECT MEMBERS (RBAC)
# ============================================================================
project_members = Table(
    "project_members",
    metadata,
    Column(
        "id",
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    ),
    Column(
        "project_id",
        UUID(as_uuid=True),
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False,
    ),
    Column(
        "user_id",
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    ),
    Column(
        "role",
        String(20),
        nullable=False,
        server_default=text("'annotator'"),
        comment="Role: owner, maintainer, annotator, viewer",
    ),
    Column(
        "allowed_task_ids",
        ARRAY(UUID(as_uuid=True)),
        nullable=True,
        comment="Scoped access to specific tasks (null = all)",
    ),
    Column(
        "allowed_job_ids",
        ARRAY(UUID(as_uuid=True)),
        nullable=True,
        comment="Scoped access to specific jobs (null = all)",
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
    Index("ix_project_members_project_id", "project_id"),
    Index("ix_project_members_user_id", "user_id"),
    Index("ix_project_members_unique", "project_id", "user_id", unique=True),
)

# ============================================================================
# LABELS (Per-Project)
# ============================================================================
labels = Table(
    "labels",
    metadata,
    Column(
        "id",
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    ),
    Column(
        "project_id",
        UUID(as_uuid=True),
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False,
    ),
    Column(
        "name",
        String(255),
        nullable=False,
        comment="Label name",
    ),
    Column(
        "color",
        String(7),
        nullable=False,
        server_default=text("'#FF0000'"),
        comment="Hex color code",
    ),
    Column(
        "parent_id",
        UUID(as_uuid=True),
        ForeignKey("labels.id", ondelete="SET NULL"),
        nullable=True,
        comment="Parent label for hierarchy",
    ),
    Column(
        "hotkey",
        String(1),
        nullable=True,
        comment="Keyboard shortcut (1-9, a-z)",
    ),
    Column(
        "applicable_types",
        ARRAY(String(50)),
        nullable=False,
        server_default=text("'{classification,detection,segmentation}'"),
        comment="Annotation types this label applies to",
    ),
    Column(
        "attributes_schema",
        JSONB,
        nullable=True,
        server_default=text("'[]'::jsonb"),
        comment="Schema for per-annotation attributes",
    ),
    Column(
        "created_at",
        DateTime(timezone=True),
        nullable=False,
        server_default=text("now()"),
    ),
    # Indexes
    Index("ix_labels_project_id", "project_id"),
    Index("ix_labels_unique", "project_id", "name", unique=True),
)
