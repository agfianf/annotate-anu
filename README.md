<div align="center">
  <img src="assets/logo.png" alt="AnnotateANU Logo" width="200"/>

  # AnnotateANU

  ### Annotate at the Speed of AI. 100% Private.

  <p>
    AnnotateANU combines the power of Meta's SAM3 for instant segmentation with a strictly local-first architecture.<br/>
    Your images never leave your browser. Free, open-source, and built for high-performance computer vision workflows.
  </p>

  [![Open Source](https://img.shields.io/badge/Open%20Source-100%25-brightgreen)](https://github.com/yourusername/annotateau)
  [![Privacy](https://img.shields.io/badge/Privacy-No%20Server%20Uploads-blue)](https://github.com/yourusername/annotateau)
  [![Powered by SAM3](https://img.shields.io/badge/Powered%20by-Meta%20SAM3-0467DF)](https://huggingface.co/facebook/sam3)

  [Get Started](#quick-start) · [View Demo](https://annotateau.example.com) · [Report Bug](https://github.com/yourusername/annotateau/issues)

</div>

---

## 📚 Table of Contents

- [Why Choose AnnotateANU?](#why-choose-annotatanu)
- [Features](#-features)
- [Quick Start](#quick-start)
- [Architecture](#architecture)
- [Development Commands](#development-commands)
- [API Documentation](#api-documentation)
- [Tech Stack](#tech-stack)
- [GPU Support](#gpu-support)
- [Roadmap](#-roadmap---coming-soon)
- [Troubleshooting](#troubleshooting)
- [Contributing](#-contributing)

---

## Why Choose AnnotateANU?

### ⚡ AI-Powered Precision
Don't waste hours clicking points. Our integration with SAM3 (Segment Anything Model 3) allows for automatic object detection via text prompts or simple bounding boxes. Get pixel-perfect masks in milliseconds.

### 🔒 Privacy by Design
We utilize IndexedDB for browser-based storage. Your dataset remains strictly local on your machine. We do not upload your images to any server, ensuring total data sovereignty and zero latency.

### 🛠️ Flexible & Export Ready
Whether you need Bounding Boxes or Polygon Segmentation, we support it. Export instantly to industry standards: COCO JSON, YOLO format, or ZIP archives with a single click.

## ✨ Features

### ⚡ Automated Segmentation
SAM3 inference runs locally or via optimized endpoints to auto-segment objects instantly. Use text prompts or bounding boxes to get pixel-perfect masks in milliseconds.

### 🎯 Manual Precision
Need to tweak the AI's work? Use our pixel-perfect pen, rectangle, and polygon tools for fine-tuning your annotations with complete control.

### 📦 Batch Workflow
Load hundreds of images at once. Our interface handles batch processing without browser lag, making large dataset annotation a breeze.

### ⌨️ Lightning Shortcuts
Designed for power users. Keep your hands on the keyboard and annotate without breaking flow with comprehensive keyboard shortcuts.

### 💾 Export Ready
Export to COCO JSON, YOLO format, or ZIP archives with one click. Industry-standard formats ready for your ML pipelines.

### 🔒 Local-First Storage
Your data stays local with IndexedDB - no server uploads, total privacy. All processing happens in your browser or on your local backend.

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
- **IndexedDB** - Local browser storage for images and annotations
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
│   │   ├── Canvas.tsx           # Annotation canvas
│   │   ├── LeftSidebar.tsx      # Tool selection & AI prompts
│   │   ├── Sidebar.tsx          # Annotations list
│   │   ├── TextPromptPanel.tsx  # SAM3 text prompts
│   │   ├── BboxPromptPanel.tsx  # SAM3 bbox prompts
│   │   ├── ExportModal.tsx      # Export interface
│   │   └── ui/                  # Reusable UI components
│   ├── lib/
│   │   ├── storage.ts           # IndexedDB persistence
│   │   ├── sam3-client.ts       # SAM3 API client
│   │   └── coco-export.ts       # Export utilities
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

## 🚀 Roadmap - Coming Soon

We are constantly evolving. Here's what's shipping next to AnnotateANU:

### 🔌 Bring Your Own Model (BYOM)
Connect your existing custom models via API. Pre-label your images using your own weights to bootstrap the annotation process even faster.

### ☁️ Enterprise Storage Integration
Move beyond browser storage. We're adding native integration for MinIO and S3-compatible object storage, allowing you to pull and sync datasets directly from your cloud buckets.

### 📋 Additional Planned Features
- [ ] Pascal VOC export format (COCO and YOLO already supported)
- [ ] Annotation history and versioning with persistent undo/redo
- [ ] Video annotation support
- [ ] Multi-user collaboration
- [ ] Project management and datasets
- [ ] CVAT integration for advanced labeling

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

## 🤝 Contributing

We welcome contributions from the community! Whether you're fixing bugs, adding features, or improving documentation, we'd love your help.

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Commit your changes (`git commit -m 'Add some amazing feature'`)
5. Push to the branch (`git push origin feature/amazing-feature`)
6. Open a Pull Request

Want to influence what we build next? Join our community on GitHub and share your ideas!

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

---

<div align="center">
  <p><strong>Ready to speed up your CV pipeline?</strong></p>
  <p>© 2025 AnnotateANU. Built for the Computer Vision Community.</p>
  <p>
    <a href="https://github.com/yourusername/annotateau">GitHub</a> ·
    <a href="https://annotateau.example.com">Website</a> ·
    <a href="https://github.com/yourusername/annotateau/issues">Issues</a>
  </p>
</div>

## References

- [SAM3 Model](https://huggingface.co/facebook/sam3)
- [T-REX Label](https://www.trexlabel.com/)
- [MakeSense.ai](https://www.makesense.ai/)
- [FastAPI](https://fastapi.tiangolo.com/)
- [React](https://react.dev/)
- [Vite](https://vite.dev/)
