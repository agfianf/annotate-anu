"""add storage connections

Revision ID: q2d3e4f5a6b7
Revises: p1c2d3e4f5a6
Create Date: 2026-09-08 19:00:00.000000
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "q2d3e4f5a6b7"
down_revision = "p1c2d3e4f5a6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "storage_connections",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("project_id", sa.Integer(), nullable=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("endpoint_url", sa.String(512), nullable=True),
        sa.Column("region", sa.String(64), nullable=True),
        sa.Column("bucket", sa.String(255), nullable=False),
        sa.Column("prefix", sa.String(1024), server_default=sa.text("''"), nullable=False),
        sa.Column("access_key", sa.String(255), nullable=False),
        sa.Column("secret_key", sa.Text(), nullable=False),
        sa.Column("use_ssl", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("last_checked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_status", sa.String(512), nullable=True),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("project_id", "name", name="uq_storage_connections_project_name"),
    )
    op.create_index("ix_storage_connections_project_id", "storage_connections", ["project_id"])


def downgrade() -> None:
    op.drop_table("storage_connections")
