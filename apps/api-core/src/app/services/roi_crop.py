"""Generates and caches ROI crops for classification QC.

Crops come from two places: annotations already in the database, or a directory
of pre-extracted crops laid out as <class>/<crop>.jpg.
"""

import hashlib
from pathlib import Path

from PIL import Image

from app.config import settings
from app.helpers.logger import logger

CACHE_DIR = settings.SHARE_THUMBNAIL_CACHE_DIR / "roi"
MAX_EDGE = 320
PAD_FRAC = 0.08


class ROICropService:
    """Crops annotation regions out of source images, cached on disk."""

    def __init__(self) -> None:
        self.cache_dir = CACHE_DIR
        self.cache_dir.mkdir(parents=True, exist_ok=True)

    def _cache_path(self, annotation_id: str) -> Path:
        digest = hashlib.sha256(annotation_id.encode()).hexdigest()[:24]
        return self.cache_dir / f"{digest}.jpg"

    def get_or_create(
        self, annotation_id: str, s3_key: str, bbox: tuple[float, float, float, float]
    ) -> Path:
        """Crop one normalized bbox out of an image, reusing the cached file.

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
        target = self._cache_path(annotation_id)
        if target.exists():
            return target

        source = settings.SHARE_ROOT / s3_key
        if not source.exists():
            raise FileNotFoundError(f"Source image not found: {s3_key}")

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

        logger.debug(f"Cached ROI crop for {annotation_id}")
        return target

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
