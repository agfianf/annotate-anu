"""Database engine and metadata configuration for PostgreSQL."""

from sqlalchemy import MetaData, create_engine
from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine

from app.config import settings

# Naming convention for constraints (PostgreSQL)
naming_convention = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}

metadata = MetaData(naming_convention=naming_convention)


def get_async_engine() -> AsyncEngine:
    """Create and configure async PostgreSQL database engine.

    Returns
    -------
    AsyncEngine
        Configured async database engine using asyncpg
    """
    return create_async_engine(
        settings.DATABASE_URL,
        echo=settings.API_CORE_DEBUG,
        pool_pre_ping=True,
        pool_size=10,
        max_overflow=20,
    )


def get_sync_engine():
    """Create sync engine for Alembic migrations.

    Returns
    -------
    Engine
        Sync database engine using psycopg2
    """
    return create_engine(
        settings.DATABASE_URL_SYNC,
        echo=settings.API_CORE_DEBUG,
    )
