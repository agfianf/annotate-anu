# Getting Started

This guide shows how to run AnnotateANU with Docker or locally.

## Prerequisites

- Docker + Docker Compose
- HuggingFace token for `facebook/sam3`
- Local dev only: Node.js 18+ and Python 3.12+

## Quick Start (Docker dev stack)

```bash
cp apps/api-inference/.env.example apps/api-inference/.env
cp apps/api-core/.env.example apps/api-core/.env
cp apps/web/.env.example apps/web/.env
```

Add your HuggingFace token in `apps/api-inference/.env`:

```bash
HF_TOKEN=hf_your_token_here
```

Start the stack:

```bash
make docker-up
```

Open:

- Web UI: http://localhost:5173
- SAM3 API docs: http://localhost:8000/docs
- API Core docs: http://localhost:8001/docs

Services started: web, api-core, api-core-worker, postgres, redis, sam3 inference.

## Local Development (no Docker)

```bash
# SAM3 inference
make backend-install
make backend-run

# API core
make core-install
make core-run

# Web app
make frontend-install
make frontend-dev
```

## Common Commands

```bash
make docker-logs                     # All services
make docker-logs service=backend     # SAM3 inference logs
make docker-logs service=api-core    # API core logs
make docker-logs service=frontend    # Web UI logs

make docker-down                     # Stop dev stack
make docker-rebuild                  # Build -> down -> up
```

## Troubleshooting

### SAM3 fails to load

- Confirm `HF_TOKEN` is set in `apps/api-inference/.env`.
- Verify access to https://huggingface.co/facebook/sam3.

### Frontend cannot reach APIs

- Check `VITE_SAM3_API_URL` and `VITE_CORE_API_URL` in `apps/web/.env`.
- Confirm `make docker-up` is running.

### Port conflicts

```bash
make docker-down
```

If a port is still in use, stop the conflicting container or process.
