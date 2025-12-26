"""Export router with CRUD operations for exports and saved filters."""

from pathlib import Path
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncConnection

from app.config import settings
from app.dependencies.auth import get_current_active_user
from app.dependencies.database import get_async_transaction_conn
from app.dependencies.rbac import ProjectPermission
from app.helpers.response_api import JsonResponse
from app.models.data_management import tag_categories, tags
from app.models.project import labels
from app.repositories.export import ExportRepository, SavedFilterRepository
from app.schemas.auth import UserBase
from app.schemas.export import (
    ClassificationOptionsResponse,
    ExportCreate,
    ExportListResponse,
    ExportPreview,
    ExportResponse,
    ExportSummary,
    SavedFilterCreate,
    SavedFilterResponse,
    SavedFilterUpdate,
)
from app.services.export import ExportService
from sqlalchemy import select


router = APIRouter(prefix="/api/v1/projects", tags=["Exports"])


# ============================================================================
# Saved Filters CRUD
# ============================================================================
@router.get(
    "/{project_id}/saved-filters",
    response_model=JsonResponse[list[SavedFilterResponse], None],
)
async def list_saved_filters(
    project: Annotated[dict, Depends(ProjectPermission("viewer"))],
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)],
):
    """List all saved filters for a project."""
    filters = await SavedFilterRepository.list_for_project(connection, project["id"])
    return JsonResponse(
        data=[SavedFilterResponse(**f) for f in filters],
        message=f"Found {len(filters)} saved filter(s)",
        status_code=status.HTTP_200_OK,
    )


@router.post(
    "/{project_id}/saved-filters",
    response_model=JsonResponse[SavedFilterResponse, None],
)
async def create_saved_filter(
    project: Annotated[dict, Depends(ProjectPermission("annotator"))],
    payload: SavedFilterCreate,
    current_user: Annotated[UserBase, Depends(get_current_active_user)],
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)],
):
    """Create a new saved filter."""
    # Check if name already exists
    existing = await SavedFilterRepository.get_by_name(
        connection, project["id"], payload.name
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Saved filter with name '{payload.name}' already exists",
        )

    filter_data = await SavedFilterRepository.create(
        connection,
        project_id=project["id"],
        name=payload.name,
        description=payload.description,
        filter_config=payload.filter_config.model_dump(),
        user_id=current_user.id,
    )

    return JsonResponse(
        data=SavedFilterResponse(**filter_data),
        message="Saved filter created successfully",
        status_code=status.HTTP_201_CREATED,
    )


@router.get(
    "/{project_id}/saved-filters/{filter_id}",
    response_model=JsonResponse[SavedFilterResponse, None],
)
async def get_saved_filter(
    project: Annotated[dict, Depends(ProjectPermission("viewer"))],
    filter_id: UUID,
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)],
):
    """Get a saved filter by ID."""
    filter_data = await SavedFilterRepository.get_by_id(connection, filter_id)
    if not filter_data or filter_data["project_id"] != project["id"]:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Saved filter not found",
        )

    return JsonResponse(
        data=SavedFilterResponse(**filter_data),
        message="Saved filter retrieved",
        status_code=status.HTTP_200_OK,
    )


@router.patch(
    "/{project_id}/saved-filters/{filter_id}",
    response_model=JsonResponse[SavedFilterResponse, None],
)
async def update_saved_filter(
    project: Annotated[dict, Depends(ProjectPermission("annotator"))],
    filter_id: UUID,
    payload: SavedFilterUpdate,
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)],
):
    """Update a saved filter."""
    filter_data = await SavedFilterRepository.get_by_id(connection, filter_id)
    if not filter_data or filter_data["project_id"] != project["id"]:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Saved filter not found",
        )

    update_data = payload.model_dump(exclude_unset=True)
    if "filter_config" in update_data and update_data["filter_config"]:
        update_data["filter_config"] = update_data["filter_config"].model_dump()

    if "name" in update_data:
        existing = await SavedFilterRepository.get_by_name(
            connection, project["id"], update_data["name"]
        )
        if existing and existing["id"] != filter_id:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Saved filter with name '{update_data['name']}' already exists",
            )

    updated = await SavedFilterRepository.update(connection, filter_id, **update_data)

    return JsonResponse(
        data=SavedFilterResponse(**updated),
        message="Saved filter updated",
        status_code=status.HTTP_200_OK,
    )


@router.delete(
    "/{project_id}/saved-filters/{filter_id}",
    response_model=JsonResponse[None, None],
)
async def delete_saved_filter(
    project: Annotated[dict, Depends(ProjectPermission("maintainer"))],
    filter_id: UUID,
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)],
):
    """Delete a saved filter."""
    filter_data = await SavedFilterRepository.get_by_id(connection, filter_id)
    if not filter_data or filter_data["project_id"] != project["id"]:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Saved filter not found",
        )

    await SavedFilterRepository.delete(connection, filter_id)

    return JsonResponse(
        data=None,
        message="Saved filter deleted",
        status_code=status.HTTP_200_OK,
    )


# ============================================================================
# Exports CRUD
# ============================================================================
@router.post(
    "/{project_id}/exports/preview",
    response_model=JsonResponse[ExportPreview, None],
)
async def preview_export(
    project: Annotated[dict, Depends(ProjectPermission("annotator"))],
    payload: ExportCreate,
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)],
):
    """Preview export counts without creating the export."""
    service = ExportService()
    preview = await service.preview_export(connection, project["id"], payload)

    return JsonResponse(
        data=preview,
        message="Export preview generated",
        status_code=status.HTTP_200_OK,
    )


# NOTE: This route MUST come before /{project_id}/exports/{export_id} to avoid
# "classification-options" being parsed as a UUID
@router.get(
    "/{project_id}/exports/classification-options",
    response_model=JsonResponse[ClassificationOptionsResponse, None],
)
async def get_classification_options(
    project: Annotated[dict, Depends(ProjectPermission("viewer"))],
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)],
):
    """Get available classification options for export wizard."""
    # Helper to convert UUIDs to strings for JSON serialization
    def serialize_row(row_dict: dict) -> dict:
        return {
            k: str(v) if isinstance(v, UUID) else v
            for k, v in row_dict.items()
        }

    # Get tag categories with tags
    categories_query = (
        select(tag_categories)
        .where(tag_categories.c.project_id == project["id"])
        .order_by(tag_categories.c.sidebar_order, tag_categories.c.name)
    )
    categories_result = await connection.execute(categories_query)
    categories_data = [serialize_row(dict(row._mapping)) for row in categories_result.fetchall()]

    # Get tags for each category
    for category in categories_data:
        tags_query = (
            select(tags)
            .where(tags.c.category_id == category["id"])
            .order_by(tags.c.name)
        )
        tags_result = await connection.execute(tags_query)
        category["tags"] = [serialize_row(dict(row._mapping)) for row in tags_result.fetchall()]

    # Get annotation labels
    labels_query = (
        select(labels)
        .where(labels.c.project_id == project["id"])
        .order_by(labels.c.name)
    )
    labels_result = await connection.execute(labels_query)
    labels_data = [serialize_row(dict(row._mapping)) for row in labels_result.fetchall()]

    return JsonResponse(
        data=ClassificationOptionsResponse(
            categories=categories_data,
            labels=labels_data,
        ),
        message="Classification options retrieved",
        status_code=status.HTTP_200_OK,
    )


@router.post(
    "/{project_id}/exports",
    response_model=JsonResponse[ExportResponse, None],
)
async def create_export(
    project: Annotated[dict, Depends(ProjectPermission("maintainer"))],
    payload: ExportCreate,
    current_user: Annotated[UserBase, Depends(get_current_active_user)],
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)],
):
    """Create a new export job."""
    service = ExportService()
    export_data = await service.create_export(
        connection, project["id"], payload, current_user.id
    )

    return JsonResponse(
        data=ExportResponse(**export_data),
        message="Export job created and queued",
        status_code=status.HTTP_202_ACCEPTED,
    )


@router.get(
    "/{project_id}/exports",
    response_model=JsonResponse[ExportListResponse, None],
)
async def list_exports(
    project: Annotated[dict, Depends(ProjectPermission("viewer"))],
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)],
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    status_filter: str | None = Query(default=None, alias="status"),
    export_mode: str | None = Query(default=None),
):
    """List export history for a project."""
    exports, total = await ExportRepository.list_for_project(
        connection,
        project["id"],
        page=page,
        page_size=page_size,
        status=status_filter,
        export_mode=export_mode,
    )

    return JsonResponse(
        data=ExportListResponse(
            exports=[ExportResponse(**e) for e in exports],
            total=total,
            page=page,
            page_size=page_size,
        ),
        message=f"Found {total} export(s)",
        status_code=status.HTTP_200_OK,
    )


@router.get(
    "/{project_id}/exports/{export_id}",
    response_model=JsonResponse[ExportResponse, None],
)
async def get_export(
    project: Annotated[dict, Depends(ProjectPermission("viewer"))],
    export_id: UUID,
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)],
):
    """Get an export by ID."""
    export_data = await ExportRepository.get_by_id(connection, export_id)
    if not export_data or export_data["project_id"] != project["id"]:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Export not found",
        )

    return JsonResponse(
        data=ExportResponse(**export_data),
        message="Export retrieved",
        status_code=status.HTTP_200_OK,
    )


@router.get("/{project_id}/exports/{export_id}/download")
async def download_export(
    project: Annotated[dict, Depends(ProjectPermission("viewer"))],
    export_id: UUID,
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)],
):
    """Download export artifact."""
    export_data = await ExportRepository.get_by_id(connection, export_id)
    if not export_data or export_data["project_id"] != project["id"]:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Export not found",
        )

    if export_data["status"] != "completed":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Export is not completed (status: {export_data['status']})",
        )

    artifact_path = export_data.get("artifact_path")
    if not artifact_path:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Export artifact not found",
        )

    full_path = settings.EXPORT_ROOT / artifact_path
    if not full_path.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Export artifact file not found on disk",
        )

    return FileResponse(
        path=full_path,
        filename=full_path.name,
        media_type="application/zip",
    )


@router.delete(
    "/{project_id}/exports/{export_id}",
    response_model=JsonResponse[None, None],
)
async def delete_export(
    project: Annotated[dict, Depends(ProjectPermission("maintainer"))],
    export_id: UUID,
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)],
):
    """Delete an export and its artifact."""
    export_data = await ExportRepository.get_by_id(connection, export_id)
    if not export_data or export_data["project_id"] != project["id"]:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Export not found",
        )

    # Delete artifact file if exists
    artifact_path = export_data.get("artifact_path")
    if artifact_path:
        full_path = settings.EXPORT_ROOT / artifact_path
        if full_path.exists():
            full_path.unlink()
        # Also try to remove parent directory if empty
        try:
            full_path.parent.rmdir()
        except OSError:
            pass  # Directory not empty, that's fine

    await ExportRepository.delete(connection, export_id)

    return JsonResponse(
        data=None,
        message="Export deleted",
        status_code=status.HTTP_200_OK,
    )
