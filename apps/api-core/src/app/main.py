"""FastAPI application entry point for AnnotateANU API Core service."""

from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.formparsers import MultiPartParser

from app.config import settings
from app.helpers.database import get_async_engine, metadata
from app.helpers.logger import logger
from app.integrations.redis import RedisClient
from app.routers import admin as admin_router
from app.routers import annotations as annotations_router
from app.routers import attributes as attributes_router
from app.routers import auth as auth_router
from app.routers import exports as exports_router
from app.routers import images as images_router
from app.routers import inference as inference_router
from app.routers import jobs as jobs_router
from app.routers import models as models_router
from app.routers import project_images as project_images_router
from app.routers import projects as projects_router
from app.routers import share as share_router
from app.routers import shared_images as shared_images_router
from app.routers import tag_categories as tag_categories_router
from app.routers import tags as tags_router
from app.routers import tasks as tasks_router
from app.services.health_checker import HealthChecker
from app.services.inference_proxy import InferenceProxyService
from app.services.models import ModelService

# Configure Starlette's MultiPartParser to allow more files (default is 1000)
MultiPartParser.max_files = settings.SHARE_MAX_UPLOAD_FILES


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

    # Initialize model service for BYOM
    model_service = ModelService(redis_client, health_checker)
    logger.info("Model service initialized")

    # Initialize inference proxy service
    inference_proxy = InferenceProxyService(settings.SAM3_API_URL)
    logger.info(f"Inference proxy initialized (SAM3: {settings.SAM3_API_URL})")

    # Store in app state
    yield {
        "engine": engine,
        "redis_client": redis_client,
        "health_checker": health_checker,
        "model_service": model_service,
        "inference_proxy": inference_proxy,
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

# CORS middleware - allow all origins in dev mode
if settings.API_CORE_DEBUG:
    # Development: allow all origins without credentials
    cors_origins = ["*"]
    allow_credentials = False
else:
    # Production: specific origins with credentials
    cors_origins = settings.CORS_ORIGINS
    allow_credentials = True

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=allow_credentials,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Middleware to inject services into request state
@app.middleware("http")
async def inject_services_middleware(request: Request, call_next):
    """Inject services from app.state into request.state for route access."""
    if hasattr(app.state, "model_service"):
        request.state.model_service = app.state.model_service
    if hasattr(app.state, "inference_proxy"):
        request.state.inference_proxy = app.state.inference_proxy
    return await call_next(request)


# Exception handlers with standardized response format: { data, message, success, status_code, meta }
@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """Handle validation errors with standardized format."""
    errors = exc.errors()
    # Extract first error message for main message
    first_error = errors[0] if errors else {}
    field = ".".join(str(loc) for loc in first_error.get("loc", [])) if first_error else "unknown"
    msg = first_error.get("msg", "Validation error")

    return JSONResponse(
        status_code=422,
        content={
            "data": None,
            "message": f"{field}: {msg}",
            "success": False,
            "status_code": 422,
            "meta": {"errors": errors},
        },
    )


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    """Handle HTTP exceptions with standardized format."""
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "data": None,
            "message": exc.detail,
            "success": False,
            "status_code": exc.status_code,
            "meta": None,
        },
    )


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Handle uncaught exceptions with standardized format."""
    logger.error(f"Unhandled exception: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={
            "data": None,
            "message": str(exc),
            "success": False,
            "status_code": 500,
            "meta": None,
        },
    )


# Include routers
app.include_router(auth_router.router)
app.include_router(admin_router.router)
app.include_router(projects_router.router)
app.include_router(tasks_router.router)
app.include_router(jobs_router.router)
app.include_router(images_router.router)
app.include_router(annotations_router.router)
app.include_router(models_router.router)
app.include_router(inference_router.router)
app.include_router(share_router.router)
app.include_router(shared_images_router.router)
app.include_router(tag_categories_router.router)
app.include_router(tags_router.router)
app.include_router(project_images_router.router)
app.include_router(attributes_router.router)
app.include_router(exports_router.router)


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
