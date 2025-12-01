"""FastAPI application entry point for API Core service."""

from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import settings
from app.helpers.database import get_async_engine, metadata
from app.helpers.logger import logger
from app.integrations.redis import RedisClient
from app.routers import inference as inference_router
from app.routers import models as models_router
from app.services.health_checker import HealthChecker
from app.services.inference_proxy import InferenceProxyService
from app.services.models import ModelService


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan context manager for startup and shutdown events.

    Parameters
    ----------
    app : FastAPI
        FastAPI application instance

    Yields
    ------
    dict
        State dictionary with initialized services
    """
    logger.info("Starting API Core service...")

    # Initialize database engine
    engine = get_async_engine()
    logger.info("Database engine initialized")

    # Create tables if they don't exist
    async with engine.begin() as conn:
        await conn.run_sync(metadata.create_all)
    logger.info("Database tables ensured")

    # Initialize Redis
    redis_client = RedisClient(settings.REDIS_URL)

    # Initialize health checker
    health_checker = HealthChecker()

    # Initialize services
    model_service = ModelService(redis_client, health_checker)
    logger.info("Services initialized")

    # Initialize inference proxy
    inference_proxy = InferenceProxyService(settings.SAM3_API_URL)
    logger.info(f"Inference proxy initialized (SAM3: {settings.SAM3_API_URL})")

    # Store in app state
    yield {
        "engine": engine,
        "model_service": model_service,
        "redis_client": redis_client,
        "health_checker": health_checker,
        "inference_proxy": inference_proxy,
    }

    # Shutdown
    logger.info("Shutting down API Core service...")
    await engine.dispose()


# Create FastAPI app
app = FastAPI(
    title="API Core Service",
    description="Core API service for BYOM model registry and management",
    version=settings.API_CORE_VERSION,
    lifespan=lifespan,
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Exception handlers
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Handle uncaught exceptions.

    Parameters
    ----------
    request : Request
        FastAPI request
    exc : Exception
        Raised exception

    Returns
    -------
    JSONResponse
        Error response
    """
    logger.error(f"Unhandled exception: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={
            "error": "Internal Server Error",
            "message": str(exc),
            "status_code": 500,
        },
    )


# Include routers
app.include_router(models_router.router)
app.include_router(inference_router.router)


# Root endpoint
@app.get("/")
async def root():
    """Root endpoint.

    Returns
    -------
    dict
        Service information
    """
    return {
        "service": "api-core",
        "version": settings.API_CORE_VERSION,
        "status": "running",
    }


# Health check endpoint
@app.get("/health")
async def health():
    """Health check endpoint.

    Returns
    -------
    dict
        Health status
    """
    return {
        "status": "healthy",
        "service": "api-core",
        "version": settings.API_CORE_VERSION,
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "app.main:app",
        host=settings.API_CORE_HOST,
        port=settings.API_CORE_PORT,
        reload=settings.API_CORE_DEBUG,
    )
