"""Router for Tags (project-scoped user-defined tags)."""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncConnection

from app.dependencies.auth import get_current_active_user
from app.dependencies.database import get_async_transaction_conn
from app.dependencies.rbac import ProjectPermission
from app.helpers.response_api import JsonResponse
from app.repositories.tag import TagRepository
from app.schemas.auth import UserBase
from app.schemas.data_management import TagCreate, TagResponse, TagUpdate

router = APIRouter(prefix="/api/v1/projects", tags=["Tags"])


# ============================================================================
# List & Get
# ============================================================================
@router.get("/{project_id}/tags", response_model=JsonResponse[list[TagResponse], None])
async def list_tags(
    project: Annotated[dict, Depends(ProjectPermission("viewer"))],
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)],
    search: str | None = Query(default=None, max_length=100),
    include_usage_count: bool = Query(default=False),
):
    """List all tags for a project with optional search."""
    project_id = project["id"]

    if include_usage_count:
        tags = await TagRepository.list_with_usage_count(connection, project_id, search)
    else:
        tags = await TagRepository.list_for_project(connection, project_id, search)

    return JsonResponse(
        data=[TagResponse(**t) for t in tags],
        message=f"Found {len(tags)} tag(s)",
        status_code=status.HTTP_200_OK,
    )


@router.get("/{project_id}/tags/{tag_id}", response_model=JsonResponse[TagResponse, None])
async def get_tag(
    tag_id: UUID,
    project: Annotated[dict, Depends(ProjectPermission("viewer"))],
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)],
):
    """Get tag details with usage count."""
    project_id = project["id"]

    tag = await TagRepository.get_by_id(connection, tag_id, project_id)
    if not tag:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Tag not found in this project",
        )

    # Get usage count
    usage_count = await TagRepository.get_usage_count(connection, tag_id, project_id)
    tag["usage_count"] = usage_count

    return JsonResponse(
        data=TagResponse(**tag),
        message="Tag retrieved",
        status_code=status.HTTP_200_OK,
    )


# ============================================================================
# Create, Update, Delete
# ============================================================================
@router.post("/{project_id}/tags", response_model=JsonResponse[TagResponse, None])
async def create_tag(
    payload: TagCreate,
    project: Annotated[dict, Depends(ProjectPermission("annotator"))],
    current_user: Annotated[UserBase, Depends(get_current_active_user)],
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)],
):
    """Create a new tag in a project."""
    project_id = project["id"]

    # Check if name already exists in this project
    existing = await TagRepository.get_by_name(connection, payload.name, project_id)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Tag with name '{payload.name}' already exists in this project",
        )

    tag_data = payload.model_dump()
    tag_data["created_by"] = current_user.id

    tag = await TagRepository.create(connection, project_id, tag_data)
    return JsonResponse(
        data=TagResponse(**tag),
        message="Tag created successfully",
        status_code=status.HTTP_201_CREATED,
    )


@router.patch("/{project_id}/tags/{tag_id}", response_model=JsonResponse[TagResponse, None])
async def update_tag(
    tag_id: UUID,
    payload: TagUpdate,
    project: Annotated[dict, Depends(ProjectPermission("annotator"))],
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)],
):
    """Update a tag in a project."""
    project_id = project["id"]

    tag = await TagRepository.get_by_id(connection, tag_id, project_id)
    if not tag:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Tag not found in this project",
        )

    # Check name uniqueness if updating name
    if payload.name and payload.name != tag["name"]:
        existing = await TagRepository.get_by_name(connection, payload.name, project_id)
        if existing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Tag with name '{payload.name}' already exists in this project",
            )

    update_data = payload.model_dump(exclude_unset=True)
    if not update_data:
        return JsonResponse(
            data=TagResponse(**tag),
            message="No changes",
            status_code=status.HTTP_200_OK,
        )

    updated_tag = await TagRepository.update(connection, tag_id, project_id, update_data)
    return JsonResponse(
        data=TagResponse(**updated_tag),
        message="Tag updated successfully",
        status_code=status.HTTP_200_OK,
    )


@router.delete("/{project_id}/tags/{tag_id}", response_model=JsonResponse[None, None])
async def delete_tag(
    tag_id: UUID,
    project: Annotated[dict, Depends(ProjectPermission("maintainer"))],
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)],
):
    """Delete a tag from a project."""
    project_id = project["id"]

    tag = await TagRepository.get_by_id(connection, tag_id, project_id)
    if not tag:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Tag not found in this project",
        )

    await TagRepository.delete(connection, tag_id, project_id)
    return JsonResponse(
        data=None,
        message="Tag deleted successfully",
        status_code=status.HTTP_200_OK,
    )
