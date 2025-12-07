"""Pydantic schemas for Project Activity."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class ProjectActivityResponse(BaseModel):
    """Response schema for project activity."""

    id: UUID
    project_id: UUID
    entity_type: str = Field(..., description="Type: task, job, label, member, project")
    entity_id: UUID
    entity_name: str | None = Field(None, description="Name of the entity at time of action")
    action: str = Field(..., description="Action: created, updated, deleted, status_changed, assigned")
    actor_id: UUID | None = None
    actor_name: str | None = Field(None, description="Denormalized actor name for display")
    previous_data: dict | None = None
    new_data: dict | None = None
    created_at: datetime


class ProjectActivityCreate(BaseModel):
    """Schema for creating an activity entry."""

    entity_type: str = Field(..., description="Type: task, job, label, member, project")
    entity_id: UUID
    entity_name: str | None = None
    action: str = Field(..., description="Action: created, updated, deleted, status_changed, assigned")
    previous_data: dict | None = None
    new_data: dict | None = None


class ActivityListMeta(BaseModel):
    """Metadata for activity list responses."""

    total: int = Field(..., description="Total number of activity entries")
    limit: int = Field(..., description="Maximum entries per request")
    offset: int = Field(..., description="Offset for pagination")

