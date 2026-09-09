"""SQLAlchemy Core models for external object storage connections."""

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Table,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID

from app.helpers.database import metadata

# STORAGE CONNECTIONS (S3 / MinIO)
storage_connections = Table(
    "storage_connections",
    metadata,
    Column("id", UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")),
    Column("project_id", Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=True),
    Column("name", String(255), nullable=False),
    Column("endpoint_url", String(512), nullable=True, comment="MinIO/S3-compatible endpoint; empty for AWS"),
    Column("region", String(64), nullable=True),
    Column("bucket", String(255), nullable=False),
    Column("prefix", String(1024), nullable=False, server_default=text("''"), comment="Restrict to a subset of the bucket"),
    Column("access_key", String(255), nullable=False),
    Column("secret_key", Text, nullable=False, comment="Encrypted at rest"),
    Column("use_ssl", Boolean, nullable=False, server_default=text("true")),
    Column("is_active", Boolean, nullable=False, server_default=text("true")),
    Column("last_checked_at", DateTime(timezone=True), nullable=True),
    Column("last_status", String(512), nullable=True),
    Column("created_by", UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
    Column("created_at", DateTime(timezone=True), nullable=False, server_default=text("now()")),
    Column("updated_at", DateTime(timezone=True), nullable=False, server_default=text("now()")),
    UniqueConstraint("project_id", "name", name="uq_storage_connections_project_name"),
    Index("ix_storage_connections_project_id", "project_id"),
)
