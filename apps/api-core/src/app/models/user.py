"""SQLAlchemy Core model for users table."""

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
from sqlalchemy.dialects.postgresql import UUID

from app.helpers.database import metadata

users = Table(
    "users",
    metadata,
    Column(
        "id",
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
        comment="UUID primary key",
    ),
    Column(
        "email",
        String(255),
        unique=True,
        nullable=False,
        comment="User email address",
    ),
    Column(
        "username",
        String(50),
        unique=True,
        nullable=False,
        comment="Unique username",
    ),
    Column(
        "hashed_password",
        String(255),
        nullable=False,
        comment="Bcrypt hashed password",
    ),
    Column(
        "full_name",
        String(255),
        nullable=False,
        comment="User's full name",
    ),
    Column(
        "role",
        String(20),
        nullable=False,
        server_default=text("'annotator'"),
        comment="User role: admin, member, annotator",
    ),
    Column(
        "is_active",
        Boolean,
        nullable=False,
        server_default=text("true"),
        comment="Whether the user account is active",
    ),
    Column(
        "deleted_at",
        DateTime(timezone=True),
        nullable=True,
        comment="Soft delete timestamp",
    ),
    Column(
        "created_at",
        DateTime(timezone=True),
        nullable=False,
        server_default=text("now()"),
        comment="Creation timestamp",
    ),
    Column(
        "updated_at",
        DateTime(timezone=True),
        nullable=False,
        server_default=text("now()"),
        comment="Last update timestamp",
    ),
    # Indexes
    Index("ix_users_email", "email"),
    Index("ix_users_username", "username"),
    Index("ix_users_role", "role"),
    Index("ix_users_is_active", "is_active"),
)

# Refresh tokens table for token invalidation
refresh_tokens = Table(
    "refresh_tokens",
    metadata,
    Column(
        "id",
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    ),
    Column(
        "user_id",
        UUID(as_uuid=True),
        nullable=False,
        comment="User this token belongs to",
    ),
    Column(
        "token_hash",
        String(255),
        nullable=False,
        unique=True,
        comment="SHA256 hash of the refresh token",
    ),
    Column(
        "expires_at",
        DateTime(timezone=True),
        nullable=False,
        comment="Token expiration timestamp",
    ),
    Column(
        "is_revoked",
        Boolean,
        nullable=False,
        server_default=text("false"),
        comment="Whether token is revoked",
    ),
    Column(
        "created_at",
        DateTime(timezone=True),
        nullable=False,
        server_default=text("now()"),
    ),
    # Indexes
    Index("ix_refresh_tokens_user_id", "user_id"),
    Index("ix_refresh_tokens_token_hash", "token_hash"),
)
