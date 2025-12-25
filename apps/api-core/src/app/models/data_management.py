"""SQLAlchemy Core models for Data Management (Shared Images, Tags, Project Images)."""

from sqlalchemy import (
    BigInteger,
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
# SHARED IMAGES - Central image registry
# ============================================================================
shared_images = Table(
    "shared_images",
    metadata,
    Column(
        "id",
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
        comment="UUID primary key",
    ),
    Column(
        "file_path",
        String(1024),
        nullable=False,
        unique=True,
        comment="Relative path from SHARE_ROOT",
    ),
    Column(
        "filename",
        String(512),
        nullable=False,
        comment="Original filename",
    ),
    Column(
        "width",
        Integer,
        nullable=True,
        comment="Image width in pixels",
    ),
    Column(
        "height",
        Integer,
        nullable=True,
        comment="Image height in pixels",
    ),
    Column(
        "file_size_bytes",
        BigInteger,
        nullable=True,
        comment="File size in bytes",
    ),
    Column(
        "mime_type",
        String(100),
        nullable=True,
        comment="MIME type",
    ),
    Column(
        "checksum_sha256",
        String(64),
        nullable=True,
        comment="SHA256 checksum for deduplication",
    ),
    Column(
        "metadata",
        JSONB,
        nullable=True,
        server_default=text("'{}'::jsonb"),
        comment="Custom metadata (EXIF, camera info, etc.)",
    ),
    Column(
        "registered_by",
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        comment="User who registered this image",
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
    Index("ix_shared_images_file_path", "file_path"),
    Index("ix_shared_images_checksum", "checksum_sha256"),
    Index("ix_shared_images_filename", "filename"),
)


# ============================================================================
# TAG CATEGORIES - Project-scoped categories for organizing tags
# ============================================================================
tag_categories = Table(
    "tag_categories",
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
        comment="Reference to project",
    ),
    Column(
        "name",
        String(100),
        nullable=False,
        comment="Category name (unique per project)",
    ),
    Column(
        "display_name",
        String(255),
        nullable=True,
        comment="Display name for UI",
    ),
    Column(
        "color",
        String(7),
        nullable=False,
        server_default=text("'#6B7280'"),
        comment="Hex color for UI (inherited by tags)",
    ),
    Column(
        "sidebar_order",
        Integer,
        nullable=False,
        server_default=text("0"),
        comment="Order in sidebar display",
    ),
    Column(
        "created_by",
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        comment="User who created this category",
    ),
    Column(
        "created_at",
        DateTime(timezone=True),
        nullable=False,
        server_default=text("now()"),
    ),
    # Indexes
    Index("ix_tag_categories_project_id", "project_id"),
    Index("ix_tag_categories_project_name", "project_id", "name", unique=True),
)


# ============================================================================
# TAGS - Project-scoped user-defined tags
# ============================================================================
tags = Table(
    "tags",
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
        comment="Reference to project",
    ),
    Column(
        "category_id",
        UUID(as_uuid=True),
        ForeignKey("tag_categories.id", ondelete="CASCADE"),
        nullable=False,
        comment="Reference to tag category (required - defaults to 'Uncategorized')",
    ),
    Column(
        "name",
        String(100),
        nullable=False,
        comment="Tag name (unique per project)",
    ),
    Column(
        "description",
        String(500),
        nullable=True,
        comment="Optional description",
    ),
    Column(
        "color",
        String(7),
        nullable=False,
        server_default=text("'#6B7280'"),
        comment="Hex color for UI (overrides category color if set)",
    ),
    Column(
        "created_by",
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        comment="User who created this tag",
    ),
    Column(
        "created_at",
        DateTime(timezone=True),
        nullable=False,
        server_default=text("now()"),
    ),
    # Indexes
    Index("ix_tags_project_id", "project_id"),
    Index("ix_tags_category_id", "category_id"),
    Index("ix_tags_name", "name"),
    # Unique per category (including "Uncategorized" category)
    Index("ix_tags_unique_per_category", "project_id", "category_id", "name", unique=True),
)


# ============================================================================
# SHARED IMAGE TAGS - Project-scoped junction table for many-to-many
# ============================================================================
shared_image_tags = Table(
    "shared_image_tags",
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
        comment="Reference to project",
    ),
    Column(
        "shared_image_id",
        UUID(as_uuid=True),
        ForeignKey("shared_images.id", ondelete="CASCADE"),
        nullable=False,
        comment="Reference to shared image",
    ),
    Column(
        "tag_id",
        UUID(as_uuid=True),
        ForeignKey("tags.id", ondelete="CASCADE"),
        nullable=False,
        comment="Reference to tag",
    ),
    Column(
        "created_by",
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        comment="User who added this tag",
    ),
    Column(
        "created_at",
        DateTime(timezone=True),
        nullable=False,
        server_default=text("now()"),
    ),
    # Indexes
    Index("ix_shared_image_tags_project", "project_id"),
    Index("ix_shared_image_tags_image", "shared_image_id"),
    Index("ix_shared_image_tags_tag", "tag_id"),
    Index("ix_shared_image_tags_unique", "project_id", "shared_image_id", "tag_id", unique=True),
)


# ============================================================================
# PROJECT IMAGES - Project image pool junction
# ============================================================================
project_images = Table(
    "project_images",
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
        comment="Reference to project",
    ),
    Column(
        "shared_image_id",
        UUID(as_uuid=True),
        ForeignKey("shared_images.id", ondelete="CASCADE"),
        nullable=False,
        comment="Reference to shared image",
    ),
    Column(
        "added_by",
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        comment="User who added this image to project",
    ),
    Column(
        "created_at",
        DateTime(timezone=True),
        nullable=False,
        server_default=text("now()"),
    ),
    # Indexes
    Index("ix_project_images_project", "project_id"),
    Index("ix_project_images_image", "shared_image_id"),
    Index("ix_project_images_unique", "project_id", "shared_image_id", unique=True),
)
