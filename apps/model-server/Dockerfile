# Slim base: the NVIDIA container runtime injects the host driver, and torch's
# pip wheels bundle their own CUDA runtime, so no CUDA toolkit is needed here.
FROM python:3.12-slim

WORKDIR /code

RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

COPY --from=ghcr.io/astral-sh/uv:0.9.11 /uv /uvx /bin/

ENV UV_COMPILE_BYTECODE=1

RUN --mount=type=bind,source=pyproject.toml,target=pyproject.toml \
    uv sync --no-cache

COPY src/ ./src/

EXPOSE 8002

ENV PYTHONPATH=/code/src
ENV MODELS_DIR=/code/models

CMD ["uv", "run", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8002"]
