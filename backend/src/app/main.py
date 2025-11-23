"""FastAPI application for SAM3 segmentation."""

from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import settings
from app.helpers.logger import logger
from app.helpers.response_api import ErrorDetail, ErrorResponse
from app.integrations.sam3.inference import SAM3Inference
from app.routers import sam3


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage application lifespan: startup and shutdown.

    Parameters
    ----------
    app : FastAPI
        FastAPI application instance

    Yields
    ------
    None
        Yields control to application
    """
    # Startup
    logger.info(f"Starting SAM3 API application v{settings.APP_VERSION}")

    try:
        # Initialize and load SAM3 model
        logger.info("Loading SAM3 model (this may take a few minutes)...")
        sam3_inference = SAM3Inference()
        sam3_inference.load_model()
        logger.info("SAM3 model loaded successfully")

        yield {
            "sam3_inference": sam3_inference,
        }

        logger.info("Application startup complete")

    except Exception as e:
        logger.error(f"Failed to initialize application: {e}")
        raise

    yield

    # Shutdown
    logger.info("Shutting down application")
    # Cleanup if needed
    logger.info("Application shutdown complete")


# Create FastAPI app
app = FastAPI(
    title=settings.APP_TITLE,
    description=settings.APP_DESCRIPTION,
    version=settings.APP_VERSION,
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=settings.ALLOWED_METHODS,
    allow_headers=settings.ALLOWED_HEADERS,
)


# Exception handlers
@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """Handle request validation errors.

    Parameters
    ----------
    request : Request
        FastAPI request
    exc : RequestValidationError
        Validation error exception

    Returns
    -------
    JSONResponse
        Error response
    """
    errors = []
    for error in exc.errors():
        errors.append(
            ErrorDetail(
                field=".".join(str(loc) for loc in error["loc"]) if error.get("loc") else None,
                message=error.get("msg", "Validation error"),
                type=error.get("type"),
            )
        )

    error_response = ErrorResponse(
        error="Validation Error",
        message="Request validation failed",
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        details=errors,
    )

    logger.warning(f"Validation error: {errors}")

    return JSONResponse(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, content=error_response.model_dump())


@app.exception_handler(Exception)
async def general_exception_handler(request: Request, exc: Exception):
    """Handle general exceptions.

    Parameters
    ----------
    request : Request
        FastAPI request
    exc : Exception
        Exception instance

    Returns
    -------
    JSONResponse
        Error response
    """
    error_response = ErrorResponse(
        error="Internal Server Error",
        message="An unexpected error occurred",
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        details=None,
    )

    logger.error(f"Unhandled exception at {request.url.path}: {exc}")

    return JSONResponse(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, content=error_response.model_dump())


# Include routers
app.include_router(sam3.router)


# Root endpoint
@app.get("/", tags=["Root"])
async def root():
    """Root endpoint.

    Returns
    -------
    dict
        Welcome message
    """
    return {
        "message": "Welcome to SAM3 API",
        "version": settings.APP_VERSION,
        "docs": "/docs",
        "health": "/api/v1/sam3/health",
    }


# Run application
if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "app.main:app",
        host=settings.APP_HOST,
        port=settings.APP_PORT,
        reload=settings.DEBUG,
        log_level=settings.LOG_LEVEL.lower(),
    )
