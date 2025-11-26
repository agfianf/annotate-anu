.PHONY: help dev install clean \
        backend-install backend-run backend-test backend-format backend-lint \
        frontend-install frontend-dev frontend-build \
        docker-up docker-down docker-logs docker-build docker-restart docker-shell \
        turbo-dev turbo-build turbo-lint

help:
	@echo "SAM3 Annotation Platform - Turborepo Monorepo"
	@echo "=============================================="
	@echo ""
	@echo "Turborepo Commands (Recommended):"
	@echo "  turbo-dev        - Run all apps in dev mode with Turbo"
	@echo "  turbo-build      - Build all apps with Turbo caching"
	@echo "  turbo-lint       - Lint all apps"
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
	@echo "Frontend Commands:"
	@echo "  frontend-install - Install frontend dependencies with npm"
	@echo "  frontend-dev     - Run frontend dev server"
	@echo "  frontend-build   - Build frontend for production"
	@echo ""
	@echo "Docker Commands:"
	@echo "  docker-up        - Start all services with Docker Compose"
	@echo "  docker-down      - Stop all services"
	@echo "  docker-logs      - View logs (usage: make docker-logs service=backend|frontend)"
	@echo "  docker-build     - Rebuild all Docker images"
	@echo "  docker-restart   - Restart services (usage: make docker-restart service=backend|frontend)"
	@echo "  docker-shell     - Open shell in container (usage: make docker-shell service=backend|frontend)"

# Turborepo commands
turbo-dev:
	@echo "Starting all apps with Turborepo..."
	npm run dev

turbo-build:
	@echo "Building all apps with Turborepo..."
	npm run build

turbo-lint:
	@echo "Linting all apps with Turborepo..."
	npm run lint

# Development
dev:
	@echo "Starting development environment..."
	@echo "This will start both backend and frontend services using Docker Compose"
	docker-compose up

install:
	@echo "Installing root dependencies..."
	npm install
	@echo "Installing workspace dependencies..."
	npm install --workspaces
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
	@echo "Cleaning packages..."
	@cd packages/shared-types && rm -rf dist 2>/dev/null || true
	@echo "Cleaning root..."
	@rm -rf node_modules 2>/dev/null || true
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
	@echo "Starting Docker services..."
	docker-compose up -d
	@echo ""
	@echo "✓ Services started:"
	@echo "  Backend API: http://localhost:8000"
	@echo "  API Docs: http://localhost:8000/docs"
	@echo "  Frontend: http://localhost:5173"

docker-down:
	@echo "Stopping Docker services..."
	docker-compose down

docker-logs:
ifdef service
	@echo "Viewing logs for $(service)..."
	docker-compose logs -f $(service)
else
	@echo "Viewing all logs..."
	docker-compose logs -f
endif

docker-build:
	@echo "Building Docker images..."
	docker-compose build

docker-restart:
ifdef service
	@echo "Restarting $(service) service..."
	docker-compose restart $(service)
else
	@echo "Restarting all services..."
	docker-compose restart
endif

docker-shell:
ifdef service
	@echo "Opening shell in $(service) container..."
	docker-compose exec $(service) sh
else
	@echo "Error: Please specify service (e.g., make docker-shell service=backend)"
endif
