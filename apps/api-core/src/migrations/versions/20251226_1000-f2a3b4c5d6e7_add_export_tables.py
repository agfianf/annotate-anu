"""Add export tables and split column to tasks

Revision ID: f2a3b4c5d6e7
Revises: e1f2a3b4c5d6
Create Date: 2025-12-26 10:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB


# revision identifiers, used by Alembic.
revision: str = "f2a3b4c5d6e7"
down_revision: Union[str, None] = "e1f2a3b4c5d6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Apply migration changes."""
    # Add split column to tasks table
    op.add_column(
        "tasks",
        sa.Column(
            "split",
            sa.String(10),
            nullable=True,
            comment="Dataset split: train, val, test, or null (none)",
        ),
    )

    # Create saved_filters table
    op.create_table(
        "saved_filters",
        sa.Column(
            "id",
            UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "project_id",
            sa.Integer,
            sa.ForeignKey("projects.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column(
            "filter_config",
            JSONB,
            nullable=False,
            comment="Complete filter specification",
        ),
        sa.Column(
            "created_by",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )
    op.create_index("ix_saved_filters_project_id", "saved_filters", ["project_id"])
    op.create_index(
        "ix_saved_filters_unique_name",
        "saved_filters",
        ["project_id", "name"],
        unique=True,
    )

    # Create exports table
    op.create_table(
        "exports",
        sa.Column(
            "id",
            UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "project_id",
            sa.Integer,
            sa.ForeignKey("projects.id", ondelete="CASCADE"),
            nullable=False,
        ),
        # Export configuration
        sa.Column(
            "export_mode",
            sa.String(20),
            nullable=False,
            comment="classification, detection, segmentation",
        ),
        sa.Column(
            "output_format",
            sa.String(50),
            nullable=False,
            comment="coco_json, manifest_csv, image_folder",
        ),
        sa.Column(
            "include_images",
            sa.Boolean,
            nullable=False,
            server_default=sa.text("false"),
        ),
        # Filter snapshot (the recipe)
        sa.Column(
            "filter_snapshot",
            JSONB,
            nullable=False,
            comment="Complete filter state at export time",
        ),
        sa.Column(
            "saved_filter_id",
            UUID(as_uuid=True),
            sa.ForeignKey("saved_filters.id", ondelete="SET NULL"),
            nullable=True,
        ),
        # Classification mapping (for classification mode)
        sa.Column(
            "classification_config",
            JSONB,
            nullable=True,
            comment="Mapping mode + class assignments",
        ),
        # Mode-specific options
        sa.Column(
            "mode_options",
            JSONB,
            nullable=True,
            comment="include_bbox_from_seg, convert_bbox_to_seg, label_filter, etc.",
        ),
        # Version selection
        sa.Column(
            "version_mode",
            sa.String(20),
            nullable=False,
            server_default=sa.text("'latest'"),
            comment="latest, job_version, timestamp",
        ),
        sa.Column(
            "version_value",
            sa.String(50),
            nullable=True,
            comment="Version number or ISO timestamp",
        ),
        # Results
        sa.Column(
            "status",
            sa.String(20),
            nullable=False,
            server_default=sa.text("'pending'"),
            comment="pending, processing, completed, failed",
        ),
        sa.Column(
            "artifact_path",
            sa.String(1024),
            nullable=True,
            comment="Path to export artifact on filesystem",
        ),
        sa.Column("artifact_size_bytes", sa.BigInteger, nullable=True),
        sa.Column("message", sa.Text, nullable=True, comment="User message or description"),
        sa.Column("error_message", sa.Text, nullable=True),
        # Summary counts
        sa.Column(
            "summary",
            JSONB,
            nullable=True,
            comment="image_count, annotation_count, class_counts, split_counts",
        ),
        # Metadata
        sa.Column(
            "created_by",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_exports_project_id", "exports", ["project_id"])
    op.create_index("ix_exports_status", "exports", ["status"])
    op.create_index("ix_exports_created_at", "exports", ["created_at"])


def downgrade() -> None:
    """Revert migration changes."""
    # Drop exports table
    op.drop_index("ix_exports_created_at", table_name="exports")
    op.drop_index("ix_exports_status", table_name="exports")
    op.drop_index("ix_exports_project_id", table_name="exports")
    op.drop_table("exports")

    # Drop saved_filters table
    op.drop_index("ix_saved_filters_unique_name", table_name="saved_filters")
    op.drop_index("ix_saved_filters_project_id", table_name="saved_filters")
    op.drop_table("saved_filters")

    # Drop split column from tasks
    op.drop_column("tasks", "split")
