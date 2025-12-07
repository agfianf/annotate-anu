"""Pydantic schemas for Projects, Labels, and Project Members."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


# ============================================================================
# Label Schemas
# ============================================================================
class LabelCreate(BaseModel):
    """Schema for creating a label."""

    name: str = Field(..., max_length=255, description="Label name")
    color: str = Field(default="#FF0000", pattern=r"^#[0-9A-Fa-f]{6}$", description="Hex color")
    parent_id: UUID | None = Field(None, description="Parent label for hierarchy")
    hotkey: str | None = Field(None, max_length=1, description="Keyboard shortcut")
    applicable_types: list[str] = Field(
        default=["classification", "detection", "segmentation"],
        description="Annotation types this label applies to",
    )
    attributes_schema: list[dict] | None = Field(None, description="Per-annotation attribute schema")


class LabelUpdate(BaseModel):
    """Schema for updating a label."""

    name: str | None = Field(None, max_length=255)
    color: str | None = Field(None, pattern=r"^#[0-9A-Fa-f]{6}$")
    parent_id: UUID | None = None
    hotkey: str | None = None
    applicable_types: list[str] | None = None
    attributes_schema: list[dict] | None = None


class LabelResponse(BaseModel):
    """Label response schema."""

    id: UUID
    project_id: int
    name: str
    color: str
    parent_id: UUID | None
    hotkey: str | None
    applicable_types: list[str]
    attributes_schema: list[dict] | None
    created_at: datetime


# ============================================================================
# Project Member Schemas
# ============================================================================
class ProjectMemberCreate(BaseModel):
    """Schema for adding a project member."""

    user_id: UUID = Field(..., description="User to add")
    role: str = Field(default="annotator", description="Role: owner, maintainer, annotator, viewer")
    allowed_task_ids: list[int] | None = Field(None, description="Restrict to specific tasks")
    allowed_job_ids: list[int] | None = Field(None, description="Restrict to specific jobs")


class ProjectMemberUpdate(BaseModel):
    """Schema for updating a project member."""

    role: str | None = None
    allowed_task_ids: list[int] | None = None
    allowed_job_ids: list[int] | None = None


class MemberUserInfo(BaseModel):
    """Minimal user info for member listings."""
    
    email: str
    username: str
    full_name: str | None


class ProjectMemberResponse(BaseModel):
    """Project member response schema."""

    id: UUID
    project_id: int
    user_id: UUID
    role: str
    allowed_task_ids: list[int] | None
    allowed_job_ids: list[int] | None
    created_at: datetime
    updated_at: datetime
    user: MemberUserInfo | None = None


# ============================================================================
# Project Schemas
# ============================================================================
class ProjectCreate(BaseModel):
    """Schema for creating a project."""

    name: str = Field(..., max_length=255, description="Project name")
    slug: str = Field(..., max_length=255, pattern=r"^[a-z0-9-]+$", description="URL-safe identifier")
    description: str | None = Field(None, description="Project description")
    readme: str | None = Field(None, description="Markdown readme")
    annotation_types: list[str] = Field(
        default=["classification"],
        description="Enabled annotation types",
    )


class ProjectUpdate(BaseModel):
    """Schema for updating a project."""

    name: str | None = Field(None, max_length=255)
    description: str | None = None
    readme: str | None = None
    annotation_types: list[str] | None = None
    is_archived: bool | None = None


class ProjectResponse(BaseModel):
    """Project response schema."""

    id: int
    name: str
    slug: str
    description: str | None
    readme: str | None
    annotation_types: list[str]
    owner_id: UUID
    storage_prefix: str | None
    is_archived: bool
    created_at: datetime
    updated_at: datetime


class ProjectDetailResponse(ProjectResponse):
    """Project response with labels and member count."""

    labels: list[LabelResponse] = []
    member_count: int = 0
    task_count: int = 0
    user_role: str = "viewer"  # User's role in this project: owner, maintainer, annotator, viewer
