"""Database connection dependencies for FastAPI dependency injection."""

from collections.abc import AsyncGenerator
from typing import Annotated

from fastapi import Depends, Request
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


async def get_async_transaction_conn(
    connection: Annotated[AsyncConnection, Depends(get_async_conn)],
) -> AsyncGenerator[AsyncConnection, None]:
    """Get async database connection with transaction for WRITE operations.

    Parameters
    ----------
    connection : AsyncConnection
        The same request-scoped connection used by authentication and permission checks.

    Yields
    ------
    AsyncConnection
        Async database connection with transaction context
    """
    # Permission queries may already have autobegun a transaction. Reuse it;
    # acquiring a second connection here can deadlock an exhausted pool.
    try:
        yield connection
        await connection.commit()
    except BaseException:
        await connection.rollback()
        raise
