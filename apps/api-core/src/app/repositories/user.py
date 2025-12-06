"""Repository layer for user data access."""

from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import delete, insert, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncConnection

from app.models.user import refresh_tokens, users
from app.schemas.auth import UserBase


class UserStatements:
    """SQL statement builders for user operations."""

    @staticmethod
    def select_by_id(user_id: UUID):
        """Build SELECT statement for user by ID.

        Parameters
        ----------
        user_id : UUID
            User identifier

        Returns
        -------
        Select
            SQLAlchemy select statement
        """
        return select(users).where(
            users.c.id == user_id,
            users.c.deleted_at.is_(None),
        )

    @staticmethod
    def select_by_email(email: str):
        """Build SELECT statement for user by email.

        Parameters
        ----------
        email : str
            User email

        Returns
        -------
        Select
            SQLAlchemy select statement
        """
        return select(users).where(
            users.c.email == email,
            users.c.deleted_at.is_(None),
        )

    @staticmethod
    def select_by_username(username: str):
        """Build SELECT statement for user by username.

        Parameters
        ----------
        username : str
            Username

        Returns
        -------
        Select
            SQLAlchemy select statement
        """
        return select(users).where(
            users.c.username == username,
            users.c.deleted_at.is_(None),
        )

    @staticmethod
    def insert_user(data: dict):
        """Build INSERT statement for new user.

        Parameters
        ----------
        data : dict
            User data

        Returns
        -------
        Insert
            SQLAlchemy insert statement
        """
        return insert(users).values(**data).returning(users)

    @staticmethod
    def update_user(user_id: UUID, data: dict):
        """Build UPDATE statement for user.

        Parameters
        ----------
        user_id : UUID
            User identifier
        data : dict
            Updated fields

        Returns
        -------
        Update
            SQLAlchemy update statement
        """
        data["updated_at"] = datetime.now(timezone.utc)
        return (
            update(users)
            .where(users.c.id == user_id)
            .values(**data)
            .returning(users)
        )


class RefreshTokenStatements:
    """SQL statement builders for refresh token operations."""

    @staticmethod
    def insert_token(data: dict):
        """Build INSERT statement for refresh token."""
        return insert(refresh_tokens).values(**data).returning(refresh_tokens)

    @staticmethod
    def select_by_hash(token_hash: str):
        """Build SELECT statement for token by hash."""
        return select(refresh_tokens).where(
            refresh_tokens.c.token_hash == token_hash,
            refresh_tokens.c.is_revoked == False,  # noqa: E712
        )

    @staticmethod
    def revoke_token(token_hash: str):
        """Build UPDATE statement to revoke a token."""
        return (
            update(refresh_tokens)
            .where(refresh_tokens.c.token_hash == token_hash)
            .values(is_revoked=True)
        )

    @staticmethod
    def revoke_all_user_tokens(user_id: UUID):
        """Build UPDATE statement to revoke all user tokens."""
        return (
            update(refresh_tokens)
            .where(refresh_tokens.c.user_id == user_id)
            .values(is_revoked=True)
        )


class UserAsyncRepository:
    """Async repository for user operations."""

    @staticmethod
    async def get_by_id(connection: AsyncConnection, user_id: UUID) -> UserBase | None:
        """Retrieve user by ID.

        Parameters
        ----------
        connection : AsyncConnection
            Database connection
        user_id : UUID
            User identifier

        Returns
        -------
        UserBase | None
            User data or None if not found
        """
        stmt = UserStatements.select_by_id(user_id)
        result = await connection.execute(stmt)
        row = result.fetchone()

        if not row:
            return None

        return UserBase(**dict(row._mapping))

    @staticmethod
    async def get_by_email(connection: AsyncConnection, email: str) -> dict | None:
        """Retrieve user by email (includes hashed_password for auth).

        Parameters
        ----------
        connection : AsyncConnection
            Database connection
        email : str
            User email

        Returns
        -------
        dict | None
            User data including hashed_password, or None if not found
        """
        stmt = UserStatements.select_by_email(email)
        result = await connection.execute(stmt)
        row = result.fetchone()

        if not row:
            return None

        return dict(row._mapping)

    @staticmethod
    async def get_by_username(connection: AsyncConnection, username: str) -> dict | None:
        """Retrieve user by username.

        Parameters
        ----------
        connection : AsyncConnection
            Database connection
        username : str
            Username

        Returns
        -------
        dict | None
            User data or None if not found
        """
        stmt = UserStatements.select_by_username(username)
        result = await connection.execute(stmt)
        row = result.fetchone()

        if not row:
            return None

        return dict(row._mapping)

    @staticmethod
    async def create(connection: AsyncConnection, data: dict) -> UserBase:
        """Create new user.

        Parameters
        ----------
        connection : AsyncConnection
            Database connection
        data : dict
            User data

        Returns
        -------
        UserBase
            Created user

        Raises
        ------
        ValueError
            If email or username already exists
        """
        try:
            stmt = UserStatements.insert_user(data)
            result = await connection.execute(stmt)
            row = result.fetchone()
            return UserBase(**dict(row._mapping))
        except IntegrityError as e:
            error_msg = str(e.orig)
            if "email" in error_msg:
                raise ValueError(f"Email '{data.get('email')}' is already registered")
            elif "username" in error_msg:
                raise ValueError(f"Username '{data.get('username')}' is already taken")
            raise ValueError("User already exists")

    @staticmethod
    async def update(
        connection: AsyncConnection, user_id: UUID, data: dict
    ) -> UserBase | None:
        """Update existing user.

        Parameters
        ----------
        connection : AsyncConnection
            Database connection
        user_id : UUID
            User identifier
        data : dict
            Updated fields

        Returns
        -------
        UserBase | None
            Updated user or None if not found
        """
        stmt = UserStatements.update_user(user_id, data)
        result = await connection.execute(stmt)
        row = result.fetchone()

        if not row:
            return None

        return UserBase(**dict(row._mapping))

    @staticmethod
    async def get_user_count(connection: AsyncConnection) -> int:
        """Get total count of non-deleted users.

        Parameters
        ----------
        connection : AsyncConnection
            Database connection

        Returns
        -------
        int
            Total count of users
        """
        from sqlalchemy import func
        stmt = select(func.count()).select_from(users).where(users.c.deleted_at.is_(None))
        result = await connection.execute(stmt)
        return result.scalar() or 0


class RefreshTokenRepository:
    """Repository for refresh token operations."""

    @staticmethod
    async def create(connection: AsyncConnection, data: dict) -> None:
        """Store refresh token hash."""
        stmt = RefreshTokenStatements.insert_token(data)
        await connection.execute(stmt)

    @staticmethod
    async def get_by_hash(connection: AsyncConnection, token_hash: str) -> dict | None:
        """Get token by hash."""
        stmt = RefreshTokenStatements.select_by_hash(token_hash)
        result = await connection.execute(stmt)
        row = result.fetchone()
        return dict(row._mapping) if row else None

    @staticmethod
    async def revoke(connection: AsyncConnection, token_hash: str) -> None:
        """Revoke a refresh token."""
        stmt = RefreshTokenStatements.revoke_token(token_hash)
        await connection.execute(stmt)

    @staticmethod
    async def revoke_all_for_user(connection: AsyncConnection, user_id: UUID) -> None:
        """Revoke all tokens for a user (logout everywhere)."""
        stmt = RefreshTokenStatements.revoke_all_user_tokens(user_id)
        await connection.execute(stmt)
