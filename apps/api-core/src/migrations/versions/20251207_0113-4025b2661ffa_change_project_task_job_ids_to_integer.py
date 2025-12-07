"""change_project_task_job_ids_to_integer

Revision ID: 4025b2661ffa
Revises: a1b2c3d4e5f6
Create Date: 2025-12-07 01:13:30.813249

This migration changes project_id, task_id, and job_id from UUID to INTEGER.
It requires dropping all data due to the incompatible type change.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '4025b2661ffa'
down_revision: Union[str, None] = 'a1b2c3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Apply migration changes - drops all data and recreates with Integer IDs."""
    
    # Drop all dependent tables first (cascade would handle it but explicit is better)
    op.drop_table('segmentations')
    op.drop_table('keypoints')
    op.drop_table('image_tags')
    op.drop_table('detections')
    op.drop_table('annotation_events')
    op.drop_table('version_snapshots')
    op.drop_table('images')
    op.drop_table('jobs')
    op.drop_table('tasks')
    op.drop_table('project_activity')
    op.drop_table('project_members')
    op.drop_table('pose_skeletons')
    op.drop_table('labels')
    op.drop_table('projects')
    
    # Recreate projects table with Integer ID
    op.create_table('projects',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False, comment='Auto-incrementing primary key'),
        sa.Column('name', sa.String(length=255), nullable=False, comment='Project display name'),
        sa.Column('slug', sa.String(length=255), nullable=False, comment='URL-safe project identifier'),
        sa.Column('description', sa.Text(), nullable=True, comment='Project description'),
        sa.Column('readme', sa.Text(), nullable=True, comment='Markdown readme content'),
        sa.Column('annotation_types', postgresql.ARRAY(sa.String(length=50)), server_default=sa.text("'{classification}'"), nullable=False, comment='Enabled annotation types'),
        sa.Column('owner_id', sa.UUID(), nullable=False, comment='Project owner'),
        sa.Column('storage_prefix', sa.String(length=512), nullable=True, comment='S3/MinIO prefix for this project'),
        sa.Column('is_archived', sa.Boolean(), server_default=sa.text('false'), nullable=False, comment='Whether project is archived'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['owner_id'], ['users.id'], name=op.f('fk_projects_owner_id_users'), ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_projects')),
        sa.UniqueConstraint('slug', name=op.f('uq_projects_slug'))
    )
    op.create_index('ix_projects_owner_id', 'projects', ['owner_id'], unique=False)
    op.create_index('ix_projects_slug', 'projects', ['slug'], unique=False)
    
    # Recreate labels table with Integer project_id
    op.create_table('labels',
        sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('project_id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False, comment='Label name'),
        sa.Column('color', sa.String(length=7), server_default=sa.text("'#FF0000'"), nullable=False, comment='Hex color code'),
        sa.Column('parent_id', sa.UUID(), nullable=True, comment='Parent label for hierarchy'),
        sa.Column('hotkey', sa.String(length=1), nullable=True, comment='Keyboard shortcut (1-9, a-z)'),
        sa.Column('applicable_types', postgresql.ARRAY(sa.String(length=50)), server_default=sa.text("'{classification,detection,segmentation}'"), nullable=False, comment='Annotation types this label applies to'),
        sa.Column('attributes_schema', postgresql.JSONB(astext_type=sa.Text()), server_default=sa.text("'[]'::jsonb"), nullable=True, comment='Schema for per-annotation attributes'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['parent_id'], ['labels.id'], name=op.f('fk_labels_parent_id_labels'), ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['project_id'], ['projects.id'], name=op.f('fk_labels_project_id_projects'), ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_labels'))
    )
    op.create_index('ix_labels_project_id', 'labels', ['project_id'], unique=False)
    op.create_index('ix_labels_unique', 'labels', ['project_id', 'name'], unique=True)
    
    # Recreate pose_skeletons table with Integer project_id
    op.create_table('pose_skeletons',
        sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('project_id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False, comment='Skeleton name (e.g., COCO Person, Hand)'),
        sa.Column('keypoint_names', postgresql.JSONB(astext_type=sa.Text()), nullable=False, comment='Array of keypoint names'),
        sa.Column('skeleton', postgresql.JSONB(astext_type=sa.Text()), nullable=False, comment='Array of [from, to] index pairs for connections'),
        sa.Column('keypoint_colors', postgresql.JSONB(astext_type=sa.Text()), nullable=True, comment='Array of colors for each keypoint'),
        sa.Column('limb_colors', postgresql.JSONB(astext_type=sa.Text()), nullable=True, comment='Array of colors for each limb'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['project_id'], ['projects.id'], name=op.f('fk_pose_skeletons_project_id_projects'), ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_pose_skeletons'))
    )
    op.create_index('ix_pose_skeletons_project_id', 'pose_skeletons', ['project_id'], unique=False)
    op.create_index('ix_pose_skeletons_unique', 'pose_skeletons', ['project_id', 'name'], unique=True)
    
    # Recreate project_members table with Integer project_id and Integer arrays
    op.create_table('project_members',
        sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('project_id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.UUID(), nullable=False),
        sa.Column('role', sa.String(length=20), server_default=sa.text("'annotator'"), nullable=False, comment='Role: owner, maintainer, annotator, viewer'),
        sa.Column('allowed_task_ids', postgresql.ARRAY(sa.Integer()), nullable=True, comment='Scoped access to specific tasks (null = all)'),
        sa.Column('allowed_job_ids', postgresql.ARRAY(sa.Integer()), nullable=True, comment='Scoped access to specific jobs (null = all)'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['project_id'], ['projects.id'], name=op.f('fk_project_members_project_id_projects'), ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], name=op.f('fk_project_members_user_id_users'), ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_project_members'))
    )
    op.create_index('ix_project_members_project_id', 'project_members', ['project_id'], unique=False)
    op.create_index('ix_project_members_unique', 'project_members', ['project_id', 'user_id'], unique=True)
    op.create_index('ix_project_members_user_id', 'project_members', ['user_id'], unique=False)
    
    # Recreate project_activity table with Integer project_id
    op.create_table('project_activity',
        sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False, comment='UUID primary key'),
        sa.Column('project_id', sa.Integer(), nullable=False, comment='Parent project'),
        sa.Column('entity_type', sa.String(length=20), nullable=False, comment='Type: task, job, label, member, project'),
        sa.Column('entity_id', sa.UUID(), nullable=False, comment='ID of the affected entity'),
        sa.Column('entity_name', sa.String(length=255), nullable=True, comment='Name of the entity at time of action'),
        sa.Column('action', sa.String(length=30), nullable=False, comment='Action: created, updated, deleted, status_changed, assigned'),
        sa.Column('actor_id', sa.UUID(), nullable=True, comment='User who performed the action'),
        sa.Column('actor_name', sa.String(length=255), nullable=True, comment='Denormalized actor name for display'),
        sa.Column('previous_data', postgresql.JSONB(astext_type=sa.Text()), nullable=True, comment='State before change (null for create)'),
        sa.Column('new_data', postgresql.JSONB(astext_type=sa.Text()), nullable=True, comment='State after change (null for delete)'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['actor_id'], ['users.id'], name=op.f('fk_project_activity_actor_id_users'), ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['project_id'], ['projects.id'], name=op.f('fk_project_activity_project_id_projects'), ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_project_activity'))
    )
    op.create_index('ix_project_activity_created_at', 'project_activity', ['created_at'], unique=False)
    op.create_index('ix_project_activity_entity', 'project_activity', ['project_id', 'entity_type', 'entity_id'], unique=False)
    op.create_index('ix_project_activity_project_id', 'project_activity', ['project_id'], unique=False)
    
    # Recreate tasks table with Integer ID and Integer project_id
    op.create_table('tasks',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False, comment='Auto-incrementing primary key'),
        sa.Column('project_id', sa.Integer(), nullable=False, comment='Parent project'),
        sa.Column('name', sa.String(length=255), nullable=False, comment='Task name'),
        sa.Column('description', sa.Text(), nullable=True, comment='Task description'),
        sa.Column('assignee_id', sa.UUID(), nullable=True, comment='Assigned user'),
        sa.Column('status', sa.String(length=20), server_default=sa.text("'pending'"), nullable=False, comment='Status: pending, in_progress, completed, review, approved'),
        sa.Column('is_approved', sa.Boolean(), server_default=sa.text('false'), nullable=False, comment='QA approval status'),
        sa.Column('approved_by', sa.UUID(), nullable=True, comment='User who approved'),
        sa.Column('approved_at', sa.DateTime(timezone=True), nullable=True, comment='Approval timestamp'),
        sa.Column('version', sa.Integer(), server_default=sa.text('1'), nullable=False, comment='Auto-incrementing version on annotation changes'),
        sa.Column('total_images', sa.Integer(), server_default=sa.text('0'), nullable=False, comment='Total image count (cached)'),
        sa.Column('annotated_images', sa.Integer(), server_default=sa.text('0'), nullable=False, comment='Annotated image count (cached)'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['approved_by'], ['users.id'], name=op.f('fk_tasks_approved_by_users'), ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['assignee_id'], ['users.id'], name=op.f('fk_tasks_assignee_id_users'), ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['project_id'], ['projects.id'], name=op.f('fk_tasks_project_id_projects'), ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_tasks'))
    )
    op.create_index('ix_tasks_assignee_id', 'tasks', ['assignee_id'], unique=False)
    op.create_index('ix_tasks_project_id', 'tasks', ['project_id'], unique=False)
    op.create_index('ix_tasks_status', 'tasks', ['status'], unique=False)
    
    # Recreate jobs table with Integer ID and Integer task_id
    op.create_table('jobs',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False, comment='Auto-incrementing primary key'),
        sa.Column('task_id', sa.Integer(), nullable=False, comment='Parent task'),
        sa.Column('sequence_number', sa.Integer(), nullable=False, comment='Order within task'),
        sa.Column('assignee_id', sa.UUID(), nullable=True, comment='Assigned annotator'),
        sa.Column('status', sa.String(length=20), server_default=sa.text("'pending'"), nullable=False, comment='Status: pending, assigned, in_progress, completed, review, approved, rejected'),
        sa.Column('is_approved', sa.Boolean(), server_default=sa.text('false'), nullable=False, comment='QA approval status'),
        sa.Column('approved_by', sa.UUID(), nullable=True, comment='User who approved'),
        sa.Column('approved_at', sa.DateTime(timezone=True), nullable=True, comment='Approval timestamp'),
        sa.Column('rejection_reason', sa.Text(), nullable=True, comment='Reason for rejection'),
        sa.Column('version', sa.Integer(), server_default=sa.text('1'), nullable=False, comment='Auto-incrementing version on annotation changes'),
        sa.Column('total_images', sa.Integer(), server_default=sa.text('0'), nullable=False, comment='Total image count (cached)'),
        sa.Column('annotated_images', sa.Integer(), server_default=sa.text('0'), nullable=False, comment='Annotated image count (cached)'),
        sa.Column('started_at', sa.DateTime(timezone=True), nullable=True, comment='When work started'),
        sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True, comment='When work completed'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['approved_by'], ['users.id'], name=op.f('fk_jobs_approved_by_users'), ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['assignee_id'], ['users.id'], name=op.f('fk_jobs_assignee_id_users'), ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['task_id'], ['tasks.id'], name=op.f('fk_jobs_task_id_tasks'), ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_jobs'))
    )
    op.create_index('ix_jobs_assignee_id', 'jobs', ['assignee_id'], unique=False)
    op.create_index('ix_jobs_status', 'jobs', ['status'], unique=False)
    op.create_index('ix_jobs_task_id', 'jobs', ['task_id'], unique=False)
    op.create_index('ix_jobs_unique', 'jobs', ['task_id', 'sequence_number'], unique=True)
    
    # Recreate images table with Integer job_id
    op.create_table('images',
        sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False, comment='UUID primary key'),
        sa.Column('job_id', sa.Integer(), nullable=False, comment='Parent job'),
        sa.Column('filename', sa.String(length=512), nullable=False, comment='Original filename'),
        sa.Column('s3_key', sa.String(length=1024), nullable=False, comment='Full path in MinIO/S3'),
        sa.Column('s3_bucket', sa.String(length=255), server_default=sa.text("'annotate-anu'"), nullable=False, comment='S3 bucket name'),
        sa.Column('width', sa.Integer(), nullable=False, comment='Image width in pixels'),
        sa.Column('height', sa.Integer(), nullable=False, comment='Image height in pixels'),
        sa.Column('thumbnail_s3_key', sa.String(length=1024), nullable=True, comment='Thumbnail path in S3'),
        sa.Column('file_size_bytes', sa.BigInteger(), nullable=True, comment='File size in bytes'),
        sa.Column('mime_type', sa.String(length=100), nullable=True, comment='MIME type'),
        sa.Column('checksum_sha256', sa.String(length=64), nullable=True, comment='SHA256 checksum'),
        sa.Column('metadata', postgresql.JSONB(astext_type=sa.Text()), server_default=sa.text("'{}'::jsonb"), nullable=True, comment='Custom metadata (EXIF, camera info, etc.)'),
        sa.Column('sequence_number', sa.Integer(), nullable=False, comment='Order within job'),
        sa.Column('is_annotated', sa.Boolean(), server_default=sa.text('false'), nullable=False, comment='Has any annotations'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['job_id'], ['jobs.id'], name=op.f('fk_images_job_id_jobs'), ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_images'))
    )
    op.create_index('ix_images_annotated', 'images', ['job_id', 'is_annotated'], unique=False)
    op.create_index('ix_images_job_id', 'images', ['job_id'], unique=False)
    op.create_index('ix_images_s3_key', 'images', ['s3_key'], unique=False)
    op.create_index('ix_images_unique', 'images', ['job_id', 'sequence_number'], unique=True)
    
    # Recreate version_snapshots table with Integer job_id
    op.create_table('version_snapshots',
        sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('job_id', sa.Integer(), nullable=False),
        sa.Column('version', sa.Integer(), nullable=False, comment='Version number'),
        sa.Column('snapshot_s3_key', sa.String(length=1024), nullable=True, comment='S3 path for large snapshots'),
        sa.Column('annotations_snapshot', postgresql.JSONB(astext_type=sa.Text()), nullable=True, comment='Inline snapshot for small datasets'),
        sa.Column('image_count', sa.Integer(), nullable=False),
        sa.Column('annotation_count', sa.Integer(), nullable=False),
        sa.Column('created_by', sa.UUID(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['created_by'], ['users.id'], name=op.f('fk_version_snapshots_created_by_users'), ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['job_id'], ['jobs.id'], name=op.f('fk_version_snapshots_job_id_jobs'), ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_version_snapshots'))
    )
    op.create_index('ix_version_snapshots_job_id', 'version_snapshots', ['job_id'], unique=False)
    op.create_index('ix_version_snapshots_unique', 'version_snapshots', ['job_id', 'version'], unique=True)
    
    # Recreate annotation_events table
    op.create_table('annotation_events',
        sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('target_type', sa.String(length=20), nullable=False, comment='Type: tag, detection, segmentation, keypoint'),
        sa.Column('target_id', sa.UUID(), nullable=False, comment='ID of the annotation'),
        sa.Column('image_id', sa.UUID(), nullable=False),
        sa.Column('event_type', sa.String(length=20), nullable=False, comment='Type: create, update, delete, bulk_create, bulk_delete, import, model_prediction'),
        sa.Column('previous_state', postgresql.JSONB(astext_type=sa.Text()), nullable=True, comment='State before change (null for create)'),
        sa.Column('new_state', postgresql.JSONB(astext_type=sa.Text()), nullable=True, comment='State after change (null for delete)'),
        sa.Column('actor_id', sa.UUID(), nullable=True),
        sa.Column('actor_type', sa.String(length=50), server_default=sa.text("'user'"), nullable=False, comment='Type: user, model, system'),
        sa.Column('job_version', sa.Integer(), nullable=False, comment='Job version at time of event'),
        sa.Column('task_version', sa.Integer(), nullable=False, comment='Task version at time of event'),
        sa.Column('metadata', postgresql.JSONB(astext_type=sa.Text()), server_default=sa.text("'{}'::jsonb"), nullable=True, comment='Additional event metadata'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['actor_id'], ['users.id'], name=op.f('fk_annotation_events_actor_id_users'), ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['image_id'], ['images.id'], name=op.f('fk_annotation_events_image_id_images'), ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_annotation_events'))
    )
    op.create_index('ix_annotation_events_created_at', 'annotation_events', ['created_at'], unique=False)
    op.create_index('ix_annotation_events_image_id', 'annotation_events', ['image_id'], unique=False)
    op.create_index('ix_annotation_events_job_version', 'annotation_events', ['image_id', 'job_version'], unique=False)
    
    # Recreate detections table
    op.create_table('detections',
        sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('image_id', sa.UUID(), nullable=False),
        sa.Column('label_id', sa.UUID(), nullable=False),
        sa.Column('x_min', sa.Float(), nullable=False, comment='Left edge (0-1)'),
        sa.Column('y_min', sa.Float(), nullable=False, comment='Top edge (0-1)'),
        sa.Column('x_max', sa.Float(), nullable=False, comment='Right edge (0-1)'),
        sa.Column('y_max', sa.Float(), nullable=False, comment='Bottom edge (0-1)'),
        sa.Column('rotation', sa.Float(), server_default=sa.text('0'), nullable=True, comment='Rotation in degrees'),
        sa.Column('confidence', sa.Float(), nullable=True, comment='Confidence score'),
        sa.Column('attributes', postgresql.JSONB(astext_type=sa.Text()), server_default=sa.text("'{}'::jsonb"), nullable=True, comment='Custom attributes (occluded, truncated, etc.)'),
        sa.Column('source', sa.String(length=50), server_default=sa.text("'manual'"), nullable=False),
        sa.Column('created_by', sa.UUID(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['created_by'], ['users.id'], name=op.f('fk_detections_created_by_users'), ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['image_id'], ['images.id'], name=op.f('fk_detections_image_id_images'), ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['label_id'], ['labels.id'], name=op.f('fk_detections_label_id_labels'), ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_detections'))
    )
    op.create_index('ix_detections_image_id', 'detections', ['image_id'], unique=False)
    op.create_index('ix_detections_label_id', 'detections', ['label_id'], unique=False)
    
    # Recreate image_tags table
    op.create_table('image_tags',
        sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('image_id', sa.UUID(), nullable=False),
        sa.Column('label_id', sa.UUID(), nullable=False),
        sa.Column('confidence', sa.Float(), nullable=True, comment='Confidence score (for model predictions)'),
        sa.Column('source', sa.String(length=50), server_default=sa.text("'manual'"), nullable=False, comment='Source: manual, model:<id>, import'),
        sa.Column('created_by', sa.UUID(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['created_by'], ['users.id'], name=op.f('fk_image_tags_created_by_users'), ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['image_id'], ['images.id'], name=op.f('fk_image_tags_image_id_images'), ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['label_id'], ['labels.id'], name=op.f('fk_image_tags_label_id_labels'), ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_image_tags'))
    )
    op.create_index('ix_image_tags_image_id', 'image_tags', ['image_id'], unique=False)
    op.create_index('ix_image_tags_label_id', 'image_tags', ['label_id'], unique=False)
    op.create_index('ix_image_tags_unique', 'image_tags', ['image_id', 'label_id'], unique=True)
    
    # Recreate keypoints table
    op.create_table('keypoints',
        sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('image_id', sa.UUID(), nullable=False),
        sa.Column('label_id', sa.UUID(), nullable=False),
        sa.Column('skeleton_id', sa.UUID(), nullable=True, comment='Reference to skeleton definition'),
        sa.Column('points', postgresql.JSONB(astext_type=sa.Text()), nullable=False, comment='Array of {name, x, y, visibility}'),
        sa.Column('bbox_x_min', sa.Float(), nullable=True),
        sa.Column('bbox_y_min', sa.Float(), nullable=True),
        sa.Column('bbox_x_max', sa.Float(), nullable=True),
        sa.Column('bbox_y_max', sa.Float(), nullable=True),
        sa.Column('confidence', sa.Float(), nullable=True),
        sa.Column('attributes', postgresql.JSONB(astext_type=sa.Text()), server_default=sa.text("'{}'::jsonb"), nullable=True),
        sa.Column('source', sa.String(length=50), server_default=sa.text("'manual'"), nullable=False),
        sa.Column('created_by', sa.UUID(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['created_by'], ['users.id'], name=op.f('fk_keypoints_created_by_users'), ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['image_id'], ['images.id'], name=op.f('fk_keypoints_image_id_images'), ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['label_id'], ['labels.id'], name=op.f('fk_keypoints_label_id_labels'), ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_keypoints'))
    )
    op.create_index('ix_keypoints_image_id', 'keypoints', ['image_id'], unique=False)
    
    # Recreate segmentations table
    op.create_table('segmentations',
        sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('image_id', sa.UUID(), nullable=False),
        sa.Column('label_id', sa.UUID(), nullable=False),
        sa.Column('format', sa.String(length=20), server_default=sa.text("'polygon'"), nullable=False, comment='Format: polygon, rle, bitmap'),
        sa.Column('polygon', postgresql.JSONB(astext_type=sa.Text()), nullable=True, comment='Array of [x, y] normalized coordinates'),
        sa.Column('rle', postgresql.JSONB(astext_type=sa.Text()), nullable=True, comment='Run-length encoding for masks'),
        sa.Column('mask_s3_key', sa.String(length=1024), nullable=True, comment='External mask reference'),
        sa.Column('bbox_x_min', sa.Float(), nullable=True),
        sa.Column('bbox_y_min', sa.Float(), nullable=True),
        sa.Column('bbox_x_max', sa.Float(), nullable=True),
        sa.Column('bbox_y_max', sa.Float(), nullable=True),
        sa.Column('area', sa.Float(), nullable=True, comment='Cached area'),
        sa.Column('confidence', sa.Float(), nullable=True),
        sa.Column('attributes', postgresql.JSONB(astext_type=sa.Text()), server_default=sa.text("'{}'::jsonb"), nullable=True),
        sa.Column('source', sa.String(length=50), server_default=sa.text("'manual'"), nullable=False),
        sa.Column('created_by', sa.UUID(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['created_by'], ['users.id'], name=op.f('fk_segmentations_created_by_users'), ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['image_id'], ['images.id'], name=op.f('fk_segmentations_image_id_images'), ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['label_id'], ['labels.id'], name=op.f('fk_segmentations_label_id_labels'), ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_segmentations'))
    )
    op.create_index('ix_segmentations_image_id', 'segmentations', ['image_id'], unique=False)
    op.create_index('ix_segmentations_label_id', 'segmentations', ['label_id'], unique=False)


def downgrade() -> None:
    """Revert migration - this requires re-running all previous migrations."""
    # This is a destructive migration. Downgrade would need to drop and recreate 
    # all tables with UUID types, which is handled by the previous migrations.
    # The simplest downgrade is to drop all and let previous migrations recreate.
    op.drop_table('segmentations')
    op.drop_table('keypoints')
    op.drop_table('image_tags')
    op.drop_table('detections')
    op.drop_table('annotation_events')
    op.drop_table('version_snapshots')
    op.drop_table('images')
    op.drop_table('jobs')
    op.drop_table('tasks')
    op.drop_table('project_activity')
    op.drop_table('project_members')
    op.drop_table('pose_skeletons')
    op.drop_table('labels')
    op.drop_table('projects')
    
    # After this downgrade, run: alembic upgrade a1b2c3d4e5f6
    # to restore the UUID-based schema
