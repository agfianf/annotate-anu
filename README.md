# SAM3 Annotation Platform

A modern, full-stack annotation platform combining **SAM3 AI-powered segmentation** with an intuitive **React-based annotation interface**. Inspired by T-REX Label and MakeSense.ai.

## Features

### Backend (SAM3 FastAPI)
- Text prompt inference for object segmentation
- Bounding box-based segmentation
- Batch image processing
- GPU acceleration support
- RESTful API with OpenAPI documentation

### Frontend (React Annotation Platform)
- Interactive canvas-based annotation
- Multiple annotation tools (rectangle, polygon, point)
- Real-time annotation management
- Modern UI with Tailwind CSS
- Integration with SAM3 backend for AI-assisted labeling

## Architecture

```
sam3-app/
├── backend/                 # FastAPI SAM3 inference API
│   ├── src/app/
│   ├── Dockerfile
│   ├── pyproject.toml
│   └── README.md
├── frontend/                # React annotation platform
│   ├── src/
│   ├── Dockerfile
│   ├── package.json
│   └── README.md
├── docker-compose.yml       # Orchestrates both services
├── Makefile                 # Development commands
└── README.md
```

## Quick Start

### Prerequisites

- **Docker & Docker Compose** (recommended)
- **Python 3.12+** and **uv** (for local backend development)
- **Node.js 18+** and **npm** (for local frontend development)
- **HuggingFace Account & Token** (required for SAM3 model access)

### HuggingFace Setup (REQUIRED)

SAM3 is a gated model. You must:

1. Create account: https://huggingface.co/join
2. Request access: https://huggingface.co/facebook/sam3
3. Generate token: https://huggingface.co/settings/tokens
4. Add to backend/.env:

```bash
cp backend/.env.example backend/.env
# Edit backend/.env and add:
HF_TOKEN=hf_your_token_here
```

### Docker (Recommended)

```bash
# 1. Setup environment
cp backend/.env.example backend/.env
# Edit backend/.env and add your HF_TOKEN

# 2. Start all services
make docker-up

# 3. Access the application
# Frontend: http://localhost:5173
# Backend API: http://localhost:8000
# API Docs: http://localhost:8000/docs
```

### Local Development

#### Backend Only

```bash
cd backend
cp .env.example .env  # Add your HF_TOKEN
make backend-install
make backend-run

# API at http://localhost:8000
```

#### Frontend Only

```bash
cd frontend
cp .env.example .env
make frontend-install
make frontend-dev

# App at http://localhost:5173
```

## Development Commands

### Monorepo Commands

```bash
make help            # Show all available commands
make dev             # Start both backend and frontend (Docker)
make install         # Install all dependencies
make clean           # Clean all cache and build files
```

### Backend Commands

```bash
make backend-install  # Install Python dependencies
make backend-run      # Run API locally
make backend-test     # Run tests
make backend-format   # Format code with ruff
make backend-lint     # Lint code
```

### Frontend Commands

```bash
make frontend-install # Install npm dependencies
make frontend-dev     # Start dev server
make frontend-build   # Build for production
```

### Docker Commands

```bash
make docker-up        # Start all services
make docker-down      # Stop all services
make docker-logs service=backend    # View backend logs
make docker-logs service=frontend   # View frontend logs
make docker-build     # Rebuild images
make docker-restart service=backend # Restart backend
make docker-shell service=backend   # Shell into backend container
```

## API Documentation

- **Swagger UI**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc
- **OpenAPI JSON**: http://localhost:8000/openapi.json

## Tech Stack

### Backend
- **FastAPI** - Modern Python web framework
- **SAM3** - Segment Anything Model 3 (via HuggingFace)
- **UV** - Fast Python package manager
- **Python 3.12**

### Frontend
- **React 18** + **TypeScript**
- **Vite** - Next-generation build tool
- **Konva** + **React-Konva** - Canvas manipulation
- **Tailwind CSS** - Utility-first styling
- **Axios** - HTTP client

### Infrastructure
- **Docker** + **Docker Compose**
- **Nginx** - Production frontend server

## Project Structure

### Backend (`/backend`)
```
backend/
├── src/app/
│   ├── main.py              # FastAPI app
│   ├── config.py            # Settings
│   ├── integrations/sam3/   # SAM3 model integration
│   ├── routers/             # API endpoints
│   ├── schemas/             # Pydantic models
│   └── helpers/             # Utilities
├── Dockerfile
├── pyproject.toml
└── README.md
```

### Frontend (`/frontend`)
```
frontend/
├── src/
│   ├── components/
│   │   ├── Canvas.tsx       # Annotation canvas
│   │   ├── Toolbar.tsx      # Tool selection
│   │   └── Sidebar.tsx      # Annotations list
│   ├── App.tsx
│   └── main.tsx
├── Dockerfile
├── nginx.conf
└── package.json
```

## GPU Support

To enable GPU acceleration for faster inference:

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
3. Restart: `make docker-down && make docker-up`

## Performance

- **With GPU**: ~200-500ms per image
- **CPU only**: 5-10x slower than GPU

Batch processing recommended for multiple images.

## Future Enhancements

- [ ] CVAT integration for advanced labeling
- [ ] Export annotations (COCO, YOLO, Pascal VOC)
- [ ] Multi-user collaboration
- [ ] Annotation history and versioning
- [ ] Keyboard shortcuts for faster labeling
- [ ] AI-assisted annotation with SAM3
- [ ] Project management and datasets
- [ ] User authentication and authorization

## Troubleshooting

### Model Download Issues

Pre-download the model:
```bash
make docker-shell service=backend
python -c "from transformers import Sam3Model; Sam3Model.from_pretrained('facebook/sam3')"
```

### Out of Memory

Reduce limits in `backend/.env`:
```bash
MAX_BATCH_SIZE=5
MAX_IMAGE_DIMENSION=2048
```

### Frontend Not Loading

Ensure backend is running and accessible:
```bash
curl http://localhost:8000/api/v1/sam3/health
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## License

MIT

## References

- [SAM3 Model](https://huggingface.co/facebook/sam3)
- [T-REX Label](https://www.trexlabel.com/)
- [MakeSense.ai](https://www.makesense.ai/)
- [FastAPI](https://fastapi.tiangolo.com/)
- [React](https://react.dev/)
- [Vite](https://vite.dev/)
