# SAM3 FastAPI Application

Simple and lightweight REST API for **Segment Anything Model 3 (SAM3)** using HuggingFace Transformers.

## Features

- ✅ **Text Prompt Inference** - Segment objects using natural language ("cat", "laptop", etc.)
- ✅ **Bounding Box Inference** - Segment using coordinate-based prompts
- ✅ **Batch Processing** - Process multiple images in one request
- ✅ **Mask Polygon Coordinates** - Get precise segmentation masks as polygon points
- ✅ **Optional Visualizations** - Get images with drawn masks/boxes (base64 encoded)
- ✅ **Processing Time Metadata** - Track inference performance
- ✅ **GPU Auto-detection** - Automatic CUDA/CPU selection
- ✅ **Simple Architecture** - No database, no caching, just inference

## Architecture

```
SAM3 FastAPI App
├── main.py                         # FastAPI app with model loading
├── config.py                       # Settings and environment config
├── integrations/sam3/
│   ├── inference.py                # SAM3 model inference
│   └── visualizer.py               # Draw masks and boxes
├── routers/sam3.py                 # API endpoints
├── schemas/sam3.py                 # Request/response models
└── helpers/
    ├── response_api.py             # JSON response formatting
    └── logger.py                   # Logging setup
```

## Prerequisites

### 1. HuggingFace Access Token (REQUIRED)

SAM3 is a **gated model** on HuggingFace. You need to:

1. **Create a HuggingFace account**: https://huggingface.co/join
2. **Request access to SAM3**: Visit https://huggingface.co/facebook/sam3 and accept the license
3. **Generate an access token**: https://huggingface.co/settings/tokens
   - Click "New token"
   - Name it (e.g., "sam3-api")
   - Select "Read" permissions
   - Copy the token (starts with `hf_...`)

4. **Add token to `.env` file**:
```bash
cp .env.example .env
# Edit .env and replace:
HF_TOKEN=hf_your_actual_token_here
```

⚠️ **Without a valid HF_TOKEN, the application will fail to load the model!**

### 2. System Requirements

- **Docker & Docker Compose** (recommended)
- **Python 3.12+** (for local development)
- **NVIDIA GPU with CUDA** (optional, for faster inference)

## Quick Start

### Using Docker (Recommended)

```bash
# 1. Setup HuggingFace token (see Prerequisites above)
cp .env.example .env
nano .env  # Add your HF_TOKEN

# 2. Start the application
make docker-up

# API available at http://localhost:8000
# Docs at http://localhost:8000/docs
```

### Local Development

```bash
# 1. Setup HuggingFace token
cp .env.example .env
nano .env  # Add your HF_TOKEN

# 2. Install dependencies
make install

# 3. Run application
make run
```

## API Endpoints

### 1. Text Prompt Inference

Segment objects using natural language descriptions.

```bash
POST /api/v1/sam3/inference/text

# Example with curl
curl -X POST http://localhost:8000/api/v1/sam3/inference/text \
  -F "image=@cat.jpg" \
  -F "text_prompt=ear" \
  -F "threshold=0.5" \
  -F "return_visualization=true"
```

**Response:**
```json
{
  "data": {
    "num_objects": 2,
    "boxes": [[100.5, 150.2, 200.1, 250.8], ...],
    "scores": [0.95, 0.87],
    "masks": [
      {
        "polygons": [[[120.0, 160.0], [125.0, 165.0], ...]],
        "area": 5432.0
      },
      ...
    ],
    "processing_time_ms": 245.5,
    "visualization_base64": "iVBORw0KGgo..." // optional
  },
  "message": "Successfully processed image",
  "status_code": 200
}
```

**Mask Format:**
- `masks`: Array of mask polygons for each detected object
- `polygons`: List of polygon contours, where each polygon is a list of `[x, y]` coordinate pairs
- `area`: Total pixel area of the mask
- Multiple polygons per mask represent disconnected regions or holes

### 2. Bounding Box Inference

Segment objects using coordinate prompts.

```bash
POST /api/v1/sam3/inference/bbox

# Example
curl -X POST http://localhost:8000/api/v1/sam3/inference/bbox \
  -F "image=@kitchen.jpg" \
  -F 'bounding_boxes=[[59, 144, 76, 163, 1], [87, 148, 104, 159, 1]]' \
  -F "threshold=0.5" \
  -F "return_visualization=true"
```

**Bounding box format:**  `[x1, y1, x2, y2, label]`
- `label`: 1 = positive (include), 0 = negative (exclude)

### 3. Batch Processing

Process multiple images in a single request.

```bash
POST /api/v1/sam3/inference/batch

# Example
curl -X POST http://localhost:8000/api/v1/sam3/inference/batch \
  -F "images=@cat.jpg" \
  -F "images=@dog.jpg" \
  -F 'text_prompts=["cat", "dog"]' \
  -F "threshold=0.5" \
  -F "return_visualizations=false"
```

**Response:**
```json
{
  "data": {
    "total_images": 2,
    "results": [
      {
        "image_index": 0,
        "num_objects": 1,
        "boxes": [[...]],
        "scores": [0.95],
        "masks": [{"polygons": [...], "area": 1234.0}],
        "visualization_base64": null
      },
      ...
    ],
    "total_processing_time_ms": 480.3,
    "average_time_per_image_ms": 240.15
  }
}
```

### 4. Health Check

```bash
GET /api/v1/sam3/health
```

## Python Usage Example

```python
import requests
import base64
from PIL import Image
from io import BytesIO

# Text inference
with open("cat.jpg", "rb") as f:
    response = requests.post(
        "http://localhost:8000/api/v1/sam3/inference/text",
        files={"image": f},
        data={
            "text_prompt": "cat",
            "threshold": 0.5,
            "return_visualization": True
        }
    )

result = response.json()
print(f"Found {result['data']['num_objects']} objects")
print(f"Processing time: {result['data']['processing_time_ms']}ms")

# Access mask polygon coordinates
for i, mask_data in enumerate(result['data']['masks']):
    print(f"Object {i}: {len(mask_data['polygons'])} polygon(s), area: {mask_data['area']} pixels")
    # Each polygon is a list of [x, y] coordinates
    for polygon in mask_data['polygons']:
        print(f"  Polygon with {len(polygon)} points")

# Decode and save visualization
if result['data']['visualization_base64']:
    img_data = base64.b64decode(result['data']['visualization_base64'])
    img = Image.open(BytesIO(img_data))
    img.save("result.png")
```

## Configuration

Edit `.env` file:

```bash
# Application
DEBUG=true
APP_HOST=0.0.0.0
APP_PORT=8000
LOG_LEVEL=INFO

# HuggingFace (REQUIRED)
HF_TOKEN=hf_your_token_here

# SAM3 Model
SAM3_MODEL_NAME=facebook/sam3
SAM3_DEVICE=auto  # auto, cpu, cuda
SAM3_DEFAULT_THRESHOLD=0.5

# API Limits
MAX_IMAGE_SIZE_MB=10
MAX_BATCH_SIZE=10
MAX_IMAGE_DIMENSION=4096

# Visualization
VISUALIZATION_FORMAT=PNG  # PNG or JPEG
VISUALIZATION_QUALITY=95

# CORS
ALLOWED_ORIGINS=*  # Comma-separated origins
```

## GPU Support

### Enable GPU in Docker

1. Install [nvidia-docker](https://github.com/NVIDIA/nvidia-docker)

2. Uncomment GPU section in `docker-compose.yml`:
```yaml
deploy:
  resources:
    reservations:
      devices:
        - driver: nvidia
          count: 1
          capabilities: [gpu]
```

3. Restart:
```bash
make docker-down
make docker-up
```

## Development Commands

```bash
# Local Development
make install          # Install dependencies
make run              # Run locally
make format           # Format code (ruff)
make lint             # Lint code (ruff)

# Docker
make docker-up        # Start services
make docker-down      # Stop services
make docker-logs      # View logs
make docker-build     # Rebuild image
make docker-shell     # Shell into container
```

## Project Structure

```
sam3-app/
├── src/app/
│   ├── main.py                      # FastAPI app + model loading
│   ├── config.py                    # Settings and environment config
│   ├── integrations/sam3/
│   │   ├── inference.py             # SAM3 model inference
│   │   └── visualizer.py            # Mask and box visualization
│   ├── routers/sam3.py              # API endpoints
│   ├── schemas/sam3.py              # Pydantic request/response models
│   └── helpers/
│       ├── response_api.py          # JSON response formatting
│       └── logger.py                # Logging setup
├── docker-compose.yml               # Docker service definition
├── Dockerfile                       # Python 3.12-slim + uv
├── pyproject.toml                   # Dependencies
├── Makefile                         # Development commands
└── README.md
```

## Performance

Performance depends on hardware:

- **GPU (CUDA)**: Fast inference (~200-500ms per image)
- **CPU**: 5-10x slower than GPU

Batch processing is more efficient for multiple images.

## API Documentation

- **Swagger UI**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc
- **OpenAPI JSON**: http://localhost:8000/openapi.json

## Troubleshooting

### Model Download Issues

Pre-download the model:
```bash
make docker-shell
# Inside container:
python -c "from transformers import Sam3Model; Sam3Model.from_pretrained('facebook/sam3')"
```

### Out of Memory

Reduce limits in `.env`:
```bash
MAX_BATCH_SIZE=5
MAX_IMAGE_DIMENSION=2048
```

## Design Philosophy

This application prioritizes simplicity:

- **No database** - Stateless API, no persistence needed
- **No caching** - Direct inference on every request
- **No background jobs** - Synchronous processing with immediate results
- **Minimal layers** - Router → Integration → Model (no service/repository pattern)
- **Standard responses** - JSON with consistent structure
- **Base64 visualizations** - Images returned inline (optional)

## References

- [SAM3 Documentation](https://huggingface.co/facebook/sam3)
- [SAM3 GitHub](https://github.com/facebookresearch/sam3)
- [FastAPI](https://fastapi.tiangolo.com/)
