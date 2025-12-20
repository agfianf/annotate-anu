"""Standardized JSON response helpers."""

from typing import Generic, TypeVar

from pydantic import BaseModel, Field

DataT = TypeVar("DataT")
MetaT = TypeVar("MetaT")


class MetaResponse(BaseModel):
    """Pagination metadata for list responses."""

    page: int = Field(..., description="Current page number")
    limit: int = Field(..., description="Items per page")
    total_items: int = Field(..., description="Total number of items")
    total_pages: int = Field(..., description="Total number of pages")


class JsonResponse(BaseModel, Generic[DataT, MetaT]):
    """Standardized JSON response format.

    This is the standard response format for all API endpoints.
    Format: { data, message, success, status_code, meta }
    """

    data: DataT | None = Field(default=None, description="Response data")
    message: str = Field(..., description="Human-readable message")
    success: bool = Field(default=True, description="Whether the request was successful")
    status_code: int = Field(..., description="HTTP status code")
    meta: MetaT | None = Field(default=None, description="Metadata (pagination, etc)")

    model_config = {"arbitrary_types_allowed": True}


class ErrorDetail(BaseModel):
    """Error detail information."""

    field: str | None = Field(default=None, description="Field that caused the error")
    message: str = Field(..., description="Error message")
    type: str | None = Field(default=None, description="Error type")


class ErrorResponse(BaseModel):
    """Standardized error response format.

    Format: { data, message, success, status_code, meta }
    """

    data: None = Field(default=None, description="Always null for errors")
    message: str = Field(..., description="Human-readable error message")
    success: bool = Field(default=False, description="Always false for errors")
    status_code: int = Field(..., description="HTTP status code")
    meta: dict | None = Field(default=None, description="Additional error details")
