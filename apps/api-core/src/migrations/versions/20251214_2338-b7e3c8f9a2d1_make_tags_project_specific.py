"""Make tags project-specific

Revision ID: b7e3c8f9a2d1
Revises: a1b2c3d4e5f7
Create Date: 2025-12-14 23:38:00.000000

"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "b7e3c8f9a2d1"
down_revision = "a1b2c3d4e5f7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Make tags project-specific by adding project_id to tags and shared_image_tags tables."""

    # 1. Drop existing shared_image_tags table (has FK to tags)
    op.drop_index("ix_shared_image_tags_unique", table_name="shared_image_tags")
    op.drop_index("ix_shared_image_tags_tag", table_name="shared_image_tags")
    op.drop_index("ix_shared_image_tags_image", table_name="shared_image_tags")
    op.drop_table("shared_image_tags")

    # 2. Drop existing tags table
    op.drop_index("ix_tags_name", table_name="tags")
    op.drop_table("tags")

    # 3. Recreate tags table with project_id
    op.create_table(
        "tags",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
            comment="UUID primary key",
        ),
        sa.Column(
            "project_id",
            sa.Integer(),
            sa.ForeignKey("projects.id", ondelete="CASCADE"),
            nullable=False,
            comment="Reference to project",
        ),
        sa.Column(
            "name",
            sa.String(100),
            nullable=False,
            comment="Tag name (unique per project)",
        ),
        sa.Column(
            "description",
            sa.String(500),
            nullable=True,
            comment="Optional description",
        ),
        sa.Column(
            "color",
            sa.String(7),
            nullable=False,
            server_default=sa.text("'#6B7280'"),
            comment="Hex color for UI",
        ),
        sa.Column(
            "created_by",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
            comment="User who created this tag",
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )
    op.create_index("ix_tags_project_id", "tags", ["project_id"])
    op.create_index("ix_tags_name", "tags", ["name"])
    op.create_index("ix_tags_unique", "tags", ["project_id", "name"], unique=True)

    # 4. Recreate shared_image_tags table with project_id
    op.create_table(
        "shared_image_tags",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
            comment="UUID primary key",
        ),
        sa.Column(
            "project_id",
            sa.Integer(),
            sa.ForeignKey("projects.id", ondelete="CASCADE"),
            nullable=False,
            comment="Reference to project",
        ),
        sa.Column(
            "shared_image_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("shared_images.id", ondelete="CASCADE"),
            nullable=False,
            comment="Reference to shared image",
        ),
        sa.Column(
            "tag_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("tags.id", ondelete="CASCADE"),
            nullable=False,
            comment="Reference to tag",
        ),
        sa.Column(
            "created_by",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
            comment="User who added this tag",
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )
    op.create_index("ix_shared_image_tags_project", "shared_image_tags", ["project_id"])
    op.create_index("ix_shared_image_tags_image", "shared_image_tags", ["shared_image_id"])
    op.create_index("ix_shared_image_tags_tag", "shared_image_tags", ["tag_id"])
    op.create_index(
        "ix_shared_image_tags_unique",
        "shared_image_tags",
        ["project_id", "shared_image_id", "tag_id"],
        unique=True,
    )


def downgrade() -> None:
    """Revert tags to global (non-project-specific) schema."""

    # Drop new tables
    op.drop_index("ix_shared_image_tags_unique", table_name="shared_image_tags")
    op.drop_index("ix_shared_image_tags_tag", table_name="shared_image_tags")
    op.drop_index("ix_shared_image_tags_image", table_name="shared_image_tags")
    op.drop_index("ix_shared_image_tags_project", table_name="shared_image_tags")
    op.drop_table("shared_image_tags")

    op.drop_index("ix_tags_unique", table_name="tags")
    op.drop_index("ix_tags_name", table_name="tags")
    op.drop_index("ix_tags_project_id", table_name="tags")
    op.drop_table("tags")

    # Recreate old schema (without project_id)
    op.create_table(
        "tags",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
            comment="UUID primary key",
        ),
        sa.Column(
            "name",
            sa.String(100),
            nullable=False,
            unique=True,
            comment="Tag name (unique globally)",
        ),
        sa.Column(
            "description",
            sa.String(500),
            nullable=True,
            comment="Optional description",
        ),
        sa.Column(
            "color",
            sa.String(7),
            nullable=False,
            server_default=sa.text("'#6B7280'"),
            comment="Hex color for UI",
        ),
        sa.Column(
            "created_by",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
            comment="User who created this tag",
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )
    op.create_index("ix_tags_name", "tags", ["name"])

    op.create_table(
        "shared_image_tags",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
            comment="UUID primary key",
        ),
        sa.Column(
            "shared_image_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("shared_images.id", ondelete="CASCADE"),
            nullable=False,
            comment="Reference to shared image",
        ),
        sa.Column(
            "tag_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("tags.id", ondelete="CASCADE"),
            nullable=False,
            comment="Reference to tag",
        ),
        sa.Column(
            "created_by",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
            comment="User who added this tag",
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )
    op.create_index("ix_shared_image_tags_image", "shared_image_tags", ["shared_image_id"])
    op.create_index("ix_shared_image_tags_tag", "shared_image_tags", ["tag_id"])
    op.create_index(
        "ix_shared_image_tags_unique",
        "shared_image_tags",
        ["shared_image_id", "tag_id"],
        unique=True,
    )
