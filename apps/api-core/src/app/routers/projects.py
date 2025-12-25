"""Project router with CRUD operations."""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncConnection

from app.dependencies.auth import get_admin_user, get_current_active_user
from app.dependencies.database import get_async_transaction_conn
from app.dependencies.rbac import ProjectPermission
from app.helpers.response_api import JsonResponse
from app.repositories.activity import ProjectActivityRepository
from app.repositories.project import LabelRepository, ProjectMemberRepository, ProjectRepository
from app.schemas.activity import ActivityListMeta, ProjectActivityCreate, ProjectActivityResponse
from app.schemas.auth import UserBase
from app.schemas.project import (
    LabelCreate,
    LabelResponse,
    LabelUpdate,
    ProjectCreate,
    ProjectDetailResponse,
    ProjectMemberCreate,
    ProjectMemberResponse,
    ProjectMemberUpdate,
    ProjectResponse,
    ProjectUpdate,
)

router = APIRouter(prefix="/api/v1/projects", tags=["Projects"])


# ============================================================================
# Project CRUD
# ============================================================================
@router.get("", response_model=JsonResponse[list[ProjectResponse], None])
async def list_projects(
    current_user: Annotated[UserBase, Depends(get_current_active_user)],
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)],
    include_archived: bool = False,
):
    """List projects accessible to current user."""
    projects = await ProjectRepository.list_for_user(
        connection, current_user.id, include_archived
    )
    return JsonResponse(
        data=[ProjectResponse(**p) for p in projects],
        message=f"Found {len(projects)} project(s)",
        status_code=status.HTTP_200_OK,
    )


@router.post("", response_model=JsonResponse[ProjectResponse, None])
async def create_project(
    payload: ProjectCreate,
    current_user: Annotated[UserBase, Depends(get_current_active_user)],
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)],
):
    """Create a new project."""
    # Only admins and members can create projects
    if current_user.role not in ["admin", "member"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only admins and members can create projects"
        )

    project_data = payload.model_dump()
    project_data["owner_id"] = current_user.id
    
    try:
        project = await ProjectRepository.create(connection, project_data)
        
        # Auto-add creator as maintainer
        await ProjectMemberRepository.create(
            connection,
            project["id"],
            {"user_id": current_user.id, "role": "maintainer"}
        )

        # Auto-create "Uncategorized" category for the new project
        from uuid import uuid4
        from datetime import datetime, timezone
        from sqlalchemy import insert
        from app.models.data_management import tag_categories

        uncategorized_category = {
            "id": uuid4(),
            "project_id": project["id"],
            "name": "uncategorized",
            "display_name": "Uncategorized",
            "color": "#9CA3AF",
            "sidebar_order": -1,  # Show first
            "created_at": datetime.now(timezone.utc),
        }

        stmt = insert(tag_categories).values(**uncategorized_category)
        await connection.execute(stmt)

        return JsonResponse(
            data=ProjectResponse(**project),
            message="Project created successfully",
            status_code=status.HTTP_201_CREATED,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.get("/{project_id}", response_model=JsonResponse[ProjectDetailResponse, None])
async def get_project(
    project: Annotated[dict, Depends(ProjectPermission("viewer"))],
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)],
):
    """Get project details with labels and counts."""
    # Get labels
    project_id = project["id"]
    labels = await LabelRepository.list_for_project(connection, project_id)
    member_count = await ProjectMemberRepository.get_member_count(connection, project_id)
    task_count = await ProjectRepository.get_task_count(connection, project_id)
    
    response = ProjectDetailResponse(
        **{k: v for k, v in project.items() if not k.startswith("_")},
        labels=[LabelResponse(**lb) for lb in labels],
        member_count=member_count,
        task_count=task_count,
        user_role=project.get("_user_role", "viewer"),
    )
    
    return JsonResponse(
        data=response,
        message="Project retrieved successfully",
        status_code=status.HTTP_200_OK,
    )


@router.patch("/{project_id}", response_model=JsonResponse[ProjectResponse, None])
async def update_project(
    payload: ProjectUpdate,
    project: Annotated[dict, Depends(ProjectPermission("maintainer"))],
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)],
):
    """Update a project. Requires maintainer role."""
    update_data = payload.model_dump(exclude_unset=True)
    if not update_data:
        return JsonResponse(
            data=ProjectResponse(**{k: v for k, v in project.items() if not k.startswith("_")}),
            message="No changes",
            status_code=status.HTTP_200_OK,
        )
    
    updated = await ProjectRepository.update(connection, project["id"], update_data)
    return JsonResponse(
        data=ProjectResponse(**updated),
        message="Project updated successfully",
        status_code=status.HTTP_200_OK,
    )


@router.post("/{project_id}/archive", response_model=JsonResponse[ProjectResponse, None])
async def archive_project(
    project_id: int,
    current_user: Annotated[UserBase, Depends(get_admin_user)],
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)],
):
    """Archive a project. Requires admin role."""
    project = await ProjectRepository.get_by_id(connection, project_id)
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
        
    updated = await ProjectRepository.update(connection, project_id, {"is_archived": True})
    return JsonResponse(
        data=ProjectResponse(**updated),
        message="Project archived successfully",
        status_code=status.HTTP_200_OK,
    )


@router.post("/{project_id}/unarchive", response_model=JsonResponse[ProjectResponse, None])
async def unarchive_project(
    project_id: int,
    current_user: Annotated[UserBase, Depends(get_admin_user)],
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)],
):
    """Unarchive a project. Requires admin role."""
    project = await ProjectRepository.get_by_id(connection, project_id)
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
        
    updated = await ProjectRepository.update(connection, project_id, {"is_archived": False})
    return JsonResponse(
        data=ProjectResponse(**updated),
        message="Project unarchived successfully",
        status_code=status.HTTP_200_OK,
    )


@router.delete("/{project_id}")
async def delete_project(
    project_id: int,
    current_user: Annotated[UserBase, Depends(get_admin_user)],
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)],
):
    """Delete a project. Requires admin role and archived status."""
    project = await ProjectRepository.get_by_id(connection, project_id)
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    if not project["is_archived"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, 
            detail="Project must be archived before deletion"
        )
    
    await ProjectRepository.delete(connection, project_id)
    return JsonResponse(
        data={"deleted": True},
        message="Project deleted successfully",
        status_code=status.HTTP_200_OK,
    )


# ============================================================================
# Labels
# ============================================================================
@router.get("/{project_id}/labels", response_model=JsonResponse[list[LabelResponse], None])
async def list_labels(
    project: Annotated[dict, Depends(ProjectPermission("viewer"))],
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)],
):
    """List all labels for a project."""
    labels = await LabelRepository.list_for_project(connection, project["id"])
    return JsonResponse(
        data=[LabelResponse(**lb) for lb in labels],
        message=f"Found {len(labels)} label(s)",
        status_code=status.HTTP_200_OK,
    )


@router.post("/{project_id}/labels", response_model=JsonResponse[LabelResponse, None])
async def create_label(
    payload: LabelCreate,
    project: Annotated[dict, Depends(ProjectPermission("maintainer"))],
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)],
):
    """Create a new label. Requires maintainer role."""
    try:
        label = await LabelRepository.create(
            connection, project["id"], payload.model_dump()
        )
        return JsonResponse(
            data=LabelResponse(**label),
            message="Label created successfully",
            status_code=status.HTTP_201_CREATED,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.patch("/{project_id}/labels/{label_id}", response_model=JsonResponse[LabelResponse, None])
async def update_label(
    label_id: UUID,
    payload: LabelUpdate,
    project: Annotated[dict, Depends(ProjectPermission("maintainer"))],
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)],
):
    """Update a label. Requires maintainer role."""
    label = await LabelRepository.get_by_id(connection, label_id)
    if not label or label["project_id"] != project["id"]:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Label not found")
    
    update_data = payload.model_dump(exclude_unset=True)
    if not update_data:
        return JsonResponse(data=LabelResponse(**label), message="No changes", status_code=status.HTTP_200_OK)
    
    updated = await LabelRepository.update(connection, label_id, update_data)
    return JsonResponse(
        data=LabelResponse(**updated),
        message="Label updated successfully",
        status_code=status.HTTP_200_OK,
    )


@router.delete("/{project_id}/labels/{label_id}")
async def delete_label(
    label_id: UUID,
    project: Annotated[dict, Depends(ProjectPermission("maintainer"))],
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)],
):
    """Delete a label. Requires maintainer role."""
    label = await LabelRepository.get_by_id(connection, label_id)
    if not label or label["project_id"] != project["id"]:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Label not found")
    
    await LabelRepository.delete(connection, label_id)
    return JsonResponse(data={"deleted": True}, message="Label deleted", status_code=status.HTTP_200_OK)


# ============================================================================
# Members
# ============================================================================
@router.get("/{project_id}/members", response_model=JsonResponse[list[ProjectMemberResponse], None])
async def list_members(
    project: Annotated[dict, Depends(ProjectPermission("viewer"))],
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)],
):
    """List all members of a project with user info."""
    from sqlalchemy import select
    from app.models.user import users
    from app.schemas.project import MemberUserInfo
    
    members_raw = await ProjectMemberRepository.list_for_project(connection, project["id"])
    
    # Fetch user info for each member
    members_with_users = []
    for m in members_raw:
        # Get user data
        stmt = select(users.c.email, users.c.username, users.c.full_name).where(users.c.id == m["user_id"])
        result = await connection.execute(stmt)
        user_row = result.fetchone()
        
        user_info = None
        if user_row:
            user_info = MemberUserInfo(
                email=user_row.email,
                username=user_row.username,
                full_name=user_row.full_name,
            )
        
        members_with_users.append(ProjectMemberResponse(**m, user=user_info))
    
    return JsonResponse(
        data=members_with_users,
        message=f"Found {len(members_with_users)} member(s)",
        status_code=status.HTTP_200_OK,
    )


# Schema for available user (minimal info for dropdown)
from pydantic import BaseModel

class AvailableUser(BaseModel):
    id: str
    email: str
    username: str
    full_name: str | None


@router.get("/{project_id}/available-users", response_model=JsonResponse[list[AvailableUser], None])
async def list_available_users(
    project: Annotated[dict, Depends(ProjectPermission("maintainer"))],
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)],
):
    """List active users not already members of the project. Requires maintainer role."""
    from sqlalchemy import select, and_, not_
    from app.models.user import users
    from app.models.project import project_members
    
    # Get user IDs already in the project
    existing_member_ids_stmt = select(project_members.c.user_id).where(
        project_members.c.project_id == project["id"]
    )
    
    # Get active users not in the project
    stmt = select(
        users.c.id,
        users.c.email,
        users.c.username,
        users.c.full_name,
    ).where(
        and_(
            users.c.is_active == True,
            users.c.deleted_at.is_(None),
            not_(users.c.id.in_(existing_member_ids_stmt)),
        )
    ).order_by(users.c.full_name, users.c.username)
    
    result = await connection.execute(stmt)
    rows = result.fetchall()
    
    return JsonResponse(
        data=[
            AvailableUser(
                id=str(row.id),
                email=row.email,
                username=row.username,
                full_name=row.full_name,
            )
            for row in rows
        ],
        message=f"Found {len(rows)} available user(s)",
        status_code=status.HTTP_200_OK,
    )


@router.post("/{project_id}/members", response_model=JsonResponse[ProjectMemberResponse, None])
async def add_member(
    payload: ProjectMemberCreate,
    project: Annotated[dict, Depends(ProjectPermission("owner"))],
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)],
):
    """Add a member to a project. Requires owner role."""
    try:
        member = await ProjectMemberRepository.create(
            connection, project["id"], payload.model_dump()
        )
        return JsonResponse(
            data=ProjectMemberResponse(**member),
            message="Member added successfully",
            status_code=status.HTTP_201_CREATED,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.patch("/{project_id}/members/{member_id}", response_model=JsonResponse[ProjectMemberResponse, None])
async def update_member(
    member_id: UUID,
    payload: ProjectMemberUpdate,
    project: Annotated[dict, Depends(ProjectPermission("owner"))],
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)],
):
    """Update a member's role. Requires owner role."""
    member = await ProjectMemberRepository.get_by_id(connection, member_id)
    if not member or member["project_id"] != project["id"]:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found")
    
    update_data = payload.model_dump(exclude_unset=True)
    if not update_data:
        return JsonResponse(data=ProjectMemberResponse(**member), message="No changes", status_code=status.HTTP_200_OK)
    
    updated = await ProjectMemberRepository.update(connection, member_id, update_data)
    return JsonResponse(
        data=ProjectMemberResponse(**updated),
        message="Member updated successfully",
        status_code=status.HTTP_200_OK,
    )


@router.delete("/{project_id}/members/{member_id}")
async def remove_member(
    member_id: UUID,
    project: Annotated[dict, Depends(ProjectPermission("owner"))],
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)],
):
    """Remove a member from a project. Requires owner role."""
    member = await ProjectMemberRepository.get_by_id(connection, member_id)
    if not member or member["project_id"] != project["id"]:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found")
    
    await ProjectMemberRepository.delete(connection, member_id)
    return JsonResponse(data={"deleted": True}, message="Member removed", status_code=status.HTTP_200_OK)


# ============================================================================
# Activity / History
# ============================================================================
@router.get("/{project_id}/activity", response_model=JsonResponse[list[ProjectActivityResponse], ActivityListMeta])
async def list_activity(
    project: Annotated[dict, Depends(ProjectPermission("viewer"))],
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)],
    limit: int = Query(default=100, le=365, ge=1, description="Max activities to return"),
    offset: int = Query(default=0, ge=0, description="Offset for pagination"),
):
    """List project activity/history. Returns up to 365 most recent entries."""
    activities = await ProjectActivityRepository.list_for_project(
        connection, project["id"], limit=limit, offset=offset
    )
    total = await ProjectActivityRepository.count_for_project(connection, project["id"])
    
    return JsonResponse(
        data=[ProjectActivityResponse(**a) for a in activities],
        message=f"Found {len(activities)} of {total} activity entries",
        status_code=status.HTTP_200_OK,
        meta=ActivityListMeta(total=total, limit=limit, offset=offset),
    )


@router.post("/{project_id}/activity", response_model=JsonResponse[ProjectActivityResponse, None])
async def create_activity(
    payload: ProjectActivityCreate,
    project: Annotated[dict, Depends(ProjectPermission("annotator"))],
    current_user: Annotated[UserBase, Depends(get_current_active_user)],
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)],
):
    """Log a project activity entry. Used internally when tasks/jobs change."""
    activity = await ProjectActivityRepository.create(
        connection,
        project["id"],
        actor_id=current_user.id,
        actor_name=current_user.full_name or current_user.username,
        data=payload.model_dump(),
    )
    
    # Cleanup old entries (keep max 365)
    await ProjectActivityRepository.cleanup_old(connection, project["id"], keep_count=365)
    
    return JsonResponse(
        data=ProjectActivityResponse(**activity),
        message="Activity logged successfully",
        status_code=status.HTTP_201_CREATED,
    )

