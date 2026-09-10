"""Generic BYOM-compatible server for local Ultralytics/YOLO weights.

Each .pt file in MODELS_DIR is served at /models/{name}, which is the URL to
register in the app as a BYOM endpoint.
"""

import json
import logging
import os

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app import inference, registry

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

MAX_UPLOAD_BYTES = int(os.getenv("MAX_UPLOAD_MB", "500")) * 1024 * 1024

app = FastAPI(title="AnnotateANU Model Server", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def _load_or_404(name: str) -> registry.LoadedModel:
    try:
        return registry.load(name)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@app.get("/health")
async def health():
    return {"status": "healthy", "models_dir": str(registry.MODELS_DIR), "models": len(registry.list_models())}


@app.get("/models")
async def list_models():
    return {"models": registry.list_models(), "models_dir": str(registry.MODELS_DIR)}


@app.post("/models/upload")
async def upload_model(file: UploadFile = File(...)):
    if not file.filename or not file.filename.endswith(".pt"):
        raise HTTPException(status_code=400, detail="Only .pt weight files are accepted")

    name = os.path.basename(file.filename)[:-3]
    try:
        destination = registry.model_path(name)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    registry.MODELS_DIR.mkdir(parents=True, exist_ok=True)
    size = 0
    with destination.open("wb") as out:
        while chunk := await file.read(1024 * 1024):
            size += len(chunk)
            if size > MAX_UPLOAD_BYTES:
                out.close()
                destination.unlink(missing_ok=True)
                raise HTTPException(status_code=413, detail=f"File exceeds {MAX_UPLOAD_BYTES // 1024 // 1024}MB")
            out.write(chunk)

    registry.unload(name)
    loaded = _load_or_404(name)
    return {
        "name": name,
        "size_bytes": size,
        "task": loaded.task,
        "classes": loaded.class_names,
        "endpoint_url": f"/models/{name}",
    }


@app.delete("/models/{name}")
async def delete_model(name: str):
    try:
        path = registry.model_path(name)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"Model '{name}' not found")
    registry.unload(name)
    path.unlink()
    return {"deleted": name}


@app.get("/models/{name}/health")
async def model_health(name: str):
    loaded = _load_or_404(name)
    return {
        "status": "healthy",
        "model": loaded.name,
        "task": loaded.task,
        "classes": len(loaded.class_names),
    }


@app.get("/models/{name}/info")
async def model_info(name: str):
    loaded = _load_or_404(name)
    return {"name": loaded.name, "task": loaded.task, "classes": loaded.class_names}


@app.post("/models/{name}/inference")
async def model_inference(
    name: str,
    image: UploadFile = File(...),
    mode: str = Form("auto"),
    threshold: float = Form(0.25),
    class_filter: str | None = Form(None),
    return_visualization: str | None = Form(None),
):
    loaded = _load_or_404(name)

    if mode not in ("auto", "text", "bbox"):
        raise HTTPException(status_code=400, detail=f"Unsupported mode '{mode}'")

    parsed_filter = None
    if class_filter:
        try:
            parsed_filter = json.loads(class_filter)
        except json.JSONDecodeError:
            parsed_filter = [c.strip() for c in class_filter.split(",") if c.strip()]

    want_visualization = str(return_visualization).lower() in ("true", "1", "yes")

    try:
        result = inference.run(
            loaded, await image.read(), threshold, parsed_filter, want_visualization
        )
    except Exception as exc:
        logger.exception("Inference failed")
        raise HTTPException(status_code=500, detail=str(exc))

    return JSONResponse(result)


@app.post("/models/{name}/classify")
async def model_classify(
    name: str,
    image: UploadFile = File(...),
    top_k: int = Form(5),
):
    loaded = _load_or_404(name)
    try:
        return JSONResponse(inference.classify(loaded, await image.read(), top_k))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        logger.exception("Classification failed")
        raise HTTPException(status_code=500, detail=str(exc))
