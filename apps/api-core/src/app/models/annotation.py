"""SQLAlchemy Core models for Annotations."""

from sqlalchemy import (
    Column,
    DateTime,
    Float,
    ForeignKey,
    Index,
    String,
    Table,
    Text,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID

from app.helpers.database import metadata

# ============================================================================
# IMAGE TAGS (Classification)
# ============================================================================
image_tags = Table(
    "image_tags",
    metadata,
    Column(
        "id",
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    ),
    Column(
        "image_id",
        UUID(as_uuid=True),
        ForeignKey("images.id", ondelete="CASCADE"),
        nullable=False,
    ),
    Column(
        "label_id",
        UUID(as_uuid=True),
        ForeignKey("labels.id", ondelete="CASCADE"),
        nullable=False,
    ),
    Column(
        "confidence",
        Float,
        nullable=True,
        comment="Confidence score (for model predictions)",
    ),
    Column(
        "source",
        String(50),
        nullable=False,
        server_default=text("'manual'"),
        comment="Source: manual, model:<id>, import",
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
    Index("ix_image_tags_image_id", "image_id"),
    Index("ix_image_tags_label_id", "label_id"),
    Index("ix_image_tags_unique", "image_id", "label_id", unique=True),
)

# ============================================================================
# DETECTIONS (Bounding Boxes)
# ============================================================================
detections = Table(
    "detections",
    metadata,
    Column(
        "id",
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    ),
    Column(
        "image_id",
        UUID(as_uuid=True),
        ForeignKey("images.id", ondelete="CASCADE"),
        nullable=False,
    ),
    Column(
        "label_id",
        UUID(as_uuid=True),
        ForeignKey("labels.id", ondelete="CASCADE"),
        nullable=False,
    ),
    # Bounding box (normalized 0-1 coordinates)
    Column("x_min", Float, nullable=False, comment="Left edge (0-1)"),
    Column("y_min", Float, nullable=False, comment="Top edge (0-1)"),
    Column("x_max", Float, nullable=False, comment="Right edge (0-1)"),
    Column("y_max", Float, nullable=False, comment="Bottom edge (0-1)"),
    Column(
        "rotation",
        Float,
        nullable=True,
        server_default=text("0"),
        comment="Rotation in degrees",
    ),
    Column(
        "confidence",
        Float,
        nullable=True,
        comment="Confidence score",
    ),
    Column(
        "attributes",
        JSONB,
        nullable=True,
        server_default=text("'{}'::jsonb"),
        comment="Custom attributes (occluded, truncated, etc.)",
    ),
    Column(
        "source",
        String(50),
        nullable=False,
        server_default=text("'manual'"),
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
    Column(
        "updated_at",
        DateTime(timezone=True),
        nullable=False,
        server_default=text("now()"),
    ),
    # Indexes
    Index("ix_detections_image_id", "image_id"),
    Index("ix_detections_label_id", "label_id"),
)

# ============================================================================
# SEGMENTATIONS (Polygons/Masks)
# ============================================================================
segmentations = Table(
    "segmentations",
    metadata,
    Column(
        "id",
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    ),
    Column(
        "image_id",
        UUID(as_uuid=True),
        ForeignKey("images.id", ondelete="CASCADE"),
        nullable=False,
    ),
    Column(
        "label_id",
        UUID(as_uuid=True),
        ForeignKey("labels.id", ondelete="CASCADE"),
        nullable=False,
    ),
    Column(
        "format",
        String(20),
        nullable=False,
        server_default=text("'polygon'"),
        comment="Format: polygon, rle, bitmap",
    ),
    Column(
        "polygon",
        JSONB,
        nullable=True,
        comment="Array of [x, y] normalized coordinates",
    ),
    Column(
        "rle",
        JSONB,
        nullable=True,
        comment="Run-length encoding for masks",
    ),
    Column(
        "mask_s3_key",
        String(1024),
        nullable=True,
        comment="External mask reference",
    ),
    # Cached bounding box
    Column("bbox_x_min", Float, nullable=True),
    Column("bbox_y_min", Float, nullable=True),
    Column("bbox_x_max", Float, nullable=True),
    Column("bbox_y_max", Float, nullable=True),
    Column("area", Float, nullable=True, comment="Cached area"),
    Column("confidence", Float, nullable=True),
    Column(
        "attributes",
        JSONB,
        nullable=True,
        server_default=text("'{}'::jsonb"),
    ),
    Column(
        "source",
        String(50),
        nullable=False,
        server_default=text("'manual'"),
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
    Column(
        "updated_at",
        DateTime(timezone=True),
        nullable=False,
        server_default=text("now()"),
    ),
    # Indexes
    Index("ix_segmentations_image_id", "image_id"),
    Index("ix_segmentations_label_id", "label_id"),
)

# ============================================================================
# KEYPOINTS
# ============================================================================
keypoints = Table(
    "keypoints",
    metadata,
    Column(
        "id",
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    ),
    Column(
        "image_id",
        UUID(as_uuid=True),
        ForeignKey("images.id", ondelete="CASCADE"),
        nullable=False,
    ),
    Column(
        "label_id",
        UUID(as_uuid=True),
        ForeignKey("labels.id", ondelete="CASCADE"),
        nullable=False,
    ),
    Column(
        "skeleton_id",
        UUID(as_uuid=True),
        nullable=True,
        comment="Reference to skeleton definition",
    ),
    Column(
        "points",
        JSONB,
        nullable=False,
        comment="Array of {name, x, y, visibility}",
    ),
    # Optional bounding box
    Column("bbox_x_min", Float, nullable=True),
    Column("bbox_y_min", Float, nullable=True),
    Column("bbox_x_max", Float, nullable=True),
    Column("bbox_y_max", Float, nullable=True),
    Column("confidence", Float, nullable=True),
    Column(
        "attributes",
        JSONB,
        nullable=True,
        server_default=text("'{}'::jsonb"),
    ),
    Column(
        "source",
        String(50),
        nullable=False,
        server_default=text("'manual'"),
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
    Column(
        "updated_at",
        DateTime(timezone=True),
        nullable=False,
        server_default=text("now()"),
    ),
    # Indexes
    Index("ix_keypoints_image_id", "image_id"),
)

# ============================================================================
# POSE SKELETONS (Configuration per project)
# ============================================================================
pose_skeletons = Table(
    "pose_skeletons",
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
        comment="Skeleton name (e.g., COCO Person, Hand)",
    ),
    Column(
        "keypoint_names",
        JSONB,
        nullable=False,
        comment="Array of keypoint names",
    ),
    Column(
        "skeleton",
        JSONB,
        nullable=False,
        comment="Array of [from, to] index pairs for connections",
    ),
    Column(
        "keypoint_colors",
        JSONB,
        nullable=True,
        comment="Array of colors for each keypoint",
    ),
    Column(
        "limb_colors",
        JSONB,
        nullable=True,
        comment="Array of colors for each limb",
    ),
    Column(
        "created_at",
        DateTime(timezone=True),
        nullable=False,
        server_default=text("now()"),
    ),
    # Indexes
    Index("ix_pose_skeletons_project_id", "project_id"),
    Index("ix_pose_skeletons_unique", "project_id", "name", unique=True),
)
