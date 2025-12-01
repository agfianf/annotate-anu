"""Database engine and metadata configuration."""

from pathlib import Path

from sqlalchemy import MetaData, create_engine
from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine

from app.config import settings

# Naming convention for constraints (PostgreSQL/SQLite)
naming_convention = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}

metadata = MetaData(naming_convention=naming_convention)


def get_async_engine() -> AsyncEngine:
    """Create and configure async database engine.

    Returns
    -------
    AsyncEngine
        Configured async database engine
    """
    # Ensure data directory exists for SQLite
    if settings.DATABASE_URL.startswith("sqlite"):
        db_path = Path(settings.DATABASE_URL.replace("sqlite:///", "").replace("sqlite+aiosqlite:///", ""))
        db_path.parent.mkdir(parents=True, exist_ok=True)

    # Convert SQLite URL to async version
    database_url = settings.DATABASE_URL
    if database_url.startswith("sqlite:///"):
        database_url = database_url.replace("sqlite:///", "sqlite+aiosqlite:///")

    return create_async_engine(
        database_url,
        echo=settings.API_CORE_DEBUG,
        pool_pre_ping=True,
        pool_size=5,
        max_overflow=10,
    )


def get_sync_engine():
    """Create sync engine for Alembic migrations.

    Returns
    -------
    Engine
        Sync database engine
    """
    # Ensure data directory exists for SQLite
    if settings.DATABASE_URL.startswith("sqlite"):
        db_path = Path(settings.DATABASE_URL.replace("sqlite:///", ""))
        db_path.parent.mkdir(parents=True, exist_ok=True)

    return create_engine(
        settings.DATABASE_URL,
        echo=settings.API_CORE_DEBUG,
    )
