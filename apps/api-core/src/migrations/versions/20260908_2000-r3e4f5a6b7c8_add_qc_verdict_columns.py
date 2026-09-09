"""add qc verdict columns to images and segmentations

Revision ID: r3e4f5a6b7c8
Revises: q2d3e4f5a6b7
Create Date: 2026-09-08 20:00:00.000000
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "r3e4f5a6b7c8"
down_revision = "q2d3e4f5a6b7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("images", sa.Column("qc_verdict", sa.String(20), nullable=True))
    op.add_column("segmentations", sa.Column("qc_verdict", sa.String(20), nullable=True))
    op.add_column(
        "segmentations",
        sa.Column("qc_original_label_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        "fk_segmentations_qc_original_label_id",
        "segmentations",
        "labels",
        ["qc_original_label_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("fk_segmentations_qc_original_label_id", "segmentations", type_="foreignkey")
    op.drop_column("segmentations", "qc_original_label_id")
    op.drop_column("segmentations", "qc_verdict")
    op.drop_column("images", "qc_verdict")
