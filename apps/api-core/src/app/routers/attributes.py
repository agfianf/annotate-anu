"""Router for Attribute Schemas and Image Attributes."""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncConnection

from app.dependencies.auth import get_current_active_user
from app.dependencies.database import get_async_transaction_conn
from app.dependencies.rbac import ProjectPermission
from app.helpers.response_api import JsonResponse
from app.repositories.attribute import AttributeSchemaRepository, ImageAttributeRepository
from app.schemas.auth import UserBase
from app.schemas.data_management import (
    AttributeSchemaCreate,
    AttributeSchemaResponse,
    AttributeSchemaUpdate,
    BulkAttributeSet,
    ImageAttributeResponse,
    ImageAttributeSet,
)

router = APIRouter(prefix="/api/v1/projects", tags=["Attributes"])


# ============================================================================
# Attribute Schemas CRUD
# ============================================================================
@router.get(
    "/{project_id}/attributes/schemas",
    response_model=JsonResponse[list[AttributeSchemaResponse], None],
)
async def list_attribute_schemas(
    project: Annotated[dict, Depends(ProjectPermission("viewer"))],
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)],
    is_filterable: bool | None = Query(default=None),
    is_visible: bool | None = Query(default=None),
):
    """List all attribute schemas for a project."""
    project_id = project["id"]

    schemas = await AttributeSchemaRepository.list_for_project(
        connection, project_id, is_filterable, is_visible
    )

    return JsonResponse(
        data=[AttributeSchemaResponse(**s) for s in schemas],
        message=f"Found {len(schemas)} attribute schema(s)",
        status_code=status.HTTP_200_OK,
    )


@router.get(
    "/{project_id}/attributes/schemas/{schema_id}",
    response_model=JsonResponse[AttributeSchemaResponse, None],
)
async def get_attribute_schema(
    schema_id: UUID,
    project: Annotated[dict, Depends(ProjectPermission("viewer"))],
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)],
):
    """Get attribute schema by ID."""
    project_id = project["id"]

    schema = await AttributeSchemaRepository.get_by_id(connection, schema_id, project_id)
    if not schema:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Attribute schema not found",
        )

    return JsonResponse(
        data=AttributeSchemaResponse(**schema),
        message="Attribute schema retrieved",
        status_code=status.HTTP_200_OK,
    )


@router.post(
    "/{project_id}/attributes/schemas",
    response_model=JsonResponse[AttributeSchemaResponse, None],
)
async def create_attribute_schema(
    payload: AttributeSchemaCreate,
    project: Annotated[dict, Depends(ProjectPermission("maintainer"))],
    current_user: Annotated[UserBase, Depends(get_current_active_user)],
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)],
):
    """Create a new attribute schema."""
    project_id = project["id"]

    # Check if name already exists
    existing = await AttributeSchemaRepository.get_by_name(connection, payload.name, project_id)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Attribute schema '{payload.name}' already exists",
        )

    schema_data = payload.model_dump()
    schema_data["created_by"] = current_user.id

    schema = await AttributeSchemaRepository.create(connection, project_id, schema_data)
    return JsonResponse(
        data=AttributeSchemaResponse(**schema),
        message="Attribute schema created",
        status_code=status.HTTP_201_CREATED,
    )


@router.patch(
    "/{project_id}/attributes/schemas/{schema_id}",
    response_model=JsonResponse[AttributeSchemaResponse, None],
)
async def update_attribute_schema(
    schema_id: UUID,
    payload: AttributeSchemaUpdate,
    project: Annotated[dict, Depends(ProjectPermission("maintainer"))],
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)],
):
    """Update an attribute schema."""
    project_id = project["id"]

    schema = await AttributeSchemaRepository.get_by_id(connection, schema_id, project_id)
    if not schema:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Attribute schema not found",
        )

    # Check name uniqueness if updating name
    if payload.name and payload.name != schema["name"]:
        existing = await AttributeSchemaRepository.get_by_name(connection, payload.name, project_id)
        if existing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Attribute schema '{payload.name}' already exists",
            )

    update_data = payload.model_dump(exclude_unset=True)
    if not update_data:
        return JsonResponse(
            data=AttributeSchemaResponse(**schema),
            message="No changes",
            status_code=status.HTTP_200_OK,
        )

    updated = await AttributeSchemaRepository.update(connection, schema_id, project_id, update_data)
    return JsonResponse(
        data=AttributeSchemaResponse(**updated),
        message="Attribute schema updated",
        status_code=status.HTTP_200_OK,
    )


@router.delete(
    "/{project_id}/attributes/schemas/{schema_id}",
    response_model=JsonResponse[None, None],
)
async def delete_attribute_schema(
    schema_id: UUID,
    project: Annotated[dict, Depends(ProjectPermission("maintainer"))],
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)],
):
    """Delete an attribute schema (and all associated image attributes)."""
    project_id = project["id"]

    schema = await AttributeSchemaRepository.get_by_id(connection, schema_id, project_id)
    if not schema:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Attribute schema not found",
        )

    await AttributeSchemaRepository.delete(connection, schema_id, project_id)
    return JsonResponse(
        data=None,
        message="Attribute schema deleted",
        status_code=status.HTTP_200_OK,
    )


# ============================================================================
# Image Attributes
# ============================================================================
@router.get(
    "/{project_id}/images/{image_id}/attributes",
    response_model=JsonResponse[list[ImageAttributeResponse], None],
)
async def get_image_attributes(
    image_id: UUID,
    project: Annotated[dict, Depends(ProjectPermission("viewer"))],
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)],
):
    """Get all attributes for an image."""
    project_id = project["id"]

    attributes = await ImageAttributeRepository.get_for_image(connection, image_id, project_id)

    return JsonResponse(
        data=[ImageAttributeResponse(**a) for a in attributes],
        message=f"Found {len(attributes)} attribute(s)",
        status_code=status.HTTP_200_OK,
    )


@router.post(
    "/{project_id}/images/{image_id}/attributes",
    response_model=JsonResponse[ImageAttributeResponse, None],
)
async def set_image_attribute(
    image_id: UUID,
    payload: ImageAttributeSet,
    project: Annotated[dict, Depends(ProjectPermission("annotator"))],
    current_user: Annotated[UserBase, Depends(get_current_active_user)],
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)],
):
    """Set an attribute value on an image (creates or updates)."""
    project_id = project["id"]

    # Get the schema to determine field type
    schema = await AttributeSchemaRepository.get_by_id(
        connection, payload.attribute_schema_id, project_id
    )
    if not schema:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Attribute schema not found",
        )

    # Build value data based on field type
    value_data = _build_value_data(schema["field_type"], payload.value)
    value_data["confidence"] = payload.confidence
    value_data["source"] = payload.source

    attribute = await ImageAttributeRepository.set_attribute(
        connection,
        project_id,
        image_id,
        payload.attribute_schema_id,
        value_data,
        current_user.id,
    )

    return JsonResponse(
        data=ImageAttributeResponse(**attribute),
        message="Attribute set",
        status_code=status.HTTP_200_OK,
    )


@router.post(
    "/{project_id}/images/bulk-attributes",
    response_model=JsonResponse[dict, None],
)
async def bulk_set_attributes(
    payload: BulkAttributeSet,
    project: Annotated[dict, Depends(ProjectPermission("annotator"))],
    current_user: Annotated[UserBase, Depends(get_current_active_user)],
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)],
):
    """Bulk set an attribute value on multiple images."""
    project_id = project["id"]

    # Get the schema to determine field type
    schema = await AttributeSchemaRepository.get_by_id(
        connection, payload.attribute_schema_id, project_id
    )
    if not schema:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Attribute schema not found",
        )

    # Build value data based on field type
    value_data = _build_value_data(schema["field_type"], payload.value)
    value_data["source"] = payload.source

    affected = await ImageAttributeRepository.bulk_set_attribute(
        connection,
        project_id,
        payload.shared_image_ids,
        payload.attribute_schema_id,
        value_data,
        current_user.id,
    )

    return JsonResponse(
        data={"images_affected": affected},
        message=f"Attribute set on {affected} image(s)",
        status_code=status.HTTP_200_OK,
    )


def _build_value_data(field_type: str, value) -> dict:
    """Build value data dict based on field type."""
    value_data = {
        "value_categorical": None,
        "value_numeric": None,
        "value_boolean": None,
        "value_string": None,
        "value_json": None,
    }

    if value is None:
        return value_data

    if field_type == "categorical":
        value_data["value_categorical"] = str(value)
    elif field_type == "numeric":
        value_data["value_numeric"] = float(value)
    elif field_type == "boolean":
        value_data["value_boolean"] = bool(value)
    elif field_type == "string":
        value_data["value_string"] = str(value)
    else:
        # JSON or unknown type
        value_data["value_json"] = value if isinstance(value, dict) else {"value": value}

    return value_data
