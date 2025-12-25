"""fix tag uniqueness per category

Revision ID: e1f2a3b4c5d6
Revises: d9e8f7a6b5c4
Create Date: 2025-12-25 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import text
from datetime import datetime, timezone
import uuid

# revision identifiers, used by Alembic.
revision = 'e1f2a3b4c5d6'
down_revision = 'd9e8f7a6b5c4'
branch_labels = None
depends_on = None


def upgrade():
    """
    Fix tag uniqueness constraint to allow same tag names across different categories.

    Steps:
    1. Create "Uncategorized" category for each existing project
    2. Migrate all NULL category_id tags to the "Uncategorized" category
    3. Make category_id NOT NULL
    4. Drop old unique index and create new (project_id, category_id, name) constraint
    """
    # Step 1: Create "Uncategorized" category for each project
    connection = op.get_bind()

    # Get all projects
    projects = connection.execute(text("SELECT id FROM projects")).fetchall()

    # Create "Uncategorized" category for each project
    for project in projects:
        project_id = project[0]
        category_id = str(uuid.uuid4())

        connection.execute(text("""
            INSERT INTO tag_categories (id, project_id, name, display_name, color, sidebar_order, created_at)
            VALUES (:id, :project_id, 'uncategorized', 'Uncategorized', '#9CA3AF', -1, :created_at)
        """), {
            'id': category_id,
            'project_id': project_id,
            'created_at': datetime.now(timezone.utc)
        })

        # Step 2: Update all tags with NULL category_id to point to "Uncategorized"
        connection.execute(text("""
            UPDATE tags
            SET category_id = :category_id
            WHERE project_id = :project_id AND category_id IS NULL
        """), {
            'category_id': category_id,
            'project_id': project_id
        })

    # Step 3: Make category_id NOT NULL
    op.alter_column('tags', 'category_id',
                    existing_type=sa.UUID(),
                    nullable=False)

    # Step 4: Drop old constraint and create new one
    op.drop_index('ix_tags_unique', table_name='tags')
    op.create_index(
        'ix_tags_unique_per_category',
        'tags',
        ['project_id', 'category_id', 'name'],
        unique=True
    )


def downgrade():
    """Reverse the changes"""
    # Reverse the changes
    op.drop_index('ix_tags_unique_per_category', table_name='tags')
    op.create_index('ix_tags_unique', 'tags', ['project_id', 'name'], unique=True)

    op.alter_column('tags', 'category_id',
                    existing_type=sa.UUID(),
                    nullable=True)

    # Delete "Uncategorized" categories
    connection = op.get_bind()
    connection.execute(text("DELETE FROM tag_categories WHERE name = 'uncategorized'"))
