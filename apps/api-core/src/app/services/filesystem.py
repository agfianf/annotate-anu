"""File system service for secure file operations."""

import mimetypes
import os
from datetime import datetime
from pathlib import Path

import aiofiles
from fastapi import HTTPException

from app.config import settings
from app.schemas.share import FileItem


class FileSystemService:
    """Service for file system operations with security checks."""

    def __init__(self, base_path: Path | None = None):
        """Initialize file system service.

        Parameters
        ----------
        base_path : Path | None
            Base path for file operations. Defaults to settings.SHARE_ROOT.
        """
        self.base_path = base_path or settings.SHARE_ROOT
        self.allowed_extensions = settings.SHARE_ALLOWED_EXTENSIONS
        self.max_depth = settings.SHARE_MAX_DEPTH

    def _validate_path(self, relative_path: str) -> Path:
        """Validate and resolve path, preventing directory traversal attacks.

        Parameters
        ----------
        relative_path : str
            Relative path from share root

        Returns
        -------
        Path
            Absolute path if valid

        Raises
        ------
        HTTPException
            If path traversal is detected
        """
        # Normalize and resolve
        clean_path = Path(relative_path.lstrip("/"))
        absolute_path = (self.base_path / clean_path).resolve()

        # Security check: ensure path is within base_path
        try:
            absolute_path.relative_to(self.base_path.resolve())
        except ValueError:
            raise HTTPException(
                status_code=403, detail="Access denied: path traversal detected"
            )

        return absolute_path

    def _check_depth(self, relative_path: str) -> None:
        """Check if path depth exceeds maximum allowed.

        Parameters
        ----------
        relative_path : str
            Relative path to check

        Raises
        ------
        HTTPException
            If depth exceeds maximum
        """
        depth = len(Path(relative_path).parts)
        if depth > self.max_depth:
            raise HTTPException(
                status_code=400,
                detail=f"Maximum folder depth ({self.max_depth}) exceeded",
            )

    def _is_allowed_file(self, filename: str) -> bool:
        """Check if file extension is allowed.

        Parameters
        ----------
        filename : str
            File name to check

        Returns
        -------
        bool
            True if extension is allowed
        """
        ext = Path(filename).suffix.lower()
        return ext in self.allowed_extensions

    async def list_directory(
        self, relative_path: str = "", include_hidden: bool = False
    ) -> tuple[list[FileItem], int]:
        """List contents of a directory.

        Parameters
        ----------
        relative_path : str
            Path relative to share root
        include_hidden : bool
            Whether to include hidden files

        Returns
        -------
        tuple[list[FileItem], int]
            Tuple of (items, total_count)

        Raises
        ------
        HTTPException
            If directory not found or permission denied
        """
        self._check_depth(relative_path)
        absolute_path = self._validate_path(relative_path)

        # Ensure base path exists
        if not self.base_path.exists():
            self.base_path.mkdir(parents=True, exist_ok=True)

        if not absolute_path.exists():
            raise HTTPException(status_code=404, detail="Directory not found")

        if not absolute_path.is_dir():
            raise HTTPException(status_code=400, detail="Path is not a directory")

        items: list[FileItem] = []

        try:
            entries = list(os.scandir(absolute_path))
        except PermissionError:
            raise HTTPException(status_code=403, detail="Permission denied")

        for entry in entries:
            # Skip hidden files unless requested
            if not include_hidden and entry.name.startswith("."):
                continue

            # For files, check if extension is allowed
            if entry.is_file() and not self._is_allowed_file(entry.name):
                continue

            try:
                stat = entry.stat()
                relative_item_path = str(Path(relative_path) / entry.name).lstrip("/")

                if entry.is_dir():
                    # Count immediate children for directories
                    try:
                        children = len(list(os.scandir(entry.path)))
                    except (PermissionError, OSError):
                        children = 0

                    items.append(
                        FileItem(
                            name=entry.name,
                            path=relative_item_path,
                            type="directory",
                            modified_at=datetime.fromtimestamp(stat.st_mtime),
                            children_count=children,
                        )
                    )
                else:
                    mime_type, _ = mimetypes.guess_type(entry.name)
                    items.append(
                        FileItem(
                            name=entry.name,
                            path=relative_item_path,
                            type="file",
                            size=stat.st_size,
                            mime_type=mime_type,
                            modified_at=datetime.fromtimestamp(stat.st_mtime),
                        )
                    )
            except (OSError, PermissionError):
                # Skip files we can't access
                continue

        # Sort: directories first, then alphabetically
        items.sort(key=lambda x: (x.type != "directory", x.name.lower()))

        return items, len(items)

    async def create_directory(self, relative_path: str, name: str) -> Path:
        """Create a new directory.

        Parameters
        ----------
        relative_path : str
            Parent path relative to share root
        name : str
            Name of new directory

        Returns
        -------
        Path
            Path to created directory

        Raises
        ------
        HTTPException
            If creation fails
        """
        self._check_depth(f"{relative_path}/{name}")
        parent_path = self._validate_path(relative_path)

        # Ensure parent exists
        if not parent_path.exists():
            raise HTTPException(status_code=404, detail="Parent directory not found")

        # Validate directory name
        if "/" in name or "\\" in name or name in (".", ".."):
            raise HTTPException(status_code=400, detail="Invalid directory name")

        new_dir = parent_path / name

        if new_dir.exists():
            raise HTTPException(status_code=409, detail="Directory already exists")

        try:
            new_dir.mkdir(parents=False)
            return new_dir
        except OSError as e:
            raise HTTPException(
                status_code=500, detail=f"Failed to create directory: {e}"
            )

    async def save_uploaded_file(
        self, relative_path: str, filename: str, content: bytes
    ) -> str:
        """Save an uploaded file.

        Parameters
        ----------
        relative_path : str
            Target directory path
        filename : str
            Original filename
        content : bytes
            File content

        Returns
        -------
        str
            Relative path of saved file

        Raises
        ------
        HTTPException
            If save fails
        """
        if not self._is_allowed_file(filename):
            raise HTTPException(
                status_code=400, detail=f"File type not allowed: {filename}"
            )

        self._check_depth(f"{relative_path}/{filename}")
        target_dir = self._validate_path(relative_path)

        if not target_dir.exists():
            raise HTTPException(status_code=404, detail="Target directory not found")

        # Sanitize filename
        safe_filename = Path(filename).name  # Remove any path components
        target_file = target_dir / safe_filename

        # Handle duplicate filenames
        counter = 1
        original_stem = target_file.stem
        while target_file.exists():
            target_file = target_dir / f"{original_stem}_{counter}{target_file.suffix}"
            counter += 1

        async with aiofiles.open(target_file, "wb") as f:
            await f.write(content)

        return str(target_file.relative_to(self.base_path))

    async def resolve_selection(
        self, paths: list[str], recursive: bool = True
    ) -> list[str]:
        """Resolve a list of paths (files and folders) to a list of file paths.

        Used when user selects folders - expands to all files within.

        Parameters
        ----------
        paths : list[str]
            List of selected paths
        recursive : bool
            Whether to recursively resolve folders

        Returns
        -------
        list[str]
            List of resolved file paths
        """
        resolved_files: list[str] = []

        for path in paths:
            absolute_path = self._validate_path(path)

            if not absolute_path.exists():
                continue

            if absolute_path.is_file():
                if self._is_allowed_file(absolute_path.name):
                    resolved_files.append(path)
            elif absolute_path.is_dir() and recursive:
                # Recursively collect all files
                for root, _, files in os.walk(absolute_path):
                    root_path = Path(root)
                    # Check depth
                    rel_root = root_path.relative_to(self.base_path)
                    if len(rel_root.parts) > self.max_depth:
                        continue

                    for file in files:
                        if self._is_allowed_file(file):
                            file_path = root_path / file
                            rel_path = str(file_path.relative_to(self.base_path))
                            resolved_files.append(rel_path)

        return sorted(set(resolved_files))  # Remove duplicates and sort

    def get_absolute_path(self, relative_path: str) -> Path:
        """Get absolute path for a relative path.

        Parameters
        ----------
        relative_path : str
            Relative path from share root

        Returns
        -------
        Path
            Absolute path
        """
        return self._validate_path(relative_path)
