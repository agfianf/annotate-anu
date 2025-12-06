"""FastAPI application entry point for AnnotateANU API Core service."""

from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import settings
from app.helpers.database import get_async_engine, metadata
from app.helpers.logger import logger
from app.integrations.redis import RedisClient
from app.routers import auth as auth_router
from app.routers import annotations as annotations_router
from app.routers import images as images_router
from app.routers import jobs as jobs_router
from app.routers import projects as projects_router
from app.routers import tasks as tasks_router
from app.services.health_checker import HealthChecker


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
    logger.info("Starting AnnotateANU API Core service...")

    # Initialize database engine
    engine = get_async_engine()
    logger.info("PostgreSQL database engine initialized")

    # Create tables if they don't exist (development only)
    # In production, use Alembic migrations
    if settings.API_CORE_DEBUG:
        async with engine.begin() as conn:
            await conn.run_sync(metadata.create_all)
        logger.info("Database tables ensured (dev mode)")

    # Initialize Redis
    redis_client = RedisClient(settings.REDIS_URL)
    logger.info("Redis client initialized")

    # Initialize health checker
    health_checker = HealthChecker()

    # Store in app state
    yield {
        "engine": engine,
        "redis_client": redis_client,
        "health_checker": health_checker,
    }

    # Shutdown
    logger.info("Shutting down API Core service...")
    await engine.dispose()


# Create FastAPI app
app = FastAPI(
    title="AnnotateANU API",
    description="Core API service for AnnotateANU annotation platform",
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
app.include_router(auth_router.router)
app.include_router(projects_router.router)
app.include_router(tasks_router.router)
app.include_router(jobs_router.router)
app.include_router(images_router.router)
app.include_router(annotations_router.router)


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
        "service": "annotateanu-api",
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
        "service": "annotateanu-api",
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
