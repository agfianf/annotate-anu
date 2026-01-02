"""Add image_quality_metrics table for storing computed quality metrics.

Revision ID: j6d7e8f9a0b1
Revises: i5c6d7e8f9a0
Create Date: 2026-01-02 10:00:00.000000

"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "j6d7e8f9a0b1"
down_revision = "i5c6d7e8f9a0"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create enum type for quality status (only if it doesn't exist)
    quality_status_enum = postgresql.ENUM(
        "pending",
        "processing",
        "completed",
        "failed",
        name="quality_status",
        create_type=False,  # We handle creation manually below
    )
    quality_status_enum.create(op.get_bind(), checkfirst=True)

    # Create image_quality_metrics table
    op.create_table(
        "image_quality_metrics",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
            comment="UUID primary key",
        ),
        sa.Column(
            "shared_image_id",
            postgresql.UUID(as_uuid=True),
            nullable=False,
            comment="Reference to shared image (one-to-one)",
        ),
        # Quality metrics (all normalized 0-1)
        sa.Column(
            "sharpness",
            sa.Float(),
            nullable=True,
            comment="Sharpness score (Laplacian variance, 0-1). Higher = sharper",
        ),
        sa.Column(
            "brightness",
            sa.Float(),
            nullable=True,
            comment="Brightness score (mean pixel intensity, 0-1). 0.3-0.7 = optimal",
        ),
        sa.Column(
            "contrast",
            sa.Float(),
            nullable=True,
            comment="Contrast score (std dev of pixels, 0-1). Higher = more contrast",
        ),
        sa.Column(
            "uniqueness",
            sa.Float(),
            nullable=True,
            comment="Uniqueness score (1 - max similarity, 0-1). 1 = unique, 0 = duplicate",
        ),
        # RGB channel averages
        sa.Column(
            "red_avg",
            sa.Float(),
            nullable=True,
            comment="Average red channel intensity (0-1)",
        ),
        sa.Column(
            "green_avg",
            sa.Float(),
            nullable=True,
            comment="Average green channel intensity (0-1)",
        ),
        sa.Column(
            "blue_avg",
            sa.Float(),
            nullable=True,
            comment="Average blue channel intensity (0-1)",
        ),
        # Composite quality score
        sa.Column(
            "overall_quality",
            sa.Float(),
            nullable=True,
            comment="Composite quality score (0-1). Weighted average of individual metrics",
        ),
        # Perceptual hash for duplicate detection
        sa.Column(
            "perceptual_hash",
            sa.String(64),
            nullable=True,
            comment="Perceptual hash (pHash) for duplicate detection",
        ),
        # Detected issues
        sa.Column(
            "issues",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'[]'::jsonb"),
            nullable=True,
            comment="List of detected issues: blur, low_brightness, high_brightness, low_contrast, duplicate",
        ),
        # Status tracking
        sa.Column(
            "status",
            quality_status_enum,
            server_default=sa.text("'pending'"),
            nullable=False,
            comment="Computation status: pending, processing, completed, failed",
        ),
        sa.Column(
            "error_message",
            sa.String(500),
            nullable=True,
            comment="Error message if computation failed",
        ),
        sa.Column(
            "computed_at",
            sa.DateTime(timezone=True),
            nullable=True,
            comment="Timestamp when metrics were computed",
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_image_quality_metrics")),
        sa.ForeignKeyConstraint(
            ["shared_image_id"],
            ["shared_images.id"],
            name=op.f("fk_image_quality_metrics_shared_image_id_shared_images"),
            ondelete="CASCADE",
        ),
    )

    # Create indexes
    op.create_index(
        "ix_image_quality_metrics_shared_image_id",
        "image_quality_metrics",
        ["shared_image_id"],
        unique=True,
    )
    op.create_index(
        "ix_image_quality_metrics_status",
        "image_quality_metrics",
        ["status"],
        unique=False,
    )
    op.create_index(
        "ix_image_quality_metrics_overall_quality",
        "image_quality_metrics",
        ["overall_quality"],
        unique=False,
    )
    op.create_index(
        "ix_image_quality_metrics_sharpness",
        "image_quality_metrics",
        ["sharpness"],
        unique=False,
    )
    op.create_index(
        "ix_image_quality_metrics_uniqueness",
        "image_quality_metrics",
        ["uniqueness"],
        unique=False,
    )
    op.create_index(
        "ix_image_quality_metrics_perceptual_hash",
        "image_quality_metrics",
        ["perceptual_hash"],
        unique=False,
    )


def downgrade() -> None:
    # Drop indexes
    op.drop_index("ix_image_quality_metrics_perceptual_hash", table_name="image_quality_metrics")
    op.drop_index("ix_image_quality_metrics_uniqueness", table_name="image_quality_metrics")
    op.drop_index("ix_image_quality_metrics_sharpness", table_name="image_quality_metrics")
    op.drop_index("ix_image_quality_metrics_overall_quality", table_name="image_quality_metrics")
    op.drop_index("ix_image_quality_metrics_status", table_name="image_quality_metrics")
    op.drop_index("ix_image_quality_metrics_shared_image_id", table_name="image_quality_metrics")

    # Drop table
    op.drop_table("image_quality_metrics")

    # Drop enum type
    quality_status_enum = postgresql.ENUM(
        "pending",
        "processing",
        "completed",
        "failed",
        name="quality_status",
    )
    quality_status_enum.drop(op.get_bind(), checkfirst=True)
