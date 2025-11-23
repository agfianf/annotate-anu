# 1. Change Base Image to NVIDIA CUDA (Devel version ensures compatibility with Transformers/PyTorch extensions)
# Note: Use CUDA 12.1 or 12.4 depending on your PyTorch version requirements. 12.1 is widely supported.
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

# 6. Install transformers (and ensure PyTorch uses CUDA)
# Note: If you need specific CUDA PyTorch, you might need to define extra-index-url in pyproject.toml
RUN uv pip install git+https://github.com/huggingface/transformers.git

# Copy application code
COPY src/ ./src/

EXPOSE 8000

# Set Python path
ENV PYTHONPATH=/code/src

# 7. Run application
# We use 'uv run' which ensures the correct python environment is used
CMD ["uv", "run", "app/main.py"]