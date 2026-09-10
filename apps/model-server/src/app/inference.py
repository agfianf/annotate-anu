"""Runs Ultralytics predictions and shapes them into the BYOM flat_arrays contract."""

import base64
import io
import time

import numpy as np
from PIL import Image

from app.registry import LoadedModel


def _polygon_area(points: list[list[float]]) -> float:
    """Shoelace area over [[x, y], ...] point pairs."""
    n = len(points)
    if n < 3:
        return 0.0
    total = sum(
        points[i][0] * points[(i + 1) % n][1] - points[(i + 1) % n][0] * points[i][1]
        for i in range(n)
    )
    return abs(total) / 2


def run(
    loaded: LoadedModel,
    image_bytes: bytes,
    threshold: float,
    class_filter: list[str] | None,
    return_visualization: bool,
) -> dict:
    image = Image.open(io.BytesIO(image_bytes)).convert("RGB")

    classes = None
    if class_filter:
        wanted = {c.lower() for c in class_filter}
        classes = [i for i, n in enumerate(loaded.class_names) if n.lower() in wanted]
        if not classes:
            return {
                "num_objects": 0, "boxes": [], "scores": [], "masks": [], "labels": [],
                "processing_time_ms": 0.0, "visualization_base64": None,
            }

    start = time.perf_counter()
    results = loaded.model.predict(
        source=np.array(image), conf=threshold, classes=classes, verbose=False
    )
    elapsed_ms = (time.perf_counter() - start) * 1000

    result = results[0]
    boxes: list[list[float]] = []
    scores: list[float] = []
    labels: list[str] = []

    if result.boxes is not None and len(result.boxes) > 0:
        boxes = [[float(v) for v in b] for b in result.boxes.xyxy.cpu().tolist()]
        scores = [float(c) for c in result.boxes.conf.cpu().tolist()]
        labels = [loaded.class_names[int(c)] for c in result.boxes.cls.cpu().tolist()]

    masks: list[dict] = []
    if getattr(result, "masks", None) is not None and result.masks is not None:
        for polygon in result.masks.xy:
            # api-core expects [[x, y], ...] pairs, not a flat coordinate array
            points = [[float(x), float(y)] for x, y in polygon.tolist()]
            if len(points) >= 3:
                masks.append({"polygons": [points], "area": _polygon_area(points)})

    visualization = None
    if return_visualization:
        plotted = result.plot()[:, :, ::-1]
        buffer = io.BytesIO()
        Image.fromarray(plotted).save(buffer, format="JPEG", quality=85)
        visualization = base64.b64encode(buffer.getvalue()).decode("utf-8")

    return {
        "num_objects": len(boxes),
        "boxes": boxes,
        "scores": scores,
        "masks": masks,
        "labels": labels,
        "processing_time_ms": round(elapsed_ms, 2),
        "visualization_base64": visualization,
    }


def classify(loaded: LoadedModel, image_bytes: bytes, top_k: int) -> dict:
    image = Image.open(io.BytesIO(image_bytes)).convert("RGB")

    start = time.perf_counter()
    result = loaded.model.predict(source=np.array(image), verbose=False)[0]
    elapsed_ms = (time.perf_counter() - start) * 1000

    if getattr(result, "probs", None) is None:
        raise ValueError(f"Model '{loaded.name}' is a {loaded.task} model, not a classifier")

    probs = result.probs.data.cpu().numpy()
    top = np.argsort(probs)[::-1][:top_k]
    predictions = [
        {"label": loaded.class_names[int(i)], "confidence": float(probs[int(i)])} for i in top
    ]
    return {
        "predictions": predictions,
        "processing_time_ms": round(elapsed_ms, 2),
    }
