"""Tests for storage connection access control.

The predicate built by ``StorageConnectionRepository.access_clause`` is the whole of the
authorization rule for the storage endpoints, so it is exercised against a real database
rather than asserted on in Python.
"""

import os
import uuid
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, insert, select
from testcontainers.community.postgres import PostgresContainer

from app.models.project import project_members, projects
from app.models.storage import storage_connections
from app.models.user import users
from app.repositories.storage import StorageConnectionRepository
from app.services.storage_connection import MANAGE_ROLE, READ_ROLE, roles_at_least

SRC_DIR = Path(__file__).parent.parent.resolve()
ALEMBIC_INI = SRC_DIR / "alembic.ini"
MIGRATIONS_DIR = SRC_DIR / "migrations"


@pytest.fixture(scope="module")
def db_engine():
    """Postgres container with the full schema applied."""
    with PostgresContainer("postgres:16-alpine") as postgres:
        db_url = postgres.get_connection_url()
        os.environ["TESTING_DATABASE_URL"] = db_url

        config = Config(str(ALEMBIC_INI))
        config.set_main_option("sqlalchemy.url", db_url)
        config.set_main_option("script_location", str(MIGRATIONS_DIR))
        command.upgrade(config, "head")

        engine = create_engine(db_url)
        yield engine
        engine.dispose()
        os.environ.pop("TESTING_DATABASE_URL", None)


def _make_user(conn, username: str, role: str = "annotator") -> uuid.UUID:
    result = conn.execute(
        insert(users)
        .values(
            email=f"{username}@example.test",
            username=username,
            hashed_password="x",
            full_name=username,
            role=role,
        )
        .returning(users.c.id)
    )
    return result.scalar_one()


def _make_project(conn, slug: str, owner_id: uuid.UUID) -> int:
    result = conn.execute(
        insert(projects).values(name=slug, slug=slug, owner_id=owner_id).returning(projects.c.id)
    )
    return result.scalar_one()


def _make_connection(conn, name: str, created_by: uuid.UUID, project_id: int | None) -> uuid.UUID:
    result = conn.execute(
        insert(storage_connections)
        .values(
            name=name,
            bucket="bucket",
            access_key="ak",
            secret_key="sk",
            created_by=created_by,
            project_id=project_id,
        )
        .returning(storage_connections.c.id)
    )
    return result.scalar_one()


@pytest.fixture(scope="module")
def world(db_engine):
    """One creator, one project with a viewer member, and one unrelated user."""
    with db_engine.begin() as conn:
        creator = _make_user(conn, "creator")
        outsider = _make_user(conn, "outsider")
        member = _make_user(conn, "member")
        project = _make_project(conn, "proj", creator)
        conn.execute(
            insert(project_members).values(
                project_id=project, user_id=member, role="viewer"
            )
        )
        return {
            "creator": creator,
            "outsider": outsider,
            "member": member,
            "project": project,
            "private": _make_connection(conn, "private", creator, None),
            "shared": _make_connection(conn, "shared", creator, project),
        }


def _visible(db_engine, user_id: uuid.UUID, min_role: str) -> set[str]:
    clause = StorageConnectionRepository.access_clause(user_id, roles_at_least(min_role))
    stmt = select(storage_connections.c.name).where(clause)
    with db_engine.connect() as conn:
        return {row[0] for row in conn.execute(stmt)}


def test_creator_sees_own_connections(db_engine, world):
    assert _visible(db_engine, world["creator"], READ_ROLE) == {"private", "shared"}


def test_unrelated_user_sees_nothing(db_engine, world):
    assert _visible(db_engine, world["outsider"], READ_ROLE) == set()


def test_project_member_sees_only_the_project_connection(db_engine, world):
    assert _visible(db_engine, world["member"], READ_ROLE) == {"shared"}


def test_viewer_member_cannot_manage(db_engine, world):
    assert _visible(db_engine, world["member"], MANAGE_ROLE) == set()


def test_creator_retains_full_control(db_engine, world):
    assert _visible(db_engine, world["creator"], MANAGE_ROLE) == {"private", "shared"}
