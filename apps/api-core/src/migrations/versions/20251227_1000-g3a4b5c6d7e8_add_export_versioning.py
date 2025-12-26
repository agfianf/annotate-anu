"""Add name and version_number columns to exports table

Revision ID: g3a4b5c6d7e8
Revises: f2a3b4c5d6e7
Create Date: 2025-12-27 10:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "g3a4b5c6d7e8"
down_revision: Union[str, None] = "f2a3b4c5d6e7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add name and version_number columns to exports table."""
    # Add name column (auto-generated or user-provided)
    op.add_column(
        "exports",
        sa.Column(
            "name",
            sa.String(255),
            nullable=True,
            comment="Export name (auto-generated or user-provided)",
        ),
    )

    # Add version_number column (auto-increment per project+mode)
    op.add_column(
        "exports",
        sa.Column(
            "version_number",
            sa.Integer,
            nullable=True,
            comment="Auto-incrementing version number per project+mode",
        ),
    )

    # Add index for version number lookup
    op.create_index(
        "ix_exports_project_mode_version",
        "exports",
        ["project_id", "export_mode", "version_number"],
    )


def downgrade() -> None:
    """Remove name and version_number columns from exports table."""
    op.drop_index("ix_exports_project_mode_version", table_name="exports")
    op.drop_column("exports", "version_number")
    op.drop_column("exports", "name")
