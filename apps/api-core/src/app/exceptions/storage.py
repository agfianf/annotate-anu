"""Custom exceptions for storage connection operations."""

from uuid import UUID

from fastapi import HTTPException, status


class StorageConnectionNotFoundException(HTTPException):
    """Raised when a storage connection is missing or out of the caller's reach.

    Callers who may not access a connection get this same 404 rather than a 403: a 403
    would confirm that the id exists, which is itself a disclosure for rows the caller
    has no business enumerating.
    """

    def __init__(self, connection_id: UUID):
        """Initialize exception.

        Parameters
        ----------
        connection_id : UUID
            Storage connection identifier that could not be reached
        """
        super().__init__(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Storage connection not found",
        )
        self.connection_id = connection_id


class StorageProjectForbiddenException(HTTPException):
    """Raised when a caller attaches a connection to a project they do not control."""

    def __init__(self, required_role: str):
        """Initialize exception.

        Parameters
        ----------
        required_role : str
            Minimum project role the caller was missing
        """
        super().__init__(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"This action requires at least '{required_role}' role on the project",
        )


class BucketListingFailedException(HTTPException):
    """Raised when the object store rejects a listing.

    The underlying boto3 error is logged server-side only; it can carry endpoint, bucket
    and credential detail that must not reach the client.
    """

    def __init__(self):
        """Initialize exception."""
        super().__init__(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Bucket listing failed",
        )
