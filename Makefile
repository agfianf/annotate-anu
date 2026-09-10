.PHONY: help dev install clean check-node \
        backend-install backend-run backend-test backend-format backend-lint \
        core-install core-run core-test core-format core-lint \
        frontend-install frontend-dev frontend-build frontend-clear-cache \
        docker-up docker-down docker-logs docker-build docker-rebuild docker-restart docker-shell \
        docker-rebuild-service \
        docker-up-solo docker-down-solo docker-up-team docker-down-team \
        docker-up-prod docker-down-prod docker-rebuild-prod

help:
	@echo "SAM3 Annotation Platform - Monorepo"
	@echo "===================================="
	@echo ""
	@echo "Development:"
	@echo "  dev              - Start both backend and frontend in development mode"
	@echo "  install          - Install all dependencies (backend + frontend)"
	@echo "  clean            - Clean all cache and build files"
	@echo ""
	@echo "Backend Commands:"
	@echo "  backend-install  - Install backend dependencies with uv"
	@echo "  backend-run      - Run backend API locally"
	@echo "  backend-test     - Run backend tests"
	@echo "  backend-format   - Format backend code with ruff"
	@echo "  backend-lint     - Lint backend code with ruff"
	@echo ""
	@echo "API Core Commands:"
	@echo "  core-install     - Install api-core dependencies with uv"
	@echo "  core-run         - Run api-core service locally"
	@echo "  core-test        - Run api-core tests"
	@echo "  core-format      - Format api-core code with ruff"
	@echo "  core-lint        - Lint api-core code with ruff"
	@echo ""
	@echo "Frontend Commands (require Node >= 22.12.0):"
	@echo "  frontend-install - Install frontend dependencies with npm"
	@echo "  frontend-dev     - Run frontend dev server"
	@echo "  frontend-build   - Build frontend for production (also the only typecheck)"
	@echo "  frontend-clear-cache - Clear Vite cache and restart the frontend container"
	@echo ""
	@echo "Docker Commands:"
	@echo "  docker-up        - Start development environment (hot-reload)"
	@echo "  docker-down      - Stop development services"
	@echo "  docker-up-prod   - Start production environment (optimized build)"
	@echo "  docker-down-prod - Stop production services"
	@echo "  docker-up-solo   - Start SOLO mode (minimal, IndexedDB storage)"
	@echo "  docker-down-solo - Stop SOLO mode services"
	@echo "  docker-up-team   - Start TEAM mode (full stack: Postgres, MinIO, Redis, Workers)"
	@echo "  docker-down-team - Stop TEAM mode services"
	@echo "  docker-logs      - View logs (usage: make docker-logs service=backend|api-core|frontend)"
	@echo "  docker-build     - Rebuild all Docker images"
	@echo "  docker-rebuild   - Rebuild images, stop, and restart services (build -> down -> up)"
	@echo "  docker-rebuild-service - Rebuild one service (usage: make docker-rebuild-service service=frontend)"
	@echo "  docker-rebuild-prod - Rebuild production images (build -> down -> up)"
	@echo "  docker-restart   - Restart services (usage: make docker-restart service=backend|api-core|frontend)"
	@echo "  docker-shell     - Open shell in container (usage: make docker-shell service=backend|api-core|frontend)"

# Development
# docker-compose.override.yml holds machine-specific settings (host address, ports,
# GPU) and is gitignored. Compose only auto-loads an override file when no -f flag
# is given, and every target here passes -f, so it has to be added explicitly.
# The wildcard makes it optional: a fresh clone with no override still works.
COMPOSE_FILE := docker/docker-compose.yml
COMPOSE_OVERRIDE := docker/docker-compose.override.yml
COMPOSE := docker-compose -f $(COMPOSE_FILE) $(if $(wildcard $(COMPOSE_OVERRIDE)),-f $(COMPOSE_OVERRIDE),)

dev:
	@echo "Starting development environment..."
	@echo "This will start both backend and frontend services using Docker Compose"
	$(COMPOSE) up

install: check-node
	@echo "Installing frontend dependencies..."
	@cd apps/web && npm install
	@echo "Installing backend dependencies..."
	@cd apps/api-inference && uv sync
	@echo "✓ All dependencies installed"

clean:
	@echo "Cleaning cache and build files..."
	@echo "Cleaning backend..."
	@cd apps/api-inference && find . -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
	@cd apps/api-inference && find . -type f -name "*.pyc" -delete 2>/dev/null || true
	@cd apps/api-inference && find . -type d -name ".pytest_cache" -exec rm -rf {} + 2>/dev/null || true
	@cd apps/api-inference && find . -type d -name ".ruff_cache" -exec rm -rf {} + 2>/dev/null || true
	@echo "Cleaning frontend..."
	@cd apps/web && rm -rf dist .vite 2>/dev/null || true
	@echo "✓ Cleanup complete"

# Backend commands
backend-install:
	@echo "Installing backend dependencies..."
	@cd apps/api-inference && uv venv || true
	@cd apps/api-inference && uv sync
	@echo "✓ Backend dependencies installed"

backend-run:
	@echo "Starting SAM3 API..."
	@cd apps/api-inference/src && PYTHONPATH=. uv run python app/main.py

backend-test:
	@echo "Running backend tests..."
	@cd apps/api-inference && uv run pytest src/tests/ -v

backend-format:
	@echo "Formatting backend code..."
	@cd apps/api-inference && uv run ruff check --fix src/
	@cd apps/api-inference && uv run ruff format src/

backend-lint:
	@echo "Linting backend code..."
	@cd apps/api-inference && uv run ruff check src/

# API Core commands
core-install:
	@echo "Installing api-core dependencies..."
	@cd apps/api-core && uv venv || true
	@cd apps/api-core && uv sync
	@echo "✓ API Core dependencies installed"

core-run:
	@echo "Starting API Core service..."
	@cd apps/api-core/src && PYTHONPATH=. uv run python app/main.py

core-test:
	@echo "Running api-core tests..."
	@cd apps/api-core && uv run pytest src/tests/ -v

core-format:
	@echo "Formatting api-core code..."
	@cd apps/api-core && uv run ruff check --fix src/
	@cd apps/api-core && uv run ruff format src/

core-lint:
	@echo "Linting api-core code..."
	@cd apps/api-core && uv run ruff check src/

# Frontend commands

# apps/web requires Node >= 22.12.0 (vite 8, eslint 10, react-dropzone 20).
# Enforced by "engines" in apps/web/package.json; checked here so host runs fail
# with a clear message instead of a cryptic syntax or resolver error.
NODE_MIN_MAJOR := 22

check-node:
	@command -v node >/dev/null 2>&1 || { \
		echo "✗ node not found. apps/web requires Node >= 22.12.0"; exit 1; }
	@major=$$(node -p "process.versions.node.split('.')[0]"); \
	if [ "$$major" -lt $(NODE_MIN_MAJOR) ]; then \
		echo "✗ Node $$(node -v) is too old — apps/web requires Node >= 22.12.0"; \
		echo "  (vite 8 and eslint 10 need >= 20.19; react-dropzone 20 needs >= 22)"; \
		echo "  Fix: nvm use 22"; \
		exit 1; \
	fi

frontend-install: check-node
	@echo "Installing frontend dependencies..."
	@cd apps/web && npm install
	@echo "✓ Frontend dependencies installed"

frontend-dev: check-node
	@echo "Starting frontend dev server..."
	@cd apps/web && npm run dev

frontend-build: check-node
	@echo "Building frontend for production..."
	@cd apps/web && npm run build

# Docker commands

docker-up:
	@echo "Starting Docker services (development mode)..."
	$(COMPOSE) --profile dev up -d
	@echo ""
	@echo "✓ Services started:"
	@echo "  Backend API (SAM3): http://localhost:18710"
	@echo "  Backend Docs: http://localhost:18710/docs"
	@echo "  API Core (BYOM): http://localhost:18711"
	@echo "  API Core Docs: http://localhost:18711/docs"
	@echo "  Frontend: http://localhost:18712"
	@echo "  Redis: localhost:6379 (internal)"

docker-down:
	@echo "Stopping Docker services..."
	$(COMPOSE) --profile dev down

docker-up-prod:
	@echo "Starting Docker services (production mode)..."
	$(COMPOSE) --profile prod up -d
	@echo ""
	@echo "✓ Production services started:"
	@echo "  Backend API (SAM3): http://localhost:18710"
	@echo "  Backend Docs: http://localhost:18710/docs"
	@echo "  API Core (BYOM): http://localhost:18711"
	@echo "  API Core Docs: http://localhost:18711/docs"
	@echo "  Frontend (Production): http://localhost:3000"
	@echo "  Redis: localhost:6379 (internal)"

docker-down-prod:
	@echo "Stopping production services..."
	$(COMPOSE) --profile prod down

docker-up-solo:
	@echo "Starting Docker services (SOLO mode - minimal)..."
	docker-compose -f docker/docker-compose.solo.yml up -d
	@echo ""
	@echo "✓ SOLO MODE Services started:"
	@echo "  Backend API: http://localhost:8000"
	@echo "  Frontend: http://localhost:3000"

docker-down-solo:
	@echo "Stopping SOLO mode services..."
	docker-compose -f docker/docker-compose.solo.yml down

docker-up-team:
	@echo "Starting Docker services (TEAM mode - full stack)..."
	docker-compose -f docker/docker-compose.team.yml up -d
	@echo ""
	@echo "✓ TEAM MODE Services started:"
	@echo "  Traefik Dashboard: http://localhost:8080"
	@echo "  Frontend: http://localhost"
	@echo "  API Inference: http://localhost/api/v1/inference"
	@echo "  API Core: http://localhost/api/v1"
	@echo "  MinIO Console: http://localhost:9001"
	@echo "  PostgreSQL: localhost:5432"
	@echo "  Redis: localhost:6379"

docker-down-team:
	@echo "Stopping TEAM mode services..."
	docker-compose -f docker/docker-compose.team.yml down

docker-logs:
ifdef service
	@echo "Viewing logs for $(service)..."
	$(COMPOSE) logs -f $(service)
else
	@echo "Viewing all logs..."
	$(COMPOSE) logs -f
endif

docker-build:
	@echo "Building Docker images..."
	$(COMPOSE) build

# --renew-anon-volumes matters for `frontend`: docker-compose.yml mounts an
# anonymous volume at /app/node_modules, which survives a plain recreate and would
# otherwise shadow the freshly built node_modules with the previous dependency set.
docker-rebuild:
	@echo "Rebuilding Docker services (build -> down -> up)..."
	@echo "Step 1/3: Building images..."
	@$(COMPOSE) --profile dev build
	@echo ""
	@echo "Step 2/3: Stopping services..."
	@$(COMPOSE) --profile dev down
	@echo ""
	@echo "Step 3/3: Starting services..."
	@$(COMPOSE) --profile dev up -d --renew-anon-volumes
	@echo ""
	@echo "✓ Services rebuilt and restarted:"
	@echo "  Backend API (SAM3): http://localhost:18710"
	@echo "  Backend Docs: http://localhost:18710/docs"
	@echo "  API Core (BYOM): http://localhost:18711"
	@echo "  API Core Docs: http://localhost:18711/docs"
	@echo "  Frontend: http://localhost:18712"
	@echo "  Redis: localhost:6379 (internal)"

docker-rebuild-prod:
	@echo "Rebuilding production Docker services (build -> down -> up)..."
	@echo "Step 1/3: Building production images..."
	@$(COMPOSE) --profile prod build
	@echo ""
	@echo "Step 2/3: Stopping services..."
	@$(COMPOSE) --profile prod down
	@echo ""
	@echo "Step 3/3: Starting services..."
	@$(COMPOSE) --profile prod up -d
	@echo ""
	@echo "✓ Production services rebuilt and restarted:"
	@echo "  Backend API (SAM3): http://localhost:18710"
	@echo "  Backend Docs: http://localhost:18710/docs"
	@echo "  API Core (BYOM): http://localhost:18711"
	@echo "  API Core Docs: http://localhost:18711/docs"
	@echo "  Frontend (Production): http://localhost:3000"
	@echo "  Redis: localhost:6379 (internal)"

# Rebuild a single service without cycling the whole stack.
# Usage: make docker-rebuild-service service=frontend
docker-rebuild-service:
ifdef service
	@echo "Rebuilding $(service)..."
	$(COMPOSE) up -d --build --renew-anon-volumes $(service)
	@echo "✓ $(service) rebuilt and restarted"
else
	@echo "Error: Please specify service (e.g., make docker-rebuild-service service=frontend)"
	@exit 1
endif

docker-restart:
ifdef service
	@echo "Restarting $(service) service..."
	$(COMPOSE) restart $(service)
else
	@echo "Restarting all services..."
	$(COMPOSE) restart
endif

docker-shell:
ifdef service
	@echo "Opening shell in $(service) container..."
	$(COMPOSE) exec $(service) sh
else
	@echo "Error: Please specify service (e.g., make docker-shell service=backend)"
endif


frontend-clear-cache:
	rm -rf apps/web/node_modules/.vite
	$(COMPOSE) restart frontend
