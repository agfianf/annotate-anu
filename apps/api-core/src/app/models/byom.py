"""SQLAlchemy models for BYOM registry."""

from sqlalchemy import Boolean, Column, DateTime, Index, JSON, String, Table, Text, text

from app.helpers.database import metadata

registered_models = Table(
    "registered_models",
    metadata,
    Column(
        "id",
        String(36),
        primary_key=True,
        server_default=text("(lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6))))"),
        comment="UUID primary key",
    ),
    Column(
        "name",
        String(100),
        nullable=False,
        unique=True,
        comment="Unique display name for the model",
    ),
    Column(
        "endpoint_url",
        String(500),
        nullable=False,
        comment="Base URL of the external model API",
    ),
    Column(
        "auth_token",
        String(500),
        nullable=True,
        comment="Bearer token for authentication (encrypted)",
    ),
    Column(
        "capabilities",
        JSON,
        nullable=True,
        comment="Model capabilities as JSON object",
    ),
    Column(
        "endpoint_config",
        JSON,
        nullable=True,
        comment="Custom endpoint configuration for non-standard APIs",
    ),
    Column(
        "description",
        Text,
        nullable=True,
        comment="Optional description of the model",
    ),
    Column(
        "is_active",
        Boolean,
        nullable=False,
        server_default=text("1"),
        comment="Whether the model is active",
    ),
    Column(
        "is_healthy",
        Boolean,
        nullable=False,
        server_default=text("0"),
        comment="Last health check result",
    ),
    Column(
        "last_health_check",
        DateTime,
        nullable=True,
        comment="Timestamp of last health check",
    ),
    Column(
        "created_at",
        DateTime,
        nullable=False,
        server_default=text("(datetime('now'))"),
        comment="Creation timestamp",
    ),
    Column(
        "updated_at",
        DateTime,
        nullable=False,
        server_default=text("(datetime('now'))"),
        comment="Last update timestamp",
    ),
    Index("ix_registered_models_name", "name"),
    Index("ix_registered_models_is_active", "is_active"),
)
