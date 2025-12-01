# API Core Service

Core API service for managing BYOM (Bring Your Own Model) registry in Annotate ANU.

## Features

- Model registration and discovery
- Health check monitoring for external models
- Capability detection and validation
- SQLite-based persistence

## Quick Start

### Local Development

```bash
# Install dependencies
cd apps/api-core
uv pip install -e .

# Set up environment
cp .env.example .env

# Run server
uvicorn src.app.main:app --host 0.0.0.0 --port 8001 --reload
```

### Docker

```bash
# From repository root
make docker-up
```

## API Documentation

Once running, visit:
- Swagger UI: http://localhost:8001/docs
- ReDoc: http://localhost:8001/redoc

## Endpoints

- `GET /api/v1/models` - List registered models
- `POST /api/v1/models` - Register new model
- `GET /api/v1/models/{id}` - Get model details
- `PATCH /api/v1/models/{id}` - Update model
- `DELETE /api/v1/models/{id}` - Delete model
- `POST /api/v1/models/{id}/health` - Check model health
- `GET /api/v1/models/{id}/capabilities` - Get model capabilities
