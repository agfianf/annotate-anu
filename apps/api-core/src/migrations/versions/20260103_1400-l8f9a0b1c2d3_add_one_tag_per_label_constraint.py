"""add one tag per label constraint support

Revision ID: l8f9a0b1c2d3
Revises: k7e8f9a0b1c2
Create Date: 2026-01-03 14:00:00.000000

This migration adds support for the "1 tag per Label per image" constraint:
1. Adds is_uncategorized flag to tag_categories (exempt from constraint)
2. Denormalizes category_id onto shared_image_tags for efficient conflict detection
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy import text

# revision identifiers, used by Alembic.
revision = 'l8f9a0b1c2d3'
down_revision = 'k7e8f9a0b1c2'
branch_labels = None
depends_on = None


def upgrade():
    """
    Add support for 1-tag-per-label-per-image constraint.

    Steps:
    1. Add is_uncategorized flag to tag_categories
    2. Set is_uncategorized = TRUE for existing 'uncategorized' categories
    3. Add category_id to shared_image_tags (nullable initially)
    4. Backfill category_id from tags table
    5. Make category_id NOT NULL
    6. Add foreign key constraint and composite index
    """
    connection = op.get_bind()

    # Step 1: Add is_uncategorized column to tag_categories
    op.add_column(
        'tag_categories',
        sa.Column(
            'is_uncategorized',
            sa.Boolean(),
            nullable=False,
            server_default=sa.text('false'),
            comment='True for uncategorized category (exempt from 1-per-label rule)'
        )
    )

    # Step 2: Set is_uncategorized = TRUE for existing 'uncategorized' categories
    connection.execute(text("""
        UPDATE tag_categories
        SET is_uncategorized = TRUE
        WHERE name = 'uncategorized'
    """))

    # Step 3: Add category_id column to shared_image_tags (nullable initially)
    op.add_column(
        'shared_image_tags',
        sa.Column(
            'category_id',
            UUID(as_uuid=True),
            nullable=True,
            comment='Denormalized category_id for 1-per-label constraint enforcement'
        )
    )

    # Step 4: Backfill category_id from tags table
    connection.execute(text("""
        UPDATE shared_image_tags sit
        SET category_id = t.category_id
        FROM tags t
        WHERE sit.tag_id = t.id
    """))

    # Step 5: Make category_id NOT NULL
    op.alter_column(
        'shared_image_tags',
        'category_id',
        existing_type=UUID(as_uuid=True),
        nullable=False
    )

    # Step 6a: Add foreign key constraint
    op.create_foreign_key(
        'fk_shared_image_tags_category',
        'shared_image_tags',
        'tag_categories',
        ['category_id'],
        ['id'],
        ondelete='CASCADE'
    )

    # Step 6b: Add composite index for efficient conflict detection
    # This index allows fast lookup: "What tags from this category exist on this image?"
    op.create_index(
        'ix_shared_image_tags_category_lookup',
        'shared_image_tags',
        ['project_id', 'shared_image_id', 'category_id']
    )


def downgrade():
    """Reverse the migration."""
    # Remove the composite index
    op.drop_index('ix_shared_image_tags_category_lookup', table_name='shared_image_tags')

    # Remove the foreign key constraint
    op.drop_constraint('fk_shared_image_tags_category', 'shared_image_tags', type_='foreignkey')

    # Remove category_id column from shared_image_tags
    op.drop_column('shared_image_tags', 'category_id')

    # Remove is_uncategorized column from tag_categories
    op.drop_column('tag_categories', 'is_uncategorized')
