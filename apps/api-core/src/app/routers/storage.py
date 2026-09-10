"""Storage connection router: register S3/MinIO buckets and browse them."""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncConnection

from app.dependencies.auth import get_current_active_user
from app.dependencies.database import get_async_transaction_conn
from app.helpers.response_api import JsonResponse
from app.schemas.auth import UserBase
from app.services.storage_connection import StorageConnectionService

router = APIRouter(prefix="/api/v1/storage", tags=["Storage"])


class ConnectionCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    bucket: str = Field(..., min_length=1)
    access_key: str = Field(..., min_length=1)
    secret_key: str = Field(..., min_length=1)
    endpoint_url: str | None = None
    region: str | None = None
    prefix: str = ""
    use_ssl: bool = True
    project_id: int | None = None


@router.post("/connections", response_model=JsonResponse[dict, None], status_code=201)
async def create_connection(
    payload: ConnectionCreate,
    current_user: Annotated[UserBase, Depends(get_current_active_user)],
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)],
):
    """Register a bucket. Credentials are encrypted before storage."""
    data = await StorageConnectionService.create(
        connection, payload.model_dump(), current_user
    )
    return JsonResponse(
        data=data,
        message="Storage connection created",
        status_code=status.HTTP_201_CREATED,
    )


@router.get("/connections", response_model=JsonResponse[list[dict], None])
async def list_connections(
    current_user: Annotated[UserBase, Depends(get_current_active_user)],
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)],
    project_id: int | None = None,
):
    """List the buckets the caller may see."""
    connections = await StorageConnectionService.list_for_user(
        connection, current_user, project_id=project_id
    )
    return JsonResponse(
        data=connections,
        message="Storage connections",
        status_code=status.HTTP_200_OK,
    )


@router.delete("/connections/{connection_id}", response_model=JsonResponse[dict, None])
async def delete_connection(
    connection_id: UUID,
    current_user: Annotated[UserBase, Depends(get_current_active_user)],
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)],
):
    """Remove a stored bucket connection."""
    name = await StorageConnectionService.delete(connection, connection_id, current_user)
    return JsonResponse(
        data={"deleted": str(connection_id)},
        message=f"Deleted '{name}'",
        status_code=status.HTTP_200_OK,
    )


@router.post("/connections/{connection_id}/check", response_model=JsonResponse[dict, None])
async def check_connection(
    connection_id: UUID,
    current_user: Annotated[UserBase, Depends(get_current_active_user)],
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)],
):
    """Re-test credentials against the bucket."""
    healthy, message = await StorageConnectionService.check(
        connection, connection_id, current_user
    )
    return JsonResponse(
        data={"healthy": healthy, "status": message},
        message=message,
        status_code=status.HTTP_200_OK,
    )


@router.get("/connections/{connection_id}/browse", response_model=JsonResponse[dict, None])
async def browse(
    connection_id: UUID,
    current_user: Annotated[UserBase, Depends(get_current_active_user)],
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)],
    path: str = "",
    limit: int = Query(default=200, ge=1, le=1000),
):
    """List sub-prefixes (batches) and images under a prefix."""
    listing = await StorageConnectionService.browse(
        connection, connection_id, current_user, path=path, limit=limit
    )
    return JsonResponse(
        data=listing,
        message="Bucket listing",
        status_code=status.HTTP_200_OK,
    )
