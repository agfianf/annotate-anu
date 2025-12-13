"""Add data management tables (shared_images, tags, shared_image_tags, project_images)

Revision ID: a1b2c3d4e5f7
Revises: 0fb19a3bf6d4
Create Date: 2025-12-13 15:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB


# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f7'
down_revision: Union[str, None] = '0fb19a3bf6d4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Apply migration changes."""

    # 1. Create shared_images table
    op.create_table(
        'shared_images',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()"), comment="UUID primary key"),
        sa.Column('file_path', sa.String(1024), nullable=False, unique=True, comment="Relative path from SHARE_ROOT"),
        sa.Column('filename', sa.String(512), nullable=False, comment="Original filename"),
        sa.Column('width', sa.Integer(), nullable=True, comment="Image width in pixels"),
        sa.Column('height', sa.Integer(), nullable=True, comment="Image height in pixels"),
        sa.Column('file_size_bytes', sa.BigInteger(), nullable=True, comment="File size in bytes"),
        sa.Column('mime_type', sa.String(100), nullable=True, comment="MIME type"),
        sa.Column('checksum_sha256', sa.String(64), nullable=True, comment="SHA256 checksum for deduplication"),
        sa.Column('metadata', JSONB, nullable=True, server_default=sa.text("'{}'::jsonb"), comment="Custom metadata (EXIF, camera info, etc.)"),
        sa.Column('registered_by', UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True, comment="User who registered this image"),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index('ix_shared_images_file_path', 'shared_images', ['file_path'])
    op.create_index('ix_shared_images_checksum', 'shared_images', ['checksum_sha256'])
    op.create_index('ix_shared_images_filename', 'shared_images', ['filename'])

    # 2. Create tags table
    op.create_table(
        'tags',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()"), comment="UUID primary key"),
        sa.Column('name', sa.String(100), nullable=False, unique=True, comment="Tag name (unique globally)"),
        sa.Column('description', sa.String(500), nullable=True, comment="Optional description"),
        sa.Column('color', sa.String(7), nullable=False, server_default=sa.text("'#6B7280'"), comment="Hex color for UI"),
        sa.Column('created_by', UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True, comment="User who created this tag"),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index('ix_tags_name', 'tags', ['name'])

    # 3. Create shared_image_tags junction table
    op.create_table(
        'shared_image_tags',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()"), comment="UUID primary key"),
        sa.Column('shared_image_id', UUID(as_uuid=True), sa.ForeignKey('shared_images.id', ondelete='CASCADE'), nullable=False, comment="Reference to shared image"),
        sa.Column('tag_id', UUID(as_uuid=True), sa.ForeignKey('tags.id', ondelete='CASCADE'), nullable=False, comment="Reference to tag"),
        sa.Column('created_by', UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True, comment="User who added this tag"),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index('ix_shared_image_tags_image', 'shared_image_tags', ['shared_image_id'])
    op.create_index('ix_shared_image_tags_tag', 'shared_image_tags', ['tag_id'])
    op.create_index('ix_shared_image_tags_unique', 'shared_image_tags', ['shared_image_id', 'tag_id'], unique=True)

    # 4. Create project_images junction table
    op.create_table(
        'project_images',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()"), comment="UUID primary key"),
        sa.Column('project_id', sa.Integer(), sa.ForeignKey('projects.id', ondelete='CASCADE'), nullable=False, comment="Reference to project"),
        sa.Column('shared_image_id', UUID(as_uuid=True), sa.ForeignKey('shared_images.id', ondelete='CASCADE'), nullable=False, comment="Reference to shared image"),
        sa.Column('added_by', UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True, comment="User who added this image to project"),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index('ix_project_images_project', 'project_images', ['project_id'])
    op.create_index('ix_project_images_image', 'project_images', ['shared_image_id'])
    op.create_index('ix_project_images_unique', 'project_images', ['project_id', 'shared_image_id'], unique=True)

    # 5. Add shared_image_id column to images table (nullable for backward compatibility)
    op.add_column(
        'images',
        sa.Column(
            'shared_image_id',
            UUID(as_uuid=True),
            sa.ForeignKey('shared_images.id', ondelete='SET NULL'),
            nullable=True,
            comment="Reference to shared image registry"
        )
    )
    op.create_index('ix_images_shared_image_id', 'images', ['shared_image_id'])


def downgrade() -> None:
    """Revert migration changes."""

    # Remove shared_image_id from images table
    op.drop_index('ix_images_shared_image_id', table_name='images')
    op.drop_column('images', 'shared_image_id')

    # Drop project_images table
    op.drop_index('ix_project_images_unique', table_name='project_images')
    op.drop_index('ix_project_images_image', table_name='project_images')
    op.drop_index('ix_project_images_project', table_name='project_images')
    op.drop_table('project_images')

    # Drop shared_image_tags table
    op.drop_index('ix_shared_image_tags_unique', table_name='shared_image_tags')
    op.drop_index('ix_shared_image_tags_tag', table_name='shared_image_tags')
    op.drop_index('ix_shared_image_tags_image', table_name='shared_image_tags')
    op.drop_table('shared_image_tags')

    # Drop tags table
    op.drop_index('ix_tags_name', table_name='tags')
    op.drop_table('tags')

    # Drop shared_images table
    op.drop_index('ix_shared_images_filename', table_name='shared_images')
    op.drop_index('ix_shared_images_checksum', table_name='shared_images')
    op.drop_index('ix_shared_images_file_path', table_name='shared_images')
    op.drop_table('shared_images')
