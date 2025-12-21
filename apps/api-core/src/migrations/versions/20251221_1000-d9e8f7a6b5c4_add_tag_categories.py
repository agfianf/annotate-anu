"""Add tag_categories table and category_id to tags

Revision ID: d9e8f7a6b5c4
Revises: c8f9a2d1b7e3
Create Date: 2025-12-21 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'd9e8f7a6b5c4'
down_revision: Union[str, None] = 'c8f9a2d1b7e3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create tag_categories table
    op.create_table(
        'tag_categories',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False, server_default=sa.text('gen_random_uuid()')),
        sa.Column('project_id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(100), nullable=False),
        sa.Column('display_name', sa.String(255), nullable=True),
        sa.Column('color', sa.String(7), nullable=False, server_default='#6B7280'),
        sa.Column('sidebar_order', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('created_by', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.ForeignKeyConstraint(['project_id'], ['projects.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['created_by'], ['users.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id')
    )

    # Create unique constraint on project_id + name
    op.create_index(
        'ix_tag_categories_project_name',
        'tag_categories',
        ['project_id', 'name'],
        unique=True
    )

    # Create index on project_id for faster queries
    op.create_index(
        'ix_tag_categories_project_id',
        'tag_categories',
        ['project_id']
    )

    # Add category_id column to tags table
    op.add_column(
        'tags',
        sa.Column('category_id', postgresql.UUID(as_uuid=True), nullable=True)
    )

    # Add foreign key constraint
    op.create_foreign_key(
        'fk_tags_category_id',
        'tags',
        'tag_categories',
        ['category_id'],
        ['id'],
        ondelete='SET NULL'
    )

    # Create index on category_id for faster queries
    op.create_index(
        'ix_tags_category_id',
        'tags',
        ['category_id']
    )


def downgrade() -> None:
    # Remove index on category_id
    op.drop_index('ix_tags_category_id', table_name='tags')

    # Remove foreign key constraint
    op.drop_constraint('fk_tags_category_id', 'tags', type_='foreignkey')

    # Remove category_id column from tags
    op.drop_column('tags', 'category_id')

    # Drop indexes on tag_categories
    op.drop_index('ix_tag_categories_project_id', table_name='tag_categories')
    op.drop_index('ix_tag_categories_project_name', table_name='tag_categories')

    # Drop tag_categories table
    op.drop_table('tag_categories')
