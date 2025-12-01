"""Configuration settings for API Core service."""

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

    # Database settings
    DATABASE_URL: str = Field(
        default="sqlite:///data/byom.db",
        description="Database connection URL"
    )

    # CORS settings
    CORS_ORIGINS: list[str] = Field(
        default=["http://localhost:5173", "http://localhost:3000"],
        description="Allowed CORS origins"
    )

    # Logging
    LOG_LEVEL: str = Field(default="INFO", description="Logging level")

    # Security
    SECRET_KEY: str = Field(default="change-me-in-production", description="Secret key for signing")
    ENCRYPTION_KEY: str = Field(
        default="change-me-in-production-32-chars",
        description="Key for encrypting sensitive data"
    )

    # Health check settings
    HEALTH_CHECK_TIMEOUT: int = Field(default=10, description="Health check timeout in seconds")
    HEALTH_CHECK_INTERVAL: int = Field(default=300, description="Health check interval in seconds")

    # Inference proxy settings
    SAM3_API_URL: str = Field(
        default="http://localhost:8000",
        description="SAM3 API inference service URL"
    )
    INFERENCE_TIMEOUT: int = Field(default=120, description="Inference request timeout in seconds")


settings = Settings()
