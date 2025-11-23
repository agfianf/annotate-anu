# SAM3 FastAPI Application Dockerfile
FROM python:3.12-slim

WORKDIR /code

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    g++ \
    git \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install uv package manager
# Install the application dependencies
COPY --from=ghcr.io/astral-sh/uv:0.9.11 /uv /uvx /bin/
RUN --mount=type=bind,source=uv.lock,target=uv.lock \
    --mount=type=bind,source=pyproject.toml,target=pyproject.toml \
    uv sync --frozen --no-cache

# Install transformers from GitHub (for SAM3 support)
RUN uv pip install git+https://github.com/huggingface/transformers.git

# Copy application code
COPY src/ ./src/

# Expose port
EXPOSE 8000

# Set Python path
ENV PYTHONPATH=/code/src

# Run application
CMD ["uv", "run", "app/main.py"]
