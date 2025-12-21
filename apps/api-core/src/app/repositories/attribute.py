"""Repository layer for Attribute Schema and Image Attribute data access."""

from uuid import UUID

from sqlalchemy import delete, func, insert, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncConnection

from app.models.attribute import attribute_schemas, image_attributes


class AttributeSchemaRepository:
    """Async repository for attribute schema operations."""

    @staticmethod
    async def get_by_id(
        connection: AsyncConnection, schema_id: UUID, project_id: int
    ) -> dict | None:
        """Get attribute schema by ID within a project."""
        stmt = select(attribute_schemas).where(
            attribute_schemas.c.id == schema_id,
            attribute_schemas.c.project_id == project_id,
        )
        result = await connection.execute(stmt)
        row = result.fetchone()
        return dict(row._mapping) if row else None

    @staticmethod
    async def get_by_name(connection: AsyncConnection, name: str, project_id: int) -> dict | None:
        """Get attribute schema by name within a project."""
        stmt = select(attribute_schemas).where(
            attribute_schemas.c.name == name,
            attribute_schemas.c.project_id == project_id,
        )
        result = await connection.execute(stmt)
        row = result.fetchone()
        return dict(row._mapping) if row else None

    @staticmethod
    async def list_for_project(
        connection: AsyncConnection,
        project_id: int,
        is_filterable: bool | None = None,
        is_visible: bool | None = None,
    ) -> list[dict]:
        """List all attribute schemas for a project."""
        stmt = (
            select(attribute_schemas)
            .where(attribute_schemas.c.project_id == project_id)
            .order_by(attribute_schemas.c.sidebar_order, attribute_schemas.c.name)
        )

        if is_filterable is not None:
            stmt = stmt.where(attribute_schemas.c.is_filterable == is_filterable)
        if is_visible is not None:
            stmt = stmt.where(attribute_schemas.c.is_visible == is_visible)

        result = await connection.execute(stmt)
        return [dict(row._mapping) for row in result.fetchall()]

    @staticmethod
    async def create(connection: AsyncConnection, project_id: int, data: dict) -> dict:
        """Create a new attribute schema within a project."""
        data["project_id"] = project_id
        try:
            stmt = insert(attribute_schemas).values(**data).returning(attribute_schemas)
            result = await connection.execute(stmt)
            row = result.fetchone()
            return dict(row._mapping)
        except IntegrityError:
            raise ValueError(
                f"Attribute schema '{data.get('name')}' already exists in this project"
            )

    @staticmethod
    async def update(
        connection: AsyncConnection, schema_id: UUID, project_id: int, data: dict
    ) -> dict | None:
        """Update an attribute schema within a project."""
        stmt = (
            update(attribute_schemas)
            .where(
                attribute_schemas.c.id == schema_id,
                attribute_schemas.c.project_id == project_id,
            )
            .values(**data)
            .returning(attribute_schemas)
        )
        result = await connection.execute(stmt)
        row = result.fetchone()
        return dict(row._mapping) if row else None

    @staticmethod
    async def delete(connection: AsyncConnection, schema_id: UUID, project_id: int) -> bool:
        """Delete an attribute schema from a project."""
        stmt = delete(attribute_schemas).where(
            attribute_schemas.c.id == schema_id,
            attribute_schemas.c.project_id == project_id,
        )
        result = await connection.execute(stmt)
        return result.rowcount > 0


class ImageAttributeRepository:
    """Async repository for image attribute operations."""

    @staticmethod
    async def get_by_id(connection: AsyncConnection, attr_id: UUID, project_id: int) -> dict | None:
        """Get image attribute by ID within a project."""
        stmt = select(image_attributes).where(
            image_attributes.c.id == attr_id,
            image_attributes.c.project_id == project_id,
        )
        result = await connection.execute(stmt)
        row = result.fetchone()
        return dict(row._mapping) if row else None

    @staticmethod
    async def get_for_image(
        connection: AsyncConnection, shared_image_id: UUID, project_id: int
    ) -> list[dict]:
        """Get all attributes for an image."""
        stmt = (
            select(image_attributes)
            .where(
                image_attributes.c.shared_image_id == shared_image_id,
                image_attributes.c.project_id == project_id,
            )
            .order_by(image_attributes.c.attribute_schema_id)
        )
        result = await connection.execute(stmt)
        return [dict(row._mapping) for row in result.fetchall()]

    @staticmethod
    async def get_by_schema(
        connection: AsyncConnection,
        shared_image_id: UUID,
        attribute_schema_id: UUID,
        project_id: int,
    ) -> dict | None:
        """Get specific attribute for an image by schema."""
        stmt = select(image_attributes).where(
            image_attributes.c.shared_image_id == shared_image_id,
            image_attributes.c.attribute_schema_id == attribute_schema_id,
            image_attributes.c.project_id == project_id,
        )
        result = await connection.execute(stmt)
        row = result.fetchone()
        return dict(row._mapping) if row else None

    @staticmethod
    async def set_attribute(
        connection: AsyncConnection,
        project_id: int,
        shared_image_id: UUID,
        attribute_schema_id: UUID,
        value_data: dict,
        created_by: UUID | None = None,
    ) -> dict:
        """Set or update an attribute value on an image (upsert)."""
        from sqlalchemy.dialects.postgresql import insert as pg_insert

        data = {
            "project_id": project_id,
            "shared_image_id": shared_image_id,
            "attribute_schema_id": attribute_schema_id,
            **value_data,
        }
        if created_by:
            data["created_by"] = created_by

        stmt = (
            pg_insert(image_attributes)
            .values(**data)
            .on_conflict_do_update(
                index_elements=[
                    image_attributes.c.project_id,
                    image_attributes.c.shared_image_id,
                    image_attributes.c.attribute_schema_id,
                ],
                set_={
                    "value_categorical": data.get("value_categorical"),
                    "value_numeric": data.get("value_numeric"),
                    "value_boolean": data.get("value_boolean"),
                    "value_string": data.get("value_string"),
                    "value_json": data.get("value_json"),
                    "confidence": data.get("confidence"),
                    "source": data.get("source", "manual"),
                    "updated_at": func.now(),
                },
            )
            .returning(image_attributes)
        )
        result = await connection.execute(stmt)
        row = result.fetchone()
        return dict(row._mapping)

    @staticmethod
    async def bulk_set_attribute(
        connection: AsyncConnection,
        project_id: int,
        shared_image_ids: list[UUID],
        attribute_schema_id: UUID,
        value_data: dict,
        created_by: UUID | None = None,
    ) -> int:
        """Bulk set attribute value on multiple images."""
        from sqlalchemy.dialects.postgresql import insert as pg_insert

        values = []
        for image_id in shared_image_ids:
            data = {
                "project_id": project_id,
                "shared_image_id": image_id,
                "attribute_schema_id": attribute_schema_id,
                **value_data,
            }
            if created_by:
                data["created_by"] = created_by
            values.append(data)

        stmt = (
            pg_insert(image_attributes)
            .values(values)
            .on_conflict_do_update(
                index_elements=[
                    image_attributes.c.project_id,
                    image_attributes.c.shared_image_id,
                    image_attributes.c.attribute_schema_id,
                ],
                set_={
                    "value_categorical": value_data.get("value_categorical"),
                    "value_numeric": value_data.get("value_numeric"),
                    "value_boolean": value_data.get("value_boolean"),
                    "value_string": value_data.get("value_string"),
                    "value_json": value_data.get("value_json"),
                    "confidence": value_data.get("confidence"),
                    "source": value_data.get("source", "manual"),
                    "updated_at": func.now(),
                },
            )
        )
        result = await connection.execute(stmt)
        return result.rowcount

    @staticmethod
    async def delete_attribute(
        connection: AsyncConnection,
        attr_id: UUID,
        project_id: int,
    ) -> bool:
        """Delete an attribute value."""
        stmt = delete(image_attributes).where(
            image_attributes.c.id == attr_id,
            image_attributes.c.project_id == project_id,
        )
        result = await connection.execute(stmt)
        return result.rowcount > 0

    @staticmethod
    async def get_categorical_aggregation(
        connection: AsyncConnection,
        project_id: int,
        attribute_schema_id: UUID,
        image_ids: list[UUID] | None = None,
    ) -> list[dict]:
        """Get aggregated counts for categorical attribute values."""
        stmt = (
            select(
                image_attributes.c.value_categorical,
                func.count().label("count"),
            )
            .where(
                image_attributes.c.project_id == project_id,
                image_attributes.c.attribute_schema_id == attribute_schema_id,
                image_attributes.c.value_categorical.isnot(None),
            )
            .group_by(image_attributes.c.value_categorical)
            .order_by(func.count().desc())
        )

        if image_ids:
            stmt = stmt.where(image_attributes.c.shared_image_id.in_(image_ids))

        result = await connection.execute(stmt)
        return [{"value": row.value_categorical, "count": row.count} for row in result.fetchall()]

    @staticmethod
    async def get_numeric_aggregation(
        connection: AsyncConnection,
        project_id: int,
        attribute_schema_id: UUID,
        image_ids: list[UUID] | None = None,
        num_buckets: int = 20,
    ) -> dict:
        """Get aggregated stats for numeric attribute values."""
        base_where = [
            image_attributes.c.project_id == project_id,
            image_attributes.c.attribute_schema_id == attribute_schema_id,
            image_attributes.c.value_numeric.isnot(None),
        ]

        if image_ids:
            base_where.append(image_attributes.c.shared_image_id.in_(image_ids))

        # Get min, max, avg
        stats_stmt = select(
            func.min(image_attributes.c.value_numeric).label("min_value"),
            func.max(image_attributes.c.value_numeric).label("max_value"),
            func.avg(image_attributes.c.value_numeric).label("mean"),
            func.count().label("total"),
        ).where(*base_where)

        stats_result = await connection.execute(stats_stmt)
        stats = stats_result.fetchone()

        if not stats or stats.total == 0:
            return {
                "min_value": 0,
                "max_value": 0,
                "mean": 0,
                "histogram": [],
            }

        min_val = float(stats.min_value)
        max_val = float(stats.max_value)
        mean_val = float(stats.mean)

        # Build histogram
        if min_val == max_val:
            histogram = [{"bucket_start": min_val, "bucket_end": max_val, "count": stats.total}]
        else:
            bucket_width = (max_val - min_val) / num_buckets
            histogram_stmt = (
                select(
                    func.floor((image_attributes.c.value_numeric - min_val) / bucket_width).label(
                        "bucket"
                    ),
                    func.count().label("count"),
                )
                .where(*base_where)
                .group_by(func.floor((image_attributes.c.value_numeric - min_val) / bucket_width))
                .order_by("bucket")
            )

            hist_result = await connection.execute(histogram_stmt)
            histogram = []
            for row in hist_result.fetchall():
                bucket_idx = int(row.bucket) if row.bucket is not None else 0
                bucket_idx = min(bucket_idx, num_buckets - 1)  # Clamp to last bucket
                bucket_start = min_val + bucket_idx * bucket_width
                bucket_end = bucket_start + bucket_width
                histogram.append(
                    {
                        "bucket_start": bucket_start,
                        "bucket_end": bucket_end,
                        "count": row.count,
                    }
                )

        return {
            "min_value": min_val,
            "max_value": max_val,
            "mean": mean_val,
            "histogram": histogram,
        }
