"""Pydantic schemas for Jobs."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class JobCreate(BaseModel):
    """Schema for creating a job (usually auto-created via task chunking)."""

    sequence_number: int = Field(..., ge=0, description="Order within task")
    assignee_id: UUID | None = Field(None, description="Assigned annotator")


class JobUpdate(BaseModel):
    """Schema for updating a job."""

    assignee_id: UUID | None = None
    status: str | None = Field(None, description="Status: pending, assigned, in_progress, completed, review, approved, rejected")


class JobApprove(BaseModel):
    """Schema for approving/rejecting a job."""

    is_approved: bool = Field(..., description="Approve or reject")
    rejection_reason: str | None = Field(None, description="Reason for rejection")


class JobAssigneeInfo(BaseModel):
    """User info for job assignee."""
    
    id: UUID
    email: str
    username: str
    full_name: str | None


class JobResponse(BaseModel):
    """Job response schema."""

    id: int
    task_id: int
    sequence_number: int
    assignee_id: UUID | None
    assignee: JobAssigneeInfo | None = None
    status: str
    is_archived: bool
    is_approved: bool
    approved_by: UUID | None
    approved_at: datetime | None
    rejection_reason: str | None
    version: int
    total_images: int
    annotated_images: int
    started_at: datetime | None
    completed_at: datetime | None
    created_at: datetime
    updated_at: datetime





class JobDetailResponse(JobResponse):
    """Job response with image count and project context for annotation mode."""

    image_count: int = 0
    project_id: int | None = None
    labels: list["LabelResponse"] = []
    allowed_model_ids: list[str] | None = None


# Import for forward reference
from app.schemas.project import LabelResponse



class JobAssign(BaseModel):
    """Schema for assigning a job to a user."""

    assignee_id: UUID = Field(..., description="User ID to assign the job to")
