"""Add attribute_schemas and image_attributes tables

Revision ID: c8f9a2d1b7e3
Revises: b7e3c8f9a2d1
Create Date: 2025-12-20 14:30:00.000000

"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "c8f9a2d1b7e3"
down_revision = "b7e3c8f9a2d1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Create attribute_schemas and image_attributes tables."""

    # 1. Create attribute_schemas table
    op.create_table(
        "attribute_schemas",
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
            comment="Attribute name (unique per project)",
        ),
        sa.Column(
            "display_name",
            sa.String(255),
            nullable=True,
            comment="Human-readable display name",
        ),
        sa.Column(
            "field_type",
            sa.String(50),
            nullable=False,
            comment="Field type: categorical, numeric, boolean, string",
        ),
        # For categorical fields
        sa.Column(
            "allowed_values",
            postgresql.JSONB,
            nullable=True,
            comment="Allowed values for categorical: ['ripe', 'unripe', 'overripe']",
        ),
        sa.Column(
            "default_value",
            sa.String(255),
            nullable=True,
            comment="Default value for new images",
        ),
        # For numeric fields
        sa.Column(
            "min_value",
            sa.Float(),
            nullable=True,
            comment="Minimum value for numeric fields",
        ),
        sa.Column(
            "max_value",
            sa.Float(),
            nullable=True,
            comment="Maximum value for numeric fields",
        ),
        sa.Column(
            "unit",
            sa.String(50),
            nullable=True,
            comment="Unit for numeric fields (e.g., 'score', 'percentage')",
        ),
        # Display settings
        sa.Column(
            "color",
            sa.String(7),
            nullable=False,
            server_default=sa.text("'#6B7280'"),
            comment="Hex color for UI",
        ),
        sa.Column(
            "icon",
            sa.String(50),
            nullable=True,
            comment="Icon name for UI",
        ),
        sa.Column(
            "sidebar_order",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("0"),
            comment="Order in sidebar",
        ),
        sa.Column(
            "is_filterable",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
            comment="Whether this attribute appears in sidebar filter",
        ),
        sa.Column(
            "is_visible",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
            comment="Whether this attribute is visible in UI",
        ),
        sa.Column(
            "created_by",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
            comment="User who created this schema",
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )

    # Indexes for attribute_schemas
    op.create_index("ix_attribute_schemas_project", "attribute_schemas", ["project_id"])
    op.create_index(
        "ix_attribute_schemas_unique",
        "attribute_schemas",
        ["project_id", "name"],
        unique=True,
    )

    # 2. Create image_attributes table
    op.create_table(
        "image_attributes",
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
            "attribute_schema_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("attribute_schemas.id", ondelete="CASCADE"),
            nullable=False,
            comment="Reference to attribute schema",
        ),
        # Value storage (only one populated based on field_type)
        sa.Column(
            "value_categorical",
            sa.String(255),
            nullable=True,
            comment="Value for categorical fields",
        ),
        sa.Column(
            "value_numeric",
            sa.Float(),
            nullable=True,
            comment="Value for numeric fields",
        ),
        sa.Column(
            "value_boolean",
            sa.Boolean(),
            nullable=True,
            comment="Value for boolean fields",
        ),
        sa.Column(
            "value_string",
            sa.Text(),
            nullable=True,
            comment="Value for string fields",
        ),
        sa.Column(
            "value_json",
            postgresql.JSONB,
            nullable=True,
            comment="Value for complex JSON fields",
        ),
        # Metadata
        sa.Column(
            "confidence",
            sa.Float(),
            nullable=True,
            comment="Confidence score for model predictions",
        ),
        sa.Column(
            "source",
            sa.String(50),
            nullable=False,
            server_default=sa.text("'manual'"),
            comment="Source: manual, model:<id>, import",
        ),
        sa.Column(
            "created_by",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
            comment="User who set this value",
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

    # Indexes for image_attributes
    op.create_index("ix_image_attributes_project", "image_attributes", ["project_id"])
    op.create_index("ix_image_attributes_image", "image_attributes", ["shared_image_id"])
    op.create_index("ix_image_attributes_schema", "image_attributes", ["attribute_schema_id"])
    op.create_index(
        "ix_image_attributes_unique",
        "image_attributes",
        ["project_id", "shared_image_id", "attribute_schema_id"],
        unique=True,
    )
    # Partial indexes for efficient filtering
    op.create_index("ix_image_attributes_categorical", "image_attributes", ["value_categorical"])
    op.create_index("ix_image_attributes_numeric", "image_attributes", ["value_numeric"])


def downgrade() -> None:
    """Drop attribute_schemas and image_attributes tables."""

    # Drop image_attributes first (has FK to attribute_schemas)
    op.drop_index("ix_image_attributes_numeric", table_name="image_attributes")
    op.drop_index("ix_image_attributes_categorical", table_name="image_attributes")
    op.drop_index("ix_image_attributes_unique", table_name="image_attributes")
    op.drop_index("ix_image_attributes_schema", table_name="image_attributes")
    op.drop_index("ix_image_attributes_image", table_name="image_attributes")
    op.drop_index("ix_image_attributes_project", table_name="image_attributes")
    op.drop_table("image_attributes")

    # Drop attribute_schemas
    op.drop_index("ix_attribute_schemas_unique", table_name="attribute_schemas")
    op.drop_index("ix_attribute_schemas_project", table_name="attribute_schemas")
    op.drop_table("attribute_schemas")
