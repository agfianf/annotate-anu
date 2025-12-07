"""Pydantic schemas for Tasks."""

from datetime import datetime
from uuid import UUID

from app.schemas.job import JobAssigneeInfo

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

    id: int
    project_id: int
    name: str
    description: str | None
    assignee_id: UUID | None
    assignee: JobAssigneeInfo | None = None
    status: str
    is_archived: bool
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


class TaskCreateWithImages(BaseModel):
    """Schema for creating a task with image configuration and job chunking."""

    name: str = Field(..., max_length=255, description="Task name")
    description: str | None = Field(None, description="Task description")
    assignee_id: UUID | None = Field(None, description="Default assignee for jobs")
    chunk_size: int = Field(default=25, ge=1, le=500, description="Images per job (1-500)")
    distribution_order: str = Field(
        default="sequential",
        description="Image distribution: 'sequential' or 'random'",
    )

    def model_post_init(self, __context) -> None:
        if self.distribution_order not in ("sequential", "random"):
            raise ValueError("distribution_order must be 'sequential' or 'random'")


class MockImageInput(BaseModel):
    """Mocked image input for testing (real upload deferred)."""

    filename: str = Field(..., max_length=512)
    width: int = Field(default=1920, gt=0)
    height: int = Field(default=1080, gt=0)
    file_size_bytes: int | None = Field(default=None)
    checksum_sha256: str | None = Field(default=None, description="For duplicate detection")


class TaskCreateWithMockImages(TaskCreateWithImages):
    """Task creation with mocked images (for development/testing)."""

    images: list[MockImageInput] = Field(..., min_length=1, max_length=10000)


class JobPreview(BaseModel):
    """Preview of a job to be created."""

    sequence_number: int
    image_count: int


class TaskCreationPreview(BaseModel):
    """Preview of task creation showing job breakdown."""

    task_name: str
    total_images: int
    chunk_size: int
    distribution_order: str
    jobs: list[JobPreview]


class TaskWithJobsResponse(BaseModel):
    """Task response including created jobs."""

    task: TaskResponse
    jobs: list["JobResponse"]
    total_images: int
    duplicate_count: int = 0
    duplicate_filenames: list[str] = Field(default_factory=list)


# Import here to avoid circular imports
from app.schemas.job import JobResponse  # noqa: E402

TaskWithJobsResponse.model_rebuild()
