"""SQLAlchemy Core models for Attribute Schemas and Image Attributes."""

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Table,
    Text,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID

from app.helpers.database import metadata

# ============================================================================
# ATTRIBUTE SCHEMAS - Define what attributes exist per project
# ============================================================================
attribute_schemas = Table(
    "attribute_schemas",
    metadata,
    Column(
        "id",
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
        comment="UUID primary key",
    ),
    Column(
        "project_id",
        Integer,
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False,
        comment="Reference to project",
    ),
    Column(
        "name",
        String(100),
        nullable=False,
        comment="Attribute name (unique per project)",
    ),
    Column(
        "display_name",
        String(255),
        nullable=True,
        comment="Human-readable display name",
    ),
    Column(
        "field_type",
        String(50),
        nullable=False,
        comment="Field type: categorical, numeric, boolean, string",
    ),
    # For categorical fields
    Column(
        "allowed_values",
        JSONB,
        nullable=True,
        comment="Allowed values for categorical: ['ripe', 'unripe', 'overripe']",
    ),
    Column(
        "default_value",
        String(255),
        nullable=True,
        comment="Default value for new images",
    ),
    # For numeric fields
    Column(
        "min_value",
        Float,
        nullable=True,
        comment="Minimum value for numeric fields",
    ),
    Column(
        "max_value",
        Float,
        nullable=True,
        comment="Maximum value for numeric fields",
    ),
    Column(
        "unit",
        String(50),
        nullable=True,
        comment="Unit for numeric fields (e.g., 'score', 'percentage')",
    ),
    # Display settings
    Column(
        "color",
        String(7),
        nullable=False,
        server_default=text("'#6B7280'"),
        comment="Hex color for UI",
    ),
    Column(
        "icon",
        String(50),
        nullable=True,
        comment="Icon name for UI",
    ),
    Column(
        "sidebar_order",
        Integer,
        nullable=False,
        server_default=text("0"),
        comment="Order in sidebar",
    ),
    Column(
        "is_filterable",
        Boolean,
        nullable=False,
        server_default=text("true"),
        comment="Whether this attribute appears in sidebar filter",
    ),
    Column(
        "is_visible",
        Boolean,
        nullable=False,
        server_default=text("true"),
        comment="Whether this attribute is visible in UI",
    ),
    Column(
        "created_by",
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        comment="User who created this schema",
    ),
    Column(
        "created_at",
        DateTime(timezone=True),
        nullable=False,
        server_default=text("now()"),
    ),
    # Indexes
    Index("ix_attribute_schemas_project", "project_id"),
    Index("ix_attribute_schemas_unique", "project_id", "name", unique=True),
)


# ============================================================================
# IMAGE ATTRIBUTES - Actual attribute values per image
# ============================================================================
image_attributes = Table(
    "image_attributes",
    metadata,
    Column(
        "id",
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
        comment="UUID primary key",
    ),
    Column(
        "project_id",
        Integer,
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False,
        comment="Reference to project",
    ),
    Column(
        "shared_image_id",
        UUID(as_uuid=True),
        ForeignKey("shared_images.id", ondelete="CASCADE"),
        nullable=False,
        comment="Reference to shared image",
    ),
    Column(
        "attribute_schema_id",
        UUID(as_uuid=True),
        ForeignKey("attribute_schemas.id", ondelete="CASCADE"),
        nullable=False,
        comment="Reference to attribute schema",
    ),
    # Value storage (only one populated based on field_type)
    Column(
        "value_categorical",
        String(255),
        nullable=True,
        comment="Value for categorical fields",
    ),
    Column(
        "value_numeric",
        Float,
        nullable=True,
        comment="Value for numeric fields",
    ),
    Column(
        "value_boolean",
        Boolean,
        nullable=True,
        comment="Value for boolean fields",
    ),
    Column(
        "value_string",
        Text,
        nullable=True,
        comment="Value for string fields",
    ),
    Column(
        "value_json",
        JSONB,
        nullable=True,
        comment="Value for complex JSON fields",
    ),
    # Metadata
    Column(
        "confidence",
        Float,
        nullable=True,
        comment="Confidence score for model predictions",
    ),
    Column(
        "source",
        String(50),
        nullable=False,
        server_default=text("'manual'"),
        comment="Source: manual, model:<id>, import",
    ),
    Column(
        "created_by",
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        comment="User who set this value",
    ),
    Column(
        "created_at",
        DateTime(timezone=True),
        nullable=False,
        server_default=text("now()"),
    ),
    Column(
        "updated_at",
        DateTime(timezone=True),
        nullable=False,
        server_default=text("now()"),
    ),
    # Indexes
    Index("ix_image_attributes_project", "project_id"),
    Index("ix_image_attributes_image", "shared_image_id"),
    Index("ix_image_attributes_schema", "attribute_schema_id"),
    Index(
        "ix_image_attributes_unique",
        "project_id",
        "shared_image_id",
        "attribute_schema_id",
        unique=True,
    ),
    # Partial indexes for efficient filtering
    Index("ix_image_attributes_categorical", "value_categorical"),
    Index("ix_image_attributes_numeric", "value_numeric"),
)
