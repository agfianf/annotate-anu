"""Add project_activity table for tracking project changes

Revision ID: a1b2c3d4e5f6
Revises: d5e5edcedeae
Create Date: 2025-12-06 23:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, None] = 'd5e5edcedeae'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create project_activity table for tracking project-level changes."""
    op.create_table(
        'project_activity',
        sa.Column(
            'id',
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
            comment="UUID primary key",
        ),
        sa.Column(
            'project_id',
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey('projects.id', ondelete='CASCADE'),
            nullable=False,
            comment="Parent project",
        ),
        sa.Column(
            'entity_type',
            sa.String(20),
            nullable=False,
            comment="Type: task, job, label, member, project",
        ),
        sa.Column(
            'entity_id',
            postgresql.UUID(as_uuid=True),
            nullable=False,
            comment="ID of the affected entity",
        ),
        sa.Column(
            'entity_name',
            sa.String(255),
            nullable=True,
            comment="Name of the entity at time of action",
        ),
        sa.Column(
            'action',
            sa.String(30),
            nullable=False,
            comment="Action: created, updated, deleted, status_changed, assigned",
        ),
        sa.Column(
            'actor_id',
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey('users.id', ondelete='SET NULL'),
            nullable=True,
            comment="User who performed the action",
        ),
        sa.Column(
            'actor_name',
            sa.String(255),
            nullable=True,
            comment="Denormalized actor name for display",
        ),
        sa.Column(
            'previous_data',
            postgresql.JSONB,
            nullable=True,
            comment="State before change (null for create)",
        ),
        sa.Column(
            'new_data',
            postgresql.JSONB,
            nullable=True,
            comment="State after change (null for delete)",
        ),
        sa.Column(
            'created_at',
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )
    
    # Create indexes for efficient querying
    op.create_index(
        'ix_project_activity_project_id',
        'project_activity',
        ['project_id']
    )
    op.create_index(
        'ix_project_activity_created_at',
        'project_activity',
        ['created_at']
    )
    op.create_index(
        'ix_project_activity_entity',
        'project_activity',
        ['project_id', 'entity_type', 'entity_id']
    )


def downgrade() -> None:
    """Drop project_activity table."""
    op.drop_index('ix_project_activity_entity', table_name='project_activity')
    op.drop_index('ix_project_activity_created_at', table_name='project_activity')
    op.drop_index('ix_project_activity_project_id', table_name='project_activity')
    op.drop_table('project_activity')
