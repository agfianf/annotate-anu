"""RBAC dependencies for project-level access control."""

from typing import Annotated
from uuid import UUID

from fastapi import Depends, HTTPException, Path, status
from sqlalchemy.ext.asyncio import AsyncConnection

from app.dependencies.auth import get_current_active_user
from app.dependencies.database import get_async_conn
from app.repositories.project import ProjectMemberRepository, ProjectRepository
from app.schemas.auth import UserBase


class ProjectPermission:
    """Dependency for checking project permissions.
    
    Usage:
        @router.get("/projects/{project_id}")
        async def get_project(
            project: dict = Depends(ProjectPermission("viewer")),
        ):
            ...
    """

    def __init__(self, required_role: str = "viewer"):
        """Initialize permission checker.
        
        Parameters
        ----------
        required_role : str
            Minimum required role: owner, maintainer, annotator, viewer
        """
        self.required_role = required_role
        self.role_hierarchy = {
            "owner": 4,
            "maintainer": 3,
            "annotator": 2,
            "viewer": 1,
        }

    async def __call__(
        self,
        project_id: Annotated[UUID, Path(description="Project ID")],
        current_user: Annotated[UserBase, Depends(get_current_active_user)],
        connection: Annotated[AsyncConnection, Depends(get_async_conn)],
    ) -> dict:
        """Check if user has permission to access the project.
        
        Parameters
        ----------
        project_id : UUID
            Project to check access for
        current_user : UserBase
            Current authenticated user
        connection : AsyncConnection
            Database connection
            
        Returns
        -------
        dict
            Project data with permission info
            
        Raises
        ------
        HTTPException
            403 if user lacks required permission
            404 if project not found
        """
        # Get project
        project = await ProjectRepository.get_by_id(connection, project_id)
        if not project:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Project not found",
            )

        # Admin users have full access
        if current_user.role == "admin":
            project["_user_role"] = "owner"
            project["_user_id"] = current_user.id
            return project

        # Check if user is owner
        if project["owner_id"] == current_user.id:
            project["_user_role"] = "owner"
            project["_user_id"] = current_user.id
            return project

        # Check membership
        membership = await ProjectMemberRepository.get_by_project_and_user(
            connection, project_id, current_user.id
        )
        
        if not membership:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You don't have access to this project",
            )

        user_role = membership["role"]
        user_level = self.role_hierarchy.get(user_role, 0)
        required_level = self.role_hierarchy.get(self.required_role, 0)

        if user_level < required_level:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"This action requires at least '{self.required_role}' role",
            )

        project["_user_role"] = user_role
        project["_user_id"] = current_user.id
        project["_membership"] = membership
        return project


class TaskPermission:
    """Dependency for checking task-level permissions."""

    def __init__(self, required_role: str = "viewer"):
        self.required_role = required_role
        self.role_hierarchy = {
            "owner": 4,
            "maintainer": 3,
            "annotator": 2,
            "viewer": 1,
        }

    async def __call__(
        self,
        task_id: Annotated[UUID, Path(description="Task ID")],
        current_user: Annotated[UserBase, Depends(get_current_active_user)],
        connection: Annotated[AsyncConnection, Depends(get_async_conn)],
    ) -> dict:
        """Check if user has permission to access the task."""
        from app.repositories.task import TaskRepository

        # Get task
        task = await TaskRepository.get_by_id(connection, task_id)
        if not task:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Task not found",
            )

        # Get project
        project = await ProjectRepository.get_by_id(connection, task["project_id"])
        if not project:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Project not found",
            )

        # Admin users have full access
        if current_user.role == "admin":
            task["_user_role"] = "owner"
            task["_project"] = project
            return task

        # Check if user is project owner
        if project["owner_id"] == current_user.id:
            task["_user_role"] = "owner"
            task["_project"] = project
            return task

        # Check membership
        membership = await ProjectMemberRepository.get_by_project_and_user(
            connection, task["project_id"], current_user.id
        )
        
        if not membership:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You don't have access to this task",
            )

        # Check task-level restrictions
        if membership.get("allowed_task_ids"):
            if task_id not in membership["allowed_task_ids"]:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="You don't have access to this specific task",
                )

        user_role = membership["role"]
        user_level = self.role_hierarchy.get(user_role, 0)
        required_level = self.role_hierarchy.get(self.required_role, 0)

        if user_level < required_level:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"This action requires at least '{self.required_role}' role",
            )

        task["_user_role"] = user_role
        task["_project"] = project
        task["_membership"] = membership
        return task


class JobPermission:
    """Dependency for checking job-level permissions."""

    def __init__(self, required_role: str = "viewer"):
        self.required_role = required_role
        self.role_hierarchy = {
            "owner": 4,
            "maintainer": 3,
            "annotator": 2,
            "viewer": 1,
        }

    async def __call__(
        self,
        job_id: Annotated[UUID, Path(description="Job ID")],
        current_user: Annotated[UserBase, Depends(get_current_active_user)],
        connection: Annotated[AsyncConnection, Depends(get_async_conn)],
    ) -> dict:
        """Check if user has permission to access the job."""
        from app.repositories.job import JobRepository
        from app.repositories.task import TaskRepository

        # Get job
        job = await JobRepository.get_by_id(connection, job_id)
        if not job:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Job not found",
            )

        # Get task
        task = await TaskRepository.get_by_id(connection, job["task_id"])
        if not task:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Task not found",
            )

        # Get project
        project = await ProjectRepository.get_by_id(connection, task["project_id"])
        if not project:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Project not found",
            )

        # Admin users have full access
        if current_user.role == "admin":
            job["_user_role"] = "owner"
            job["_task"] = task
            job["_project"] = project
            return job

        # Check if user is project owner
        if project["owner_id"] == current_user.id:
            job["_user_role"] = "owner"
            job["_task"] = task
            job["_project"] = project
            return job

        # Check membership
        membership = await ProjectMemberRepository.get_by_project_and_user(
            connection, task["project_id"], current_user.id
        )
        
        if not membership:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You don't have access to this job",
            )

        # Check job-level restrictions
        if membership.get("allowed_job_ids"):
            if job_id not in membership["allowed_job_ids"]:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="You don't have access to this specific job",
                )

        user_role = membership["role"]
        user_level = self.role_hierarchy.get(user_role, 0)
        required_level = self.role_hierarchy.get(self.required_role, 0)

        if user_level < required_level:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"This action requires at least '{self.required_role}' role",
            )

        job["_user_role"] = user_role
        job["_task"] = task
        job["_project"] = project
        job["_membership"] = membership
        return job
