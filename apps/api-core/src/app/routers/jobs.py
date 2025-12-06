"""Job router with CRUD and workflow operations."""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncConnection

from app.dependencies.auth import get_current_active_user
from app.dependencies.database import get_async_transaction_conn
from app.dependencies.rbac import JobPermission, TaskPermission
from app.helpers.response_api import JsonResponse
from app.repositories.job import JobRepository
from app.schemas.auth import UserBase
from app.schemas.job import JobApprove, JobCreate, JobDetailResponse, JobResponse, JobUpdate

router = APIRouter(prefix="/api/v1", tags=["Jobs"])


@router.get("/tasks/{task_id}/jobs", response_model=JsonResponse[list[JobResponse], None])
async def list_jobs(
    task: Annotated[dict, Depends(TaskPermission("viewer"))],
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)],
    job_status: str | None = None,
):
    """List all jobs for a task."""
    jobs = await JobRepository.list_for_task(connection, task["id"], status=job_status)
    return JsonResponse(
        data=[JobResponse(**j) for j in jobs],
        message=f"Found {len(jobs)} job(s)",
        status_code=status.HTTP_200_OK,
    )


@router.post("/tasks/{task_id}/jobs", response_model=JsonResponse[JobResponse, None])
async def create_job(
    payload: JobCreate,
    task: Annotated[dict, Depends(TaskPermission("maintainer"))],
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)],
):
    """Create a new job. Requires maintainer role."""
    job = await JobRepository.create(connection, task["id"], payload.model_dump())
    return JsonResponse(
        data=JobResponse(**job),
        message="Job created successfully",
        status_code=status.HTTP_201_CREATED,
    )


@router.post("/tasks/{task_id}/jobs/bulk", response_model=JsonResponse[list[JobResponse], None])
async def create_jobs_bulk(
    task: Annotated[dict, Depends(TaskPermission("maintainer"))],
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)],
    count: int = 1,
):
    """Create multiple jobs at once (chunking). Requires maintainer role."""
    if count < 1 or count > 100:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Count must be between 1 and 100",
        )
    
    jobs = await JobRepository.create_bulk(connection, task["id"], count)
    return JsonResponse(
        data=[JobResponse(**j) for j in jobs],
        message=f"Created {len(jobs)} job(s)",
        status_code=status.HTTP_201_CREATED,
    )


@router.get("/jobs/{job_id}", response_model=JsonResponse[JobDetailResponse, None])
async def get_job(
    job: Annotated[dict, Depends(JobPermission("viewer"))],
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)],
):
    """Get job details with image count."""
    image_count = await JobRepository.get_image_count(connection, job["id"])
    
    response = JobDetailResponse(
        **{k: v for k, v in job.items() if not k.startswith("_")},
        image_count=image_count,
    )
    
    return JsonResponse(
        data=response,
        message="Job retrieved successfully",
        status_code=status.HTTP_200_OK,
    )


@router.patch("/jobs/{job_id}", response_model=JsonResponse[JobResponse, None])
async def update_job(
    payload: JobUpdate,
    job: Annotated[dict, Depends(JobPermission("maintainer"))],
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)],
):
    """Update a job. Requires maintainer role."""
    update_data = payload.model_dump(exclude_unset=True)
    if not update_data:
        return JsonResponse(
            data=JobResponse(**{k: v for k, v in job.items() if not k.startswith("_")}),
            message="No changes",
            status_code=status.HTTP_200_OK,
        )
    
    updated = await JobRepository.update(connection, job["id"], update_data)
    return JsonResponse(
        data=JobResponse(**updated),
        message="Job updated successfully",
        status_code=status.HTTP_200_OK,
    )


@router.delete("/jobs/{job_id}")
async def delete_job(
    job: Annotated[dict, Depends(JobPermission("maintainer"))],
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)],
):
    """Delete a job. Requires maintainer role."""
    await JobRepository.delete(connection, job["id"])
    return JsonResponse(
        data={"deleted": True},
        message="Job deleted successfully",
        status_code=status.HTTP_200_OK,
    )


# ============================================================================
# Workflow Operations
# ============================================================================
@router.post("/jobs/{job_id}/start", response_model=JsonResponse[JobResponse, None])
async def start_job(
    job: Annotated[dict, Depends(JobPermission("annotator"))],
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)],
):
    """Start working on a job. Requires annotator role."""
    if job["status"] not in ["pending", "assigned"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot start job with status '{job['status']}'",
        )
    
    updated = await JobRepository.start_work(connection, job["id"])
    return JsonResponse(
        data=JobResponse(**updated),
        message="Job started",
        status_code=status.HTTP_200_OK,
    )


@router.post("/jobs/{job_id}/complete", response_model=JsonResponse[JobResponse, None])
async def complete_job(
    job: Annotated[dict, Depends(JobPermission("annotator"))],
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)],
):
    """Mark job as completed. Requires annotator role."""
    if job["status"] != "in_progress":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot complete job with status '{job['status']}'",
        )
    
    updated = await JobRepository.complete_work(connection, job["id"])
    return JsonResponse(
        data=JobResponse(**updated),
        message="Job completed",
        status_code=status.HTTP_200_OK,
    )


@router.post("/jobs/{job_id}/approve", response_model=JsonResponse[JobResponse, None])
async def approve_job(
    payload: JobApprove,
    job: Annotated[dict, Depends(JobPermission("maintainer"))],
    current_user: Annotated[UserBase, Depends(get_current_active_user)],
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)],
):
    """Approve or reject a job. Requires maintainer role."""
    if job["status"] not in ["completed", "review"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot approve/reject job with status '{job['status']}'",
        )
    
    updated = await JobRepository.approve(
        connection,
        job["id"],
        approved_by=current_user.id,
        is_approved=payload.is_approved,
        rejection_reason=payload.rejection_reason,
    )
    
    action = "approved" if payload.is_approved else "rejected"
    return JsonResponse(
        data=JobResponse(**updated),
        message=f"Job {action}",
        status_code=status.HTTP_200_OK,
    )
