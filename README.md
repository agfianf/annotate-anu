# SAM3 FastAPI Application

Simple and lightweight REST API for **Segment Anything Model 3 (SAM3)** using HuggingFace Transformers.

## Features

- ✅ **Text Prompt Inference** - Segment objects using natural language ("cat", "laptop", etc.)
- ✅ **Bounding Box Inference** - Segment using coordinate-based prompts
- ✅ **Batch Processing** - Process multiple images in one request
- ✅ **Optional Visualizations** - Get images with drawn masks/boxes (base64 encoded)
- ✅ **Processing Time Metadata** - Track inference performance
- ✅ **GPU Auto-detection** - Automatic CUDA/CPU selection
- ✅ **Simple Architecture** - No database, no caching, just inference

## Architecture

```
SAM3 FastAPI App (Simplified)
├── integrations/sam3/inference.py  # Direct SAM3 model inference
├── integrations/sam3/visualizer.py # Draw masks and boxes
├── routers/sam3.py                 # API endpoints
├── schemas/sam3.py                 # Request/response models
└── main.py                         # FastAPI app with model loading
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
    "processing_time_ms": 245.5,
    "visualization_base64": "iVBORw0KGgo..." // optional
  },
  "message": "Successfully processed image",
  "status_code": 200
}
```

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
APP_PORT=8000
LOG_LEVEL=INFO

# SAM3 Model
SAM3_MODEL_NAME=facebook/sam3
SAM3_DEVICE=auto  # auto, cpu, cuda

# API Limits
MAX_IMAGE_SIZE_MB=10
MAX_BATCH_SIZE=10
MAX_IMAGE_DIMENSION=4096

# Visualization
VISUALIZATION_FORMAT=PNG  # PNG or JPEG
VISUALIZATION_QUALITY=95
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
make install          # Install dependencies
make run              # Run locally
make test             # Run tests
make format           # Format code
make lint             # Lint code

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
│   ├── config.py                    # Simple settings
│   ├── integrations/sam3/
│   │   ├── inference.py             # SAM3 inference (follows docs)
│   │   └── visualizer.py            # Draw masks/boxes
│   ├── routers/sam3.py              # API endpoints
│   ├── schemas/sam3.py              # Pydantic models
│   └── helpers/
│       ├── response_api.py          # Standard JSON responses
│       └── logger.py                # Logging
├── docker-compose.yml               # Single app service
├── Dockerfile                       # Python 3.12 + uv
├── pyproject.toml                   # Dependencies (no DB/Redis)
├── Makefile                         # Commands
└── README.md
```

## Performance

Typical inference times (NVIDIA RTX 3090):

- **Text prompt**: ~200-300ms
- **Bbox prompt**: ~150-250ms
- **Batch (10 images)**: ~2-3s (~250ms/image)

CPU inference is 5-10x slower.

## API Documentation

- **Swagger UI**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc
- **OpenAPI JSON**: http://localhost:8000/openapi.json

## Troubleshooting

### Model Download Issues

Pre-download the model:
```bash
docker-compose exec app python -c "from transformers import Sam3Model; Sam3Model.from_pretrained('facebook/sam3')"
```

### Out of Memory

Reduce limits in `.env`:
```bash
MAX_BATCH_SIZE=5
MAX_IMAGE_DIMENSION=2048
```

## What's Different (Simplified)

Compared to typical FastAPI apps, this is simplified:

- ❌ No database (PostgreSQL removed)
- ❌ No Redis caching
- ❌ No complex service/repository layers
- ❌ No job IDs or async result storage
- ✅ Direct inference with immediate results
- ✅ Base64-encoded visualizations in response
- ✅ Follows HuggingFace transformers documentation exactly
- ✅ ~70% less code

## References

- [SAM3 Documentation](https://huggingface.co/facebook/sam3)
- [SAM3 GitHub](https://github.com/facebookresearch/sam3)
- [FastAPI](https://fastapi.tiangolo.com/)
