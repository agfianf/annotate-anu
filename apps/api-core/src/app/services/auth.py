"""Authentication service with business logic."""

import hashlib
from datetime import datetime, timedelta, timezone
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncConnection

from app.config import settings
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
    verify_token_type,
)
from app.helpers.logger import logger
from app.repositories.user import RefreshTokenRepository, UserAsyncRepository
from app.schemas.auth import (
    TokenOnlyResponse,
    TokenResponse,
    UserLogin,
    UserRegister,
    UserResponse,
    UserUpdate,
)


class AuthService:
    """Business logic for authentication operations."""

    def __init__(self):
        """Initialize auth service."""
        self.user_repo = UserAsyncRepository
        self.token_repo = RefreshTokenRepository

    def _hash_token(self, token: str) -> str:
        """Create SHA256 hash of token for storage.

        Parameters
        ----------
        token : str
            Token to hash

        Returns
        -------
        str
            SHA256 hash of token
        """
        return hashlib.sha256(token.encode()).hexdigest()

    def _user_to_response(self, user_data) -> UserResponse:
        """Convert user dict or UserBase to UserResponse.

        Parameters
        ----------
        user_data : dict | UserBase
            User data from database

        Returns
        -------
        UserResponse
            Public user response
        """
        # Convert Pydantic model to dict if needed
        if hasattr(user_data, "model_dump"):
            user_data = user_data.model_dump()
        
        return UserResponse(
            id=user_data["id"],
            email=user_data["email"],
            username=user_data["username"],
            full_name=user_data.get("full_name"),
            role=user_data["role"],
            is_active=user_data["is_active"],
            created_at=user_data["created_at"],
        )

    async def register(
        self,
        connection: AsyncConnection,
        payload: UserRegister,
    ) -> TokenResponse:
        """Register a new user.

        Parameters
        ----------
        connection : AsyncConnection
            Database connection
        payload : UserRegister
            Registration data

        Returns
        -------
        TokenResponse
            Access and refresh tokens with user info

        Raises
        ------
        ValueError
            If validation fails or user already exists
        """
        from app.core.password import PasswordValidator

        # Validate password
        is_valid, errors = PasswordValidator.validate(
            password=payload.password,
            confirm_password=payload.confirm_password,
            username=payload.username,
        )
        if not is_valid:
            raise ValueError(errors[0] if len(errors) == 1 else "; ".join(errors))

        # Check if email exists
        existing = await self.user_repo.get_by_email(connection, payload.email)
        if existing:
            raise ValueError(f"Email '{payload.email}' is already registered")

        # Check if username exists
        existing = await self.user_repo.get_by_username(connection, payload.username)
        if existing:
            raise ValueError(f"Username '{payload.username}' is already taken")

        # Check if first user
        user_count = await self.user_repo.get_user_count(connection)
        is_first_user = user_count == 0

        if is_first_user:
            # First user becomes admin and is active
            role = "admin"
            is_active = True
            logger.info("Registering first user as admin")
        else:
            # Subsequent users get their selected role (default to annotator) but are inactive
            role = payload.role if payload.role in ["member", "annotator"] else "annotator"
            is_active = False
            logger.info(f"Registering user with role '{role}' (inactive, needs admin approval)")

        # Hash password and create user
        user_data = {
            "email": payload.email,
            "username": payload.username,
            "hashed_password": hash_password(payload.password),
            "full_name": payload.full_name,
            "role": role,
            "is_active": is_active,
        }

        user = await self.user_repo.create(connection, user_data)
        logger.info(f"User registered: {user.email} (@{user.username}) as {role}")

        # Generate tokens
        return await self._generate_tokens(connection, user)

    async def login(
        self,
        connection: AsyncConnection,
        payload: UserLogin,
    ) -> TokenResponse:
        """Authenticate user and return tokens.

        Parameters
        ----------
        connection : AsyncConnection
            Database connection
        payload : UserLogin
            Login credentials

        Returns
        -------
        TokenResponse
            Access and refresh tokens with user info

        Raises
        ------
        ValueError
            If credentials are invalid
        """
        # Get user by email
        user_data = await self.user_repo.get_by_email(connection, payload.email)
        if not user_data:
            raise ValueError("Invalid email or password")

        # Verify password
        if not verify_password(payload.password, user_data["hashed_password"]):
            raise ValueError("Invalid email or password")

        # Check if active
        if not user_data["is_active"]:
            raise ValueError("Account is deactivated")

        logger.info(f"User logged in: {user_data['email']}")

        # Generate tokens
        return await self._generate_tokens(connection, user_data)

    async def refresh(
        self,
        connection: AsyncConnection,
        refresh_token: str,
    ) -> TokenOnlyResponse:
        """Refresh access token using refresh token.

        Parameters
        ----------
        connection : AsyncConnection
            Database connection
        refresh_token : str
            Refresh token

        Returns
        -------
        TokenOnlyResponse
            New access token

        Raises
        ------
        ValueError
            If refresh token is invalid
        """
        # Decode and verify token
        payload = decode_token(refresh_token)
        if not payload:
            raise ValueError("Invalid refresh token")

        if not verify_token_type(payload, "refresh"):
            raise ValueError("Invalid token type")

        # Check if token is in database and not revoked
        token_hash = self._hash_token(refresh_token)
        stored_token = await self.token_repo.get_by_hash(connection, token_hash)
        if not stored_token:
            raise ValueError("Refresh token not found or revoked")

        # Check expiration
        if stored_token["expires_at"] < datetime.now(timezone.utc):
            raise ValueError("Refresh token expired")

        # Get user
        user_id = UUID(payload.get("sub"))
        user = await self.user_repo.get_by_id(connection, user_id)
        if not user:
            raise ValueError("User not found")

        if not user.is_active:
            raise ValueError("Account is deactivated")

        # Generate new access token
        access_token = create_access_token(data={"sub": str(user.id)})

        return TokenOnlyResponse(
            access_token=access_token,
            token_type="bearer",
            expires_in=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        )

    async def logout(
        self,
        connection: AsyncConnection,
        refresh_token: str,
    ) -> bool:
        """Revoke refresh token (logout).

        Parameters
        ----------
        connection : AsyncConnection
            Database connection
        refresh_token : str
            Refresh token to revoke

        Returns
        -------
        bool
            True if logout successful
        """
        token_hash = self._hash_token(refresh_token)
        await self.token_repo.revoke(connection, token_hash)
        return True

    async def logout_all(
        self,
        connection: AsyncConnection,
        user_id: UUID,
    ) -> bool:
        """Revoke all refresh tokens for user (logout everywhere).

        Parameters
        ----------
        connection : AsyncConnection
            Database connection
        user_id : UUID
            User ID

        Returns
        -------
        bool
            True if successful
        """
        await self.token_repo.revoke_all_for_user(connection, user_id)
        return True

    async def get_current_user(
        self,
        connection: AsyncConnection,
        user_id: UUID,
    ) -> UserResponse:
        """Get current user info.

        Parameters
        ----------
        connection : AsyncConnection
            Database connection
        user_id : UUID
            User ID from token

        Returns
        -------
        UserResponse
            User information

        Raises
        ------
        ValueError
            If user not found
        """
        user = await self.user_repo.get_by_id(connection, user_id)
        if not user:
            raise ValueError("User not found")

        return UserResponse(
            id=user.id,
            email=user.email,
            full_name=user.full_name,
            role=user.role,
            is_active=user.is_active,
            created_at=user.created_at,
        )

    async def update_profile(
        self,
        connection: AsyncConnection,
        user_id: UUID,
        payload: UserUpdate,
    ) -> UserResponse:
        """Update user profile.

        Parameters
        ----------
        connection : AsyncConnection
            Database connection
        user_id : UUID
            User ID
        payload : UserUpdate
            Update data

        Returns
        -------
        UserResponse
            Updated user

        Raises
        ------
        ValueError
            If user not found
        """
        update_data = {}

        if payload.full_name is not None:
            update_data["full_name"] = payload.full_name

        if payload.password is not None:
            update_data["hashed_password"] = hash_password(payload.password)

        if not update_data:
            # Nothing to update, return current user
            user = await self.user_repo.get_by_id(connection, user_id)
            if not user:
                raise ValueError("User not found")
            return UserResponse(
                id=user.id,
                email=user.email,
                full_name=user.full_name,
                role=user.role,
                is_active=user.is_active,
                created_at=user.created_at,
            )

        user = await self.user_repo.update(connection, user_id, update_data)
        if not user:
            raise ValueError("User not found")

        return UserResponse(
            id=user.id,
            email=user.email,
            full_name=user.full_name,
            role=user.role,
            is_active=user.is_active,
            created_at=user.created_at,
        )

    async def _generate_tokens(
        self,
        connection: AsyncConnection,
        user_data,
    ) -> TokenResponse:
        """Generate access and refresh tokens for user.

        Parameters
        ----------
        connection : AsyncConnection
            Database connection
        user_data : dict | UserBase
            User data

        Returns
        -------
        TokenResponse
            Token pair with user info
        """
        # Convert Pydantic model to dict if needed
        if hasattr(user_data, "model_dump"):
            user_dict = user_data.model_dump()
        else:
            user_dict = user_data
            
        user_id = str(user_dict["id"])

        # Create tokens
        access_token = create_access_token(data={"sub": user_id})
        refresh_token = create_refresh_token(data={"sub": user_id})

        # Store refresh token hash
        expires_at = datetime.now(timezone.utc) + timedelta(
            days=settings.JWT_REFRESH_TOKEN_EXPIRE_DAYS
        )
        await self.token_repo.create(
            connection,
            {
                "user_id": user_dict["id"],
                "token_hash": self._hash_token(refresh_token),
                "expires_at": expires_at,
            },
        )

        return TokenResponse(
            access_token=access_token,
            refresh_token=refresh_token,
            token_type="bearer",
            expires_in=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES * 60,
            user=self._user_to_response(user_dict),
        )
