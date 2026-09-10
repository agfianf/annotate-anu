"""Service layer for storage connection business logic and access control.

Access rule, in one place so it cannot drift between endpoints: a user reaches a
connection they created, or one attached to a project they own or are a member of at a
sufficient role; `role == "admin"` reaches everything, matching
:class:`app.dependencies.rbac.ProjectPermission`. Connections with no project_id are
private to their creator — there is no project to derive membership from, and treating
"unscoped" as "shared with every account" is what made these endpoints exploitable.
"""

from uuid import UUID

from sqlalchemy import ColumnElement
from sqlalchemy.ext.asyncio import AsyncConnection

from app.dependencies.rbac import ROLE_HIERARCHY, resolve_project_role
from app.exceptions.storage import (
    BucketListingFailedException,
    StorageConnectionNotFoundException,
    StorageProjectForbiddenException,
)
from app.helpers.logger import logger
from app.repositories.storage import StorageConnectionRepository
from app.schemas.auth import UserBase
from app.services.storage_s3 import IMAGE_SUFFIXES, S3Service, encrypt_secret

# Attaching a bucket to a project, or removing one, is a configuration change; reading and
# browsing is not.
READ_ROLE = "viewer"
MANAGE_ROLE = "maintainer"


def roles_at_least(min_role: str) -> list[str]:
    """Project roles that rank at or above `min_role`."""
    required = ROLE_HIERARCHY.get(min_role, 0)
    return [role for role, level in ROLE_HIERARCHY.items() if level >= required]


class StorageConnectionService:
    """Business logic for registering and browsing external buckets."""

    @staticmethod
    def _public(row: dict) -> dict:
        """Strip credentials from a row before it leaves the API.

        The secret is encrypted at rest and must never be returned; the access key is
        half of a working credential pair and identifies the account behind the bucket,
        so it is not returned either.
        """
        return {k: v for k, v in row.items() if k not in ("secret_key", "access_key")}

    @staticmethod
    def _access_clause(
        current_user: UserBase,
        min_role: str,
    ) -> ColumnElement[bool] | None:
        """Build the caller's row filter, or None when the caller is an admin."""
        if current_user.role == "admin":
            return None
        return StorageConnectionRepository.access_clause(
            current_user.id, roles_at_least(min_role)
        )

    @classmethod
    async def require_usable(
        cls,
        connection: AsyncConnection,
        connection_id: UUID,
        current_user: UserBase,
        min_role: str = READ_ROLE,
    ) -> dict:
        """Fetch a connection the caller may act on, or raise 404.

        The row carries the stored credentials, so it is for server-side use — building an
        :class:`S3Service` — and must be passed through :meth:`_public` before it is
        returned to a client.

        Parameters
        ----------
        connection : AsyncConnection
            Database connection
        connection_id : UUID
            Connection to fetch
        current_user : UserBase
            Caller
        min_role : str
            Minimum project role the caller needs when access comes from membership

        Returns
        -------
        dict
            The raw row, credentials included

        Raises
        ------
        StorageConnectionNotFoundException
            When the row is missing or the caller may not reach it — the two cases are
            deliberately indistinguishable
        """
        row = await StorageConnectionRepository.get_accessible(
            connection, connection_id, cls._access_clause(current_user, min_role)
        )
        if not row:
            raise StorageConnectionNotFoundException(connection_id)
        return row

    @classmethod
    async def create(
        cls,
        connection: AsyncConnection,
        payload: dict,
        current_user: UserBase,
    ) -> dict:
        """Register a bucket, encrypt its secret, and record a first health check.

        Parameters
        ----------
        connection : AsyncConnection
            Database connection (transactional)
        payload : dict
            Validated connection fields, secret still in clear
        current_user : UserBase
            Creator

        Returns
        -------
        dict
            Public view of the stored row plus its health

        Raises
        ------
        StorageProjectForbiddenException
            If the caller cannot configure the project they named
        """
        project_id = payload.get("project_id")
        if project_id is not None:
            role = await resolve_project_role(connection, project_id, current_user)
            if ROLE_HIERARCHY.get(role or "", 0) < ROLE_HIERARCHY[MANAGE_ROLE]:
                raise StorageProjectForbiddenException(MANAGE_ROLE)

        values = dict(payload)
        values["secret_key"] = encrypt_secret(payload["secret_key"])
        values["created_by"] = current_user.id

        row = await StorageConnectionRepository.create(connection, values)

        healthy, message = S3Service(row).check()
        await StorageConnectionRepository.record_check(connection, row["id"], message)
        row["last_status"] = message

        return {**cls._public(row), "healthy": healthy}

    @classmethod
    async def list_for_user(
        cls,
        connection: AsyncConnection,
        current_user: UserBase,
        project_id: int | None = None,
    ) -> list[dict]:
        """List the connections the caller may see."""
        rows = await StorageConnectionRepository.list_accessible(
            connection,
            cls._access_clause(current_user, READ_ROLE),
            project_id=project_id,
        )
        return [cls._public(row) for row in rows]

    @classmethod
    async def delete(
        cls,
        connection: AsyncConnection,
        connection_id: UUID,
        current_user: UserBase,
    ) -> str:
        """Remove a connection and return its name."""
        row = await cls.require_usable(connection, connection_id, current_user, MANAGE_ROLE)
        await StorageConnectionRepository.delete(connection, connection_id)
        return row["name"]

    @classmethod
    async def check(
        cls,
        connection: AsyncConnection,
        connection_id: UUID,
        current_user: UserBase,
    ) -> tuple[bool, str]:
        """Re-test stored credentials against the bucket."""
        row = await cls.require_usable(connection, connection_id, current_user, READ_ROLE)
        healthy, message = S3Service(row).check()
        await StorageConnectionRepository.record_check(connection, connection_id, message)
        return healthy, message

    @classmethod
    async def browse(
        cls,
        connection: AsyncConnection,
        connection_id: UUID,
        current_user: UserBase,
        path: str = "",
        limit: int = 200,
    ) -> dict:
        """List sub-prefixes and images under a prefix."""
        row = await cls.require_usable(connection, connection_id, current_user, READ_ROLE)
        service = S3Service(row)
        try:
            return {
                "path": path,
                "prefixes": service.list_prefixes(path),
                "objects": service.list_objects(path, IMAGE_SUFFIXES, limit),
            }
        except Exception:
            # boto3 errors quote the endpoint, bucket and sometimes the credential in use,
            # so the detail stays in the server log and the client gets a bare 502.
            logger.exception(f"Bucket listing failed for storage connection {connection_id}")
            raise BucketListingFailedException()
