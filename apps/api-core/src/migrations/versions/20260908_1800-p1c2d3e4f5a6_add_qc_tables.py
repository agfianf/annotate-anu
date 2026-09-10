"""add qc tables

Revision ID: p1c2d3e4f5a6
Revises: n0b1c2d3e4f5
Create Date: 2026-09-08 18:00:00.000000
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "p1c2d3e4f5a6"
down_revision = "n0b1c2d3e4f5"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "qc_sessions",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("project_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("mode", sa.String(20), server_default=sa.text("'instance'"), nullable=False),
        sa.Column("job_id", sa.Integer(), nullable=True),
        sa.Column("config", postgresql.JSONB(), server_default=sa.text("'{\"replicas\": 1, \"agreement_threshold\": 0.66, \"max_votes\": 3}'::jsonb"), nullable=False),
        sa.Column("source", postgresql.JSONB(), nullable=True),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("mode IN ('instance', 'roi')", name="ck_qc_sessions_mode"),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["job_id"], ["jobs.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_qc_sessions_project_id", "qc_sessions", ["project_id"])

    op.create_table(
        "qc_verdicts",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("session_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("item_key", sa.String(1024), nullable=False),
        sa.Column("image_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("reviewer_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("verdict", sa.String(20), nullable=False),
        sa.Column("tag", sa.String(255), nullable=True),
        sa.Column("corrected_label_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("verdict IN ('good', 'refine', 'bad')", name="ck_qc_verdicts_verdict"),
        sa.ForeignKeyConstraint(["session_id"], ["qc_sessions.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["image_id"], ["images.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["reviewer_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["corrected_label_id"], ["labels.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("session_id", "item_key", "reviewer_id", name="uq_qc_verdicts_reviewer_item"),
    )
    op.create_index("ix_qc_verdicts_session_item", "qc_verdicts", ["session_id", "item_key"])

    op.create_table(
        "qc_consolidated",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("session_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("item_key", sa.String(1024), nullable=False),
        sa.Column("image_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("verdict", sa.String(20), nullable=False),
        sa.Column("tag", sa.String(255), nullable=True),
        sa.Column("n_votes", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("agreement", sa.Float(), server_default=sa.text("0"), nullable=False),
        sa.Column("consensus", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("settled", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("votes", postgresql.JSONB(), server_default=sa.text("'{}'::jsonb"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["session_id"], ["qc_sessions.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["image_id"], ["images.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("session_id", "item_key", name="uq_qc_consolidated_item"),
    )
    op.create_index("ix_qc_consolidated_session_verdict", "qc_consolidated", ["session_id", "verdict"])


def downgrade() -> None:
    op.drop_table("qc_consolidated")
    op.drop_table("qc_verdicts")
    op.drop_table("qc_sessions")
