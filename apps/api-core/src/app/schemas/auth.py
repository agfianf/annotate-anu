"""Pydantic schemas for authentication."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field


# ============================================================================
# User Roles Enum
# ============================================================================
class UserRole:
    """User role constants."""

    ADMIN = "admin"
    MEMBER = "member"
    ANNOTATOR = "annotator"


# ============================================================================
# Request Schemas
# ============================================================================
class UserRegister(BaseModel):
    """Schema for user registration request."""

    email: EmailStr = Field(..., description="User email address")
    username: str = Field(
        ...,
        min_length=3,
        max_length=50,
        pattern=r"^[a-zA-Z0-9_]+$",
        description="Username (alphanumeric and underscores only)",
    )
    password: str = Field(..., min_length=8, max_length=100, description="Password")
    confirm_password: str = Field(..., description="Password confirmation")
    full_name: str = Field(..., min_length=1, max_length=255, description="Full name")
    role: str | None = Field(
        None,
        pattern=r"^(member|annotator)$",
        description="Role (member or annotator) - ignored for first user who becomes admin",
    )


class UserLogin(BaseModel):
    """Schema for user login request."""

    email: EmailStr = Field(..., description="User email address")
    password: str = Field(..., description="Password")


class TokenRefresh(BaseModel):
    """Schema for token refresh request."""

    refresh_token: str = Field(..., description="Refresh token")


class UserUpdate(BaseModel):
    """Schema for updating user profile."""

    full_name: str | None = Field(None, max_length=255, description="Full name")
    current_password: str | None = Field(None, description="Current password (required for password change)")
    new_password: str | None = Field(None, min_length=8, max_length=100, description="New password")
    confirm_new_password: str | None = Field(None, description="Confirm new password")


# ============================================================================
# Response Schemas
# ============================================================================
class UserBase(BaseModel):
    """Base user schema with common fields."""

    id: UUID
    email: str
    username: str
    full_name: str | None
    role: str
    is_active: bool
    created_at: datetime
    updated_at: datetime


class UserResponse(BaseModel):
    """User response schema (public)."""

    id: UUID
    email: str
    username: str
    full_name: str | None
    role: str
    is_active: bool
    created_at: datetime


class TokenResponse(BaseModel):
    """Schema for token response after login/register."""

    access_token: str = Field(..., description="JWT access token")
    refresh_token: str = Field(..., description="JWT refresh token")
    token_type: str = Field(default="bearer", description="Token type")
    expires_in: int = Field(..., description="Access token expiry in seconds")
    user: UserResponse = Field(..., description="User information")


class TokenOnlyResponse(BaseModel):
    """Schema for token refresh response."""

    access_token: str = Field(..., description="JWT access token")
    token_type: str = Field(default="bearer", description="Token type")
    expires_in: int = Field(..., description="Access token expiry in seconds")
