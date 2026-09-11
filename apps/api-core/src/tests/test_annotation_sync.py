"""Annotation access and sync regression tests against PostgreSQL."""

from uuid import UUID, uuid4

import httpx
import pytest
from fastapi import FastAPI, HTTPException
from sqlalchemy import event, insert, select
from sqlalchemy.ext.asyncio import create_async_engine

from app.dependencies.auth import get_current_active_user
from app.dependencies.database import get_async_conn, get_async_transaction_conn
from app.models.annotation import detections
from app.models.image import images
from app.models.job import jobs
from app.models.project import labels, project_members, projects
from app.models.task import tasks
from app.models.user import users
from app.routers.annotations import router
from app.routers.images import router as image_router
from app.schemas.auth import UserBase
from app.schemas.job_sync import JobSyncRequest
from app.services.annotation import AnnotationService
from tests.test_storage_access import db_engine  # noqa: F401


@pytest.fixture
async def world(db_engine):  # noqa: F811 - imported pytest fixture
    engine = create_async_engine(db_engine.url.set(drivername="postgresql+asyncpg"))
    async with engine.connect() as conn:
        transaction = await conn.begin()
        user = (
            (
                await conn.execute(
                    insert(users)
                    .values(
                        email=f"{uuid4()}@example.test",
                        username=str(uuid4()),
                        hashed_password="x",
                        full_name="Owner",
                    )
                    .returning(users)
                )
            )
            .mappings()
            .one()
        )
        project = (
            (
                await conn.execute(
                    insert(projects)
                    .values(name="test", slug=str(uuid4()), owner_id=user["id"])
                    .returning(projects)
                )
            )
            .mappings()
            .one()
        )
        task_id = (
            await conn.execute(
                insert(tasks).values(name="test", project_id=project["id"]).returning(tasks.c.id)
            )
        ).scalar_one()
        job_id = (
            await conn.execute(
                insert(jobs).values(task_id=task_id, sequence_number=1).returning(jobs.c.id)
            )
        ).scalar_one()
        label = (
            await conn.execute(
                insert(labels).values(project_id=project["id"], name="label").returning(labels.c.id)
            )
        ).scalar_one()
        image_rows = []
        for index in range(2):
            row = (
                (
                    await conn.execute(
                        insert(images)
                        .values(
                            job_id=job_id,
                            filename="a.jpg",
                            s3_key="a.jpg",
                            width=100,
                            height=100,
                            sequence_number=index,
                        )
                        .returning(images)
                    )
                )
                .mappings()
                .one()
            )
            image_rows.append({**row, "_project_id": project["id"]})
        yield conn, engine, {"id": job_id, "_project": dict(project)}, image_rows, label, dict(user)
        await transaction.rollback()
    await engine.dispose()


def detection(label, frontend_id="local-a", **extra):
    return {
        "label_id": str(label),
        "x_min": 0.1,
        "y_min": 0.1,
        "x_max": 0.5,
        "y_max": 0.5,
        "attributes": {"frontendId": frontend_id},
        **extra,
    }


async def test_sync_returns_ids_and_batches_inserts_and_status(world):
    conn, engine, job, image_rows, label, _ = world
    statements = []

    def capture(_conn, _cursor, statement, _parameters, _context, _many):
        statements.append(statement)

    event.listen(engine.sync_engine, "before_cursor_execute", capture)
    try:
        payload = JobSyncRequest(
            images={
                image_rows[0]["id"]: {
                    "detections": {"created": [detection(label, f"local-{i}") for i in range(120)]}
                }
            }
        )
        result = await AnnotationService.sync(conn, job, payload)
    finally:
        event.remove(engine.sync_engine, "before_cursor_execute", capture)
    assert result["total_operations"] == 120
    assert len(result["created_ids"]) == 120
    assert len([s for s in statements if s.startswith("INSERT INTO detections")]) == 1
    assert len(statements) <= 6  # image, labels, INSERT, image status, count, job status
    assert (
        await conn.execute(select(images.c.is_annotated).where(images.c.id == image_rows[0]["id"]))
    ).scalar_one()
    assert (
        await conn.execute(select(jobs.c.annotated_images).where(jobs.c.id == job["id"]))
    ).scalar_one() == 1


async def test_sync_cannot_update_delete_or_move_another_images_annotation(world):
    conn, _, job, image_rows, label, _ = world
    victim = (
        await AnnotationService.create_many(conn, image_rows[1], "detections", [detection(label)])
    )[0]
    payload = JobSyncRequest(
        images={
            image_rows[0]["id"]: {
                "detections": {
                    "updated": [
                        detection(label, id=str(victim["id"]), image_id=str(image_rows[0]["id"]))
                    ]
                }
            }
        }
    )
    with pytest.raises(HTTPException) as error:
        await AnnotationService.sync(conn, job, payload)
    assert error.value.status_code == 404
    payload = JobSyncRequest(
        images={image_rows[0]["id"]: {"detections": {"deleted": [victim["id"]]}}}
    )
    result = await AnnotationService.sync(conn, job, payload)
    assert result["total_operations"] == 0
    assert (
        await conn.execute(select(detections.c.image_id).where(detections.c.id == victim["id"]))
    ).scalar_one() == image_rows[1]["id"]


async def test_sync_rejects_wrong_job_and_unknown_label(world):
    conn, _, job, image_rows, label, _ = world
    payload = JobSyncRequest(
        images={image_rows[0]["id"]: {"detections": {"created": [detection(label)]}}}
    )
    with pytest.raises(HTTPException) as error:
        await AnnotationService.sync(conn, {**job, "id": job["id"] + 1}, payload)
    assert error.value.status_code == 404
    payload.images[image_rows[0]["id"]].detections.created[0]["label_id"] = str(uuid4())
    with pytest.raises(HTTPException) as error:
        await AnnotationService.sync(conn, job, payload)
    assert error.value.status_code == 404


@pytest.mark.parametrize(
    "method,path",
    [
        ("GET", ""),
        ("POST", "/detections"),
        ("PATCH", f"/detections/{uuid4()}"),
        ("DELETE", "/detections/bulk"),
    ],
)
async def test_annotation_endpoints_require_authentication(method, path):
    app = FastAPI()
    app.include_router(router)
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app), base_url="http://test"
    ) as client:
        response = await client.request(
            method, f"/api/v1/images/{uuid4()}/annotations{path}", json={}
        )
    assert response.status_code == 401


async def test_bulk_delete_route_and_owner_round_trip(world):
    conn, _, _, image_rows, label, user = world
    app = FastAPI()
    app.include_router(router)
    app.dependency_overrides[get_async_conn] = lambda: conn
    app.dependency_overrides[get_async_transaction_conn] = lambda: conn
    app.dependency_overrides[get_current_active_user] = lambda: UserBase(**user)
    path = f"/api/v1/images/{image_rows[0]['id']}/annotations"
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app), base_url="http://test"
    ) as client:
        response = await client.post(f"{path}/detections", json=detection(label))
        assert response.status_code == 200, response.text
        assert response.json()["status_code"] == 201
        annotation_id = response.json()["data"]["id"]
        response = await client.request(
            "DELETE", f"{path}/detections/bulk", json={"ids": [annotation_id]}
        )
        assert response.status_code == 200, response.text
        assert response.json()["data"]["deleted"] == 1
    assert not (
        await conn.execute(select(detections.c.id).where(detections.c.id == UUID(annotation_id)))
    ).first()


@pytest.mark.parametrize("role,expected", [("viewer", 403), ("annotator", 200)])
async def test_annotation_writes_require_annotator_role(world, role, expected):
    conn, _, job, image_rows, label, _ = world
    user = (
        (
            await conn.execute(
                insert(users)
                .values(
                    email=f"{uuid4()}@example.test",
                    username=str(uuid4()),
                    hashed_password="x",
                    full_name="Member",
                )
                .returning(users)
            )
        )
        .mappings()
        .one()
    )
    await conn.execute(
        insert(project_members).values(
            project_id=job["_project"]["id"], user_id=user["id"], role=role
        )
    )
    app = FastAPI()
    app.include_router(router)
    app.dependency_overrides[get_async_conn] = lambda: conn
    app.dependency_overrides[get_async_transaction_conn] = lambda: conn
    app.dependency_overrides[get_current_active_user] = lambda: UserBase(**user)
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app), base_url="http://test"
    ) as client:
        response = await client.post(
            f"/api/v1/images/{image_rows[0]['id']}/annotations/detections", json=detection(label)
        )
    assert response.status_code == expected, response.text


@pytest.mark.parametrize(
    "method,path",
    [
        ("GET", "/images/{id}"),
        ("DELETE", "/images/{id}"),
        ("GET", "/jobs/1/images/{id}/file"),
        ("GET", "/jobs/1/images/{id}/thumbnail"),
    ],
)
async def test_image_files_and_mutations_require_authentication(method, path):
    app = FastAPI()
    app.include_router(image_router)
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app), base_url="http://test"
    ) as client:
        response = await client.request(method, "/api/v1" + path.format(id=uuid4()))
    assert response.status_code == 401


def test_image_paths_cannot_escape_share_root(tmp_path):
    from app.services.image_file import resolve_image_path

    root = tmp_path / "share"
    root.mkdir()
    (root / "link").symlink_to(tmp_path, target_is_directory=True)
    assert resolve_image_path("folder/image.jpg", root) == root / "folder/image.jpg"
    for key in ("../outside.jpg", str(tmp_path / "outside.jpg"), "link/outside.jpg"):
        with pytest.raises(FileNotFoundError):
            resolve_image_path(key, root)


async def test_classification_database_error_does_not_poison_batch(world, monkeypatch):
    from contextlib import asynccontextmanager
    from types import SimpleNamespace
    from unittest.mock import AsyncMock, MagicMock

    from sqlalchemy import text

    from app.repositories.shared_image import SharedImageRepository
    from app.repositories.shared_image_tag import SharedImageTagRepository
    from app.repositories.tag import TagRepository
    from app.tasks import classification

    conn, _, job, _, _, _ = world

    class Engine:
        @asynccontextmanager
        async def connect(self):
            # Leave test setup in the fixture transaction, while exercising real savepoints.
            yield SimpleNamespace(
                execute=conn.execute, begin_nested=conn.begin_nested, commit=AsyncMock()
            )

        async def dispose(self):
            pass

    monkeypatch.setattr(classification, "get_async_engine", Engine)
    monkeypatch.setattr(classification.redis, "from_url", lambda *args, **kwargs: MagicMock())
    monkeypatch.setattr(SharedImageRepository, "get_by_id", AsyncMock(return_value={"id": uuid4()}))
    monkeypatch.setattr(TagRepository, "get_uncategorized_category", AsyncMock(return_value=None))
    monkeypatch.setattr(SharedImageTagRepository, "add_tag", AsyncMock())
    calls = 0

    async def apply_tag(*args):
        nonlocal calls
        calls += 1
        if calls == 2:
            await conn.execute(text("SELECT 1 / 0"))
        await conn.execute(text("SELECT 1"))
        return None

    monkeypatch.setattr(classification, "_get_or_create_tag", apply_tag)
    result = await classification._batch_classify_async(
        "task-test",
        job["_project"]["id"],
        "mock-classifier",
        [str(uuid4()) for _ in range(3)],
        True,
    )
    assert result["processed"] == 2
    assert result["failed"] == 1
    assert result["status"] == "completed"


async def test_permission_and_handler_share_one_connection_and_rollback(db_engine):  # noqa: F811
    import asyncio
    from contextlib import asynccontextmanager
    from typing import Annotated

    from fastapi import Depends
    from sqlalchemy import text

    engine = create_async_engine(
        db_engine.url.set(drivername="postgresql+asyncpg"), pool_size=1, max_overflow=0,
        pool_timeout=0.5,
    )
    try:
        async with engine.begin() as conn:
            await conn.execute(text("CREATE TABLE request_transaction_test (id integer)"))

        @asynccontextmanager
        async def lifespan(app):
            yield {"engine": engine}

        app = FastAPI(lifespan=lifespan)

        async def permission(connection: Annotated[object, Depends(get_async_conn)]):
            await connection.execute(text("SELECT 1"))
            return connection

        @app.post("/write/{fail}")
        async def write(
            fail: bool,
            checked: Annotated[object, Depends(permission)],
            connection: Annotated[object, Depends(get_async_transaction_conn)],
        ):
            assert checked is connection
            await connection.execute(text("INSERT INTO request_transaction_test VALUES (1)"))
            if fail:
                raise HTTPException(400, "Rollback this write")
            return {"ok": True}

        # ASGITransport does not run lifespan; supply its state explicitly.
        async def transport_app(scope, receive, send):
            scope["state"] = {"engine": engine}
            await app(scope, receive, send)

        async with httpx.AsyncClient(transport=httpx.ASGITransport(transport_app), base_url="http://test") as client:
            responses = await asyncio.wait_for(
                asyncio.gather(client.post("/write/false"), client.post("/write/true")), timeout=3
            )
        assert [response.status_code for response in responses] == [200, 400]
        async with engine.connect() as conn:
            assert (await conn.execute(text("SELECT count(*) FROM request_transaction_test"))).scalar_one() == 1
    finally:
        await engine.dispose()
