"""Add resolved_metadata column to exports table.

Revision ID: h4b5c6d7e8f9
Revises: g3a4b5c6d7e8
Create Date: 2025-12-27 12:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

# revision identifiers, used by Alembic.
revision: str = "h4b5c6d7e8f9"
down_revision: Union[str, None] = "g3a4b5c6d7e8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add resolved_metadata column to store human-readable metadata for versioning."""
    op.add_column(
        "exports",
        sa.Column(
            "resolved_metadata",
            JSONB,
            nullable=True,
            comment="Resolved metadata: tags/labels with names, user info, project info for versioning",
        ),
    )


def downgrade() -> None:
    """Remove resolved_metadata column."""
    op.drop_column("exports", "resolved_metadata")
