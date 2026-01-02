"""Add quality_jobs table for tracking background quality processing.

Revision ID: k7e8f9a0b1c2
Revises: j6d7e8f9a0b1
Create Date: 2026-01-02 11:00:00.000000

"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "k7e8f9a0b1c2"
down_revision = "j6d7e8f9a0b1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create enum type for quality job status (only if it doesn't exist)
    quality_job_status_enum = postgresql.ENUM(
        "pending",
        "processing",
        "completed",
        "failed",
        "cancelled",
        name="quality_job_status",
        create_type=False,  # We handle creation manually below
    )
    quality_job_status_enum.create(op.get_bind(), checkfirst=True)

    # Create quality_jobs table
    op.create_table(
        "quality_jobs",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
            comment="UUID primary key",
        ),
        sa.Column(
            "project_id",
            sa.Integer(),
            nullable=False,
            comment="Reference to project",
        ),
        sa.Column(
            "status",
            quality_job_status_enum,
            server_default=sa.text("'pending'"),
            nullable=False,
            comment="Job status: pending, processing, completed, failed, cancelled",
        ),
        sa.Column(
            "total_images",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("0"),
            comment="Total images to process (accurate count at job start)",
        ),
        sa.Column(
            "processed_count",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("0"),
            comment="Number of images successfully processed",
        ),
        sa.Column(
            "failed_count",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("0"),
            comment="Number of images that failed processing",
        ),
        sa.Column(
            "celery_task_id",
            sa.String(50),
            nullable=True,
            comment="Celery task ID for cancellation",
        ),
        sa.Column(
            "started_at",
            sa.DateTime(timezone=True),
            nullable=True,
            comment="Timestamp when processing started",
        ),
        sa.Column(
            "completed_at",
            sa.DateTime(timezone=True),
            nullable=True,
            comment="Timestamp when processing completed",
        ),
        sa.Column(
            "error_message",
            sa.String(500),
            nullable=True,
            comment="Error message if job failed",
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
        sa.PrimaryKeyConstraint("id", name=op.f("pk_quality_jobs")),
        sa.ForeignKeyConstraint(
            ["project_id"],
            ["projects.id"],
            name=op.f("fk_quality_jobs_project_id_projects"),
            ondelete="CASCADE",
        ),
    )

    # Create indexes
    op.create_index(
        "ix_quality_jobs_project_id",
        "quality_jobs",
        ["project_id"],
        unique=False,
    )
    op.create_index(
        "ix_quality_jobs_status",
        "quality_jobs",
        ["status"],
        unique=False,
    )
    op.create_index(
        "ix_quality_jobs_created_at",
        "quality_jobs",
        ["created_at"],
        unique=False,
    )


def downgrade() -> None:
    # Drop indexes
    op.drop_index("ix_quality_jobs_created_at", table_name="quality_jobs")
    op.drop_index("ix_quality_jobs_status", table_name="quality_jobs")
    op.drop_index("ix_quality_jobs_project_id", table_name="quality_jobs")

    # Drop table
    op.drop_table("quality_jobs")

    # Drop enum type
    quality_job_status_enum = postgresql.ENUM(
        "pending",
        "processing",
        "completed",
        "failed",
        "cancelled",
        name="quality_job_status",
    )
    quality_job_status_enum.drop(op.get_bind(), checkfirst=True)
