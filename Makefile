.PHONY: help install run test format lint clean docker-up docker-down docker-logs docker-build

help:
	@echo "SAM3 FastAPI Application - Available Commands"
	@echo "=============================================="
	@echo "install          - Install dependencies with uv"
	@echo "run              - Run application locally"
	@echo "test             - Run tests"
	@echo "format           - Format code with ruff"
	@echo "lint             - Lint code with ruff"
	@echo "clean            - Clean cache and build files"
	@echo ""
	@echo "Docker Commands:"
	@echo "docker-up        - Start all Docker services"
	@echo "docker-down      - Stop all Docker services"
	@echo "docker-logs      - View Docker logs"
	@echo "docker-build     - Rebuild Docker images"
	@echo "docker-restart   - Restart app service"

install:
	uv venv
	@echo "Installing transformers from GitHub (for SAM3 support)..."
	uv pip install git+https://github.com/huggingface/transformers.git
	@echo "Installing dependencies..."
	uv sync

run:
	@echo "Starting SAM3 API..."
	cd src && PYTHONPATH=. uv run python app/main.py

test:
	@echo "Running tests..."
	uv run pytest src/tests/ -v

format:
	@echo "Formatting code..."
	uv run ruff check --fix src/
	uv run ruff format src/

lint:
	@echo "Linting code..."
	uv run ruff check src/

clean:
	@echo "Cleaning cache and build files..."
	find . -type d -name "__pycache__" -exec rm -rf {} +
	find . -type f -name "*.pyc" -delete
	find . -type d -name ".pytest_cache" -exec rm -rf {} +
	find . -type d -name ".ruff_cache" -exec rm -rf {} +

# Docker commands
docker-up:
	@echo "Starting Docker services..."
	docker-compose up -d
	@echo "Services started. API available at http://localhost:8000"
	@echo "Docs available at http://localhost:8000/docs"

docker-down:
	@echo "Stopping Docker services..."
	docker-compose down

docker-logs:
	@echo "Viewing Docker logs..."
	docker-compose logs -f app

docker-build:
	@echo "Building Docker images..."
	docker-compose build

docker-restart:
	@echo "Restarting app service..."
	docker-compose restart app

docker-shell:
	@echo "Opening shell in app container..."
	docker-compose exec app /bin/bash