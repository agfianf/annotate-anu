"""Task router with CRUD operations."""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncConnection

from app.dependencies.database import get_async_transaction_conn
from app.dependencies.rbac import ProjectPermission, TaskPermission
from app.helpers.response_api import JsonResponse
from app.repositories.task import TaskRepository
from app.schemas.task import TaskCreate, TaskDetailResponse, TaskResponse, TaskUpdate

router = APIRouter(prefix="/api/v1", tags=["Tasks"])


@router.get("/projects/{project_id}/tasks", response_model=JsonResponse[list[TaskResponse], None])
async def list_tasks(
    project: Annotated[dict, Depends(ProjectPermission("viewer"))],
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)],
    task_status: str | None = None,
):
    """List all tasks for a project."""
    tasks = await TaskRepository.list_for_project(
        connection, project["id"], status=task_status
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


@router.delete("/tasks/{task_id}")
async def delete_task(
    task: Annotated[dict, Depends(TaskPermission("maintainer"))],
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)],
):
    """Delete a task. Requires maintainer role."""
    await TaskRepository.delete(connection, task["id"])
    return JsonResponse(
        data={"deleted": True},
        message="Task deleted successfully",
        status_code=status.HTTP_200_OK,
    )
