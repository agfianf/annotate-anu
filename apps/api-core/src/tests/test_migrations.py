"""Test Alembic migrations using testcontainers.

This module tests that all migrations can be applied to a fresh PostgreSQL
database and verifies the final schema is correct.
"""

import os
from pathlib import Path

import pytest
from sqlalchemy import create_engine, inspect, text
from testcontainers.postgres import PostgresContainer

from alembic import command
from alembic.config import Config

# Get absolute path to src directory
SRC_DIR = Path(__file__).parent.parent.resolve()
ALEMBIC_INI = SRC_DIR / "alembic.ini"
MIGRATIONS_DIR = SRC_DIR / "migrations"


@pytest.fixture(scope="module")
def postgres_container():
    """Spin up a PostgreSQL container for testing."""
    with PostgresContainer("postgres:16-alpine") as postgres:
        yield postgres


@pytest.fixture(scope="module")
def db_engine(postgres_container):
    """Create a SQLAlchemy engine connected to the test container."""
    engine = create_engine(postgres_container.get_connection_url())
    yield engine
    engine.dispose()


@pytest.fixture(scope="module")
def alembic_config(postgres_container):
    """Create Alembic config pointing to test database."""
    # Set env var for migrations/env.py to use
    db_url = postgres_container.get_connection_url()
    os.environ["TESTING_DATABASE_URL"] = db_url

    config = Config(str(ALEMBIC_INI))
    config.set_main_option("sqlalchemy.url", db_url)
    # Override script_location to use absolute path
    config.set_main_option("script_location", str(MIGRATIONS_DIR))

    yield config

    # Cleanup
    os.environ.pop("TESTING_DATABASE_URL", None)


class TestMigrations:
    """Test suite for Alembic migrations."""

    def test_upgrade_head(self, alembic_config, db_engine):
        """Test that all migrations can be applied from scratch."""
        # Run all migrations
        command.upgrade(alembic_config, "head")

        # Verify alembic_version table exists and has correct version
        with db_engine.connect() as conn:
            result = conn.execute(text("SELECT version_num FROM alembic_version"))
            version = result.scalar()
            assert version == "m9a0b1c2d3e4", f"Expected version m9a0b1c2d3e4, got {version}"

    def test_registered_models_table_exists(self, db_engine):
        """Verify registered_models table was created with correct structure."""
        inspector = inspect(db_engine)

        # Check table exists
        tables = inspector.get_table_names()
        assert "registered_models" in tables, "registered_models table not found"

        # Check columns
        columns = {col["name"]: col for col in inspector.get_columns("registered_models")}
        expected_columns = [
            "id",
            "name",
            "endpoint_url",
            "auth_token",
            "capabilities",
            "endpoint_config",
            "description",
            "is_active",
            "is_healthy",
            "last_health_check",
            "created_at",
            "updated_at",
        ]
        for col_name in expected_columns:
            assert col_name in columns, f"Column {col_name} not found in registered_models"

        # Check id is primary key with correct type
        assert "VARCHAR" in str(columns["id"]["type"]).upper()

        # Check indexes
        indexes = inspector.get_indexes("registered_models")
        index_names = [idx["name"] for idx in indexes]
        assert "ix_registered_models_name" in index_names, "Missing index ix_registered_models_name"
        assert "ix_registered_models_is_active" in index_names, "Missing index ix_registered_models_is_active"

    def test_projects_allowed_model_ids_column(self, db_engine):
        """Verify allowed_model_ids column was added to projects table."""
        inspector = inspect(db_engine)

        # Check projects table exists
        tables = inspector.get_table_names()
        assert "projects" in tables, "projects table not found"

        # Check allowed_model_ids column exists
        columns = {col["name"]: col for col in inspector.get_columns("projects")}
        assert "allowed_model_ids" in columns, "allowed_model_ids column not found in projects"

        # Check it's an array type
        col_type = str(columns["allowed_model_ids"]["type"]).upper()
        assert "ARRAY" in col_type or "VARCHAR" in col_type, f"Unexpected type: {col_type}"

    def test_all_core_tables_exist(self, db_engine):
        """Verify all core tables exist after migration."""
        inspector = inspect(db_engine)
        tables = set(inspector.get_table_names())

        expected_tables = {
            # Auth
            "users",
            "refresh_tokens",
            # Projects
            "projects",
            "project_members",
            "labels",
            # Tasks & Jobs
            "tasks",
            "jobs",
            "images",
            # Annotations
            "image_tags",
            "detections",
            "segmentations",
            "keypoints",
            "pose_skeletons",
            # Data Management
            "shared_images",
            "tag_categories",
            "tags",
            "shared_image_tags",
            "project_images",
            # Attributes
            "attribute_schemas",
            "image_attributes",
            # Quality
            "image_quality_metrics",
            "quality_jobs",
            # Exports
            "saved_filters",
            "exports",
            # BYOM
            "registered_models",
            # History
            "annotation_events",
            "version_snapshots",
            "project_activity",
        }

        missing = expected_tables - tables
        assert not missing, f"Missing tables: {missing}"

    def test_downgrade_upgrade_cycle(self, alembic_config, db_engine):
        """Test that downgrade and upgrade work correctly for BYOM migration."""
        # Downgrade to previous version
        command.downgrade(alembic_config, "l8f9a0b1c2d3")

        inspector = inspect(db_engine)

        # Verify registered_models is gone
        tables = inspector.get_table_names()
        assert "registered_models" not in tables, "registered_models should be dropped"

        # Verify allowed_model_ids is gone
        columns = {col["name"] for col in inspector.get_columns("projects")}
        assert "allowed_model_ids" not in columns, "allowed_model_ids should be dropped"

        # Upgrade back to head
        command.upgrade(alembic_config, "head")

        # Verify they're back
        inspector = inspect(db_engine)
        tables = inspector.get_table_names()
        assert "registered_models" in tables, "registered_models should be recreated"

        columns = {col["name"] for col in inspector.get_columns("projects")}
        assert "allowed_model_ids" in columns, "allowed_model_ids should be recreated"
