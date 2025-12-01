"""Database connection dependencies for FastAPI dependency injection."""

from collections.abc import AsyncGenerator

from fastapi import Request
from sqlalchemy.ext.asyncio import AsyncConnection


async def get_async_conn(request: Request) -> AsyncConnection:
    """Get async database connection for READ operations.

    Parameters
    ----------
    request : Request
        FastAPI request object with engine in state

    Returns
    -------
    AsyncConnection
        Async database connection (no transaction)
    """
    engine = request.state.engine
    async with engine.connect() as connection:
        yield connection


async def get_async_transaction_conn(request: Request) -> AsyncGenerator[AsyncConnection, None]:
    """Get async database connection with transaction for WRITE operations.

    Parameters
    ----------
    request : Request
        FastAPI request object with engine in state

    Yields
    ------
    AsyncConnection
        Async database connection with transaction context
    """
    engine = request.state.engine
    async with engine.begin() as connection:
        yield connection
