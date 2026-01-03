"""Admin router for user management (admin only)."""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import delete, func, select, update, union_all, literal_column
from sqlalchemy.ext.asyncio import AsyncConnection

from app.dependencies.auth import get_admin_user
from app.dependencies.database import get_async_transaction_conn
from app.helpers.response_api import JsonResponse
from app.models.job import jobs
from app.models.task import tasks
from app.models.user import users
from app.schemas.auth import UserBase, UserResponse

router = APIRouter(prefix="/api/v1/admin", tags=["Admin"])


# ============================================================================
# Schemas
# ============================================================================
class RoleUpdate(BaseModel):
    """Schema for updating user role."""

    role: str


class ActiveUpdate(BaseModel):
    """Schema for toggling user active status."""

    is_active: bool


class RecentActivityItem(BaseModel):
    """Schema for a recent activity item."""

    id: int
    type: str  # 'task' or 'job'
    name: str
    status: str
    updated_at: str


class UserActivityResponse(BaseModel):
    """Schema for user activity response."""

    assigned_tasks: int
    assigned_jobs: int
    completed_jobs: int
    completion_rate: int
    recent_items: list[RecentActivityItem]


# ============================================================================
# User Management
# ============================================================================
@router.get("/users", response_model=JsonResponse[list[UserResponse], None])
async def list_users(
    current_user: Annotated[UserBase, Depends(get_admin_user)],
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)],
):
    """List all users. Admin only.

    Returns
    -------
    JsonResponse[list[UserResponse], None]
        List of all users
    """
    result = await connection.execute(
        select(users).order_by(users.c.created_at.desc())
    )
    rows = result.mappings().all()

    return JsonResponse(
        data=[
            UserResponse(
                id=u["id"],
                email=u["email"],
                username=u["username"],
                full_name=u["full_name"],
                role=u["role"],
                is_active=u["is_active"],
                created_at=u["created_at"],
            )
            for u in rows
        ],
        message=f"Found {len(rows)} user(s)",
        status_code=status.HTTP_200_OK,
    )


@router.patch("/users/{user_id}/role", response_model=JsonResponse[UserResponse, None])
async def update_user_role(
    user_id: UUID,
    payload: RoleUpdate,
    current_user: Annotated[UserBase, Depends(get_admin_user)],
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)],
):
    """Update user role. Admin only.

    Parameters
    ----------
    user_id : UUID
        User ID to update
    payload : RoleUpdate
        New role

    Returns
    -------
    JsonResponse[UserResponse, None]
        Updated user
    """
    valid_roles = ["admin", "member", "annotator"]
    if payload.role not in valid_roles:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid role. Must be one of: {', '.join(valid_roles)}",
        )

    # Prevent admin from removing their own admin role
    if user_id == current_user.id and payload.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot remove your own admin role",
        )

    result = await connection.execute(
        update(users)
        .where(users.c.id == user_id)
        .values(role=payload.role)
        .returning(users)
    )
    user = result.mappings().first()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    return JsonResponse(
        data=UserResponse(
            id=user["id"],
            email=user["email"],
            username=user["username"],
            full_name=user["full_name"],
            role=user["role"],
            is_active=user["is_active"],
            created_at=user["created_at"],
        ),
        message="User role updated",
        status_code=status.HTTP_200_OK,
    )


@router.patch("/users/{user_id}/active", response_model=JsonResponse[UserResponse, None])
async def toggle_user_active(
    user_id: UUID,
    payload: ActiveUpdate,
    current_user: Annotated[UserBase, Depends(get_admin_user)],
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)],
):
    """Toggle user active status. Admin only.

    Parameters
    ----------
    user_id : UUID
        User ID to update
    payload : ActiveUpdate
        New active status

    Returns
    -------
    JsonResponse[UserResponse, None]
        Updated user
    """
    # Prevent admin from deactivating themselves
    if user_id == current_user.id and not payload.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot deactivate your own account",
        )

    result = await connection.execute(
        update(users)
        .where(users.c.id == user_id)
        .values(is_active=payload.is_active)
        .returning(users)
    )
    user = result.mappings().first()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    return JsonResponse(
        data=UserResponse(
            id=user["id"],
            email=user["email"],
            username=user["username"],
            full_name=user["full_name"],
            role=user["role"],
            is_active=user["is_active"],
            created_at=user["created_at"],
        ),
        message=f"User {'activated' if payload.is_active else 'deactivated'}",
        status_code=status.HTTP_200_OK,
    )


@router.delete("/users/{user_id}")
async def delete_user(
    user_id: UUID,
    current_user: Annotated[UserBase, Depends(get_admin_user)],
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)],
):
    """Delete a user. Admin only.

    Parameters
    ----------
    user_id : UUID
        User ID to delete

    Returns
    -------
    JsonResponse[dict, None]
        Success confirmation
    """
    # Prevent admin from deleting themselves
    if user_id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete your own account",
        )

    result = await connection.execute(
        delete(users).where(users.c.id == user_id).returning(users.c.id)
    )
    deleted = result.scalar_one_or_none()

    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    return JsonResponse(
        data={"deleted": True},
        message="User deleted",
        status_code=status.HTTP_200_OK,
    )


@router.get("/users/{user_id}/activity", response_model=JsonResponse[UserActivityResponse, None])
async def get_user_activity(
    user_id: UUID,
    current_user: Annotated[UserBase, Depends(get_admin_user)],
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)],
):
    """Get user activity stats. Admin only.

    Parameters
    ----------
    user_id : UUID
        User ID to get activity for

    Returns
    -------
    JsonResponse[UserActivityResponse, None]
        User activity stats including assigned tasks, jobs, and completion rate
    """
    # Count assigned tasks
    task_count_result = await connection.execute(
        select(func.count()).select_from(tasks).where(tasks.c.assignee_id == user_id)
    )
    assigned_tasks = task_count_result.scalar() or 0

    # Count assigned jobs
    job_count_result = await connection.execute(
        select(func.count()).select_from(jobs).where(jobs.c.assignee_id == user_id)
    )
    assigned_jobs = job_count_result.scalar() or 0

    # Count completed jobs
    completed_result = await connection.execute(
        select(func.count())
        .select_from(jobs)
        .where(
            jobs.c.assignee_id == user_id,
            jobs.c.status.in_(["completed", "approved"]),
        )
    )
    completed_jobs = completed_result.scalar() or 0

    # Calculate completion rate
    completion_rate = (
        int((completed_jobs / assigned_jobs) * 100) if assigned_jobs > 0 else 0
    )

    # Get recent tasks
    recent_tasks_query = (
        select(
            tasks.c.id,
            literal_column("'task'").label("type"),
            tasks.c.name,
            tasks.c.status,
            tasks.c.updated_at,
        )
        .where(tasks.c.assignee_id == user_id)
        .order_by(tasks.c.updated_at.desc())
        .limit(5)
    )

    # Get recent jobs (construct name from task_id and sequence)
    recent_jobs_query = (
        select(
            jobs.c.id,
            literal_column("'job'").label("type"),
            func.concat("Job #", jobs.c.id).label("name"),
            jobs.c.status,
            jobs.c.updated_at,
        )
        .where(jobs.c.assignee_id == user_id)
        .order_by(jobs.c.updated_at.desc())
        .limit(5)
    )

    # Union and sort by updated_at
    combined_query = (
        union_all(recent_tasks_query, recent_jobs_query)
        .order_by(literal_column("updated_at").desc())
        .limit(10)
    )

    recent_result = await connection.execute(combined_query)
    recent_rows = recent_result.mappings().all()

    recent_items = [
        RecentActivityItem(
            id=row["id"],
            type=row["type"],
            name=row["name"],
            status=row["status"],
            updated_at=row["updated_at"].isoformat() if row["updated_at"] else "",
        )
        for row in recent_rows
    ]

    return JsonResponse(
        data=UserActivityResponse(
            assigned_tasks=assigned_tasks,
            assigned_jobs=assigned_jobs,
            completed_jobs=completed_jobs,
            completion_rate=completion_rate,
            recent_items=recent_items,
        ),
        message="User activity retrieved",
        status_code=status.HTTP_200_OK,
    )
