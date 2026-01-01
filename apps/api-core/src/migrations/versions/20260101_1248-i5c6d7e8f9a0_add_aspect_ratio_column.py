"""Add aspect_ratio column to shared_images table.

Revision ID: i5c6d7e8f9a0
Revises: h4b5c6d7e8f9
Create Date: 2026-01-01 12:48:00.000000

"""

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "i5c6d7e8f9a0"
down_revision = "h4b5c6d7e8f9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add aspect_ratio column to shared_images table
    op.add_column(
        "shared_images",
        sa.Column(
            "aspect_ratio",
            sa.Float(),
            nullable=True,
            comment="Aspect ratio (width / height) for efficient filtering",
        ),
    )

    # Create index for faster filtering
    op.create_index(
        "ix_shared_images_aspect_ratio",
        "shared_images",
        ["aspect_ratio"],
        unique=False,
    )

    # Backfill aspect_ratio from existing width/height values
    # PostgreSQL ROUND() with precision requires NUMERIC type, not FLOAT
    op.execute(
        """
        UPDATE shared_images
        SET aspect_ratio = ROUND((width::NUMERIC / NULLIF(height, 0))::NUMERIC, 3)
        WHERE width IS NOT NULL AND height IS NOT NULL AND height > 0
        """
    )


def downgrade() -> None:
    op.drop_index("ix_shared_images_aspect_ratio", table_name="shared_images")
    op.drop_column("shared_images", "aspect_ratio")
