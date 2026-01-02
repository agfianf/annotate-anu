"""SQLAlchemy Core model for Image Quality Metrics."""

from sqlalchemy import (
    Column,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Table,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID

from app.helpers.database import metadata

# Enum for quality computation status
QUALITY_STATUS_ENUM = Enum(
    "pending",
    "processing",
    "completed",
    "failed",
    name="quality_status",
    create_type=True,
)

# Enum for quality job status
QUALITY_JOB_STATUS_ENUM = Enum(
    "pending",
    "processing",
    "completed",
    "failed",
    "cancelled",
    name="quality_job_status",
    create_type=True,
)


# ============================================================================
# IMAGE QUALITY METRICS - Computed quality metrics for shared images
# ============================================================================
image_quality_metrics = Table(
    "image_quality_metrics",
    metadata,
    Column(
        "id",
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
        comment="UUID primary key",
    ),
    Column(
        "shared_image_id",
        UUID(as_uuid=True),
        ForeignKey("shared_images.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        comment="Reference to shared image (one-to-one)",
    ),
    # Quality metrics (all normalized 0-1)
    Column(
        "sharpness",
        Float,
        nullable=True,
        comment="Sharpness score (Laplacian variance, 0-1). Higher = sharper",
    ),
    Column(
        "brightness",
        Float,
        nullable=True,
        comment="Brightness score (mean pixel intensity, 0-1). 0.3-0.7 = optimal",
    ),
    Column(
        "contrast",
        Float,
        nullable=True,
        comment="Contrast score (std dev of pixels, 0-1). Higher = more contrast",
    ),
    Column(
        "uniqueness",
        Float,
        nullable=True,
        comment="Uniqueness score (1 - max similarity, 0-1). 1 = unique, 0 = duplicate",
    ),
    # RGB channel averages
    Column(
        "red_avg",
        Float,
        nullable=True,
        comment="Average red channel intensity (0-1)",
    ),
    Column(
        "green_avg",
        Float,
        nullable=True,
        comment="Average green channel intensity (0-1)",
    ),
    Column(
        "blue_avg",
        Float,
        nullable=True,
        comment="Average blue channel intensity (0-1)",
    ),
    # Composite quality score
    Column(
        "overall_quality",
        Float,
        nullable=True,
        comment="Composite quality score (0-1). Weighted average of individual metrics",
    ),
    # Perceptual hash for duplicate detection
    Column(
        "perceptual_hash",
        String(64),
        nullable=True,
        comment="Perceptual hash (pHash) for duplicate detection",
    ),
    # Detected issues
    Column(
        "issues",
        JSONB,
        nullable=True,
        server_default=text("'[]'::jsonb"),
        comment="List of detected issues: blur, low_brightness, high_brightness, low_contrast, duplicate",
    ),
    # Status tracking
    Column(
        "status",
        QUALITY_STATUS_ENUM,
        nullable=False,
        server_default=text("'pending'"),
        comment="Computation status: pending, processing, completed, failed",
    ),
    Column(
        "error_message",
        String(500),
        nullable=True,
        comment="Error message if computation failed",
    ),
    Column(
        "computed_at",
        DateTime(timezone=True),
        nullable=True,
        comment="Timestamp when metrics were computed",
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
    Index("ix_image_quality_metrics_shared_image_id", "shared_image_id", unique=True),
    Index("ix_image_quality_metrics_status", "status"),
    Index("ix_image_quality_metrics_overall_quality", "overall_quality"),
    Index("ix_image_quality_metrics_sharpness", "sharpness"),
    Index("ix_image_quality_metrics_uniqueness", "uniqueness"),
    Index("ix_image_quality_metrics_perceptual_hash", "perceptual_hash"),
)


# ============================================================================
# QUALITY JOBS - Track background quality processing jobs per project
# ============================================================================
quality_jobs = Table(
    "quality_jobs",
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
        "status",
        QUALITY_JOB_STATUS_ENUM,
        nullable=False,
        server_default=text("'pending'"),
        comment="Job status: pending, processing, completed, failed, cancelled",
    ),
    Column(
        "total_images",
        Integer,
        nullable=False,
        server_default=text("0"),
        comment="Total images to process (accurate count at job start)",
    ),
    Column(
        "processed_count",
        Integer,
        nullable=False,
        server_default=text("0"),
        comment="Number of images successfully processed",
    ),
    Column(
        "failed_count",
        Integer,
        nullable=False,
        server_default=text("0"),
        comment="Number of images that failed processing",
    ),
    Column(
        "celery_task_id",
        String(50),
        nullable=True,
        comment="Celery task ID for cancellation",
    ),
    Column(
        "started_at",
        DateTime(timezone=True),
        nullable=True,
        comment="Timestamp when processing started",
    ),
    Column(
        "completed_at",
        DateTime(timezone=True),
        nullable=True,
        comment="Timestamp when processing completed",
    ),
    Column(
        "error_message",
        String(500),
        nullable=True,
        comment="Error message if job failed",
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
    Index("ix_quality_jobs_project_id", "project_id"),
    Index("ix_quality_jobs_status", "status"),
    Index("ix_quality_jobs_created_at", "created_at"),
)
