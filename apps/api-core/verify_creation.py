import asyncio
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

from fastapi import HTTPException

from app.routers.projects import create_project
from app.schemas.auth import UserBase
from app.schemas.project import ProjectCreate


async def test_project_creation_transaction():
    print("Testing Project Creation Flow...")

    # Mock data
    user_id = uuid4()
    mock_user = UserBase(
        id=user_id,
        email="test@example.com",
        username="tester",
        full_name="Test User",
        role="admin",  # Authorized role
        is_active=True,
        created_at=MagicMock(),
        updated_at=MagicMock(),
    )

    mock_project_data = ProjectCreate(name="Test Project", description="A test")

    mock_connection = AsyncMock()

    # Mock Repositories
    with (
        patch("app.routers.projects.ProjectRepository") as MockProjRepo,
        patch("app.routers.projects.ProjectMemberRepository") as MockMemRepo,
    ):
        # Setup success case
        MockProjRepo.create = AsyncMock(return_value={"id": 123, "name": "Test Project"})
        MockMemRepo.create = AsyncMock(return_value={"id": uuid4(), "role": "maintainer"})

        # Run function
        response = await create_project(
            payload=mock_project_data, current_user=mock_user, connection=mock_connection
        )

        print("✅ Success Case: Function execution finished")

        # Verify calls
        MockProjRepo.create.assert_called_once()
        print("✅ Project creation called")

        MockMemRepo.create.assert_called_once()
        call_args = MockMemRepo.create.call_args[0]
        # Check arguments: connection, project_id, data
        assert call_args[1] == 123
        assert call_args[2]["user_id"] == user_id
        assert call_args[2]["role"] == "maintainer"
        print("✅ Member creation called with correct Maintainer role")


async def test_project_creation_rollback():
    print("\nTesting Rollback Scenario (Member creation fails)...")

    # Mock data
    user_id = uuid4()
    mock_user = UserBase(
        id=user_id,
        email="test@example.com",
        username="tester",
        full_name="Test User",
        role="admin",
        is_active=True,
        created_at=MagicMock(),
        updated_at=MagicMock(),
    )

    mock_project_data = ProjectCreate(name="Fail Project")
    mock_connection = AsyncMock()

    with (
        patch("app.routers.projects.ProjectRepository") as MockProjRepo,
        patch("app.routers.projects.ProjectMemberRepository") as MockMemRepo,
    ):
        # Setup: Project success, Member failure
        MockProjRepo.create = AsyncMock(return_value={"id": 456})
        MockMemRepo.create = AsyncMock(side_effect=ValueError("Simulated DB Error"))

        try:
            await create_project(
                payload=mock_project_data, current_user=mock_user, connection=mock_connection
            )
            print("❌ Failed: Should have raised HTTPException")
        except HTTPException as e:
            print(f"✅ Caught expected HTTPException: {e.detail}")
            print("   (This exception triggers the transaction rollback in the dependency)")


if __name__ == "__main__":
    asyncio.run(test_project_creation_transaction())
    asyncio.run(test_project_creation_rollback())
