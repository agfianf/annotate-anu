"""Application configuration settings."""

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings with environment variable support."""

    # Application
    APP_TITLE: str = "SAM3 API"
    APP_DESCRIPTION: str = "Segment Anything Model 3 - Promptable Segmentation API"
    APP_VERSION: str = "0.1.0"
    APP_HOST: str = "0.0.0.0"
    APP_PORT: int = 8000
    DEBUG: bool = False

    # SAM3 Model Settings (Ultralytics)
    SAM3_MODEL_PATH: str = "sam3.pt"  # Path to sam3.pt (local file or Ultralytics model name)
    SAM3_DEVICE: str = "auto"  # auto, cpu, cuda
    SAM3_DEFAULT_THRESHOLD: float = Field(default=0.5, ge=0.0, le=1.0)
    SAM3_DEFAULT_MASK_THRESHOLD: float = Field(default=0.5, ge=0.0, le=1.0)

    # API Limits
    MAX_IMAGE_SIZE_MB: int = 10
    MAX_BATCH_SIZE: int = 10
    MAX_IMAGE_DIMENSION: int = 4096  # Max width or height

    # Visualization
    VISUALIZATION_FORMAT: str = "PNG"  # PNG or JPEG
    VISUALIZATION_QUALITY: int = 95  # For JPEG

    # Logging
    LOG_LEVEL: str = "INFO"
    LOG_JSON_FORMAT: bool = False

    # CORS
    ALLOWED_ORIGINS: list[str] = ["*"]
    ALLOWED_METHODS: list[str] = ["*"]
    ALLOWED_HEADERS: list[str] = ["*"]

    model_config = SettingsConfigDict(env_file=".env", case_sensitive=True, extra="ignore")


settings = Settings()
