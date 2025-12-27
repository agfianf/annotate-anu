"""SQLAlchemy Core model for BYOM registered models."""

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Index,
    String,
    Table,
    Text,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB

from app.helpers.database import metadata

# ============================================================================
# REGISTERED MODELS (BYOM)
# ============================================================================
registered_models = Table(
    "registered_models",
    metadata,
    Column(
        "id",
        String(64),
        primary_key=True,
        server_default=text("gen_random_uuid()::text"),
        comment="Unique model identifier (UUID as string)",
    ),
    Column(
        "name",
        String(255),
        nullable=False,
        unique=True,
        comment="Model display name",
    ),
    Column(
        "endpoint_url",
        String(512),
        nullable=False,
        comment="Model endpoint URL",
    ),
    Column(
        "auth_token",
        String(512),
        nullable=True,
        comment="Bearer token for authentication",
    ),
    Column(
        "capabilities",
        JSONB,
        nullable=True,
        comment="Model capabilities (supports_text_prompt, supports_bbox_prompt, etc.)",
    ),
    Column(
        "endpoint_config",
        JSONB,
        nullable=True,
        comment="Custom endpoint configuration and response mapping",
    ),
    Column(
        "description",
        Text,
        nullable=True,
        comment="Model description",
    ),
    Column(
        "is_active",
        Boolean,
        nullable=False,
        server_default=text("true"),
        comment="Whether model is active",
    ),
    Column(
        "is_healthy",
        Boolean,
        nullable=False,
        server_default=text("false"),
        comment="Last health check result",
    ),
    Column(
        "last_health_check",
        DateTime(timezone=True),
        nullable=True,
        comment="Timestamp of last health check",
    ),
    Column(
        "created_at",
        DateTime(timezone=True),
        nullable=False,
        server_default=text("now()"),
    ),
    Column(
        "updated_at",
        DateTime(timezone=True),
        nullable=False,
        server_default=text("now()"),
    ),
    # Indexes
    Index("ix_registered_models_name", "name", unique=True),
    Index("ix_registered_models_is_active", "is_active"),
)
