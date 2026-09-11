"""add performance indexes

Adds indexes for the hot filters and sorts used by the QC queue, the data
management filters, the analytics/export queries and refresh-token cleanup.

Revision ID: s4f5a6b7c8d9
Revises: r3e4f5a6b7c8
Create Date: 2026-09-11 10:00:00.000000
"""

import sqlalchemy as sa
from alembic import op

revision = "s4f5a6b7c8d9"
down_revision = "r3e4f5a6b7c8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index("ix_segmentations_confidence", "segmentations", ["confidence"])
    op.create_index(
        "ix_segmentations_image_id_bbox",
        "segmentations",
        ["image_id"],
        postgresql_where=sa.text("bbox_x_min IS NOT NULL"),
    )
    op.create_index("ix_images_is_annotated", "images", ["is_annotated"])
    op.create_index("ix_shared_images_dimensions", "shared_images", ["width", "height"])
    op.create_index("ix_shared_images_file_size_bytes", "shared_images", ["file_size_bytes"])
    op.create_index("ix_qc_verdicts_session_reviewer", "qc_verdicts", ["session_id", "reviewer_id"])
    op.create_index(
        "ix_image_quality_metrics_status_image",
        "image_quality_metrics",
        ["status", "shared_image_id"],
    )
    op.create_index(
        "ix_project_activity_project_created",
        "project_activity",
        ["project_id", sa.text("created_at DESC")],
    )
    op.create_index("ix_refresh_tokens_expires_at", "refresh_tokens", ["expires_at"])


def downgrade() -> None:
    op.drop_index("ix_refresh_tokens_expires_at", table_name="refresh_tokens")
    op.drop_index("ix_project_activity_project_created", table_name="project_activity")
    op.drop_index("ix_image_quality_metrics_status_image", table_name="image_quality_metrics")
    op.drop_index("ix_qc_verdicts_session_reviewer", table_name="qc_verdicts")
    op.drop_index("ix_shared_images_file_size_bytes", table_name="shared_images")
    op.drop_index("ix_shared_images_dimensions", table_name="shared_images")
    op.drop_index("ix_images_is_annotated", table_name="images")
    op.drop_index("ix_segmentations_image_id_bbox", table_name="segmentations")
    op.drop_index("ix_segmentations_confidence", table_name="segmentations")
