# Model Server

Serves local Ultralytics/YOLO `.pt` weights over the BYOM contract the app already speaks.

## Why this exists

The app cannot load a `.pt` directly. The browser cannot run PyTorch, and `api-core` is a
pure HTTP proxy: it forwards a multipart image to a registered `endpoint_url` and normalizes
the JSON that comes back. Running Ultralytics needs a Python process with torch, so a server
is required. This is that server, kept generic so any `.pt` works.

## Run

```bash
docker compose -f docker/docker-compose.yml up -d model-server
```

Drop `.pt` files into `apps/model-server/models/`, or upload them from
Model Configuration in the app.

It uses the host GPU through the NVIDIA container runtime. The image is `python:3.12-slim`;
no CUDA toolkit is installed because torch's cu128 wheels carry their own runtime and the
runtime injects the host driver.

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | Server health |
| GET | `/models` | List `.pt` files |
| POST | `/models/upload` | Upload a `.pt` (field `file`) |
| DELETE | `/models/{name}` | Remove a `.pt` |
| GET | `/models/{name}/health` | Per-model health (BYOM health check) |
| GET | `/models/{name}/info` | Task and class names |
| POST | `/models/{name}/inference` | Detection/segmentation (BYOM inference) |
| POST | `/models/{name}/classify` | Classification, for `-cls` models |

## Registering by hand

The panel in Model Configuration does this for you. To do it manually:

- Endpoint URL: `http://localhost:8002/models/<name>`
- Inference path: `/inference`
- Health path: `/health`
- Response mapping: `boxes`, `scores`, `masks`, `labels`, `num_objects`

`/inference` accepts multipart `image` plus form fields `mode`, `threshold`,
`class_filter` (JSON array or comma list) and `return_visualization`, and returns:

```json
{
  "num_objects": 2,
  "boxes": [[x1, y1, x2, y2]],
  "scores": [0.94],
  "masks": [{"polygons": [[x, y, ...]], "area": 1234.5}],
  "labels": ["person"],
  "processing_time_ms": 18.4,
  "visualization_base64": null
}
```

Segmentation weights (`-seg.pt`) populate `masks`; detection weights leave it empty.
