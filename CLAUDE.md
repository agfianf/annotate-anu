# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Annotate ANU** - A full-stack image annotation application combining SAM3 (Segment Anything Model 3) AI-powered segmentation with an interactive React-based annotation interface.

**Tech Stack**:
- **Backend**: FastAPI (Python 3.12), SQLAlchemy, Alembic, PostgreSQL, Redis
- **Frontend**: React 18, TypeScript, Vite, TailwindCSS, Konva, **TanStack Router** (IMPORTANT: Code-based routing)
- **ML**: HuggingFace Transformers (SAM3), CUDA support
- **Infrastructure**: Docker Compose, Traefik, Celery

**Deployment Modes**:
- **Development** (`docker-compose.dev.yml`): Hot-reload enabled for local development
- **Solo** (`docker-compose.solo.yml`): Local-first with IndexedDB storage
- **Team** (`docker-compose.team.yml`): Full collaborative stack with PostgreSQL, MinIO, Redis

## Project Structure

```
sam3-app/
├── apps/
│   ├── api-inference/              # SAM3 Inference API (Port 8000)
│   │   ├── src/
│   │   │   ├── app/
│   │   │   │   ├── main.py                    # FastAPI entry point
│   │   │   │   ├── config.py                  # Environment configuration
│   │   │   │   ├── integrations/sam3/         # SAM3 model integration
│   │   │   │   │   ├── inference.py           # Core inference logic
│   │   │   │   │   ├── mask_utils.py          # Mask-to-polygon conversion
│   │   │   │   │   └── visualizer.py          # Visualization utilities
│   │   │   │   ├── routers/                   # API endpoints
│   │   │   │   │   └── sam3.py                # SAM3 routes
│   │   │   │   ├── schemas/                   # Pydantic models
│   │   │   │   │   └── sam3.py                # Request/response schemas
│   │   │   │   ├── services/                  # Business logic
│   │   │   │   ├── middleware/                # Custom middleware
│   │   │   │   ├── helpers/                   # Utilities
│   │   │   │   └── exceptions/                # Exception handling
│   │   │   └── tests/                         # Pytest tests
│   │   ├── pyproject.toml                     # Python dependencies (uv)
│   │   ├── .env.example
│   │   └── Dockerfile
│   │
│   ├── api-core/                   # Core API (Port 8001)
│   │   ├── src/
│   │   │   ├── app/
│   │   │   │   ├── main.py                    # FastAPI entry point
│   │   │   │   ├── config.py                  # Environment configuration
│   │   │   │   ├── core/                      # Database, security
│   │   │   │   │   ├── database.py            # Database connection
│   │   │   │   │   └── security.py            # JWT, auth utilities
│   │   │   │   ├── models/                    # SQLAlchemy models
│   │   │   │   │   ├── user.py
│   │   │   │   │   ├── project.py
│   │   │   │   │   ├── task.py
│   │   │   │   │   ├── job.py
│   │   │   │   │   └── model.py               # BYOM models
│   │   │   │   ├── repositories/              # Database access layer
│   │   │   │   ├── services/                  # Business logic
│   │   │   │   ├── routers/                   # API endpoints
│   │   │   │   │   ├── auth.py
│   │   │   │   │   ├── projects.py
│   │   │   │   │   ├── tasks.py
│   │   │   │   │   ├── jobs.py
│   │   │   │   │   └── models.py              # BYOM routes
│   │   │   │   ├── schemas/                   # Pydantic models
│   │   │   │   ├── integrations/              # External integrations
│   │   │   │   ├── dependencies/              # FastAPI dependencies
│   │   │   │   └── exceptions/                # Exception handling
│   │   │   └── migrations/                    # Alembic migrations
│   │   ├── pyproject.toml                     # Python dependencies (uv)
│   │   ├── .env.example
│   │   └── Dockerfile
│   │
│   └── web/                        # Frontend (Port 5173/3000)
│       ├── src/
│       │   ├── routes/                        # TanStack Router configuration (IMPORTANT)
│       │   │   └── __root.tsx                 # Route tree definition (code-based routing)
│       │   ├── pages/                         # React page components
│       │   │   ├── LandingPage.tsx
│       │   │   ├── DashboardPage.tsx
│       │   │   ├── ProjectsPage.tsx
│       │   │   ├── ProjectDetailPage.tsx
│       │   │   ├── TasksPage.tsx
│       │   │   ├── JobsPage.tsx
│       │   │   ├── AnimationDemoPage.tsx      # Animation system demo (/animations)
│       │   │   ├── AnnotationApp.tsx          # Main annotation interface
│       │   │   ├── ModelConfigPage.tsx
│       │   │   └── ProfilePage.tsx
│       │   ├── components/                    # React components
│       │   │   ├── Canvas.tsx                 # Konva annotation canvas
│       │   │   ├── LeftSidebar.tsx            # Tool selection
│       │   │   ├── Sidebar.tsx                # Annotations list
│       │   │   ├── BboxPromptPanel.tsx        # SAM3 bbox prompts
│       │   │   ├── TextPromptPanel.tsx        # SAM3 text prompts
│       │   │   ├── AutoDetectPanel.tsx
│       │   │   ├── DashboardLayout.tsx
│       │   │   ├── ProjectTabs.tsx
│       │   │   ├── CreateTaskWizard.tsx
│       │   │   ├── ExportModal.tsx
│       │   │   └── ui/                        # Reusable UI components
│       │   │       └── animate/               # Framer Motion animation primitives
│       │   ├── lib/                           # Utility libraries
│       │   │   ├── api-client.ts              # Core API client
│       │   │   ├── sam3-client.ts             # SAM3 API client
│       │   │   ├── byom-client.ts             # BYOM client
│       │   │   ├── inference-client.ts        # Generic inference
│       │   │   ├── storage.ts                 # IndexedDB layer
│       │   │   ├── motion-config.ts           # Animation presets + reduced-motion helpers
│       │   │   ├── animation-utils.ts         # Animation helpers
│       │   │   ├── coco-export.ts
│       │   │   ├── yolo-export.ts
│       │   │   └── utils.ts
│       │   ├── hooks/                         # React hooks
│       │   │   ├── useStorage.ts              # IndexedDB state
│       │   │   ├── useHistory.ts              # Undo/redo
│       │   │   ├── useKeyboardShortcuts.ts
│       │   │   ├── useModelRegistry.ts
│       │   │   └── useReducedMotion.ts        # prefers-reduced-motion hook
│       │   ├── contexts/                      # React contexts
│       │   │   └── AuthContext.tsx
│       │   ├── types/                         # TypeScript types
│       │   │   └── annotations.ts
│       │   └── main.tsx                       # App entry point
│       ├── package.json                       # NPM dependencies
│       ├── .env.example
│       ├── vite.config.ts
│       └── Dockerfile
│
├── docker/                         # Docker configurations
│   ├── docker-compose.dev.yml                 # Development mode
│   ├── docker-compose.solo.yml                # Solo mode
│   └── docker-compose.team.yml                # Team mode
│
├── tools/                          # CLI tools and scripts
├── docs/                           # Additional documentation
├── Makefile                        # Development commands
└── CLAUDE.md                       # This file
```

### Key Architecture Points

**Backend API - SAM3 Inference** (`/apps/api-inference`):
- FastAPI service for SAM3 AI-powered segmentation
- Model loaded via lifespan context manager (requires HF_TOKEN)
- Supports text prompts, bbox prompts, batch processing
- Auto-detects CUDA/CPU via `SAM3_DEVICE=auto`
- Port: 8000

**Backend API - Core** (`/apps/api-core`):
- FastAPI + SQLAlchemy + Alembic
- User authentication (JWT), project/task management
- BYOM (Bring Your Own Model) registry and health checking
- PostgreSQL (Team) or SQLite (Dev/Solo)
- Port: 8001

**Frontend** (`/apps/web`):
- React 18 + TypeScript + Vite + TailwindCSS
- **TanStack Router** with code-based routing (`src/routes/__root.tsx`) - IMPORTANT
- Konva-based annotation canvas (rectangles, polygons, points)
- IndexedDB persistence (Solo) or hybrid IndexedDB + API (Team)
- Ports: 5173 (dev), 3000 (solo), 80 (team via Traefik)

## Docker Development Commands

### Essential Commands

```bash
# Quick reference
make help                           # View all available commands

# Main workflow
make docker-up                      # Start all services (RECOMMENDED)
make docker-down                    # Stop all services
make docker-rebuild                 # Rebuild images, stop, and restart (full reset)

# View logs
make docker-logs                    # View all service logs
make docker-logs service=backend    # View SAM3 backend logs only
make docker-logs service=api-core   # View Core API logs only
make docker-logs service=frontend   # View frontend logs only

# Service management
make docker-restart service=backend     # Restart specific service
make docker-restart service=api-core    # Restart Core API
make docker-restart service=frontend    # Restart frontend

# Shell access
make docker-shell service=backend   # Shell into backend container
make docker-shell service=api-core  # Shell into Core API container

# Build commands
make docker-build                   # Rebuild all Docker images

# Frontend troubleshooting
make frontend-clear-cache           # Clear Vite cache + restart frontend container
```

### Detailed Docker Commands

**Starting Services**:
```bash
# Start all services in development mode (hot-reload enabled)
make docker-up

# This runs: docker-compose -f docker/docker-compose.dev.yml up -d
# Services started:
# - backend (SAM3 Inference): http://localhost:8000
# - api-core (Core API): http://localhost:8001
# - frontend (React): http://localhost:5173
# - redis: localhost:6379
```

**Stopping Services**:
```bash
# Stop all services
make docker-down

# Stop and remove volumes (WARNING: deletes all data)
docker-compose -f docker/docker-compose.dev.yml down -v
```

**Viewing Logs**:
```bash
# All services
make docker-logs

# Specific service (follow mode)
make docker-logs service=backend
make docker-logs service=api-core
make docker-logs service=frontend

# Last 100 lines
docker logs --tail 100 sam3-backend

# Follow logs in real-time
docker logs -f sam3-backend
```

**Restarting Services**:
```bash
# Restart specific service (useful after code changes)
make docker-restart service=backend
make docker-restart service=api-core
make docker-restart service=frontend

# Restart all services
make docker-down && make docker-up
```

**Shell Access**:
```bash
# Access backend container shell
make docker-shell service=backend
# Once inside: python, pytest, etc.

# Access Core API container shell
make docker-shell service=api-core
# Once inside: alembic upgrade head, python, etc.

# Run one-off commands
docker exec -it sam3-backend python -c "from transformers import Sam3Model; print('OK')"
```

**Building Images**:
```bash
# Rebuild all images (use after Dockerfile changes)
make docker-build

# Rebuild and restart everything (RECOMMENDED for full reset)
make docker-rebuild

# Build specific service
docker-compose -f docker/docker-compose.dev.yml build backend
docker-compose -f docker/docker-compose.dev.yml build api-core
docker-compose -f docker/docker-compose.dev.yml build frontend
```

**Inspecting Services**:
```bash
# List running containers
docker ps

# Inspect specific container
docker inspect sam3-backend
docker inspect sam3-api-core
docker inspect sam3-frontend

# Check service health
docker-compose -f docker/docker-compose.dev.yml ps

# View resource usage
docker stats
```

**Database Migrations (Team Mode)**:
```bash
# Shell into api-core
make docker-shell service=api-core

# Inside container
cd src
alembic revision --autogenerate -m "description"  # Create migration
alembic upgrade head                              # Apply migrations
alembic downgrade -1                              # Rollback one version
alembic current                                   # Show current version
alembic history                                   # Show migration history
```

**Troubleshooting**:
```bash
# Check if containers are running
docker ps -a

# View container logs for errors
make docker-logs service=backend

# Remove all containers and start fresh
make docker-down
docker system prune -a  # WARNING: removes all unused containers/images
make docker-up

# Check disk space
docker system df

# Clean up unused resources
docker system prune
```

### Local Development (Alternative)

If you prefer running services locally without Docker:

**Backend (SAM3 Inference)**:
```bash
cd apps/api-inference
cp .env.example .env              # Add your HF_TOKEN
make backend-install              # Run from repo root
make backend-run                  # Run from repo root (http://localhost:8000)
```

**Backend (API Core)**:
```bash
cd apps/api-core
cp .env.example .env              # Configure database
make core-install                 # Run from repo root
make core-run                     # Run from repo root (http://localhost:8001)
```

**Frontend**:
```bash
cd apps/web
npm install
npm run dev                       # http://localhost:5173
```

**Install All Dependencies**:
```bash
make install                      # Install all backend + frontend dependencies
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

**Without this token, the backend will fail to load the model.**

### Environment Files

**`apps/api-inference/.env`** - SAM3 Backend:
```bash
HF_TOKEN=hf_your_token_here       # REQUIRED for SAM3
SAM3_DEVICE=auto                  # auto, cuda, cpu
MAX_IMAGE_SIZE_MB=10
MODE=dev                          # dev, solo, team
```

**`apps/api-core/.env`** - Core API:
```bash
DATABASE_URL=postgresql://...     # PostgreSQL connection
JWT_SECRET=your_secret_key
REDIS_URL=redis://localhost:6379
MODE=dev                          # dev, solo, team
```

**`apps/web/.env`** - Frontend:
```bash
VITE_API_URL=http://localhost:8000
VITE_API_CORE_URL=http://localhost:8001
VITE_MODE=dev                     # dev, solo, team
VITE_STORAGE=indexeddb            # indexeddb, hybrid
```

### Deployment Modes

Set `MODE` environment variable:
- `dev` / `solo` - Local-first mode (IndexedDB only, no auth)
- `team` - Full collaborative mode (PostgreSQL, MinIO, Redis, auth enabled)

## Code Quality & Testing

**Backend (SAM3 Inference)**:
```bash
make backend-format               # Format with ruff
make backend-lint                 # Lint with ruff
make backend-test                 # Run pytest
```

**Backend (API Core)**:
```bash
make core-format                  # Format with ruff
make core-lint                    # Lint with ruff
make core-test                    # Run pytest
```

**Frontend**:
```bash
cd apps/web
npm run lint                      # ESLint
npm run build                     # TypeScript compilation + Vite build
```

**Clean Build Artifacts**:
```bash
make clean                        # Clean all cache and build files
```

## Common Development Tasks

### Using Color Picker Component

**IMPORTANT**: Always use the existing `ColorPickerPopup` component for all color selection needs.

**Location**: `apps/web/src/components/ui/ColorPickerPopup.tsx`

**Features**:
- Portal-based glass morphism design with backdrop blur
- Positioned relative to anchor element
- Predefined color palette
- Auto-closes on outside click
- Consistent UX across the application

**Example Usage**:
```typescript
import { ColorPickerPopup } from '@/components/ui/ColorPickerPopup';

function MyComponent() {
  const [colorPickerAnchor, setColorPickerAnchor] = useState<HTMLElement | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedColor, setSelectedColor] = useState('#10B981');

  const handleColorButtonClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    setColorPickerAnchor(e.currentTarget);
    setIsOpen(true);
  };

  const handleColorChange = (color: string) => {
    setSelectedColor(color);
    // Your color change logic here
  };

  const handleClose = () => {
    setIsOpen(false);
    setColorPickerAnchor(null);
  };

  return (
    <>
      <button onClick={handleColorButtonClick}>
        <div
          className="w-3 h-3 rounded-sm border border-emerald-300"
          style={{ backgroundColor: selectedColor }}
        />
      </button>

      <ColorPickerPopup
        selectedColor={selectedColor}
        onColorChange={handleColorChange}
        isOpen={isOpen}
        onClose={handleClose}
        anchorEl={colorPickerAnchor}
      />
    </>
  );
}
```

**DO NOT** create new color picker dropdowns or inline color selection UI. Always use this centralized component for consistency.

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

**IMPORTANT: This project uses TanStack Router with code-based routing.**

1. Create page component in `apps/web/src/pages/` (e.g., `MyPage.tsx`)
2. Open `apps/web/src/routes/__root.tsx` and:
   - Import your page component at the top
   - Create a route using `createRoute()`:
     ```typescript
     const myPageRoute = createRoute({
       getParentRoute: () => rootRoute, // or dashboardLayoutRoute for authenticated pages
       path: '/my-page',
       component: MyPage,
     })
     ```
   - Add the route to the `routeTree` (bottom of file)
3. Update navigation in `apps/web/src/components/DashboardLayout.tsx` if needed
4. Add API client methods in `apps/web/src/lib/api-client.ts` if needed
5. Update types in `apps/web/src/types/` if needed

**Notes**:
- All routes are manually defined in `src/routes/__root.tsx`
- Use `$paramName` syntax for dynamic routes (e.g., `/projects/$projectId`)
- Add routes under `authenticatedRoute` for protected pages
- Use `validateSearch` with Zod schemas for type-safe query parameters

### Animation System (Frontend)

**Docs**:
- `apps/web/ANIMATION_GUIDE.md`
- `apps/web/ANIMATION_COMPLETE.md`
- `apps/web/TOOLTIP_DEMO.md`

**Demo page**: `GET /animations` (route defined in `apps/web/src/routes/__root.tsx`)

**Implementation notes**:
- Prefer importing primitives from `apps/web/src/components/ui/animate/index.ts`.
- Respect accessibility: use `apps/web/src/hooks/useReducedMotion.ts` or reduced-motion helpers in `apps/web/src/lib/motion-config.ts`.
- Keep colors/timings consistent via `apps/web/src/lib/motion-config.ts` (emerald theme).

## API Quick Reference

### SAM3 Inference API (http://localhost:8000)
- `POST /api/v1/sam3/inference/text` - Text prompt segmentation
- `POST /api/v1/sam3/inference/bbox` - Bounding box segmentation
- `POST /api/v1/sam3/inference/batch` - Batch processing
- `GET /docs` - Swagger UI

### Core API (http://localhost:8001)
- `POST /api/v1/auth/register` - User registration
- `POST /api/v1/auth/login` - User login
- `GET /api/v1/projects` - List projects
- `POST /api/v1/models` - Register BYOM model
- `GET /docs` - Swagger UI

## Additional Documentation

- `/docs/getting-started.md` - Getting started guide
- `/docs/architecture/` - Architecture documentation
- `/docs/byom-integration-guide/` - BYOM integration guide
- `/docker/README.md` - Docker deployment modes
