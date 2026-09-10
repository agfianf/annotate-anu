# Docker Deployment Configurations

This directory contains Docker Compose files for different deployment modes of AnnotateANU.

## Available Configurations

### 🔧 Development Mode (`docker-compose.yml`)

**Purpose**: Local development with hot-reload enabled

**Services**:
- Backend API (SAM3 Inference) - Port 8000 with hot-reload
- Frontend (React) - Port 5173 with Vite dev server

**Usage**:
```bash
make docker-up
# or
docker-compose -f docker/docker-compose.yml up
```

**Features**:
- Source code mounted as volumes
- Hot-reload for both frontend and backend
- GPU acceleration enabled (requires nvidia-docker)
- Development tools and debugging enabled

---

### 🎯 Solo Mode (`docker-compose.solo.yml`)

**Purpose**: Minimal local-first deployment (no team features)

**Services**:
- Backend API (SAM3 Inference) - Port 8000
- Frontend (Production build) - Port 3000

**Storage**: IndexedDB (browser-based, no server storage)

**Usage**:
```bash
make docker-up-solo
# or
docker-compose -f docker/docker-compose.solo.yml up
```

**Features**:
- No authentication required
- No database or object storage
- All data stays in browser IndexedDB
- Folder upload support
- BYOM (Bring Your Own Model) support
- CVAT import/export
- Production-optimized frontend

---

### 👥 Team Mode (`docker-compose.team.yml`)

**Purpose**: Full collaborative stack with team features

**Services**:
- **Load Balancer**: Traefik (Port 80/443, Dashboard 8080)
- **API Inference**: SAM3 inference service (via Traefik)
- **API Core**: Team collaboration API (Port 8001)
- **PostgreSQL**: Metadata database (Port 5432)
- **MinIO**: Object storage for images/exports (Port 9000, Console 9001)
- **Redis**: Cache and message broker (Port 6379)
- **Celery Workers**: Background jobs (export, stats, evaluation)
- **Frontend**: Production build with team features

**Usage**:
```bash
make docker-up-team
# or
docker-compose -f docker/docker-compose.team.yml up
```

**Features**:
- User authentication & authorization
- Project and dataset management
- Team collaboration & assignment
- Real-time sync (IndexedDB ↔ MinIO)
- Quality assurance workflows
- Background job processing
- Team statistics and reports
- Data versioning

**Accessing Services**:
- Frontend: http://localhost
- Traefik Dashboard: http://localhost:8080
- MinIO Console: http://localhost:9001 (minioadmin/minioadmin)
- PostgreSQL: localhost:5432 (anu_user/anu_password)
- Redis: localhost:6379

---

## Local Overrides (`docker-compose.override.yml`)

Everything committed to git points at `localhost`. Anything specific to one machine — a LAN or VPN address, remapped host ports, GPU device ids — goes in a gitignored override instead, so a real host address never lands in a commit:

```bash
cp docker/docker-compose.override.example.yml docker/docker-compose.override.yml
# edit it, then:
make docker-up
```

`make docker-up` picks the override up automatically when it exists, and works fine when it does not — a fresh clone needs no override at all.

One gotcha if you run compose by hand: it only auto-loads `docker-compose.override.yml` when **no** `-f` flag is given. Pass `-f` and you must name both files:

```bash
docker-compose -f docker/docker-compose.yml -f docker/docker-compose.override.yml up -d
```

Serving the UI from anything other than `localhost` means three things have to name that same host, or the browser blocks the requests:

1. the `VITE_*` URLs for the `frontend` service — Vite reads `VITE_`-prefixed process env and it takes precedence over `apps/web/.env`
2. `CORS_ORIGINS` on `api-core`
3. the `VITE_*` **build args** for `frontend-prod`, since those are baked into the bundle at build time

Container-to-container URLs are not among them. `SAM3_API_URL=http://backend:8000` and `VITE_MODEL_SERVER_INTERNAL_URL=http://model-server:8002` resolve on the compose network and keep their internal ports.

## Environment Variables

Each mode requires appropriate `.env` configuration:

**Backend** (`apps/api-inference/.env`):
```bash
HF_TOKEN=hf_your_token_here  # Required for SAM3
MODE=solo|team               # Deployment mode
REDIS_URL=redis://redis:6379 # Team mode only
```

**Frontend** (`apps/web/.env`):
```bash
VITE_MODE=solo|team
VITE_API_URL=http://localhost:8000
VITE_STORAGE=indexeddb|hybrid
```

---

## GPU Support

All configurations include GPU support via nvidia-docker. To enable:

1. Install nvidia-docker:
```bash
# Ubuntu/Debian
distribution=$(. /etc/os-release;echo $ID$VERSION_ID)
curl -s -L https://nvidia.github.io/nvidia-docker/gpgkey | sudo apt-key add -
curl -s -L https://nvidia.github.io/nvidia-docker/$distribution/nvidia-docker.list | sudo tee /etc/apt/sources.list.d/nvidia-docker.list
sudo apt-get update && sudo apt-get install -y nvidia-docker2
sudo systemctl restart docker
```

2. GPU will be automatically used by the inference service

To disable GPU (CPU-only):
- Comment out the `deploy` section in the respective compose file
- Or set `SAM3_DEVICE=cpu` in `apps/api-inference/.env`

---

## Migration Path

1. **Start with Solo Mode** for local development and testing
2. **Migrate to Team Mode** when collaboration is needed
3. **Data sync**: Solo mode data can be synced to Team mode via export/import

---

## Troubleshooting

**Issue**: Services fail to start
```bash
docker-compose -f docker/docker-compose.[mode].yml logs
```

**Issue**: GPU not detected
```bash
docker run --rm --gpus all nvidia/cuda:12.1.0-base-ubuntu22.04 nvidia-smi
```

**Issue**: Port conflicts
- Modify port mappings in compose files
- Ensure ports 5173, 8000, 8001, 5432, 9000, 6379 are available
