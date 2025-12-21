"""Router for Tag Categories (project-scoped hierarchical tag organization)."""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncConnection

from app.dependencies.auth import get_current_active_user
from app.dependencies.database import get_async_transaction_conn
from app.dependencies.rbac import ProjectPermission
from app.helpers.response_api import JsonResponse
from app.repositories.tag_category import TagCategoryRepository
from app.schemas.auth import UserBase
from app.schemas.data_management import (
    TagCategoryCreate,
    TagCategoryReorderRequest,
    TagCategoryResponse,
    TagCategoryUpdate,
)

router = APIRouter(prefix="/api/v1/projects", tags=["Tag Categories"])


# ============================================================================
# List & Get
# ============================================================================
@router.get("/{project_id}/tag-categories", response_model=JsonResponse[list[TagCategoryResponse], None])
async def list_tag_categories(
    project: Annotated[dict, Depends(ProjectPermission("viewer"))],
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)],
    include_tags: bool = Query(default=False, description="Include nested tags"),
    include_tag_count: bool = Query(default=False, description="Include tag count"),
):
    """List all tag categories for a project with optional nested tags."""
    project_id = project["id"]

    if include_tag_count:
        categories = await TagCategoryRepository.list_with_tag_count(connection, project_id)
    else:
        categories = await TagCategoryRepository.list_for_project(
            connection, project_id, include_tags=include_tags
        )

    return JsonResponse(
        data=[TagCategoryResponse(**c) for c in categories],
        message=f"Found {len(categories)} category(ies)",
        status_code=status.HTTP_200_OK,
    )


@router.get("/{project_id}/tag-categories/{category_id}", response_model=JsonResponse[TagCategoryResponse, None])
async def get_tag_category(
    category_id: UUID,
    project: Annotated[dict, Depends(ProjectPermission("viewer"))],
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)],
):
    """Get tag category details with tag count."""
    project_id = project["id"]

    category = await TagCategoryRepository.get_by_id(connection, category_id, project_id)
    if not category:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Tag category not found in this project",
        )

    # Get tag count
    tag_count = await TagCategoryRepository.get_tag_count(connection, category_id, project_id)
    category["tag_count"] = tag_count

    return JsonResponse(
        data=TagCategoryResponse(**category),
        message="Tag category retrieved",
        status_code=status.HTTP_200_OK,
    )


# ============================================================================
# Create, Update, Delete
# ============================================================================
@router.post("/{project_id}/tag-categories", response_model=JsonResponse[TagCategoryResponse, None])
async def create_tag_category(
    payload: TagCategoryCreate,
    project: Annotated[dict, Depends(ProjectPermission("annotator"))],
    current_user: Annotated[UserBase, Depends(get_current_active_user)],
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)],
):
    """Create a new tag category in a project."""
    project_id = project["id"]

    # Check if name already exists in this project
    existing = await TagCategoryRepository.get_by_name(connection, payload.name, project_id)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Tag category with name '{payload.name}' already exists in this project",
        )

    category_data = payload.model_dump()
    category_data["created_by"] = current_user.id

    category = await TagCategoryRepository.create(connection, project_id, category_data)
    return JsonResponse(
        data=TagCategoryResponse(**category),
        message="Tag category created successfully",
        status_code=status.HTTP_201_CREATED,
    )


@router.patch("/{project_id}/tag-categories/{category_id}", response_model=JsonResponse[TagCategoryResponse, None])
async def update_tag_category(
    category_id: UUID,
    payload: TagCategoryUpdate,
    project: Annotated[dict, Depends(ProjectPermission("annotator"))],
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)],
):
    """Update a tag category in a project."""
    project_id = project["id"]

    category = await TagCategoryRepository.get_by_id(connection, category_id, project_id)
    if not category:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Tag category not found in this project",
        )

    # Check name uniqueness if updating name
    if payload.name and payload.name != category["name"]:
        existing = await TagCategoryRepository.get_by_name(connection, payload.name, project_id)
        if existing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Tag category with name '{payload.name}' already exists in this project",
            )

    update_data = payload.model_dump(exclude_unset=True)
    if not update_data:
        return JsonResponse(
            data=TagCategoryResponse(**category),
            message="No changes",
            status_code=status.HTTP_200_OK,
        )

    updated_category = await TagCategoryRepository.update(
        connection, category_id, project_id, update_data
    )
    return JsonResponse(
        data=TagCategoryResponse(**updated_category),
        message="Tag category updated successfully",
        status_code=status.HTTP_200_OK,
    )


@router.delete("/{project_id}/tag-categories/{category_id}", response_model=JsonResponse[None, None])
async def delete_tag_category(
    category_id: UUID,
    project: Annotated[dict, Depends(ProjectPermission("maintainer"))],
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)],
):
    """Delete a tag category from a project.

    Note: Tags with this category_id will have their category_id set to NULL.
    """
    project_id = project["id"]

    category = await TagCategoryRepository.get_by_id(connection, category_id, project_id)
    if not category:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Tag category not found in this project",
        )

    await TagCategoryRepository.delete(connection, category_id, project_id)
    return JsonResponse(
        data=None,
        message="Tag category deleted successfully",
        status_code=status.HTTP_200_OK,
    )


# ============================================================================
# Reorder
# ============================================================================
@router.post("/{project_id}/tag-categories/reorder", response_model=JsonResponse[list[TagCategoryResponse], None])
async def reorder_tag_categories(
    payload: TagCategoryReorderRequest,
    project: Annotated[dict, Depends(ProjectPermission("annotator"))],
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)],
):
    """Update sidebar order for multiple tag categories."""
    project_id = project["id"]

    updated_categories = await TagCategoryRepository.reorder(
        connection, project_id, payload.category_orders
    )

    return JsonResponse(
        data=[TagCategoryResponse(**c) for c in updated_categories],
        message=f"Reordered {len(updated_categories)} category(ies)",
        status_code=status.HTTP_200_OK,
    )
