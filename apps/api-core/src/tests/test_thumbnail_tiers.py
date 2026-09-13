"""The thumbnail tier ladder, including the `3x` (768 px) tier added for retina grid tiles.

A DPR 2 client showing a ~330 CSS px tile needs ~660 device px. Before `3x` existed the client's tier selection jumped straight from 512 px to 1024 px, which is what made the gallery transfer 33 MB where it used to transfer 11.7 MB. `3x` sits between them at 768 px.

The ladder is defined once, in `settings.SHARE_THUMBNAIL_SIZES` (`app/config.py`); the router's `size` query pattern (`app/routers/share.py`) is the only other place the keys are spelled out, so both are asserted here. Every tier is a bound on the longest side — `Image.thumbnail` scales to fit and never upscales — so these tests pin the bound rather than an exact width.

`app.main` cannot be imported on a dev host (`PermissionError: /data`), so the router test builds a bare `FastAPI()` around the share router, as the other router tests here do.
"""

from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from PIL import Image

from app.config import settings
from app.dependencies.auth import get_current_active_user
from app.routers import share as share_router
from app.services.thumbnail import ThumbnailService

#: The full ladder, as the client's tier selection sees it. 3x = 3 x 256, following the existing naming.
EXPECTED_TIERS = {"1x": 256, "2x": 512, "3x": 768, "4x": 1024}

#: Landscape 16:9-ish source, larger than every tier, so each tier is bound by width.
LARGE_SOURCE = (2688, 1584)

#: Smaller than 768 on both sides, so 3x and 4x must both leave it alone.
SMALL_SOURCE = (400, 300)


def _write_image(path: Path, size: tuple[int, int]) -> Path:
    """Write a JPEG of exactly ``size``. Content is irrelevant; only geometry is asserted."""
    path.parent.mkdir(parents=True, exist_ok=True)
    Image.new("RGB", size, (120, 90, 200)).save(path, "JPEG", quality=90)
    return path


@pytest.fixture
def thumb_service(tmp_path, monkeypatch) -> ThumbnailService:
    """A service rooted in ``tmp_path`` — the real `/data` paths are not writable off-container."""
    monkeypatch.setattr(settings, "SHARE_ROOT", tmp_path / "share")
    monkeypatch.setattr(settings, "SHARE_THUMBNAIL_CACHE_DIR", tmp_path / "cache")
    (tmp_path / "share").mkdir(parents=True, exist_ok=True)
    return ThumbnailService()


def _longest_side(path: Path) -> int:
    with Image.open(path) as img:
        return max(img.size)


def _dimensions(path: Path) -> tuple[int, int]:
    with Image.open(path) as img:
        return img.size


# ============================================================================
# The ladder itself
# ============================================================================
def test_configured_ladder_is_the_four_tiers():
    """`3x` joins the ladder without disturbing the tiers already shipped."""
    assert {
        key: max(size) for key, size in settings.SHARE_THUMBNAIL_SIZES.items()
    } == EXPECTED_TIERS


def test_router_query_pattern_accepts_exactly_the_configured_tiers(client):
    """The published regex and the config map must not drift apart."""
    parameters = client.app.openapi()["paths"]["/api/v1/share/thumbnail/{path}"]["get"][
        "parameters"
    ]
    size_param = next(p for p in parameters if p["name"] == "size")

    assert size_param["schema"]["pattern"] == "^(1x|2x|3x|4x)$"
    assert set(settings.SHARE_THUMBNAIL_SIZES) == set(EXPECTED_TIERS)


# ============================================================================
# The new 3x tier
# ============================================================================
async def test_3x_is_bounded_at_768_and_preserves_aspect_ratio(thumb_service, tmp_path):
    _write_image(tmp_path / "share" / "photo.jpg", LARGE_SOURCE)

    result = await thumb_service.get_or_create_thumbnail("photo.jpg", "3x")

    width, height = _dimensions(result)
    assert max(width, height) == 768
    source_ratio = LARGE_SOURCE[0] / LARGE_SOURCE[1]
    # Integer rounding in PIL moves the ratio by well under a pixel's worth.
    assert abs(width / height - source_ratio) < 0.01


async def test_3x_does_not_upscale_a_small_source(thumb_service, tmp_path):
    _write_image(tmp_path / "share" / "small.jpg", SMALL_SOURCE)

    result = await thumb_service.get_or_create_thumbnail("small.jpg", "3x")

    assert _dimensions(result) == SMALL_SOURCE


async def test_3x_and_4x_use_distinct_cache_entries_and_distinct_sizes(thumb_service, tmp_path):
    """A cached 4x must never be served for a 3x request; the cache key includes the size key."""
    _write_image(tmp_path / "share" / "photo.jpg", LARGE_SOURCE)

    path_3x = await thumb_service.get_or_create_thumbnail("photo.jpg", "3x")
    path_4x = await thumb_service.get_or_create_thumbnail("photo.jpg", "4x")

    assert path_3x != path_4x
    assert path_3x.exists() and path_4x.exists()
    assert _longest_side(path_3x) == 768
    assert _longest_side(path_4x) == 1024
    # Regenerating 3x after 4x exists still yields 768 — the two entries stay independent.
    assert _longest_side(await thumb_service.get_or_create_thumbnail("photo.jpg", "3x")) == 768


async def test_every_tier_has_its_own_cache_file(thumb_service, tmp_path):
    _write_image(tmp_path / "share" / "photo.jpg", LARGE_SOURCE)

    paths = {
        key: await thumb_service.get_or_create_thumbnail("photo.jpg", key) for key in EXPECTED_TIERS
    }

    assert len(set(paths.values())) == len(EXPECTED_TIERS)


# ============================================================================
# The pre-existing tiers, unchanged
# ============================================================================
@pytest.mark.parametrize(("size_key", "bound"), sorted(EXPECTED_TIERS.items()))
async def test_tier_bounds_the_longest_side(thumb_service, tmp_path, size_key, bound):
    _write_image(tmp_path / "share" / "photo.jpg", LARGE_SOURCE)

    result = await thumb_service.get_or_create_thumbnail("photo.jpg", size_key)

    assert _longest_side(result) == bound


async def test_default_size_key_is_still_2x(thumb_service, tmp_path):
    _write_image(tmp_path / "share" / "photo.jpg", LARGE_SOURCE)

    assert _longest_side(await thumb_service.get_or_create_thumbnail("photo.jpg")) == 512


# ============================================================================
# Unknown sizes behave exactly as before
# ============================================================================
async def test_unknown_size_still_raises_value_error(thumb_service, tmp_path):
    _write_image(tmp_path / "share" / "photo.jpg", LARGE_SOURCE)

    with pytest.raises(ValueError, match="Invalid size_key"):
        await thumb_service.get_or_create_thumbnail("photo.jpg", "5x")


async def test_missing_source_still_raises_file_not_found(thumb_service):
    with pytest.raises(FileNotFoundError):
        await thumb_service.get_or_create_thumbnail("nope.jpg", "3x")


# ============================================================================
# Through the router
# ============================================================================
@pytest.fixture
def client(thumb_service, tmp_path) -> TestClient:
    app = FastAPI()
    app.include_router(share_router.router)
    app.dependency_overrides[get_current_active_user] = lambda: object()
    app.dependency_overrides[share_router.get_thumbnail_service] = lambda: thumb_service
    _write_image(tmp_path / "share" / "photo.jpg", LARGE_SOURCE)
    return TestClient(app)


@pytest.mark.parametrize(("size_key", "bound"), sorted(EXPECTED_TIERS.items()))
def test_endpoint_serves_every_tier(client, size_key, bound, tmp_path):
    response = client.get("/api/v1/share/thumbnail/photo.jpg", params={"size": size_key})

    assert response.status_code == 200
    assert response.headers["content-type"] == "image/jpeg"
    out = tmp_path / f"out-{size_key}.jpg"
    out.write_bytes(response.content)
    assert _longest_side(out) == bound


def test_endpoint_rejects_an_unknown_size_as_before(client):
    """Unlisted sizes are rejected by the query pattern before the service sees them."""
    assert client.get("/api/v1/share/thumbnail/photo.jpg", params={"size": "5x"}).status_code == 422
    assert client.get("/api/v1/share/thumbnail/photo.jpg", params={"size": "3"}).status_code == 422


# ============================================================================
# Against a real source image, where one is mounted
# ============================================================================
def _first_real_image() -> Path | None:
    root = Path("/data/share")
    if not root.is_dir():
        return None
    return next((p for p in sorted(root.rglob("*.jpg")) if p.is_file()), None)


@pytest.mark.skipif(_first_real_image() is None, reason="no /data/share mount on this host")
async def test_3x_against_a_real_share_image(tmp_path, monkeypatch):
    """Runs inside `anu-api-core-dev`, where the benchmark's own source images are mounted."""
    source = _first_real_image()
    assert source is not None
    monkeypatch.setattr(settings, "SHARE_THUMBNAIL_CACHE_DIR", tmp_path / "cache")
    service = ThumbnailService()
    relative = str(source.relative_to(Path("/data/share")))

    with Image.open(source) as img:
        original = img.size

    result = await service.get_or_create_thumbnail(relative, "3x")
    width, height = _dimensions(result)

    assert max(width, height) == min(768, max(original))
    assert abs(width / height - original[0] / original[1]) < 0.01
