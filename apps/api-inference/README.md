# SAM3 FastAPI Backend

REST API for **Segment Anything Model 3 (SAM3)** inference using HuggingFace Transformers.

## Features

- ✅ **Text Prompt Inference** - Segment objects using natural language ("cat", "laptop", etc.)
- ✅ **Bounding Box Inference** - Segment using coordinate-based prompts
- ✅ **Batch Processing** - Process multiple images in one request
- ✅ **Mask Polygon Coordinates** - Get precise segmentation masks as polygon points
- ✅ **Optional Visualizations** - Get images with drawn masks/boxes (base64 encoded)
- ✅ **Processing Time Metadata** - Track inference performance
- ✅ **GPU Auto-detection** - Automatic CUDA/CPU selection

## Architecture

```
backend/
├── src/app/
│   ├── main.py                      # FastAPI app + model loading
│   ├── config.py                    # Settings and environment config
│   ├── integrations/sam3/
│   │   ├── inference.py             # SAM3 model inference
│   │   ├── mask_utils.py            # Mask processing utilities
│   │   └── visualizer.py            # Mask and box visualization
│   ├── routers/sam3.py              # API endpoints
│   ├── schemas/sam3.py              # Pydantic request/response models
│   └── helpers/
│       ├── response_api.py          # JSON response formatting
│       └── logger.py                # Logging setup
├── docs/                            # API documentation
├── Dockerfile                       # Python 3.12-slim + uv
├── pyproject.toml                   # Dependencies
└── example_sam.py                   # Usage examples
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

- **Python 3.12+**
- **NVIDIA GPU with CUDA** (optional, for faster inference)

## Local Development

```bash
# 1. Setup HuggingFace token
cp .env.example .env
nano .env  # Add your HF_TOKEN

# 2. Install uv package manager
curl -LsSf https://astral.sh/uv/install.sh | sh

# 3. Install dependencies
uv sync

# 4. Run application
uv run app/main.py

# API available at http://localhost:8000
# Docs at http://localhost:8000/docs
```

## API Endpoints

### 1. Text Prompt Inference

```bash
POST /api/v1/sam3/inference/text

curl -X POST http://localhost:8000/api/v1/sam3/inference/text \
  -F "image=@cat.jpg" \
  -F "text_prompt=ear" \
  -F "threshold=0.5" \
  -F "return_visualization=true"
```

### 2. Bounding Box Inference

```bash
POST /api/v1/sam3/inference/bbox

curl -X POST http://localhost:8000/api/v1/sam3/inference/bbox \
  -F "image=@kitchen.jpg" \
  -F 'bounding_boxes=[[59, 144, 76, 163, 1]]' \
  -F "threshold=0.5"
```

### 3. Batch Processing

```bash
POST /api/v1/sam3/inference/batch

curl -X POST http://localhost:8000/api/v1/sam3/inference/batch \
  -F "images=@cat.jpg" \
  -F "images=@dog.jpg" \
  -F 'text_prompts=["cat", "dog"]'
```

### 4. Health Check

```bash
GET /api/v1/sam3/health
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

## Docker Deployment

See root `docker-compose.yml` for container setup.

## Performance

- **GPU (CUDA)**: Fast inference (~200-500ms per image)
- **CPU**: 5-10x slower than GPU

Batch processing is more efficient for multiple images.

## API Documentation

- **Swagger UI**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc
- **OpenAPI JSON**: http://localhost:8000/openapi.json

## References

- [SAM3 Documentation](https://huggingface.co/facebook/sam3)
- [SAM3 GitHub](https://github.com/facebookresearch/sam3)
- [FastAPI](https://fastapi.tiangolo.com/)
