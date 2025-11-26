# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Annotate ANU - A full-stack image annotation application combining SAM3 (Segment Anything Model 3) AI-powered segmentation with an interactive React-based annotation interface. The application enables both manual and AI-assisted image labeling for computer vision datasets.

## Architecture

### Monorepo Structure
This project uses **Turborepo** for monorepo management with the following structure:
- **Backend**: FastAPI service providing SAM3 inference API (`/apps/api-inference`)
- **Frontend**: React + TypeScript annotation interface (`/apps/web`)
- **Shared Packages**:
  - `packages/tsconfig/` - Shared TypeScript configurations (base, react, node)
  - `packages/shared-types/` - Shared TypeScript types for API contracts
- **Docker Compose**: Orchestrates both services with shared networking
- **Turborepo Config**: `turbo.json` defines pipeline tasks and caching strategy

### Turborepo Workspace Structure

The project uses Turborepo for monorepo management with the following benefits:

**Workspace Packages**:
- `@sam3/tsconfig` - Shared TypeScript configurations (base.json, react.json, node.json)
- `@sam3/shared-types` - Shared TypeScript types for API contracts between frontend and backend
- Future: Additional shared utilities and components

**Key Benefits**:
- **Build Caching**: Turbo caches build outputs and only rebuilds changed packages
- **Parallel Execution**: Runs tasks across workspaces in parallel when possible
- **Dependency Graph**: Automatically determines build order based on workspace dependencies
- **Consistent Tooling**: Shared configs ensure consistent TypeScript, ESLint, and build settings

**Workspace Commands** (run from root):
```bash
npm run dev        # Start all apps in development mode
npm run build      # Build all apps and packages
npm run lint       # Lint all workspaces
turbo run test     # Run tests across all packages
```

### Backend (`/apps/api-inference`)
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

**Model Loading**: SAM3 model is loaded during FastAPI application startup via lifespan context manager. This ensures the model is loaded once and cached in memory. The model requires HuggingFace authentication (HF_TOKEN) as SAM3 is a gated model.

**Device Management**: Automatically detects CUDA/CPU via `SAM3_DEVICE=auto` setting. GPU acceleration is configured in docker-compose.yml with nvidia-docker support.

### Frontend (`/apps/web`)
**Framework**: React 18 + TypeScript + Vite

*Note: All paths below are relative to `apps/web/`*

**Key Components**:
- `src/App.tsx` - Main application orchestrating state and UI components
- `src/components/Canvas.tsx` - Konva-based annotation canvas
- `src/components/LeftSidebar.tsx` - Tool selection and image management
- `src/components/Sidebar.tsx` - Annotations list and label management
- `src/components/BboxPromptPanel.tsx` - SAM3 bounding box prompt interface
- `src/components/TextPromptPanel.tsx` - SAM3 text prompt interface
- `src/lib/sam3-client.ts` - SAM3 API client
- `src/lib/storage.ts` - IndexedDB persistence layer
- `src/types/annotations.ts` - TypeScript type definitions

**State Management**: Uses React hooks with IndexedDB persistence. The `useStorage` hook manages images, annotations, and labels with automatic persistence.

**Canvas System**: Built with Konva/React-Konva for vector-based annotations. Supports rectangles, polygons, and points with real-time editing.

**Prompt Modes**:
- `single` - Manual bounding box drawing, single SAM3 inference
- `auto-apply` - Automatic SAM3 inference after drawing each bounding box
- `batch` - Multiple bounding boxes, single batch SAM3 inference

## Development Commands

### Local Development (Recommended)

**Backend**:
```bash
cd apps/api-inference
cp .env.example .env  # IMPORTANT: Add your HF_TOKEN
make backend-install  # Install dependencies with uv (run from root)
make backend-run      # Run API at http://localhost:8000 (run from root)
```

**Frontend**:
```bash
cd apps/web
npm install
npm run dev  # Start dev server at http://localhost:5173
```

### Docker Development

```bash
make docker-up          # Start all services
make docker-down        # Stop all services
make docker-logs        # View all logs
make docker-logs service=backend   # View backend logs only
make docker-restart service=backend  # Restart backend
make docker-shell service=backend    # Shell into backend container
```

### Code Quality

**Backend**:
```bash
make backend-format  # Format with ruff
make backend-lint    # Lint with ruff
make backend-test    # Run pytest (when tests exist)
```

**Frontend**:
```bash
npm run lint   # ESLint
npm run build  # TypeScript compilation + Vite build
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
- `apps/api-inference/.env` - Backend configuration (HF_TOKEN, SAM3_DEVICE, MAX_IMAGE_SIZE_MB, etc.)
- `apps/web/.env` - Frontend configuration (VITE_API_URL)

## API Endpoints

**Base URL**: `http://localhost:8000`

- `POST /api/v1/sam3/inference/text` - Text prompt segmentation
- `POST /api/v1/sam3/inference/bbox` - Bounding box segmentation
- `POST /api/v1/sam3/inference/batch` - Batch processing
- `GET /api/v1/sam3/health` - Health check
- `GET /docs` - Swagger UI
- `GET /redoc` - ReDoc documentation

## Data Flow

1. **Image Upload**: User uploads images → stored in IndexedDB → displayed in frontend
2. **Manual Annotation**: User draws shapes on canvas → stored as annotations in IndexedDB
3. **AI-Assisted Annotation (Bbox)**: User draws bounding box → sent to SAM3 API → receives polygon masks → converted to polygon annotations
4. **AI-Assisted Annotation (Text)**: User enters text prompt → sent to SAM3 API → receives polygon masks → converted to polygon annotations
5. **Export**: Annotations exported as COCO JSON, YOLO format, or ZIP archive

## Key Technical Details

### SAM3 Integration
- Backend uses HuggingFace Transformers `Sam3Model` and `Sam3Processor`
- Masks are converted from binary arrays to polygon coordinates for frontend rendering
- Supports both text prompts ("cat", "person") and bounding box prompts (coordinate arrays)
- Batch processing for multiple images to improve performance

### Storage Strategy
- **Frontend**: IndexedDB for images (blobs) and annotations (JSON)
- **Backend**: Stateless - no persistent storage, model cached in HuggingFace cache dir
- Docker volume `huggingface_cache` persists downloaded models across container restarts

### Canvas Coordinate System
- Annotations stored in absolute pixel coordinates relative to original image dimensions
- Canvas scales images to fit viewport while maintaining aspect ratio
- Coordinates must be transformed between canvas space and image space during rendering and editing

### GPU Acceleration
- Enabled by default in `docker-compose.yml` (lines 23-29)
- Requires nvidia-docker installation
- Performance: ~200-500ms per image with GPU vs 5-10x slower on CPU

## Common Tasks

### Adding New SAM3 Endpoint
1. Add Pydantic schema in `apps/api-inference/src/app/schemas/sam3.py`
2. Implement inference method in `apps/api-inference/src/app/integrations/sam3/inference.py`
3. Add route handler in `apps/api-inference/src/app/routers/sam3.py`
4. Update frontend client in `apps/web/src/lib/sam3-client.ts`

### Adding New Annotation Type
1. Define type in `apps/web/src/types/annotations.ts`
2. Update storage schema in `apps/web/src/lib/storage.ts`
3. Add rendering logic in `apps/web/src/components/Canvas.tsx`
4. Add tool UI in `apps/web/src/components/LeftSidebar.tsx`

### Troubleshooting Model Loading
If model fails to load:
```bash
make docker-shell service=backend
python -c "from transformers import Sam3Model; Sam3Model.from_pretrained('facebook/sam3')"
```
Check HF_TOKEN is valid and SAM3 access is approved.

### Debugging Frontend State
IndexedDB state inspection:
- Open browser DevTools → Application → IndexedDB → `sam3-annotations`
- Stores: `images`, `annotations`, `labels`

## Package Management

- **Backend**: Uses `uv` (fast Python package manager) with `pyproject.toml`
- **Frontend**: Uses `npm` with `package.json`
- **Turborepo**: Manages workspace dependencies and caching via root `package.json`
- Always run `make backend-install` from repository root after pulling backend dependency changes
- Always run `npm install` in `apps/web` directory after pulling frontend dependency changes
- Run `npm install` from repository root to install all workspace dependencies

## Testing

Backend tests: Use pytest in `apps/api-inference/src/tests/` (directory structure exists but tests not yet implemented)

Frontend: No test suite currently configured (Vite default setup doesn't include testing framework)
