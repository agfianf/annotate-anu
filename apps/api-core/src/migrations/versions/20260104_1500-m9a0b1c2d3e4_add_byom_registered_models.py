"""Add BYOM registered_models table and projects.allowed_model_ids column.

Revision ID: m9a0b1c2d3e4
Revises: l8f9a0b1c2d3
Create Date: 2026-01-04 15:00:00.000000

This migration adds support for BYOM (Bring Your Own Model):
1. Creates registered_models table for storing external model registrations
2. Adds allowed_model_ids column to projects for per-project model restrictions
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

# revision identifiers, used by Alembic.
revision = "m9a0b1c2d3e4"
down_revision = "l8f9a0b1c2d3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Apply migration changes."""
    # Create registered_models table
    op.create_table(
        "registered_models",
        sa.Column(
            "id",
            sa.String(64),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()::text"),
            comment="Unique model identifier (UUID as string)",
        ),
        sa.Column(
            "name",
            sa.String(255),
            nullable=False,
            unique=True,
            comment="Model display name",
        ),
        sa.Column(
            "endpoint_url",
            sa.String(512),
            nullable=False,
            comment="Model endpoint URL",
        ),
        sa.Column(
            "auth_token",
            sa.String(512),
            nullable=True,
            comment="Bearer token for authentication",
        ),
        sa.Column(
            "capabilities",
            JSONB,
            nullable=True,
            comment="Model capabilities (supports_text_prompt, supports_bbox_prompt, etc.)",
        ),
        sa.Column(
            "endpoint_config",
            JSONB,
            nullable=True,
            comment="Custom endpoint configuration and response mapping",
        ),
        sa.Column(
            "description",
            sa.Text(),
            nullable=True,
            comment="Model description",
        ),
        sa.Column(
            "is_active",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
            comment="Whether model is active",
        ),
        sa.Column(
            "is_healthy",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
            comment="Last health check result",
        ),
        sa.Column(
            "last_health_check",
            sa.DateTime(timezone=True),
            nullable=True,
            comment="Timestamp of last health check",
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

    # Create indexes for registered_models
    op.create_index(
        "ix_registered_models_name",
        "registered_models",
        ["name"],
        unique=True,
    )
    op.create_index(
        "ix_registered_models_is_active",
        "registered_models",
        ["is_active"],
        unique=False,
    )

    # Add allowed_model_ids column to projects table
    op.add_column(
        "projects",
        sa.Column(
            "allowed_model_ids",
            sa.ARRAY(sa.String(64)),
            nullable=True,
            server_default=sa.text("NULL::character varying[]"),
            comment="Allowed BYOM model IDs (null = all models)",
        ),
    )


def downgrade() -> None:
    """Revert migration changes."""
    # Drop allowed_model_ids column from projects
    op.drop_column("projects", "allowed_model_ids")

    # Drop indexes from registered_models
    op.drop_index("ix_registered_models_is_active", table_name="registered_models")
    op.drop_index("ix_registered_models_name", table_name="registered_models")

    # Drop registered_models table
    op.drop_table("registered_models")
