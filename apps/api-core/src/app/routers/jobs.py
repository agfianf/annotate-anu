"""Job router with CRUD and workflow operations."""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncConnection

from app.dependencies.auth import get_admin_user, get_current_active_user
from app.dependencies.database import get_async_transaction_conn
from app.dependencies.rbac import JobPermission, TaskPermission
from app.helpers.response_api import JsonResponse
from app.repositories.job import JobRepository
from app.repositories.project import ProjectMemberRepository
from app.schemas.auth import UserBase
from app.schemas.job import JobApprove, JobAssign, JobCreate, JobDetailResponse, JobResponse, JobUpdate
from app.schemas.job_sync import JobSyncRequest

router = APIRouter(prefix="/api/v1", tags=["Jobs"])


@router.get("/tasks/{task_id}/jobs", response_model=JsonResponse[list[JobResponse], None])
async def list_jobs(
    task: Annotated[dict, Depends(TaskPermission("viewer"))],
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)],
    job_status: str | None = None,
    include_archived: bool = False,
):
    """List all jobs for a task."""
    jobs = await JobRepository.list_for_task(connection, task["id"], status=job_status, include_archived=include_archived)
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
    """Get job details with image count and project labels for annotation mode."""
    from app.repositories.project import LabelRepository, ProjectRepository
    from app.repositories.task import TaskRepository
    from app.schemas.project import LabelResponse


    # Get image count
    image_count = await JobRepository.get_image_count(connection, job["id"])

    # Traverse job -> task -> project to get labels and allowed models
    project_id = None
    labels = []
    allowed_model_ids = None

    task = await TaskRepository.get_by_id(connection, job["task_id"])
    if task:
        project_id = task["project_id"]
        project_labels = await LabelRepository.list_for_project(connection, project_id)
        labels = [LabelResponse(**lb) for lb in project_labels]

        # Fetch project to get allowed_model_ids
        project = await ProjectRepository.get_by_id(connection, project_id)
        if project:
            allowed_model_ids = project.get("allowed_model_ids")

    response = JobDetailResponse(
        **{k: v for k, v in job.items() if not k.startswith("_")},
        image_count=image_count,
        project_id=project_id,
        labels=labels,
        allowed_model_ids=allowed_model_ids,
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


@router.post("/jobs/{job_id}/archive", response_model=JsonResponse[JobResponse, None])
async def archive_job(
    job_id: int,
    current_user: Annotated[UserBase, Depends(get_admin_user)],
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)],
):
    """Archive a job. Requires admin role."""
    job = await JobRepository.get_by_id(connection, job_id)
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")
        
    updated = await JobRepository.update(connection, job_id, {"is_archived": True})
    return JsonResponse(
        data=JobResponse(**updated),
        message="Job archived successfully",
        status_code=status.HTTP_200_OK,
    )


@router.post("/jobs/{job_id}/unarchive", response_model=JsonResponse[JobResponse, None])
async def unarchive_job(
    job_id: int,
    current_user: Annotated[UserBase, Depends(get_admin_user)],
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)],
):
    """Unarchive a job. Requires admin role."""
    job = await JobRepository.get_by_id(connection, job_id)
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")
        
    updated = await JobRepository.update(connection, job_id, {"is_archived": False})
    return JsonResponse(
        data=JobResponse(**updated),
        message="Job unarchived successfully",
        status_code=status.HTTP_200_OK,
    )


@router.delete("/jobs/{job_id}")
async def delete_job(
    job_id: int,
    current_user: Annotated[UserBase, Depends(get_admin_user)],
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)],
):
    """Delete a job. Requires admin role and archived status."""
    job = await JobRepository.get_by_id(connection, job_id)
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")

    if not job["is_archived"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, 
            detail="Job must be archived before deletion"
        )
    
    await JobRepository.delete(connection, job_id)
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


# =============================================================================
# Job Assignment Operations
# =============================================================================


@router.post("/jobs/{job_id}/assign", response_model=JsonResponse[JobResponse, None])
async def assign_job(
    payload: JobAssign,
    job: Annotated[dict, Depends(JobPermission("maintainer"))],
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)],
):
    """
    Assign a job to a user. Requires maintainer role.
    
    Validates that the assignee is a member of the project.
    Updates status from 'pending' to 'assigned'.
    """
    # Get task to find project_id
    from app.repositories.task import TaskRepository
    
    task = await TaskRepository.get_by_id(connection, job["task_id"])
    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Parent task not found",
        )
    
    # Validate assignee is a project member (or project owner)
    from app.repositories.project import ProjectRepository
    
    project = await ProjectRepository.get_by_id(connection, task["project_id"])
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Parent project not found",
        )
    
    # Check if assignee is project owner or a member
    is_owner = project["owner_id"] == payload.assignee_id
    membership = await ProjectMemberRepository.get_by_project_and_user(
        connection, task["project_id"], payload.assignee_id
    )
    
    if not is_owner and not membership:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Assignee must be a project member",
        )
    
    updated = await JobRepository.assign(connection, job["id"], payload.assignee_id)
    if not updated:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to assign job",
        )
    
    return JsonResponse(
        data=JobResponse(**updated),
        message="Job assigned successfully",
        status_code=status.HTTP_200_OK,
    )


@router.post("/jobs/{job_id}/unassign", response_model=JsonResponse[JobResponse, None])
async def unassign_job(
    job: Annotated[dict, Depends(JobPermission("maintainer"))],
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)],
):
    """
    Remove assignment from a job. Requires maintainer role.
    
    Reverts status from 'assigned' back to 'pending'.
    Cannot unassign if job is already in_progress or beyond.
    """
    if job["status"] not in ["pending", "assigned"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot unassign job with status '{job['status']}'. Only 'pending' or 'assigned' jobs can be unassigned.",
        )
    
    updated = await JobRepository.unassign(connection, job["id"])
    if not updated:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to unassign job",
        )
    
    return JsonResponse(
        data=JobResponse(**updated),
        message="Job unassigned successfully",
        status_code=status.HTTP_200_OK,
    )


# =============================================================================
# Job Annotation Sync
# =============================================================================

@router.post("/jobs/{job_id}/annotations/sync", response_model=JsonResponse[dict, None])
async def sync_annotations(
    payload: JobSyncRequest,
    job: Annotated[dict, Depends(JobPermission("annotator"))],
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)],
):
    """
    Sync annotations for a job across multiple images.
    
    Handlers creation, update, and deletion of tags, detections, segmentations, and keypoints.
    Updates image annotation status automatically.
    """
    from app.repositories.annotation import (
        DetectionRepository,
        ImageTagRepository,
        KeypointRepository,
        SegmentationRepository,
    )
    from app.repositories.image import ImageRepository
    from app.routers.annotations import _sync_image_annotation_status
    
    total_ops = 0
    synced_images = []
    
    # Iterate over images provided in payload
    for image_id, data in payload.images.items():
        image_ops = 0
        
        # Verify image belongs to job (optional but good for security)
        # We skip this query for performance optimization assuming frontend sends correct data
        # But we DO need to fetch the image to pass it to _sync_image_annotation_status at the end
        image = await ImageRepository.get_by_id(connection, image_id)
        if not image or image["job_id"] != job["id"]:
            # Skip invalid images
            continue
            
        # 1. Tags
        if data.tags:
            # Create
            if data.tags.created:
                await ImageTagRepository.create_bulk(connection, image_id, data.tags.created)
                image_ops += len(data.tags.created)
            
            # Delete
            if data.tags.deleted:
                await ImageTagRepository.delete_bulk(connection, data.tags.deleted)
                image_ops += len(data.tags.deleted)

        # 2. Detections
        if data.detections:
            # Create
            if data.detections.created:
                await DetectionRepository.create_bulk(connection, image_id, data.detections.created)
                image_ops += len(data.detections.created)
                
            # Update
            for update_item in data.detections.updated:
                item_id = update_item.pop("id", None)
                if item_id:
                    await DetectionRepository.update(connection, item_id, update_item)
                    image_ops += 1
            
            # Delete
            if data.detections.deleted:
                await DetectionRepository.delete_bulk(connection, data.detections.deleted)
                image_ops += len(data.detections.deleted)

        # 3. Segmentations
        if data.segmentations:
            # Create
            if data.segmentations.created:
                await SegmentationRepository.create_bulk(connection, image_id, data.segmentations.created)
                image_ops += len(data.segmentations.created)
                
            # Update
            for update_item in data.segmentations.updated:
                item_id = update_item.pop("id", None)
                if item_id:
                    await SegmentationRepository.update(connection, item_id, update_item)
                    image_ops += 1
            
            # Delete
            if data.segmentations.deleted:
                await SegmentationRepository.delete_bulk(connection, data.segmentations.deleted)
                image_ops += len(data.segmentations.deleted)

        # 4. Keypoints
        if data.keypoints:
            # Create
            for kp_item in data.keypoints.created:
                await KeypointRepository.create(connection, image_id, kp_item)
                image_ops += 1
                
            # Update
            for update_item in data.keypoints.updated:
                item_id = update_item.pop("id", None)
                if item_id:
                    await KeypointRepository.update(connection, item_id, update_item)
                    image_ops += 1
            
            # Delete
            for delete_id in data.keypoints.deleted:
                await KeypointRepository.delete(connection, delete_id)
                image_ops += 1

        # Sync Image Status if any ops happened
        if image_ops > 0:
            await _sync_image_annotation_status(connection, image)
            total_ops += image_ops
            synced_images.append(str(image_id))

    return JsonResponse(
        data={"synced_images": synced_images, "total_operations": total_ops},
        message=f"Synced {total_ops} changes across {len(synced_images)} image(s)",
        status_code=status.HTTP_200_OK,
    )

