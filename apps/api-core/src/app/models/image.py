"""SQLAlchemy Core model for Images."""

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
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID

from app.helpers.database import metadata

# ============================================================================
# IMAGES
# ============================================================================
images = Table(
    "images",
    metadata,
    Column(
        "id",
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
        comment="UUID primary key",
    ),
    Column(
        "job_id",
        Integer,
        ForeignKey("jobs.id", ondelete="CASCADE"),
        nullable=False,
        comment="Parent job",
    ),
    Column(
        "filename",
        String(512),
        nullable=False,
        comment="Original filename",
    ),
    Column(
        "s3_key",
        String(1024),
        nullable=False,
        comment="Full path in MinIO/S3",
    ),
    Column(
        "s3_bucket",
        String(255),
        nullable=False,
        server_default=text("'annotate-anu'"),
        comment="S3 bucket name",
    ),
    Column(
        "width",
        Integer,
        nullable=False,
        comment="Image width in pixels",
    ),
    Column(
        "height",
        Integer,
        nullable=False,
        comment="Image height in pixels",
    ),
    Column(
        "thumbnail_s3_key",
        String(1024),
        nullable=True,
        comment="Thumbnail path in S3",
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
        comment="SHA256 checksum",
    ),
    Column(
        "metadata",
        JSONB,
        nullable=True,
        server_default=text("'{}'::jsonb"),
        comment="Custom metadata (EXIF, camera info, etc.)",
    ),
    Column(
        "sequence_number",
        Integer,
        nullable=False,
        comment="Order within job",
    ),
    Column(
        "is_annotated",
        Boolean,
        nullable=False,
        server_default=text("false"),
        comment="Has any annotations",
    ),
    Column(
        "shared_image_id",
        UUID(as_uuid=True),
        ForeignKey("shared_images.id", ondelete="SET NULL"),
        nullable=True,
        comment="Reference to shared image registry",
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
    Index("ix_images_job_id", "job_id"),
    Index("ix_images_s3_key", "s3_key"),
    Index("ix_images_annotated", "job_id", "is_annotated"),
    Index("ix_images_unique", "job_id", "sequence_number", unique=True),
    Index("ix_images_shared_image_id", "shared_image_id"),
)
