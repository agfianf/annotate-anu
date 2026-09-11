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

    # SAM3 Model Settings
    SAM3_MODEL_NAME: str = "facebook/sam3"
    SAM3_DEVICE: str = "auto"  # auto, cpu, cuda
    SAM3_DEFAULT_THRESHOLD: float = Field(default=0.5, ge=0.0, le=1.0)
    SAM3_DEFAULT_MASK_THRESHOLD: float = Field(default=0.5, ge=0.0, le=1.0)
    SAM3_CACHE_DIR: str | None = None  # HuggingFace cache directory
    # bf16 autocast on CUDA roughly halves the forward pass. Measured on an RTX A6000
    # against fp32: mask IoU > 0.997 per object, scores within 0.003, boxes within 1px.
    SAM3_AUTOCAST: bool = True
    # Run one dummy text and point inference at startup so the first real request
    # does not pay for CUDA context init, lazy kernel loading and cuDNN autotuning.
    SAM3_WARMUP: bool = True
    # Vision-encoder outputs kept per model, keyed by image content hash. A repeat
    # prompt on the same image (another click, another text query) then skips the
    # encoder, which is most of the forward pass. Each entry is tens of MB on the GPU.
    SAM3_FEATURE_CACHE_SIZE: int = 4

    # HuggingFace Authentication (required for gated models like SAM3)
    HF_TOKEN: str | None = None  # HuggingFace API token

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
