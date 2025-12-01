"""Custom exceptions for model operations."""

from fastapi import HTTPException, status


class ModelNotFoundException(HTTPException):
    """Exception raised when model is not found."""

    def __init__(self, model_id: str):
        """Initialize exception.

        Parameters
        ----------
        model_id : str
            Model identifier that was not found
        """
        super().__init__(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Model with ID '{model_id}' not found",
        )


class DuplicateModelException(HTTPException):
    """Exception raised when model name already exists."""

    def __init__(self, name: str):
        """Initialize exception.

        Parameters
        ----------
        name : str
            Duplicate model name
        """
        super().__init__(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Model with name '{name}' already exists",
        )


class ModelCreationFailedException(HTTPException):
    """Exception raised when model creation fails."""

    def __init__(self, detail: str = "Failed to create model"):
        """Initialize exception.

        Parameters
        ----------
        detail : str
            Error detail message
        """
        super().__init__(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=detail,
        )


class ModelHealthCheckFailedException(HTTPException):
    """Exception raised when health check fails."""

    def __init__(self, model_id: str, detail: str):
        """Initialize exception.

        Parameters
        ----------
        model_id : str
            Model identifier
        detail : str
            Error detail message
        """
        super().__init__(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Health check failed for model '{model_id}': {detail}",
        )
