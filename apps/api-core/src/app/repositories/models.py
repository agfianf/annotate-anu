"""Repository layer for model registry data access."""

from datetime import datetime, timezone

from sqlalchemy import delete, insert, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncConnection

from app.exceptions.models import DuplicateModelException, ModelNotFoundException
from app.models.byom import registered_models
from app.schemas.models import ModelBase


class ModelStatements:
    """SQL statement builders for model operations."""

    @staticmethod
    def select_all(include_inactive: bool = False):
        """Build SELECT statement for all models.

        Parameters
        ----------
        include_inactive : bool
            Whether to include inactive models

        Returns
        -------
        Select
            SQLAlchemy select statement
        """
        stmt = select(registered_models)
        if not include_inactive:
            stmt = stmt.where(registered_models.c.is_active == True)  # noqa: E712
        return stmt.order_by(registered_models.c.created_at.desc())

    @staticmethod
    def select_by_id(model_id: str):
        """Build SELECT statement for model by ID.

        Parameters
        ----------
        model_id : str
            Model identifier

        Returns
        -------
        Select
            SQLAlchemy select statement
        """
        return select(registered_models).where(registered_models.c.id == model_id)

    @staticmethod
    def select_by_name(name: str):
        """Build SELECT statement for model by name.

        Parameters
        ----------
        name : str
            Model name

        Returns
        -------
        Select
            SQLAlchemy select statement
        """
        return select(registered_models).where(registered_models.c.name == name)

    @staticmethod
    def insert_model(data: dict):
        """Build INSERT statement for new model.

        Parameters
        ----------
        data : dict
            Model data

        Returns
        -------
        Insert
            SQLAlchemy insert statement
        """
        return insert(registered_models).values(**data).returning(registered_models)

    @staticmethod
    def update_model(model_id: str, data: dict):
        """Build UPDATE statement for model.

        Parameters
        ----------
        model_id : str
            Model identifier
        data : dict
            Updated fields

        Returns
        -------
        Update
            SQLAlchemy update statement
        """
        data["updated_at"] = datetime.now(timezone.utc)
        return (
            update(registered_models)
            .where(registered_models.c.id == model_id)
            .values(**data)
            .returning(registered_models)
        )

    @staticmethod
    def delete_model(model_id: str):
        """Build DELETE statement for model.

        Parameters
        ----------
        model_id : str
            Model identifier

        Returns
        -------
        Delete
            SQLAlchemy delete statement
        """
        return delete(registered_models).where(registered_models.c.id == model_id)


class ModelAsyncRepositories:
    """Async repository for model operations."""

    @staticmethod
    async def get_all(
        connection: AsyncConnection,
        include_inactive: bool = False
    ) -> list[ModelBase]:
        """Retrieve all models from database.

        Parameters
        ----------
        connection : AsyncConnection
            Database connection
        include_inactive : bool
            Whether to include inactive models

        Returns
        -------
        list[ModelBase]
            List of models
        """
        stmt = ModelStatements.select_all(include_inactive)
        result = await connection.execute(stmt)
        rows = result.fetchall()
        return [ModelBase(**dict(row._mapping)) for row in rows]

    @staticmethod
    async def get_by_id(connection: AsyncConnection, model_id: str) -> ModelBase:
        """Retrieve model by ID.

        Parameters
        ----------
        connection : AsyncConnection
            Database connection
        model_id : str
            Model identifier

        Returns
        -------
        ModelBase
            Model data

        Raises
        ------
        ModelNotFoundException
            If model not found
        """
        stmt = ModelStatements.select_by_id(model_id)
        result = await connection.execute(stmt)
        row = result.fetchone()

        if not row:
            raise ModelNotFoundException(model_id=model_id)

        return ModelBase(**dict(row._mapping))

    @staticmethod
    async def get_by_name(connection: AsyncConnection, name: str) -> ModelBase | None:
        """Retrieve model by name.

        Parameters
        ----------
        connection : AsyncConnection
            Database connection
        name : str
            Model name

        Returns
        -------
        ModelBase | None
            Model data or None if not found
        """
        stmt = ModelStatements.select_by_name(name)
        result = await connection.execute(stmt)
        row = result.fetchone()

        if not row:
            return None

        return ModelBase(**dict(row._mapping))

    @staticmethod
    async def create(connection: AsyncConnection, data: dict) -> ModelBase:
        """Create new model.

        Parameters
        ----------
        connection : AsyncConnection
            Database connection
        data : dict
            Model data

        Returns
        -------
        ModelBase
            Created model

        Raises
        ------
        DuplicateModelException
            If model with same name exists
        """
        try:
            stmt = ModelStatements.insert_model(data)
            result = await connection.execute(stmt)
            row = result.fetchone()
            return ModelBase(**dict(row._mapping))
        except IntegrityError:
            raise DuplicateModelException(name=data.get("name"))

    @staticmethod
    async def update(connection: AsyncConnection, model_id: str, data: dict) -> ModelBase:
        """Update existing model.

        Parameters
        ----------
        connection : AsyncConnection
            Database connection
        model_id : str
            Model identifier
        data : dict
            Updated fields

        Returns
        -------
        ModelBase
            Updated model

        Raises
        ------
        ModelNotFoundException
            If model not found
        DuplicateModelException
            If new name conflicts with existing model
        """
        try:
            stmt = ModelStatements.update_model(model_id, data)
            result = await connection.execute(stmt)
            row = result.fetchone()

            if not row:
                raise ModelNotFoundException(model_id=model_id)

            return ModelBase(**dict(row._mapping))
        except IntegrityError:
            raise DuplicateModelException(name=data.get("name"))

    @staticmethod
    async def delete(connection: AsyncConnection, model_id: str) -> bool:
        """Delete model.

        Parameters
        ----------
        connection : AsyncConnection
            Database connection
        model_id : str
            Model identifier

        Returns
        -------
        bool
            True if deleted

        Raises
        ------
        ModelNotFoundException
            If model not found
        """
        # Check if exists first
        await ModelAsyncRepositories.get_by_id(connection, model_id)

        stmt = ModelStatements.delete_model(model_id)
        await connection.execute(stmt)
        return True
