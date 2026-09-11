"""Resolve stored image keys within the configured share root."""

from pathlib import Path

from app.config import settings


def resolve_image_path(key: str, root: Path | None = None) -> Path:
    root = (root or settings.SHARE_ROOT).resolve()
    source = (root / key).resolve()
    if not source.is_relative_to(root):
        raise FileNotFoundError("Image not found")
    return source
