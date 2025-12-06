"""Authentication dependencies for route protection."""

from typing import Annotated
from uuid import UUID

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.ext.asyncio import AsyncConnection

from app.core.security import decode_token, verify_token_type
from app.dependencies.database import get_async_conn
from app.repositories.user import UserAsyncRepository
from app.schemas.auth import UserBase

# OAuth2 scheme for bearer token
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")


async def get_current_user(
    token: Annotated[str, Depends(oauth2_scheme)],
    connection: Annotated[AsyncConnection, Depends(get_async_conn)],
) -> UserBase:
    """Validate JWT and return current user.

    Parameters
    ----------
    token : str
        JWT access token from Authorization header
    connection : AsyncConnection
        Database connection

    Returns
    -------
    UserBase
        Current authenticated user

    Raises
    ------
    HTTPException
        401 if token is invalid or user not found
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    # Decode token
    payload = decode_token(token)
    if not payload:
        raise credentials_exception

    # Verify it's an access token
    if not verify_token_type(payload, "access"):
        raise credentials_exception

    # Get user ID from token
    user_id_str = payload.get("sub")
    if not user_id_str:
        raise credentials_exception

    try:
        user_id = UUID(user_id_str)
    except ValueError:
        raise credentials_exception

    # Get user from database
    user = await UserAsyncRepository.get_by_id(connection, user_id)
    if not user:
        raise credentials_exception

    return user


async def get_current_active_user(
    current_user: Annotated[UserBase, Depends(get_current_user)],
) -> UserBase:
    """Ensure current user is active.

    Parameters
    ----------
    current_user : UserBase
        Current authenticated user

    Returns
    -------
    UserBase
        Active user

    Raises
    ------
    HTTPException
        403 if user is not active
    """
    if not current_user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is deactivated",
        )
    return current_user


async def get_admin_user(
    current_user: Annotated[UserBase, Depends(get_current_active_user)],
) -> UserBase:
    """Ensure current user is an admin.

    Parameters
    ----------
    current_user : UserBase
        Current authenticated user

    Returns
    -------
    UserBase
        Admin user

    Raises
    ------
    HTTPException
        403 if user is not an admin
    """
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )
    return current_user
