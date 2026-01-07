"""Set confidence to NULL for manual annotations.

Revision ID: n0b1c2d3e4f5
Revises: m9a0b1c2d3e4
Create Date: 2026-01-07 10:00:00.000000

Manual annotations should not have a confidence score since they are
user-verified. This migration sets confidence = NULL for all existing
annotations where source = 'manual'.
"""

from alembic import op

# revision identifiers, used by Alembic.
revision = "n0b1c2d3e4f5"
down_revision = "m9a0b1c2d3e4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Set confidence to NULL for manual annotations."""
    # Update detections where source = 'manual'
    op.execute("UPDATE detections SET confidence = NULL WHERE source = 'manual'")

    # Update segmentations where source = 'manual'
    op.execute("UPDATE segmentations SET confidence = NULL WHERE source = 'manual'")


def downgrade() -> None:
    """Restore confidence to 1.0 for manual annotations."""
    # Restore detections
    op.execute(
        "UPDATE detections SET confidence = 1.0 WHERE source = 'manual' AND confidence IS NULL"
    )

    # Restore segmentations
    op.execute(
        "UPDATE segmentations SET confidence = 1.0 WHERE source = 'manual' AND confidence IS NULL"
    )
