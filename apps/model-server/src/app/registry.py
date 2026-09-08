"""Discovery and cached loading of local Ultralytics weights."""

import os
import threading
from dataclasses import dataclass
from pathlib import Path

MODELS_DIR = Path(os.getenv("MODELS_DIR", "/code/models"))
DEVICE = os.getenv("MODEL_SERVER_DEVICE", "auto")

_lock = threading.Lock()
_loaded: dict[str, "LoadedModel"] = {}


@dataclass
class LoadedModel:
    name: str
    path: Path
    model: object
    task: str
    class_names: list[str]


def _resolve_device() -> str:
    if DEVICE != "auto":
        return DEVICE
    import torch

    return "cuda" if torch.cuda.is_available() else "cpu"


def model_path(name: str) -> Path:
    """Resolve a model name to a path inside MODELS_DIR, rejecting traversal."""
    candidate = (MODELS_DIR / f"{name}.pt").resolve()
    if candidate.parent != MODELS_DIR.resolve():
        raise ValueError(f"Invalid model name: {name}")
    return candidate


def list_models() -> list[dict]:
    if not MODELS_DIR.exists():
        return []
    entries = []
    for path in sorted(MODELS_DIR.glob("*.pt")):
        name = path.stem
        entry = {"name": name, "size_bytes": path.stat().st_size, "loaded": name in _loaded}
        if name in _loaded:
            entry["task"] = _loaded[name].task
            entry["classes"] = _loaded[name].class_names
        entries.append(entry)
    return entries


def load(name: str) -> LoadedModel:
    """Load and cache a model. Concurrent callers share one instance."""
    if name in _loaded:
        return _loaded[name]

    path = model_path(name)
    if not path.exists():
        raise FileNotFoundError(f"Model '{name}' not found in {MODELS_DIR}")

    with _lock:
        if name in _loaded:
            return _loaded[name]

        from ultralytics import YOLO

        model = YOLO(str(path))
        model.to(_resolve_device())

        names = model.names
        class_names = [names[i] for i in sorted(names)] if isinstance(names, dict) else list(names)

        loaded = LoadedModel(
            name=name,
            path=path,
            model=model,
            task=getattr(model, "task", "detect"),
            class_names=class_names,
        )
        _loaded[name] = loaded
        return loaded


def unload(name: str) -> bool:
    with _lock:
        return _loaded.pop(name, None) is not None
