"""File Share router with file browsing, upload, and thumbnail endpoints."""

from typing import Annotated

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from fastapi.responses import FileResponse

from app.config import settings
from app.dependencies.auth import get_current_active_user
from app.helpers.response_api import JsonResponse
from app.schemas.auth import UserBase
from app.schemas.share import (
    DirectoryCreateRequest,
    DirectoryCreateResponse,
    DirectoryListResponse,
    FileSelectionRequest,
    FileSelectionResponse,
    NestedDirectoryCreateRequest,
    NestedDirectoryCreateResponse,
    UploadFailure,
    UploadResponse,
)
from app.services.filesystem import FileSystemService
from app.services.thumbnail import ThumbnailService

router = APIRouter(prefix="/api/v1/share", tags=["File Share"])


# ============================================================================
# Dependencies
# ============================================================================
def get_filesystem_service() -> FileSystemService:
    """Get file system service instance."""
    return FileSystemService()


def get_thumbnail_service() -> ThumbnailService:
    """Get thumbnail service instance."""
    return ThumbnailService()


# ============================================================================
# Directory Listing
# ============================================================================
@router.get("", response_model=JsonResponse[DirectoryListResponse, None])
async def list_directory(
    current_user: Annotated[UserBase, Depends(get_current_active_user)],
    path: str = Query(default="", description="Relative path from share root"),
    include_hidden: bool = Query(default=False, description="Include hidden files"),
    fs: FileSystemService = Depends(get_filesystem_service),
):
    """List contents of a directory in the shared file storage.

    Returns files and subdirectories with metadata.
    """
    items, total = await fs.list_directory(path, include_hidden)
    return JsonResponse(
        data=DirectoryListResponse(
            path=path,
            items=items,
            total_count=total,
        ),
        message=f"Found {total} item(s)",
        status_code=status.HTTP_200_OK,
    )


# ============================================================================
# Directory Creation
# ============================================================================
@router.post("/mkdir", response_model=JsonResponse[DirectoryCreateResponse, None])
async def create_directory(
    request: DirectoryCreateRequest,
    current_user: Annotated[UserBase, Depends(get_current_active_user)],
    fs: FileSystemService = Depends(get_filesystem_service),
):
    """Create a new directory in the shared storage."""
    new_dir = await fs.create_directory(request.path, request.name)
    return JsonResponse(
        data=DirectoryCreateResponse(
            path=str(new_dir.relative_to(settings.SHARE_ROOT)),
            created=True,
        ),
        message="Directory created successfully",
        status_code=status.HTTP_201_CREATED,
    )


@router.post("/mkdir-nested", response_model=JsonResponse[NestedDirectoryCreateResponse, None])
async def create_nested_directories(
    request: NestedDirectoryCreateRequest,
    current_user: Annotated[UserBase, Depends(get_current_active_user)],
    fs: FileSystemService = Depends(get_filesystem_service),
):
    """Create nested directories in a single call.

    Example: base_path="", nested_path="parent/child/grandchild"
    Creates: parent/, parent/child/, parent/child/grandchild/

    Skips folders that already exist and returns list of created and skipped paths.
    """
    created, skipped = await fs.create_nested_directories(
        request.base_path,
        request.nested_path,
    )
    return JsonResponse(
        data=NestedDirectoryCreateResponse(
            created=created,
            skipped=skipped,
        ),
        message=f"Created {len(created)} folder(s), {len(skipped)} already existed",
        status_code=status.HTTP_201_CREATED,
    )


# ============================================================================
# File Upload
# ============================================================================
@router.post("/upload", response_model=JsonResponse[UploadResponse, None])
async def upload_files(
    current_user: Annotated[UserBase, Depends(get_current_active_user)],
    destination: str = Query(..., description="Target directory path"),
    files: list[UploadFile] = File(..., description="Files to upload"),
    fs: FileSystemService = Depends(get_filesystem_service),
):
    """Upload multiple files to a directory.

    Supports multipart/form-data with multiple files.
    """
    uploaded = []
    failed = []

    max_size = settings.SHARE_MAX_UPLOAD_SIZE_MB * 1024 * 1024

    for file in files:
        try:
            # Read file content
            content = await file.read()

            # Check file size
            if len(content) > max_size:
                failed.append(
                    UploadFailure(
                        filename=file.filename or "unknown",
                        reason=f"File exceeds maximum size ({settings.SHARE_MAX_UPLOAD_SIZE_MB}MB)",
                    )
                )
                continue

            # Save file
            saved_path = await fs.save_uploaded_file(
                destination, file.filename or "unknown", content
            )
            uploaded.append(saved_path)

        except HTTPException as e:
            failed.append(
                UploadFailure(filename=file.filename or "unknown", reason=e.detail)
            )
        except Exception as e:
            failed.append(
                UploadFailure(filename=file.filename or "unknown", reason=str(e))
            )

    return JsonResponse(
        data=UploadResponse(
            uploaded=uploaded,
            failed=failed,
            total_uploaded=len(uploaded),
            total_failed=len(failed),
        ),
        message=f"Uploaded {len(uploaded)} file(s), {len(failed)} failed",
        status_code=status.HTTP_200_OK,
    )


# ============================================================================
# Thumbnails
# ============================================================================
@router.get("/thumbnail/{path:path}")
async def get_thumbnail(
    path: str,
    current_user: Annotated[UserBase, Depends(get_current_active_user)],
    thumb: ThumbnailService = Depends(get_thumbnail_service),
    size: str = Query(default="2x", regex="^(1x|2x|4x)$", description="Thumbnail size (1x=256px, 2x=512px, 4x=1024px)"),
):
    """Get thumbnail for an image with specified size. Generates on-demand if not cached."""
    try:
        thumbnail_path = await thumb.get_or_create_thumbnail(path, size)
        return FileResponse(
            thumbnail_path,
            media_type="image/jpeg",
            headers={"Cache-Control": "public, max-age=86400"},  # 24h cache
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Image not found")
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# Batch Image Info
# ============================================================================
@router.post("/batch-info", response_model=JsonResponse[dict, None])
async def get_batch_image_info(
    paths: list[str],
    current_user: Annotated[UserBase, Depends(get_current_active_user)],
    thumb: ThumbnailService = Depends(get_thumbnail_service),
):
    """Get metadata for multiple images including thumbnail URLs."""
    images = []
    errors = []

    for path in paths:
        try:
            info = await thumb.get_image_info(path)
            info["thumbnail_url"] = f"/api/v1/share/thumbnail/{path}"
            images.append(info)
        except Exception as e:
            errors.append({"path": path, "error": str(e)})

    return JsonResponse(
        data={"images": images, "errors": errors},
        message=f"Retrieved info for {len(images)} image(s)",
        status_code=status.HTTP_200_OK,
    )


# ============================================================================
# Selection Resolution
# ============================================================================
@router.post("/resolve-selection", response_model=JsonResponse[FileSelectionResponse, None])
async def resolve_selection(
    request: FileSelectionRequest,
    current_user: Annotated[UserBase, Depends(get_current_active_user)],
    fs: FileSystemService = Depends(get_filesystem_service),
):
    """Resolve selected paths (files and folders) to a flat list of file paths.

    Used when submitting a selection that includes folders.
    """
    files = await fs.resolve_selection(request.paths, request.recursive)
    return JsonResponse(
        data=FileSelectionResponse(
            files=files,
            total_count=len(files),
        ),
        message=f"Resolved {len(files)} file(s)",
        status_code=status.HTTP_200_OK,
    )
