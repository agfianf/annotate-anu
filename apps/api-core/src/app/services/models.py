"""Service layer for model registry business logic."""

from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncConnection

from app.helpers.logger import logger
from app.integrations.redis import RedisClient
from app.repositories.models import ModelAsyncRepositories
from app.schemas.models import ModelBase, ModelCreatePayload, ModelUpdatePayload
from app.schemas.models.response import ModelHealthResponse, ModelResponse
from app.services.health_checker import HealthChecker


class ModelService:
    """Business logic for model registry operations."""

    def __init__(self, redis_client: RedisClient, health_checker: HealthChecker):
        """Initialize model service.

        Parameters
        ----------
        redis_client : RedisClient
            Redis client for caching
        health_checker : HealthChecker
            Health checker service
        """
        self.redis = redis_client
        self.health_checker = health_checker
        self.repo = ModelAsyncRepositories

    def _get_cache_key(self, model_id: str) -> str:
        """Generate cache key for model.

        Parameters
        ----------
        model_id : str
            Model identifier

        Returns
        -------
        str
            Cache key
        """
        return f"model:id:{model_id}"

    def _invalidate_model_cache(self, model_id: str):
        """Invalidate cache for specific model.

        Parameters
        ----------
        model_id : str
            Model identifier
        """
        cache_key = self._get_cache_key(model_id)
        self.redis.delete_data(cache_key)
        # Also invalidate list cache
        self.redis.delete_pattern("models:list:*")

    def _model_to_response(self, model: ModelBase) -> ModelResponse:
        """Convert ModelBase to ModelResponse (exclude auth_token).

        Parameters
        ----------
        model : ModelBase
            Model with all fields

        Returns
        -------
        ModelResponse
            Public model response
        """
        return ModelResponse(**model.model_dump(exclude={"auth_token"}))

    async def get_all(
        self,
        connection: AsyncConnection,
        include_inactive: bool = False
    ) -> list[ModelResponse]:
        """Get all models.

        Parameters
        ----------
        connection : AsyncConnection
            Database connection
        include_inactive : bool
            Whether to include inactive models

        Returns
        -------
        list[ModelResponse]
            List of models
        """
        # Check cache
        cache_key = f"models:list:{include_inactive}"
        cached = self.redis.get_data(cache_key)
        if cached:
            logger.info("Models list retrieved from cache")
            return [ModelResponse(**m) for m in cached]

        # Query database
        models = await self.repo.get_all(connection, include_inactive)

        # Cache result (15 minutes)
        models_dict = [self._model_to_response(m).model_dump() for m in models]
        self.redis.set_data(cache_key, models_dict, expire_sec=900)

        return [self._model_to_response(m) for m in models]

    async def get_by_id(
        self,
        connection: AsyncConnection,
        model_id: str
    ) -> ModelResponse:
        """Get model by ID.

        Parameters
        ----------
        connection : AsyncConnection
            Database connection
        model_id : str
            Model identifier

        Returns
        -------
        ModelResponse
            Model data
        """
        # Check cache
        cache_key = self._get_cache_key(model_id)
        cached = self.redis.get_data(cache_key)
        if cached:
            logger.info(f"Model {model_id} retrieved from cache")
            return ModelResponse(**cached)

        # Query database
        model = await self.repo.get_by_id(connection, model_id)

        # Cache result (15 minutes)
        model_response = self._model_to_response(model)
        self.redis.set_data(cache_key, model_response.model_dump(), expire_sec=900)

        return model_response

    async def create(
        self,
        connection: AsyncConnection,
        payload: ModelCreatePayload
    ) -> ModelResponse:
        """Create new model with health check and capability detection.

        Parameters
        ----------
        connection : AsyncConnection
            Database connection
        payload : ModelCreatePayload
            Model creation payload

        Returns
        -------
        ModelResponse
            Created model
        """
        # Transform payload
        data = payload.transform()

        # Check health
        endpoint_url = str(payload.endpoint_url)
        is_healthy, status_msg, response_time_ms = await self.health_checker.check_health(
            endpoint_url,
            payload.auth_token
        )

        data["is_healthy"] = is_healthy
        data["last_health_check"] = datetime.now(timezone.utc)

        # Fetch capabilities if not provided
        if payload.capabilities is None:
            logger.info(f"Fetching capabilities from {endpoint_url}")
            capabilities = await self.health_checker.fetch_capabilities(
                endpoint_url,
                payload.auth_token
            )
            if capabilities:
                data["capabilities"] = capabilities
            else:
                logger.warning("Could not fetch capabilities from model")

        # Create in database
        model = await self.repo.create(connection, data)

        # Invalidate list cache
        self.redis.delete_pattern("models:list:*")

        return self._model_to_response(model)

    async def update(
        self,
        connection: AsyncConnection,
        model_id: str,
        payload: ModelUpdatePayload
    ) -> ModelResponse:
        """Update existing model.

        Parameters
        ----------
        connection : AsyncConnection
            Database connection
        model_id : str
            Model identifier
        payload : ModelUpdatePayload
            Update payload

        Returns
        -------
        ModelResponse
            Updated model
        """
        # Transform payload
        data = payload.transform()

        # Update in database
        model = await self.repo.update(connection, model_id, data)

        # Invalidate caches
        self._invalidate_model_cache(model_id)

        return self._model_to_response(model)

    async def delete(
        self,
        connection: AsyncConnection,
        model_id: str
    ) -> bool:
        """Delete model.

        Parameters
        ----------
        connection : AsyncConnection
            Database connection
        model_id : str
            Model identifier

        Returns
        -------
        bool
            True if deleted
        """
        # Delete from database
        result = await self.repo.delete(connection, model_id)

        # Invalidate caches
        self._invalidate_model_cache(model_id)

        return result

    async def check_health(
        self,
        connection: AsyncConnection,
        model_id: str
    ) -> ModelHealthResponse:
        """Perform health check on model.

        Parameters
        ----------
        connection : AsyncConnection
            Database connection
        model_id : str
            Model identifier

        Returns
        -------
        ModelHealthResponse
            Health check result
        """
        # Get model
        model = await self.repo.get_by_id(connection, model_id)

        # Perform health check
        is_healthy, status_msg, response_time_ms = await self.health_checker.check_health(
            model.endpoint_url,
            model.auth_token
        )

        # Update health status in database
        await self.repo.update(
            connection,
            model_id,
            {
                "is_healthy": is_healthy,
                "last_health_check": datetime.now(timezone.utc)
            }
        )

        # Invalidate cache
        self._invalidate_model_cache(model_id)

        return ModelHealthResponse(
            model_id=model_id,
            is_healthy=is_healthy,
            status_message=status_msg,
            response_time_ms=response_time_ms,
            checked_at=datetime.now(timezone.utc)
        )
