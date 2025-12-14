"""Thumbnail service for generating and caching image thumbnails."""

import hashlib
from pathlib import Path

from PIL import Image

from app.config import settings


class ThumbnailService:
    """Service for generating and caching image thumbnails."""

    def __init__(self):
        """Initialize thumbnail service."""
        self.cache_dir = settings.SHARE_THUMBNAIL_CACHE_DIR
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self.sizes = settings.SHARE_THUMBNAIL_SIZES
        self.quality = settings.SHARE_THUMBNAIL_QUALITY
        self.base_path = settings.SHARE_ROOT

    def _get_cache_path(self, image_path: str, size_key: str = "2x") -> Path:
        """Generate cache path for thumbnail based on image path hash and size.

        Parameters
        ----------
        image_path : str
            Relative path to image
        size_key : str
            Size key for thumbnail (1x, 2x, 4x)

        Returns
        -------
        Path
            Path to cached thumbnail
        """
        path_hash = hashlib.md5(f"{image_path}_{size_key}".encode()).hexdigest()
        return self.cache_dir / f"{path_hash}.jpg"

    async def get_or_create_thumbnail(self, relative_path: str, size_key: str = "2x") -> Path:
        """Get existing thumbnail or create new one.

        Parameters
        ----------
        relative_path : str
            Relative path to image
        size_key : str
            Size key for thumbnail (1x, 2x, 4x)

        Returns
        -------
        Path
            Path to thumbnail

        Raises
        ------
        ValueError
            If invalid size_key provided
        FileNotFoundError
            If source image not found
        RuntimeError
            If thumbnail generation fails
        """
        # Validate size_key
        if size_key not in self.sizes:
            raise ValueError(f"Invalid size_key: {size_key}. Must be one of {list(self.sizes.keys())}")

        cache_path = self._get_cache_path(relative_path, size_key)
        source_path = self.base_path / relative_path

        # Check if source exists
        if not source_path.exists():
            raise FileNotFoundError(f"Source image not found: {relative_path}")

        # Check if cache exists and is newer than source
        if cache_path.exists():
            source_mtime = source_path.stat().st_mtime
            cache_mtime = cache_path.stat().st_mtime
            if cache_mtime >= source_mtime:
                return cache_path

        # Generate thumbnail with specified size
        await self._generate_thumbnail(source_path, cache_path, self.sizes[size_key])
        return cache_path

    async def _generate_thumbnail(self, source: Path, target: Path, size: tuple[int, int]) -> None:
        """Generate thumbnail image.

        Parameters
        ----------
        source : Path
            Path to source image
        target : Path
            Path to save thumbnail
        size : tuple[int, int]
            Thumbnail size (width, height)

        Raises
        ------
        RuntimeError
            If thumbnail generation fails
        """
        try:
            with Image.open(source) as img:
                # Convert to RGB if necessary (for PNG with transparency)
                if img.mode in ("RGBA", "P"):
                    img = img.convert("RGB")

                # Create thumbnail (maintains aspect ratio)
                img.thumbnail(size, Image.Resampling.LANCZOS)

                # Save to cache
                img.save(target, "JPEG", quality=self.quality, optimize=True)
        except Exception as e:
            raise RuntimeError(f"Failed to generate thumbnail: {e}")

    async def get_image_info(self, relative_path: str) -> dict:
        """Get image metadata.

        Parameters
        ----------
        relative_path : str
            Relative path to image

        Returns
        -------
        dict
            Image metadata including path, dimensions, size, mime_type

        Raises
        ------
        FileNotFoundError
            If image not found
        """
        source_path = self.base_path / relative_path

        if not source_path.exists():
            raise FileNotFoundError(f"Image not found: {relative_path}")

        with Image.open(source_path) as img:
            width, height = img.size

        stat = source_path.stat()
        suffix = source_path.suffix[1:].lower()
        mime_type = f"image/{suffix}" if suffix else "application/octet-stream"

        return {
            "path": relative_path,
            "width": width,
            "height": height,
            "size": stat.st_size,
            "mime_type": mime_type,
        }

    async def cleanup_cache(self, max_age_days: int = 30) -> int:
        """Remove old cached thumbnails.

        Parameters
        ----------
        max_age_days : int
            Maximum age of cached thumbnails in days

        Returns
        -------
        int
            Number of thumbnails removed
        """
        import time

        count = 0
        max_age_seconds = max_age_days * 24 * 60 * 60
        now = time.time()

        for cache_file in self.cache_dir.glob("*.jpg"):
            if now - cache_file.stat().st_mtime > max_age_seconds:
                cache_file.unlink()
                count += 1

        return count
