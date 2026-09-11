# 1. Change Base Image to NVIDIA CUDA (Devel version ensures compatibility with Transformers/PyTorch extensions)
# Note: torch ships its own CUDA runtime as nvidia-*-cu12 wheels, so this base image
# mainly supplies the toolchain, not the runtime torch uses.
# torch is pinned to <2.11 in pyproject.toml because 2.11+ default wheels are CUDA 13
# (nvidia-*-cu13) and need an NVIDIA driver >= 580.65; this deployment runs driver 550.
# Keep that cap, this base image, and the host driver consistent when bumping torch.
FROM nvidia/cuda:12.1.0-devel-ubuntu22.04

WORKDIR /code

# 2. Install system dependencies
# We need software-properties-common to install Python easily if needed, 
# but 'uv' can actually manage Python for us.
RUN apt-get update && apt-get install -y \
    git \
    curl \
    ca-certificates \
    libsndfile1 \
    && rm -rf /var/lib/apt/lists/*

# 3. Install uv package manager
COPY --from=ghcr.io/astral-sh/uv:0.9.11 /uv /uvx /bin/

# 4. Configure uv to install Python 3.12 automatically
# Since the base image is Ubuntu without Python 3.12, uv will fetch it.
ENV UV_PYTHON=3.12
ENV UV_COMPILE_BYTECODE=1

# 5. Install dependencies
# Using --frozen ensures we respect the lockfile
RUN --mount=type=bind,source=uv.lock,target=uv.lock \
    --mount=type=bind,source=pyproject.toml,target=pyproject.toml \
    uv sync --frozen --no-cache

# 6. transformers is now a normal locked dependency in pyproject.toml (>=5.14.1),
# so it is installed by the `uv sync` above. It used to be installed here from
# git main, which meant every rebuild pulled an unpinned snapshot and silently
# overrode the lockfile. Sam3Model / Sam3Processor have been in stable
# transformers since 5.0, so the git install is no longer needed.
# Do not reintroduce a `uv pip install` here without also updating uv.lock.

# Copy application code
COPY src/ ./src/

EXPOSE 8000

# Set Python path
ENV PYTHONPATH=/code/src

# 7. Run application
# Run uvicorn directly: `app/main.py` honours DEBUG=true from .env by starting a
# reloader, which in a container means watching a bind mount and reloading the
# multi-GB model on every file touch. Compose files override this command anyway.
CMD ["uv", "run", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]