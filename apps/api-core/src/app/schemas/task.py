"""Pydantic schemas for Tasks."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class TaskCreate(BaseModel):
    """Schema for creating a task."""

    name: str = Field(..., max_length=255, description="Task name")
    description: str | None = Field(None, description="Task description")
    assignee_id: UUID | None = Field(None, description="Assigned user")


class TaskUpdate(BaseModel):
    """Schema for updating a task."""

    name: str | None = Field(None, max_length=255)
    description: str | None = None
    assignee_id: UUID | None = None
    status: str | None = Field(None, description="Status: pending, in_progress, completed, review, approved")


class TaskResponse(BaseModel):
    """Task response schema."""

    id: UUID
    project_id: UUID
    name: str
    description: str | None
    assignee_id: UUID | None
    status: str
    is_approved: bool
    approved_by: UUID | None
    approved_at: datetime | None
    version: int
    total_images: int
    annotated_images: int
    created_at: datetime
    updated_at: datetime


class TaskDetailResponse(TaskResponse):
    """Task response with job count."""

    job_count: int = 0
