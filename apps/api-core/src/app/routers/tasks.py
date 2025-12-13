"""Task router with CRUD operations."""

import hashlib
import random
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncConnection

from app.dependencies.auth import get_admin_user, get_current_active_user
from app.dependencies.database import get_async_transaction_conn
from app.dependencies.rbac import ProjectPermission, TaskPermission
from app.helpers.response_api import JsonResponse
from app.repositories.image import ImageRepository
from app.repositories.job import JobRepository
from app.repositories.project_image import ProjectImageRepository
from app.repositories.shared_image import SharedImageRepository
from app.repositories.task import TaskRepository
from app.schemas.auth import UserBase
from app.schemas.data_management import TaskCreateWithFilePaths
from app.schemas.job import JobResponse
from app.schemas.task import (
    JobPreview,
    TaskCreate,
    TaskCreateWithMockImages,
    TaskCreationPreview,
    TaskDetailResponse,
    TaskResponse,
    TaskUpdate,
    TaskWithJobsResponse,
)
from app.services.filesystem import FileSystemService
from app.services.thumbnail import ThumbnailService

# Initialize services for file path handling
_filesystem_service = FileSystemService()
_thumbnail_service = ThumbnailService()

router = APIRouter(prefix="/api/v1", tags=["Tasks"])


@router.get("/projects/{project_id}/tasks", response_model=JsonResponse[list[TaskResponse], None])
async def list_tasks(
    project: Annotated[dict, Depends(ProjectPermission("viewer"))],
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)],
    task_status: str | None = None,
    include_archived: bool = False,
):
    """List all tasks for a project."""
    tasks = await TaskRepository.list_for_project(
        connection, project["id"], status=task_status, include_archived=include_archived
    )
    return JsonResponse(
        data=[TaskResponse(**t) for t in tasks],
        message=f"Found {len(tasks)} task(s)",
        status_code=status.HTTP_200_OK,
    )


@router.post("/projects/{project_id}/tasks", response_model=JsonResponse[TaskResponse, None])
async def create_task(
    payload: TaskCreate,
    project: Annotated[dict, Depends(ProjectPermission("maintainer"))],
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)],
):
    """Create a new task. Requires maintainer role."""
    task = await TaskRepository.create(connection, project["id"], payload.model_dump())
    return JsonResponse(
        data=TaskResponse(**task),
        message="Task created successfully",
        status_code=status.HTTP_201_CREATED,
    )


@router.get("/tasks/{task_id}", response_model=JsonResponse[TaskDetailResponse, None])
async def get_task(
    task: Annotated[dict, Depends(TaskPermission("viewer"))],
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)],
):
    """Get task details with job count."""
    job_count = await TaskRepository.get_job_count(connection, task["id"])
    
    response = TaskDetailResponse(
        **{k: v for k, v in task.items() if not k.startswith("_")},
        job_count=job_count,
    )
    
    return JsonResponse(
        data=response,
        message="Task retrieved successfully",
        status_code=status.HTTP_200_OK,
    )


@router.patch("/tasks/{task_id}", response_model=JsonResponse[TaskResponse, None])
async def update_task(
    payload: TaskUpdate,
    task: Annotated[dict, Depends(TaskPermission("maintainer"))],
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)],
):
    """Update a task. Requires maintainer role."""
    update_data = payload.model_dump(exclude_unset=True)
    if not update_data:
        return JsonResponse(
            data=TaskResponse(**{k: v for k, v in task.items() if not k.startswith("_")}),
            message="No changes",
            status_code=status.HTTP_200_OK,
        )
    
    updated = await TaskRepository.update(connection, task["id"], update_data)
    return JsonResponse(
        data=TaskResponse(**updated),
        message="Task updated successfully",
        status_code=status.HTTP_200_OK,
    )


@router.post("/tasks/{task_id}/archive", response_model=JsonResponse[TaskResponse, None])
async def archive_task(
    task_id: int,
    current_user: Annotated[UserBase, Depends(get_admin_user)],
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)],
):
    """Archive a task. Requires admin role."""
    task = await TaskRepository.get_by_id(connection, task_id)
    if not task:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")
        
    updated = await TaskRepository.update(connection, task_id, {"is_archived": True})
    return JsonResponse(
        data=TaskResponse(**updated),
        message="Task archived successfully",
        status_code=status.HTTP_200_OK,
    )


@router.post("/tasks/{task_id}/unarchive", response_model=JsonResponse[TaskResponse, None])
async def unarchive_task(
    task_id: int,
    current_user: Annotated[UserBase, Depends(get_admin_user)],
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)],
):
    """Unarchive a task. Requires admin role."""
    task = await TaskRepository.get_by_id(connection, task_id)
    if not task:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")
        
    updated = await TaskRepository.update(connection, task_id, {"is_archived": False})
    return JsonResponse(
        data=TaskResponse(**updated),
        message="Task unarchived successfully",
        status_code=status.HTTP_200_OK,
    )


@router.delete("/tasks/{task_id}")
async def delete_task(
    task_id: int,
    current_user: Annotated[UserBase, Depends(get_admin_user)],
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)],
):
    """Delete a task. Requires admin role and archived status."""
    task = await TaskRepository.get_by_id(connection, task_id)
    if not task:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")

    if not task["is_archived"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, 
            detail="Task must be archived before deletion"
        )

    await TaskRepository.delete(connection, task_id)
    return JsonResponse(
        data={"deleted": True},
        message="Task deleted successfully",
        status_code=status.HTTP_200_OK,
    )


@router.post("/tasks/{task_id}/assign", response_model=JsonResponse[TaskResponse, None])
async def assign_task(
    payload: dict,
    task: Annotated[dict, Depends(TaskPermission("maintainer"))],
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)],
):
    """Assign a task to a user. Requires maintainer role."""
    assignee_id = payload.get("assignee_id")
    # if assignee_id is explicit null, it means unassign
    
    updated = await TaskRepository.update(
        connection, 
        task["id"], 
        {"assignee_id": assignee_id}
    )
    
    return JsonResponse(
        data=TaskResponse(**updated),
        message="Task assigned successfully" if assignee_id else "Task unassigned successfully",
        status_code=status.HTTP_200_OK,
    )


# =============================================================================
# Task Creation with Images & Job Chunking
# =============================================================================


@router.post(
    "/projects/{project_id}/tasks/preview",
    response_model=JsonResponse[TaskCreationPreview, None],
)
async def preview_task_creation(
    payload: TaskCreateWithMockImages,
    project: Annotated[dict, Depends(ProjectPermission("maintainer"))],
):
    """Preview task creation showing job breakdown. Does not create anything."""
    total_images = len(payload.images)
    chunk_size = payload.chunk_size
    
    # Calculate job breakdown
    job_count = (total_images + chunk_size - 1) // chunk_size  # Ceiling division
    jobs_preview = []
    
    for i in range(job_count):
        start_idx = i * chunk_size
        end_idx = min((i + 1) * chunk_size, total_images)
        jobs_preview.append(JobPreview(
            sequence_number=i,
            image_count=end_idx - start_idx,
        ))
    
    return JsonResponse(
        data=TaskCreationPreview(
            task_name=payload.name,
            total_images=total_images,
            chunk_size=chunk_size,
            distribution_order=payload.distribution_order,
            jobs=jobs_preview,
        ),
        message=f"{job_count} job(s) will be created",
        status_code=status.HTTP_200_OK,
    )


@router.post(
    "/projects/{project_id}/tasks/create-with-images",
    response_model=JsonResponse[TaskWithJobsResponse, None],
)
async def create_task_with_images(
    payload: TaskCreateWithMockImages,
    project: Annotated[dict, Depends(ProjectPermission("maintainer"))],
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)],
):
    """
    Create a task with images and automatic job chunking.
    
    This endpoint:
    1. Creates the task
    2. Calculates job count based on chunk size
    3. Creates jobs automatically
    4. Distributes images across jobs
    5. Returns task with jobs and duplicate warnings
    
    Note: Image upload is mocked - real S3/MinIO integration deferred.
    """
    # Prepare images list (potentially shuffle for random distribution)
    images_data = list(payload.images)
    if payload.distribution_order == "random":
        random.shuffle(images_data)
    
    total_images = len(images_data)
    chunk_size = payload.chunk_size
    
    # Create the task first
    task_data = {
        "name": payload.name,
        "description": payload.description,
        "assignee_id": payload.assignee_id,
        "total_images": total_images,
    }
    task = await TaskRepository.create(connection, project["id"], task_data)
    task_id = task["id"]
    
    # Calculate job count
    job_count = (total_images + chunk_size - 1) // chunk_size
    
    # Create jobs
    created_jobs = []
    for i in range(job_count):
        start_idx = i * chunk_size
        end_idx = min((i + 1) * chunk_size, total_images)
        image_count = end_idx - start_idx
        
        job_data = {
            "sequence_number": i,
            "assignee_id": payload.assignee_id,  # Optionally assign all jobs to same person
            "total_images": image_count,
        }
        job = await JobRepository.create(connection, task_id, job_data)
        
        # Create images for this job (mocked S3 keys)
        job_images = images_data[start_idx:end_idx]
        for seq_num, img_input in enumerate(job_images):
            # Generate mock S3 key and checksum if not provided
            checksum = img_input.checksum_sha256 or hashlib.sha256(
                f"{project['slug']}/{task_id}/{job['id']}/{img_input.filename}".encode()
            ).hexdigest()
            
            image_data = {
                "filename": img_input.filename,
                "s3_key": f"{project['slug']}/tasks/{task_id}/jobs/{job['id']}/{img_input.filename}",
                "s3_bucket": "annotate-anu",
                "width": img_input.width,
                "height": img_input.height,
                "file_size_bytes": img_input.file_size_bytes,
                "mime_type": f"image/{img_input.filename.split('.')[-1].lower()}",
                "checksum_sha256": checksum,
                "sequence_number": seq_num,
            }
            await ImageRepository.create(connection, job["id"], image_data)
        
        created_jobs.append(job)

    return JsonResponse(
        data=TaskWithJobsResponse(
            task=TaskResponse(**task),
            jobs=[JobResponse(**j) for j in created_jobs],
            total_images=total_images,
            duplicate_count=0,  # Duplicate detection not yet implemented
            duplicate_filenames=[],
        ),
        message=f"Task created with {job_count} job(s) and {total_images} image(s)",
        status_code=status.HTTP_201_CREATED,
    )


@router.post(
    "/projects/{project_id}/tasks/create-with-file-paths",
    response_model=JsonResponse[TaskWithJobsResponse, None],
)
async def create_task_with_file_paths(
    payload: TaskCreateWithFilePaths,
    project: Annotated[dict, Depends(ProjectPermission("maintainer"))],
    current_user: Annotated[UserBase, Depends(get_current_active_user)],
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)],
):
    """
    Create a task with images from file share paths.

    This endpoint:
    1. Registers file paths as shared_images (if not already registered)
    2. Adds images to project pool (if not already in pool)
    3. Creates the task with job chunking
    4. Links job images to shared_images via shared_image_id

    File paths must exist in the file share directory (/data/share).
    """
    project_id = project["id"]

    # Step 1: Register file paths as shared_images
    shared_images_list = []
    failed_paths = []

    for file_path in payload.file_paths:
        # Check if already registered
        existing = await SharedImageRepository.get_by_file_path(connection, file_path)
        if existing:
            shared_images_list.append(existing)
            continue

        # Validate file exists and get metadata
        try:
            absolute_path = _filesystem_service.get_absolute_path(file_path)
            if not absolute_path.exists():
                failed_paths.append(file_path)
                continue

            # Get image info
            image_info = await _thumbnail_service.get_image_info(file_path)

            # Create shared image record
            image_data = {
                "file_path": file_path,
                "filename": absolute_path.name,
                "width": image_info.get("width"),
                "height": image_info.get("height"),
                "file_size_bytes": image_info.get("size"),
                "mime_type": image_info.get("mime_type"),
                "registered_by": current_user.id,
            }
            shared_image = await SharedImageRepository.create(connection, image_data)
            shared_images_list.append(shared_image)
        except Exception:
            failed_paths.append(file_path)

    if not shared_images_list:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No valid images found in the provided file paths",
        )

    # Step 2: Add images to project pool (if not already)
    for shared_image in shared_images_list:
        await ProjectImageRepository.add_to_pool(
            connection,
            project_id=project_id,
            shared_image_id=shared_image["id"],
            user_id=current_user.id,
        )

    # Step 3: Prepare images list (potentially shuffle for random distribution)
    if payload.distribution_order == "random":
        random.shuffle(shared_images_list)

    total_images = len(shared_images_list)
    chunk_size = payload.chunk_size

    # Step 4: Create the task
    task_data = {
        "name": payload.name,
        "description": payload.description,
        "assignee_id": payload.assignee_id,
        "total_images": total_images,
    }
    task = await TaskRepository.create(connection, project_id, task_data)
    task_id = task["id"]

    # Step 5: Calculate job count and create jobs
    job_count = (total_images + chunk_size - 1) // chunk_size

    created_jobs = []
    for i in range(job_count):
        start_idx = i * chunk_size
        end_idx = min((i + 1) * chunk_size, total_images)
        image_count = end_idx - start_idx

        job_data = {
            "sequence_number": i,
            "assignee_id": payload.assignee_id,
            "total_images": image_count,
        }
        job = await JobRepository.create(connection, task_id, job_data)

        # Create images for this job with shared_image_id reference
        job_images = shared_images_list[start_idx:end_idx]
        for seq_num, shared_img in enumerate(job_images):
            image_data = {
                "filename": shared_img["filename"],
                "s3_key": shared_img["file_path"],  # Use file_path as s3_key for now
                "s3_bucket": "file-share",  # Marker to indicate file share storage
                "width": shared_img["width"] or 1920,
                "height": shared_img["height"] or 1080,
                "file_size_bytes": shared_img.get("file_size_bytes"),
                "mime_type": shared_img.get("mime_type"),
                "checksum_sha256": shared_img.get("checksum_sha256"),
                "sequence_number": seq_num,
                "shared_image_id": shared_img["id"],  # Link to shared image registry
            }
            await ImageRepository.create(connection, job["id"], image_data)

        created_jobs.append(job)

    return JsonResponse(
        data=TaskWithJobsResponse(
            task=TaskResponse(**task),
            jobs=[JobResponse(**j) for j in created_jobs],
            total_images=total_images,
            duplicate_count=len(failed_paths),
            duplicate_filenames=failed_paths,  # Reusing field for failed paths
        ),
        message=f"Task created with {job_count} job(s) and {total_images} image(s)",
        status_code=status.HTTP_201_CREATED,
    )

