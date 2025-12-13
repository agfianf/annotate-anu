"""Pydantic schemas for File Share feature."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


# ============================================================================
# File/Directory Schemas
# ============================================================================
class FileItem(BaseModel):
    """Single file or directory item."""

    name: str = Field(..., description="File or directory name")
    path: str = Field(..., description="Relative path from share root")
    type: Literal["file", "directory"] = Field(..., description="Item type")
    size: int | None = Field(None, description="File size in bytes (files only)")
    mime_type: str | None = Field(None, description="MIME type (files only)")
    modified_at: datetime | None = Field(None, description="Last modified timestamp")
    children_count: int | None = Field(None, description="Number of immediate children (directories only)")


class DirectoryListResponse(BaseModel):
    """Response for directory listing."""

    path: str = Field(..., description="Current directory path")
    items: list[FileItem] = Field(default_factory=list, description="Directory contents")
    total_count: int = Field(..., description="Total number of items")
    has_more: bool = Field(default=False, description="Whether there are more items (pagination)")


# ============================================================================
# Directory Creation Schemas
# ============================================================================
class DirectoryCreateRequest(BaseModel):
    """Request to create a new directory."""

    path: str = Field(default="", description="Parent path relative to share root")
    name: str = Field(..., min_length=1, max_length=255, description="New directory name")


class DirectoryCreateResponse(BaseModel):
    """Response after creating directory."""

    path: str = Field(..., description="Full path of created directory")
    created: bool = Field(..., description="Whether directory was created")


class NestedDirectoryCreateRequest(BaseModel):
    """Request to create nested directories."""

    base_path: str = Field(default="", description="Base path relative to share root")
    nested_path: str = Field(..., min_length=1, description="Nested directory path (e.g., 'parent/child/grandchild')")


class NestedDirectoryCreateResponse(BaseModel):
    """Response after creating nested directories."""

    created: list[str] = Field(default_factory=list, description="List of created directory paths")
    skipped: list[str] = Field(default_factory=list, description="List of already existing directory paths")


# ============================================================================
# Upload Schemas
# ============================================================================
class UploadFailure(BaseModel):
    """Details of a failed upload."""

    filename: str = Field(..., description="Name of the file that failed")
    reason: str = Field(..., description="Reason for failure")


class UploadResponse(BaseModel):
    """Response after file upload."""

    uploaded: list[str] = Field(default_factory=list, description="Successfully uploaded file paths")
    failed: list[UploadFailure] = Field(default_factory=list, description="Failed uploads with reasons")
    total_uploaded: int = Field(..., description="Count of successfully uploaded files")
    total_failed: int = Field(..., description="Count of failed uploads")


# ============================================================================
# Thumbnail/Image Schemas
# ============================================================================
class ThumbnailRequest(BaseModel):
    """Request for batch thumbnails."""

    paths: list[str] = Field(..., description="List of image paths")


class ImageInfo(BaseModel):
    """Image metadata."""

    path: str = Field(..., description="Image path")
    width: int = Field(..., description="Image width in pixels")
    height: int = Field(..., description="Image height in pixels")
    size: int = Field(..., description="File size in bytes")
    mime_type: str = Field(..., description="MIME type")
    thumbnail_url: str = Field(..., description="URL to thumbnail")


class BatchImageInfoResponse(BaseModel):
    """Response for batch image info."""

    images: list[ImageInfo] = Field(default_factory=list, description="Image metadata list")
    errors: list[dict] = Field(default_factory=list, description="Errors for failed images")


# ============================================================================
# Selection Resolution Schemas
# ============================================================================
class FileSelectionRequest(BaseModel):
    """Request to resolve file selection (folders -> files)."""

    paths: list[str] = Field(..., description="List of selected paths (files and/or folders)")
    recursive: bool = Field(default=True, description="Whether to recursively resolve folders")


class FileSelectionResponse(BaseModel):
    """Resolved file paths."""

    files: list[str] = Field(default_factory=list, description="List of resolved file paths")
    total_count: int = Field(..., description="Total number of files")
