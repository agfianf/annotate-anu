"""Authentication router for register, login, refresh, and logout."""

from typing import Annotated

from fastapi import APIRouter, Depends, Form, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import EmailStr
from sqlalchemy.ext.asyncio import AsyncConnection

from app.dependencies.auth import get_current_active_user
from app.dependencies.database import get_async_transaction_conn
from app.helpers.response_api import JsonResponse
from app.schemas.auth import (
    TokenOnlyResponse,
    TokenRefresh,
    TokenResponse,
    UserBase,
    UserRegister,
    UserResponse,
    UserUpdate,
)
from app.services.auth import AuthService

router = APIRouter(prefix="/api/v1/auth", tags=["Authentication"])

# Initialize auth service
auth_service = AuthService()


@router.post("/register", response_model=JsonResponse[TokenResponse, None])
async def register(
    payload: UserRegister,
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)],
):
    """Register a new user.

    Parameters
    ----------
    payload : UserRegister
        Registration data

    Returns
    -------
    JsonResponse[TokenResponse, None]
        Access and refresh tokens with user info
    """
    try:
        result = await auth_service.register(connection, payload)
        return JsonResponse(
            data=result,
            message="User registered successfully",
            status_code=status.HTTP_201_CREATED,
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )


@router.post("/login", response_model=JsonResponse[TokenResponse, None])
async def login(
    form_data: Annotated[OAuth2PasswordRequestForm, Depends()],
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)],
):
    """Authenticate user and return tokens.

    Uses OAuth2 password flow for compatibility with Swagger UI.
    Use email as username field.

    Parameters
    ----------
    form_data : OAuth2PasswordRequestForm
        Login credentials (username=email, password)
    connection : AsyncConnection
        Database connection with transaction

    Returns
    -------
    JsonResponse[TokenResponse, None]
        Access and refresh tokens with user info

    Example Response
    ----------------
    ```json
    {
        "data": {
            "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
            "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
            "token_type": "bearer",
            "expires_in": 1800,
            "user": {
                "id": "a644ceac-f030-4937-b3de-df84627d54d5",
                "email": "john@example.com",
                "username": "johndoe",
                "full_name": "John Doe",
                "role": "annotator",
                "is_active": true,
                "created_at": "2025-12-06T06:00:00.000000Z"
            }
        },
        "message": "Login successful",
        "status_code": 200,
        "meta": null
    }
    ```
    """
    from app.schemas.auth import UserLogin

    try:
        payload = UserLogin(email=form_data.username, password=form_data.password)
        result = await auth_service.login(connection, payload)
        return JsonResponse(
            data=result,
            message="Login successful",
            status_code=status.HTTP_200_OK,
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(e),
            headers={"WWW-Authenticate": "Bearer"},
        )


@router.post("/refresh", response_model=JsonResponse[TokenOnlyResponse, None])
async def refresh_token(
    refresh_token: Annotated[str, Form(description="Refresh token")],
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)],
):
    """Refresh access token using refresh token.

    Parameters
    ----------
    refresh_token : str
        Valid refresh token
    connection : AsyncConnection
        Database connection

    Returns
    -------
    JsonResponse[TokenOnlyResponse, None]
        New access token

    Example Response
    ----------------
    ```json
    {
        "data": {
            "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
            "token_type": "bearer",
            "expires_in": 1800
        },
        "message": "Token refreshed successfully",
        "status_code": 200,
        "meta": null
    }
    ```
    """
    try:
        result = await auth_service.refresh(connection, refresh_token)
        return JsonResponse(
            data=result,
            message="Token refreshed successfully",
            status_code=status.HTTP_200_OK,
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(e),
        )


@router.post("/logout", response_model=JsonResponse[dict, None])
async def logout(
    refresh_token: Annotated[str, Form(description="Refresh token to revoke")],
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)],
):
    """Logout (revoke refresh token).

    Parameters
    ----------
    refresh_token : str
        Refresh token to revoke
    connection : AsyncConnection
        Database connection

    Returns
    -------
    JsonResponse[dict, None]
        Success confirmation

    Example Response
    ----------------
    ```json
    {
        "data": {"success": true},
        "message": "Logged out successfully",
        "status_code": 200,
        "meta": null
    }
    ```
    """
    await auth_service.logout(connection, refresh_token)
    return JsonResponse(
        data={"success": True},
        message="Logged out successfully",
        status_code=status.HTTP_200_OK,
    )


@router.get("/me", response_model=JsonResponse[UserResponse, None])
async def get_me(
    current_user: Annotated[UserBase, Depends(get_current_active_user)],
):
    """Get current user information.

    Parameters
    ----------
    current_user : UserBase
        Current authenticated user

    Returns
    -------
    JsonResponse[UserResponse, None]
        User information

    Example Response
    ----------------
    ```json
    {
        "data": {
            "id": "a644ceac-f030-4937-b3de-df84627d54d5",
            "email": "john@example.com",
            "username": "johndoe",
            "full_name": "John Doe",
            "role": "annotator",
            "is_active": true,
            "created_at": "2025-12-06T06:00:00.000000Z"
        },
        "message": "User retrieved successfully",
        "status_code": 200,
        "meta": null
    }
    ```
    """
    return JsonResponse(
        data=UserResponse(
            id=current_user.id,
            email=current_user.email,
            username=current_user.username,
            full_name=current_user.full_name,
            role=current_user.role,
            is_active=current_user.is_active,
            created_at=current_user.created_at,
        ),
        message="User retrieved successfully",
        status_code=status.HTTP_200_OK,
    )


@router.patch("/me", response_model=JsonResponse[UserResponse, None])
async def update_me(
    current_user: Annotated[UserBase, Depends(get_current_active_user)],
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)],
    full_name: Annotated[str | None, Form(max_length=255, description="New full name")] = None,
    current_password: Annotated[str | None, Form(description="Current password (required to change password)")] = None,
    new_password: Annotated[str | None, Form(min_length=8, max_length=100, description="New password")] = None,
    confirm_new_password: Annotated[str | None, Form(description="Confirm new password")] = None,
):
    """Update current user profile.

    Parameters
    ----------
    full_name : str, optional
        New full name
    current_password : str, optional
        Current password (required if changing password)
    new_password : str, optional
        New password (min 8 chars, complexity required)
    confirm_new_password : str, optional
        Confirm new password

    Returns
    -------
    JsonResponse[UserResponse, None]
        Updated user information

    Example Response
    ----------------
    ```json
    {
        "data": {
            "id": "a644ceac-f030-4937-b3de-df84627d54d5",
            "email": "john@example.com",
            "username": "johndoe",
            "full_name": "John Smith",
            "role": "annotator",
            "is_active": true,
            "created_at": "2025-12-06T06:00:00.000000Z"
        },
        "message": "Profile updated successfully",
        "status_code": 200,
        "meta": null
    }
    ```
    """
    try:
        payload = UserUpdate(
            full_name=full_name,
            current_password=current_password,
            new_password=new_password,
            confirm_new_password=confirm_new_password,
        )
        result = await auth_service.update_profile(connection, current_user.id, payload)
        return JsonResponse(
            data=result,
            message="Profile updated successfully",
            status_code=status.HTTP_200_OK,
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )
