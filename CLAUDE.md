# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Annotate ANU - A full-stack image annotation application combining SAM3 (Segment Anything Model 3) AI-powered segmentation with an interactive React-based annotation interface. The application enables both manual and AI-assisted image labeling for computer vision datasets.

**Key Features**:
- AI-powered segmentation using SAM3 (text and bounding box prompts)
- BYOM (Bring Your Own Model) support for custom inference models
- Multiple deployment modes (Solo for individuals, Team for collaboration)
- Manual annotation tools (rectangles, polygons, points)
- Export to COCO JSON, YOLO formats
- Team collaboration with project and task management
- Real-time annotation syncing (Team mode)

**Tech Stack**:
- **Backend**: FastAPI (Python 3.12), SQLAlchemy, Alembic, PostgreSQL, Redis
- **Frontend**: React 18, TypeScript, Vite, TailwindCSS, Konva
- **ML**: HuggingFace Transformers (SAM3), CUDA support
- **Storage**: IndexedDB (Solo), MinIO + PostgreSQL (Team)
- **Infrastructure**: Docker Compose, Traefik, Celery

## Architecture

### Project Structure
Monorepo structure with three main applications:
- **Backend API (SAM3 Inference)**: FastAPI service providing SAM3 AI-powered segmentation (`/apps/api-inference`)
- **Backend API (Core)**: FastAPI service for model registry, team collaboration, and BYOM features (`/apps/api-core`)
- **Frontend**: React + TypeScript annotation interface with multiple pages and dashboard (`/apps/web`)
- **Docker Compose**: Three deployment modes (dev, solo, team) in `/docker` directory
- **Tools**: CLI tools and deployment scripts (`/tools`)

Each app manages its own dependencies and can be run independently or via Docker.

### Deployment Modes
- **Development Mode** (`docker-compose.dev.yml`): Hot-reload enabled for local development
- **Solo Mode** (`docker-compose.solo.yml`): Minimal local-first deployment with IndexedDB storage, no team features
- **Team Mode** (`docker-compose.team.yml`): Full collaborative stack with PostgreSQL, MinIO, Redis, Celery workers

### Backend API - SAM3 Inference (`/apps/api-inference`)
**Framework**: FastAPI with Python 3.12

*Note: All paths below are relative to `apps/api-inference/`*

**Key Components**:
- `src/app/main.py` - FastAPI application entry point with lifespan management for model loading
- `src/app/config.py` - Pydantic settings with environment variable support
- `src/app/integrations/sam3/` - SAM3 model integration layer
  - `inference.py` - Core SAM3 inference logic (text prompts, bounding boxes, batch processing)
  - `mask_utils.py` - Mask-to-polygon conversion utilities
  - `visualizer.py` - Mask and bounding box visualization
- `src/app/routers/sam3.py` - API endpoints for SAM3 inference
- `src/app/schemas/sam3.py` - Pydantic request/response models
- `src/app/helpers/` - Response formatting and logging utilities
- `src/app/services/` - Business logic layer
- `src/app/middleware/` - Custom middleware for request processing
- `src/app/exceptions/` - Custom exception handling

**Model Loading**: SAM3 model is loaded during FastAPI application startup via lifespan context manager. This ensures the model is loaded once and cached in memory. The model requires HuggingFace authentication (HF_TOKEN) as SAM3 is a gated model.

**Device Management**: Automatically detects CUDA/CPU via `SAM3_DEVICE=auto` setting. GPU acceleration is configured in docker-compose files with nvidia-docker support.

**Port**: 8000 (default)

### Backend API - Core (`/apps/api-core`)
**Framework**: FastAPI with Python 3.12 + SQLAlchemy + Alembic

*Note: All paths below are relative to `apps/api-core/`*

**Key Components**:
- `src/app/main.py` - FastAPI application entry point
- `src/app/config.py` - Pydantic settings with environment variable support
- `src/app/core/` - Core functionality (database, security)
- `src/app/models/` - SQLAlchemy database models
- `src/app/repositories/` - Database access layer
- `src/app/services/` - Business logic layer
- `src/app/routers/` - API endpoint definitions
- `src/app/schemas/` - Pydantic request/response models
- `src/app/integrations/` - External service integrations (BYOM models)
- `src/app/dependencies/` - FastAPI dependency injection
- `src/app/exceptions/` - Custom exception handling
- `src/migrations/` - Alembic database migrations

**Features**:
- BYOM (Bring Your Own Model) registry and health checking
- User authentication and authorization (JWT + passlib)
- Project and dataset management
- Task assignment and collaboration
- Team roles and permissions

**Database**: PostgreSQL (Team mode) or SQLite (Solo/Dev mode)

**Port**: 8001 (default)

### Frontend (`/apps/web`)
**Framework**: React 18 + TypeScript + Vite + TailwindCSS

*Note: All paths below are relative to `apps/web/`*

**Key Pages** (`src/pages/`):
- `LandingPage.tsx` - Landing page with features showcase
- `LoginPage.tsx` / `RegisterPage.tsx` - Authentication pages
- `DashboardPage.tsx` - Main dashboard with project overview
- `ProjectsPage.tsx` - Project listing and management
- `ProjectDetailPage.tsx` - Individual project details with tabs
- `TasksPage.tsx` - Task management and assignment
- `JobsPage.tsx` - Annotation jobs listing
- `AnnotationApp.tsx` - Main annotation interface
- `ModelConfigPage.tsx` - BYOM model configuration
- `ProfilePage.tsx` - User profile management
- `AdminPage.tsx` - Admin panel

**Key Components** (`src/components/`):
- `Canvas.tsx` - Konva-based annotation canvas
- `LeftSidebar.tsx` - Tool selection and image management
- `Sidebar.tsx` - Annotations list and label management
- `BboxPromptPanel.tsx` - SAM3 bounding box prompt interface
- `TextPromptPanel.tsx` - SAM3 text prompt interface
- `AutoDetectPanel.tsx` - Auto-detection configuration
- `DashboardLayout.tsx` - Main layout wrapper
- `ProjectTabs.tsx` - Project detail tabs (Tasks, Explore, History, Configuration)
- `CreateTaskWizard.tsx` - Task creation wizard
- `ExportModal.tsx` - Export functionality (COCO, YOLO, ZIP)
- `ConfirmationModal.tsx` - Generic confirmation dialog
- `ModelSelector.tsx` - BYOM model selection
- `AssigneeDropdown.tsx` - User assignment dropdown
- `ui/` - Reusable UI components

**Library Files** (`src/lib/`):
- `api-client.ts` - API Core client (auth, projects, tasks, jobs)
- `sam3-client.ts` - SAM3 inference client
- `byom-client.ts` - BYOM model registry client
- `inference-client.ts` - Generic inference client
- `storage.ts` - IndexedDB persistence layer
- `coco-export.ts` - COCO format export
- `yolo-export.ts` - YOLO format export
- `file-utils.ts` - File handling utilities
- `colors.ts` - Color theme utilities
- `utils.ts` - General utilities
- `navigation.ts` - Navigation helpers

**Hooks** (`src/hooks/`):
- `useStorage.ts` - IndexedDB state management
- `useHistory.ts` - Undo/redo functionality
- `useKeyboardShortcuts.ts` - Keyboard shortcuts handler
- `useModelRegistry.ts` - BYOM model registry state

**Contexts** (`src/contexts/`):
- `AuthContext.tsx` - Authentication state and user context

**State Management**: React hooks with IndexedDB persistence (Solo mode) or hybrid IndexedDB + API (Team mode). The `useStorage` hook manages images, annotations, and labels with automatic persistence.

**Canvas System**: Built with Konva/React-Konva for vector-based annotations. Supports rectangles, polygons, and points with real-time editing.

**Prompt Modes**:
- `single` - Manual bounding box drawing, single SAM3 inference
- `auto-apply` - Automatic SAM3 inference after drawing each bounding box
- `batch` - Multiple bounding boxes, single batch SAM3 inference

**Port**: 5173 (dev), 3000 (production/solo), 80 (team mode via Traefik)

## Development Commands

### Quick Start
```bash
make help  # View all available commands
```

### Local Development (Recommended)

**Backend (SAM3 Inference)**:
```bash
cd apps/api-inference
cp .env.example .env  # IMPORTANT: Add your HF_TOKEN
make backend-install  # Install dependencies with uv (run from root)
make backend-run      # Run API at http://localhost:8000 (run from root)
```

**Backend (API Core)**:
```bash
cd apps/api-core
cp .env.example .env  # Configure database settings
make core-install     # Install dependencies with uv (run from root)
make core-run         # Run API at http://localhost:8001 (run from root)
```

**Frontend**:
```bash
cd apps/web
npm install           # Or use: make frontend-install
npm run dev          # Or use: make frontend-dev (http://localhost:5173)
```

**Install All Dependencies**:
```bash
make install  # Install both backend and frontend dependencies at once
```

### Docker Development

**Development Mode** (hot-reload enabled):
```bash
make docker-up          # Start all services (backend, api-core, frontend, redis)
make docker-down        # Stop all services
make docker-logs        # View all logs
make docker-logs service=backend      # View SAM3 backend logs only
make docker-logs service=api-core     # View Core API logs only
make docker-logs service=frontend     # View frontend logs only
make docker-restart service=backend   # Restart specific service
make docker-shell service=backend     # Shell into backend container
make docker-build       # Rebuild all Docker images
make docker-rebuild     # Rebuild images, stop, and restart services (Recommended for full reset)

> [!IMPORTANT]
> **Always use Makefile commands** for common operations:
> - Build: `make docker-build`
> - Run: `make docker-up`
> - Stop: `make docker-down`
> - Rebuild: `make docker-rebuild` (restarts everything)
```

**Solo Mode** (minimal, local-first):
```bash
make docker-up-solo     # Start solo mode services
make docker-down-solo   # Stop solo mode services
```

**Team Mode** (full collaborative stack):
```bash
make docker-up-team     # Start team mode with all services
make docker-down-team   # Stop team mode services
```

### Code Quality

**Backend (SAM3 Inference)**:
```bash
make backend-format  # Format with ruff
make backend-lint    # Lint with ruff
make backend-test    # Run pytest
```

**Backend (API Core)**:
```bash
make core-format     # Format with ruff
make core-lint       # Lint with ruff
make core-test       # Run pytest
```

**Frontend**:
```bash
cd apps/web
npm run lint   # ESLint
npm run build  # TypeScript compilation + Vite build
```

**Clean Build Artifacts**:
```bash
make clean  # Clean all cache and build files
```

## Critical Configuration

### HuggingFace Token (REQUIRED)
SAM3 is a **gated model**. You MUST:
1. Request access: https://huggingface.co/facebook/sam3
2. Generate token: https://huggingface.co/settings/tokens
3. Add to `apps/api-inference/.env`:
```bash
HF_TOKEN=hf_your_token_here
```

Without this token, the backend will fail to load the model during startup.

### Environment Files
- `apps/api-inference/.env` - SAM3 backend configuration (HF_TOKEN, SAM3_DEVICE, MAX_IMAGE_SIZE_MB, MODE, etc.)
- `apps/api-core/.env` - Core API configuration (DATABASE_URL, JWT_SECRET, REDIS_URL, MODE, etc.)
- `apps/web/.env` - Frontend configuration (VITE_API_URL, VITE_API_CORE_URL, VITE_MODE, VITE_STORAGE, etc.)

### Deployment Modes Configuration
Set `MODE` environment variable in backend services and `VITE_MODE` in frontend:
- `solo` - Minimal local-first mode (IndexedDB only, no auth)
- `team` - Full collaborative mode (PostgreSQL, MinIO, Redis, auth enabled)

## API Endpoints

### SAM3 Inference API (Port 8000)
**Base URL**: `http://localhost:8000`

- `POST /api/v1/sam3/inference/text` - Text prompt segmentation
- `POST /api/v1/sam3/inference/bbox` - Bounding box segmentation
- `POST /api/v1/sam3/inference/batch` - Batch processing
- `GET /api/v1/sam3/health` - Health check
- `GET /docs` - Swagger UI
- `GET /redoc` - ReDoc documentation

### Core API (Port 8001)
**Base URL**: `http://localhost:8001`

**Authentication**:
- `POST /api/v1/auth/register` - User registration
- `POST /api/v1/auth/login` - User login (returns JWT token)
- `GET /api/v1/auth/me` - Get current user info

**BYOM (Bring Your Own Model)**:
- `GET /api/v1/models` - List registered models
- `POST /api/v1/models` - Register new model
- `GET /api/v1/models/{id}` - Get model details
- `PATCH /api/v1/models/{id}` - Update model
- `DELETE /api/v1/models/{id}` - Delete model
- `POST /api/v1/models/{id}/health` - Check model health

**Projects**:
- `GET /api/v1/projects` - List projects
- `POST /api/v1/projects` - Create project
- `GET /api/v1/projects/{id}` - Get project details
- `PATCH /api/v1/projects/{id}` - Update project
- `DELETE /api/v1/projects/{id}` - Archive/delete project

**Tasks & Jobs**:
- `GET /api/v1/tasks` - List tasks
- `POST /api/v1/tasks` - Create task
- `GET /api/v1/jobs` - List annotation jobs
- `POST /api/v1/jobs/{id}/assign` - Assign job to user

**Documentation**:
- `GET /docs` - Swagger UI
- `GET /redoc` - ReDoc documentation

## Data Flow

### Solo Mode
1. **Image Upload**: User uploads images → stored in IndexedDB → displayed in frontend
2. **Manual Annotation**: User draws shapes on canvas → stored as annotations in IndexedDB
3. **AI-Assisted Annotation (Bbox)**: User draws bounding box → sent to SAM3 API → receives polygon masks → converted to polygon annotations
4. **AI-Assisted Annotation (Text)**: User enters text prompt → sent to SAM3 API → receives polygon masks → converted to polygon annotations
5. **BYOM Inference**: User selects registered model → sent to BYOM endpoint → receives annotations
6. **Export**: Annotations exported as COCO JSON, YOLO format, or ZIP archive

### Team Mode
1. **Authentication**: User logs in → receives JWT token → stored in AuthContext
2. **Project Management**: User creates/joins project → stored in PostgreSQL → accessible to team
3. **Task Assignment**: Admin assigns tasks to users → tracked in database
4. **Image Upload**: Images uploaded → stored in MinIO object storage → metadata in PostgreSQL
5. **Annotation**: User annotates → synced between IndexedDB and MinIO → versioned in database
6. **Collaboration**: Multiple users work on same project → changes synced via API
7. **Export**: Project exports → background Celery job → results stored in MinIO

## Key Technical Details

### SAM3 Integration
- Backend uses HuggingFace Transformers `Sam3Model` and `Sam3Processor`
- Masks are converted from binary arrays to polygon coordinates for frontend rendering
- Supports both text prompts ("cat", "person") and bounding box prompts (coordinate arrays)
- Batch processing for multiple images to improve performance

### Storage Strategy

**Solo Mode**:
- **Frontend**: IndexedDB for all data (images as blobs, annotations as JSON)
- **SAM3 Backend**: Stateless - no persistent storage, model cached in HuggingFace cache dir
- **Docker**: `huggingface_cache` volume persists downloaded models across container restarts

**Team Mode**:
- **Frontend**: Hybrid - IndexedDB for local cache + API for persistence
- **API Core**: PostgreSQL for metadata (users, projects, tasks, jobs)
- **Object Storage**: MinIO for images and annotation files
- **Cache**: Redis for session management and task queues
- **Background Jobs**: Celery workers for async processing (exports, stats, evaluations)
- **Docker**: Multiple volumes for postgres data, minio data, redis data

### Canvas Coordinate System
- Annotations stored in absolute pixel coordinates relative to original image dimensions
- Canvas scales images to fit viewport while maintaining aspect ratio
- Coordinates must be transformed between canvas space and image space during rendering and editing

### GPU Acceleration
- Enabled by default in all docker-compose files (dev, solo, team)
- Requires nvidia-docker installation
- Performance: ~200-500ms per image with GPU vs 5-10x slower on CPU
- Automatically detects CUDA availability via `SAM3_DEVICE=auto`
- Can be disabled by setting `SAM3_DEVICE=cpu` in environment

### BYOM (Bring Your Own Model)
- Register external inference models via Core API
- Models must expose compatible HTTP endpoints
- Health check monitoring for registered models
- Automatic capability detection (bbox, text, auto-detect)
- Fallback to SAM3 when BYOM models unavailable

## Common Tasks

### Adding New SAM3 Endpoint
1. Add Pydantic schema in `apps/api-inference/src/app/schemas/sam3.py`
2. Implement inference method in `apps/api-inference/src/app/integrations/sam3/inference.py`
3. Add route handler in `apps/api-inference/src/app/routers/sam3.py`
4. Update frontend client in `apps/web/src/lib/sam3-client.ts`

### Adding New Core API Endpoint
1. Define database model in `apps/api-core/src/app/models/`
2. Create Alembic migration: `cd apps/api-core/src && alembic revision --autogenerate -m "description"`
3. Add Pydantic schemas in `apps/api-core/src/app/schemas/`
4. Implement repository in `apps/api-core/src/app/repositories/`
5. Add business logic in `apps/api-core/src/app/services/`
6. Create route handler in `apps/api-core/src/app/routers/`
7. Update frontend client in `apps/web/src/lib/api-client.ts`

### Adding New Frontend Page
1. Create page component in `apps/web/src/pages/`
2. Add route in `apps/web/src/main.tsx`
3. Update navigation in `apps/web/src/components/DashboardLayout.tsx`
4. Add API client methods in `apps/web/src/lib/api-client.ts` if needed
5. Update types in `apps/web/src/types/` if needed

### Adding New Annotation Type
1. Define type in `apps/web/src/types/annotations.ts`
2. Update storage schema in `apps/web/src/lib/storage.ts`
3. Add rendering logic in `apps/web/src/components/Canvas.tsx`
4. Add tool UI in `apps/web/src/components/LeftSidebar.tsx`
5. Update export logic in `apps/web/src/lib/coco-export.ts` and `yolo-export.ts`

### Running Database Migrations (Team Mode)
```bash
# Create new migration
make docker-shell service=api-core
cd src
alembic revision --autogenerate -m "add new table"

# Apply migrations
alembic upgrade head

# Rollback
alembic downgrade -1
```

### Troubleshooting Model Loading
If SAM3 model fails to load:
```bash
make docker-shell service=backend
python -c "from transformers import Sam3Model; Sam3Model.from_pretrained('facebook/sam3')"
```
Check HF_TOKEN is valid and SAM3 access is approved.

### Debugging Frontend State
IndexedDB state inspection:
- Open browser DevTools → Application → IndexedDB → `sam3-annotations`
- Stores: `images`, `annotations`, `labels`

### Accessing Docker Services
```bash
# View all running containers
docker ps

# Check logs
make docker-logs service=backend
make docker-logs service=api-core
make docker-logs service=frontend

# Shell into container
make docker-shell service=backend
make docker-shell service=api-core

# Restart specific service
make docker-restart service=api-core
```

## Package Management

- **Backend (SAM3 Inference)**: Uses `uv` with `apps/api-inference/pyproject.toml`
- **Backend (API Core)**: Uses `uv` with `apps/api-core/pyproject.toml`
- **Frontend**: Uses `npm` with `apps/web/package.json`
- Always run `make backend-install` or `make core-install` from repository root after pulling Python dependency changes
- Always run `npm install` in `apps/web` directory after pulling frontend dependency changes
- Use `make install` from repository root to install all dependencies at once

## Testing

**Backend (SAM3 Inference)**:
```bash
make backend-test  # Run pytest in apps/api-inference/src/tests/
```

**Backend (API Core)**:
```bash
make core-test     # Run pytest in apps/api-core/src/tests/
```

**Frontend**: No test suite currently configured (Vite default setup doesn't include testing framework)

## Project Documentation

Additional documentation is available in the `/docs` directory:
- `/docs/getting-started.md` - Getting started guide
- `/docs/architecture/` - Architecture documentation
- `/docs/api-specs/` - API specifications
- `/docs/byom-integration-guide/` - BYOM integration guide
- `/docs/COLOR_THEME_GUIDE.md` - UI color theme guide
- `/docs/database-schema.dbml` - Database schema diagram
- `/docker/README.md` - Docker deployment modes documentation