"""Generates and caches ROI crops for classification QC.

Crops come from two places: annotations already in the database, or a directory
of pre-extracted crops laid out as <class>/<crop>.jpg.
"""

import asyncio
import hashlib
from pathlib import Path

from PIL import Image

from app.config import settings
from app.helpers.logger import logger

CACHE_DIR = settings.SHARE_THUMBNAIL_CACHE_DIR / "roi"
MAX_EDGE = 320
PAD_FRAC = 0.08


class ROICropService:
    """Crops annotation regions out of source images, cached on disk.

    Use the module-level ``roi_crop_service`` instance rather than constructing one per request: the cache directory is created once, on the first crop, and never re-checked.
    """

    def __init__(self) -> None:
        self.cache_dir = CACHE_DIR
        self._cache_dir_ready = False

    def _ensure_cache_dir(self) -> None:
        # Lazy so importing the module does not touch the filesystem
        if not self._cache_dir_ready:
            self.cache_dir.mkdir(parents=True, exist_ok=True)
            self._cache_dir_ready = True

    def _cache_path(self, annotation_id: str) -> Path:
        digest = hashlib.sha256(annotation_id.encode()).hexdigest()[:24]
        return self.cache_dir / f"{digest}.jpg"

    async def get_or_create(
        self, annotation_id: str, s3_key: str, bbox: tuple[float, float, float, float]
    ) -> Path:
        """Crop one normalized bbox out of an image, reusing the cached file.

        The PIL decode/crop/encode runs on a worker thread so the event loop is not blocked while a crop is rendered.

        Parameters
        ----------
        annotation_id : str
            Stable id used as the cache key
        s3_key : str
            Image path relative to SHARE_ROOT
        bbox : tuple
            Normalized (x_min, y_min, x_max, y_max)

        Returns
        -------
        Path
            Path to the cached crop
        """
        self._ensure_cache_dir()
        target = self._cache_path(annotation_id)
        if target.exists():
            return target

        source = settings.SHARE_ROOT / s3_key
        if not source.exists():
            raise FileNotFoundError(f"Source image not found: {s3_key}")

        await asyncio.to_thread(self._render_crop, annotation_id, source, target, bbox)
        logger.debug(f"Cached ROI crop for {annotation_id}")
        return target

    @staticmethod
    def _render_crop(
        annotation_id: str, source: Path, target: Path, bbox: tuple[float, float, float, float]
    ) -> None:
        """Blocking PIL work; run via ``asyncio.to_thread``."""
        with Image.open(source) as img:
            img = img.convert("RGB")
            width, height = img.size

            x0, y0, x1, y1 = bbox
            px0, py0 = x0 * width, y0 * height
            px1, py1 = x1 * width, y1 * height

            # A little context makes small objects judgeable
            pad = PAD_FRAC * max(px1 - px0, py1 - py0)
            box = (
                max(0, int(px0 - pad)),
                max(0, int(py0 - pad)),
                min(width, int(px1 + pad)),
                min(height, int(py1 + pad)),
            )
            if box[2] <= box[0] or box[3] <= box[1]:
                raise ValueError(f"Degenerate crop box for annotation {annotation_id}")

            crop = img.crop(box)
            crop.thumbnail((MAX_EDGE, MAX_EDGE), Image.Resampling.LANCZOS)
            crop.save(target, "JPEG", quality=85)

    def imported_crops(self, root: Path) -> list[dict]:
        """List a pre-extracted crop dump laid out as <class>/<crop>.jpg."""
        if not root.is_dir():
            return []

        items = []
        for class_dir in sorted(p for p in root.iterdir() if p.is_dir()):
            for crop in sorted([*class_dir.glob("*.jpg"), *class_dir.glob("*.png")]):
                items.append(
                    {
                        "item_key": str(crop.relative_to(root)),
                        "src_label": class_dir.name,
                        "path": str(crop),
                    }
                )
        return items


# One instance for the process, so the cache-dir check happens once rather than per request
roi_crop_service = ROICropService()
