"""Configuration settings for API Core service."""

from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # API settings
    API_CORE_HOST: str = Field(default="0.0.0.0", description="API host")
    API_CORE_PORT: int = Field(default=8001, description="API port")
    API_CORE_DEBUG: bool = Field(default=False, description="Debug mode")
    API_CORE_VERSION: str = Field(default="0.1.0", description="API version")

    # Database settings (PostgreSQL)
    DATABASE_URL: str = Field(
        default="postgresql+asyncpg://annotateanu:annotateanu_dev@localhost:5432/annotateanu",
        description="PostgreSQL connection URL (async)",
    )
    DATABASE_URL_SYNC: str = Field(
        default="postgresql://annotateanu:annotateanu_dev@localhost:5432/annotateanu",
        description="PostgreSQL connection URL (sync for Alembic)",
    )

    # Redis settings
    REDIS_URL: str = Field(
        default="redis://localhost:6379/0",
        description="Redis connection URL",
    )

    # CORS settings
    CORS_ORIGINS: list[str] = Field(
        default=["http://localhost:5173", "http://localhost:3000"],
        description="Allowed CORS origins",
    )

    # Logging
    LOG_LEVEL: str = Field(default="INFO", description="Logging level")

    # JWT Authentication
    JWT_SECRET_KEY: str = Field(
        default="dev-secret-key-change-in-production-please",
        description="Secret key for JWT signing",
    )
    JWT_ALGORITHM: str = Field(default="HS256", description="JWT algorithm")
    JWT_ACCESS_TOKEN_EXPIRE_MINUTES: int = Field(
        default=30, description="Access token expiry in minutes"
    )
    JWT_REFRESH_TOKEN_EXPIRE_DAYS: int = Field(
        default=7, description="Refresh token expiry in days"
    )

    # Password hashing
    BCRYPT_ROUNDS: int = Field(default=12, description="Bcrypt hashing rounds")

    # Security (legacy - for encryption)
    SECRET_KEY: str = Field(default="change-me-in-production", description="Secret key for signing")
    ENCRYPTION_KEY: str = Field(
        default="change-me-in-production-32-chars",
        description="Key for encrypting sensitive data",
    )

    # Health check settings
    HEALTH_CHECK_TIMEOUT: int = Field(default=10, description="Health check timeout in seconds")
    HEALTH_CHECK_INTERVAL: int = Field(default=300, description="Health check interval in seconds")

    # Inference proxy settings
    SAM3_API_URL: str = Field(
        default="http://localhost:8000",
        description="SAM3 API inference service URL",
    )
    INFERENCE_TIMEOUT: int = Field(default=120, description="Inference request timeout in seconds")

    # File Share Settings
    SHARE_ROOT: Path = Field(
        default=Path("/data/share"),
        description="Root directory for shared file storage",
    )
    SHARE_MAX_DEPTH: int = Field(default=5, description="Maximum folder depth allowed")
    SHARE_ALLOWED_EXTENSIONS: set[str] = Field(
        default={".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp"},
        description="Allowed file extensions for upload",
    )
    SHARE_MAX_UPLOAD_SIZE_MB: int = Field(default=50, description="Maximum upload file size in MB")
    SHARE_MAX_UPLOAD_FILES: int = Field(
        default=100000, description="Maximum number of files per upload request"
    )
    SHARE_THUMBNAIL_SIZES: dict[str, tuple[int, int]] = Field(
        default={
            "1x": (256, 256),  # Small zoom
            "2x": (512, 512),  # Medium zoom (default)
            "4x": (1024, 1024),  # Large zoom
        },
        description="Thumbnail dimensions for different zoom levels",
    )
    SHARE_THUMBNAIL_CACHE_DIR: Path = Field(
        default=Path("/data/cache/thumbnails"),
        description="Directory for cached thumbnails",
    )
    SHARE_THUMBNAIL_QUALITY: int = Field(
        default=85, description="JPEG quality for thumbnails (1-100)"
    )

    # Export Settings
    EXPORT_ROOT: Path = Field(
        default=Path("/data/exports"),
        description="Root directory for export artifacts",
    )
    EXPORT_MAX_IMAGES: int = Field(
        default=100000, description="Maximum images per export"
    )

    # Celery Settings
    CELERY_BROKER_URL: str = Field(
        default="redis://localhost:6379/1",
        description="Celery broker URL (Redis)",
    )
    CELERY_RESULT_BACKEND: str = Field(
        default="redis://localhost:6379/1",
        description="Celery result backend URL",
    )


settings = Settings()
