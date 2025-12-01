"""Router for model registry endpoints."""

from typing import Annotated

from fastapi import APIRouter, Depends, Request, status
from sqlalchemy.ext.asyncio import AsyncConnection

from app.dependencies.database import get_async_conn, get_async_transaction_conn
from app.helpers.response_api import JsonResponse
from app.schemas.models import ModelCreatePayload, ModelUpdatePayload
from app.schemas.models.response import ModelHealthResponse, ModelListResponse, ModelResponse
from app.services.models import ModelService

router = APIRouter(prefix="/api/v1/models", tags=["Model Registry"])


@router.get("", response_model=JsonResponse[ModelListResponse, None])
async def list_models(
    request: Request,
    include_inactive: bool = False,
    connection: Annotated[AsyncConnection, Depends(get_async_conn)] = None,
):
    """List all registered models.

    Parameters
    ----------
    request : Request
        FastAPI request object
    include_inactive : bool
        Include inactive models in the list
    connection : AsyncConnection
        Database connection from dependency

    Returns
    -------
    JsonResponse[ModelListResponse, None]
        List of models with total count
    """
    service: ModelService = request.state.model_service

    models = await service.get_all(connection, include_inactive)

    response_data = ModelListResponse(models=models, total=len(models))

    return JsonResponse(
        data=response_data,
        message=f"Retrieved {len(models)} models",
        status_code=status.HTTP_200_OK,
    )


@router.post("", response_model=JsonResponse[ModelResponse, None])
async def create_model(
    request: Request,
    payload: ModelCreatePayload,
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)] = None,
):
    """Register a new model.

    Parameters
    ----------
    request : Request
        FastAPI request object
    payload : ModelCreatePayload
        Model registration data
    connection : AsyncConnection
        Database connection with transaction

    Returns
    -------
    JsonResponse[ModelResponse, None]
        Created model
    """
    service: ModelService = request.state.model_service

    model = await service.create(connection, payload)

    return JsonResponse(
        data=model,
        message=f"Model '{model.name}' registered successfully",
        status_code=status.HTTP_201_CREATED,
    )


@router.get("/{model_id}", response_model=JsonResponse[ModelResponse, None])
async def get_model(
    request: Request,
    model_id: str,
    connection: Annotated[AsyncConnection, Depends(get_async_conn)] = None,
):
    """Get model by ID.

    Parameters
    ----------
    request : Request
        FastAPI request object
    model_id : str
        Model identifier
    connection : AsyncConnection
        Database connection

    Returns
    -------
    JsonResponse[ModelResponse, None]
        Model data
    """
    service: ModelService = request.state.model_service

    model = await service.get_by_id(connection, model_id)

    return JsonResponse(
        data=model,
        message="Model retrieved successfully",
        status_code=status.HTTP_200_OK,
    )


@router.patch("/{model_id}", response_model=JsonResponse[ModelResponse, None])
async def update_model(
    request: Request,
    model_id: str,
    payload: ModelUpdatePayload,
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)] = None,
):
    """Update existing model.

    Parameters
    ----------
    request : Request
        FastAPI request object
    model_id : str
        Model identifier
    payload : ModelUpdatePayload
        Update data
    connection : AsyncConnection
        Database connection with transaction

    Returns
    -------
    JsonResponse[ModelResponse, None]
        Updated model
    """
    service: ModelService = request.state.model_service

    model = await service.update(connection, model_id, payload)

    return JsonResponse(
        data=model,
        message=f"Model '{model.name}' updated successfully",
        status_code=status.HTTP_200_OK,
    )


@router.delete("/{model_id}", response_model=JsonResponse[dict, None])
async def delete_model(
    request: Request,
    model_id: str,
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)] = None,
):
    """Delete model.

    Parameters
    ----------
    request : Request
        FastAPI request object
    model_id : str
        Model identifier
    connection : AsyncConnection
        Database connection with transaction

    Returns
    -------
    JsonResponse[dict, None]
        Deletion confirmation
    """
    service: ModelService = request.state.model_service

    await service.delete(connection, model_id)

    return JsonResponse(
        data={"deleted": True},
        message=f"Model '{model_id}' deleted successfully",
        status_code=status.HTTP_200_OK,
    )


@router.post("/{model_id}/health", response_model=JsonResponse[ModelHealthResponse, None])
async def check_model_health(
    request: Request,
    model_id: str,
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)] = None,
):
    """Check model health status.

    Parameters
    ----------
    request : Request
        FastAPI request object
    model_id : str
        Model identifier
    connection : AsyncConnection
        Database connection with transaction

    Returns
    -------
    JsonResponse[ModelHealthResponse, None]
        Health check result
    """
    service: ModelService = request.state.model_service

    health_result = await service.check_health(connection, model_id)

    status_code = status.HTTP_200_OK if health_result.is_healthy else status.HTTP_503_SERVICE_UNAVAILABLE

    return JsonResponse(
        data=health_result,
        message=health_result.status_message,
        status_code=status_code,
    )
