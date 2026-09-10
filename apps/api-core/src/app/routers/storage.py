"""Storage connection router: register S3/MinIO buckets and browse them."""

from datetime import datetime, timezone
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import delete, insert, select, update
from sqlalchemy.ext.asyncio import AsyncConnection

from app.dependencies.auth import get_current_active_user
from app.dependencies.database import get_async_transaction_conn
from app.helpers.response_api import JsonResponse
from app.models.storage import storage_connections
from app.schemas.auth import UserBase
from app.services.storage_s3 import IMAGE_SUFFIXES, S3Service, encrypt_secret

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


def _public(row: dict) -> dict:
    """Never return the stored secret."""
    return {k: v for k, v in row.items() if k != "secret_key"}


async def _require_connection(connection: AsyncConnection, connection_id: UUID) -> dict:
    result = await connection.execute(
        select(storage_connections).where(storage_connections.c.id == connection_id)
    )
    row = result.mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Storage connection not found")
    return dict(row)


@router.post("/connections", response_model=JsonResponse[dict, None], status_code=201)
async def create_connection(
    payload: ConnectionCreate,
    current_user: Annotated[UserBase, Depends(get_current_active_user)],
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)],
):
    """Register a bucket. Credentials are encrypted before storage."""
    values = payload.model_dump()
    values["secret_key"] = encrypt_secret(payload.secret_key)
    values["created_by"] = current_user.id

    result = await connection.execute(
        insert(storage_connections).values(**values).returning(storage_connections)
    )
    row = dict(result.mappings().first())

    healthy, message = S3Service(row).check()
    await connection.execute(
        update(storage_connections)
        .where(storage_connections.c.id == row["id"])
        .values(last_checked_at=datetime.now(timezone.utc), last_status=message)
    )
    row["last_status"] = message

    return JsonResponse(
        data={**_public(row), "healthy": healthy},
        message="Storage connection created",
        status_code=status.HTTP_201_CREATED,
    )


@router.get("/connections", response_model=JsonResponse[list[dict], None])
async def list_connections(
    current_user: Annotated[UserBase, Depends(get_current_active_user)],
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)],
    project_id: int | None = None,
):
    """List registered buckets."""
    query = select(storage_connections).order_by(storage_connections.c.created_at.desc())
    if project_id is not None:
        query = query.where(storage_connections.c.project_id == project_id)
    result = await connection.execute(query)
    return JsonResponse(
        data=[_public(dict(r)) for r in result.mappings().all()],
        message="Storage connections",
        status_code=200,
    )


@router.delete("/connections/{connection_id}", response_model=JsonResponse[dict, None])
async def delete_connection(
    connection_id: UUID,
    current_user: Annotated[UserBase, Depends(get_current_active_user)],
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)],
):
    """Remove a stored bucket connection."""
    row = await _require_connection(connection, connection_id)
    await connection.execute(
        delete(storage_connections).where(storage_connections.c.id == connection_id)
    )
    return JsonResponse(data={"deleted": str(connection_id)}, message=f"Deleted '{row['name']}'", status_code=200)


@router.post("/connections/{connection_id}/check", response_model=JsonResponse[dict, None])
async def check_connection(
    connection_id: UUID,
    current_user: Annotated[UserBase, Depends(get_current_active_user)],
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)],
):
    """Re-test credentials against the bucket."""
    row = await _require_connection(connection, connection_id)
    healthy, message = S3Service(row).check()
    await connection.execute(
        update(storage_connections)
        .where(storage_connections.c.id == connection_id)
        .values(last_checked_at=datetime.now(timezone.utc), last_status=message)
    )
    return JsonResponse(data={"healthy": healthy, "status": message}, message=message, status_code=200)


@router.get("/connections/{connection_id}/browse", response_model=JsonResponse[dict, None])
async def browse(
    connection_id: UUID,
    current_user: Annotated[UserBase, Depends(get_current_active_user)],
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)],
    path: str = "",
    limit: int = Query(default=200, ge=1, le=1000),
):
    """List sub-prefixes (batches) and images under a prefix."""
    row = await _require_connection(connection, connection_id)
    service = S3Service(row)
    try:
        return JsonResponse(
            data={
                "path": path,
                "prefixes": service.list_prefixes(path),
                "objects": service.list_objects(path, IMAGE_SUFFIXES, limit),
            },
            message="Bucket listing",
            status_code=200,
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Bucket listing failed: {exc}")
