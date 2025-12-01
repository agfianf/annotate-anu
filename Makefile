.PHONY: help dev install clean \
        backend-install backend-run backend-test backend-format backend-lint \
        core-install core-run core-test core-format core-lint \
        frontend-install frontend-dev frontend-build \
        docker-up docker-down docker-logs docker-build docker-restart docker-shell \
        docker-up-solo docker-down-solo docker-up-team docker-down-team

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
	@echo "Frontend Commands:"
	@echo "  frontend-install - Install frontend dependencies with npm"
	@echo "  frontend-dev     - Run frontend dev server"
	@echo "  frontend-build   - Build frontend for production"
	@echo ""
	@echo "Docker Commands:"
	@echo "  docker-up        - Start development environment (hot-reload)"
	@echo "  docker-down      - Stop development services"
	@echo "  docker-up-solo   - Start SOLO mode (minimal, IndexedDB storage)"
	@echo "  docker-down-solo - Stop SOLO mode services"
	@echo "  docker-up-team   - Start TEAM mode (full stack: Postgres, MinIO, Redis, Workers)"
	@echo "  docker-down-team - Stop TEAM mode services"
	@echo "  docker-logs      - View logs (usage: make docker-logs service=backend|api-core|frontend)"
	@echo "  docker-build     - Rebuild all Docker images"
	@echo "  docker-restart   - Restart services (usage: make docker-restart service=backend|api-core|frontend)"
	@echo "  docker-shell     - Open shell in container (usage: make docker-shell service=backend|api-core|frontend)"

# Development
dev:
	@echo "Starting development environment..."
	@echo "This will start both backend and frontend services using Docker Compose"
	docker-compose -f docker/docker-compose.dev.yml up

install:
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
	@cd apps/api-inference && uv pip install git+https://github.com/huggingface/transformers.git
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
frontend-install:
	@echo "Installing frontend dependencies..."
	@cd apps/web && npm install
	@echo "✓ Frontend dependencies installed"

frontend-dev:
	@echo "Starting frontend dev server..."
	@cd apps/web && npm run dev

frontend-build:
	@echo "Building frontend for production..."
	@cd apps/web && npm run build

# Docker commands
docker-up:
	@echo "Starting Docker services (development mode)..."
	docker-compose -f docker/docker-compose.dev.yml up -d
	@echo ""
	@echo "✓ Services started:"
	@echo "  Backend API (SAM3): http://localhost:8000"
	@echo "  Backend Docs: http://localhost:8000/docs"
	@echo "  API Core (BYOM): http://localhost:8001"
	@echo "  API Core Docs: http://localhost:8001/docs"
	@echo "  Frontend: http://localhost:5173"
	@echo "  Redis: localhost:6379 (internal)"

docker-down:
	@echo "Stopping Docker services..."
	docker-compose -f docker/docker-compose.dev.yml down

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
	docker-compose -f docker/docker-compose.dev.yml logs -f $(service)
else
	@echo "Viewing all logs..."
	docker-compose -f docker/docker-compose.dev.yml logs -f
endif

docker-build:
	@echo "Building Docker images..."
	docker-compose -f docker/docker-compose.dev.yml build

docker-restart:
ifdef service
	@echo "Restarting $(service) service..."
	docker-compose -f docker/docker-compose.dev.yml restart $(service)
else
	@echo "Restarting all services..."
	docker-compose -f docker/docker-compose.dev.yml restart
endif

docker-shell:
ifdef service
	@echo "Opening shell in $(service) container..."
	docker-compose -f docker/docker-compose.dev.yml exec $(service) sh
else
	@echo "Error: Please specify service (e.g., make docker-shell service=backend)"
endif
