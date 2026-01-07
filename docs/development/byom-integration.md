# BYOM Integration Guide

Bring Your Own Model (BYOM) registers external inference endpoints in API Core.
The web UI uses the registry and sends all prompts through the inference proxy.

## How BYOM Works

1. Register a model in API Core (`POST /api/v1/models`).
2. API Core stores capabilities and response mappings.
3. The UI lists models and routes prompts to `/api/v1/inference/*`.
4. API Core proxies the request to your endpoint and normalizes the response.

## Required Endpoint Behavior

Your endpoint must accept an image and return a JSON payload that includes:

- Boxes: `[[x1, y1, x2, y2], ...]`
- Scores: `[0.0 - 1.0]`
- Masks (optional): polygon or mask data
- Labels (optional): string or class IDs

If your response uses different field names, map them with `response_mapping`.

## Register a Model

```bash
curl -X POST http://localhost:8001/api/v1/models \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{
    "name": "YOLOv8 Traffic",
    "endpoint_url": "https://example.com",
    "auth_token": "optional-token",
    "description": "Custom YOLOv8 model",
    "capabilities": {
      "supports_text_prompt": false,
      "supports_bbox_prompt": false,
      "supports_auto_detect": true,
      "supports_class_filter": true,
      "output_types": ["bbox"],
      "classes": ["car", "truck", "person"]
    },
    "endpoint_config": {
      "inference_path": "/predict",
      "response_mapping": {
        "boxes_field": "predictions.boxes",
        "scores_field": "predictions.confidence",
        "labels_field": "predictions.class_names"
      }
    }
  }'
```

## Health Checks

```bash
curl -X POST http://localhost:8001/api/v1/models/<model_id>/health \
  -H "Authorization: Bearer <token>"
```

The UI also exposes health checks in the Model Configuration page.

## Inference Proxy

The UI never calls your endpoint directly. It calls:

- `POST /api/v1/inference/text`
- `POST /api/v1/inference/bbox`
- `POST /api/v1/inference/auto`

Use the model ID from registration. The built-in SAM3 model uses `model_id = "sam3"`.

### Polygon Point Reduction

SAM3 and BYOM models support configurable polygon point reduction:
- **Purpose**: Reduce polygon complexity for better performance and easier editing.
- **Parameter**: `point_reduction` (float, 0.0-1.0) - percentage of points to retain.
- **Passthrough**: The setting is passed from the UI through the inference proxy to SAM3.

Example request with polygon simplification:
```json
{
  "model_id": "sam3",
  "image": "...",
  "point_reduction": 0.5,
  "simplify_polygons": true
}
```

## Response Mapping

`response_mapping` supports JSON paths for nested responses. Example:

```json
{
  "boxes_field": "results.boxes",
  "scores_field": "results.scores",
  "masks_field": "results.masks",
  "labels_field": "results.labels",
  "num_objects_field": "results.count"
}
```

If `num_objects_field` is omitted, the proxy derives it from the box list.
