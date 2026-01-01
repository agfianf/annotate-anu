<div align="center">
  <img src="assets/logo.png" alt="AnnotateANU Logo" width="200"/>

  # AnnotateANU

  Self-hosted image annotation with SAM3-assisted segmentation and BYOM inference.

  AnnotateANU pairs a React/Konva canvas with a FastAPI core for projects, tasks, and exports.
  Run it as a full stack or in solo mode with local storage.

  [![Open Source](https://img.shields.io/badge/Open%20Source-100%25-brightgreen)](https://github.com/agfianf/annotate-anu.git)
  [![Privacy](https://img.shields.io/badge/Privacy-Self%20Hosted-blue)](https://github.com/agfianf/annotate-anu.git)
  [![Powered by SAM3](https://img.shields.io/badge/Powered%20by-Meta%20SAM3-0467DF)](https://huggingface.co/facebook/sam3)

  [Get Started](#quick-start) · [API Docs](#api-docs) · [Report Bug](https://github.com/agfianf/annotate-anu/issues)
</div>

---

## Overview

AnnotateANU is a full-stack image annotation platform for computer vision datasets.
It includes a SAM3 inference service, a core API for workflow and data management,
and a React/Konva UI for annotation, exploration, and exports.

## Features

- Annotation canvas with rectangle/polygon tools, selection, vertex editing, zoom/pan/autofit, undo/redo, and shortcuts.
- SAM3 text and bbox prompts with single, auto-apply, and batch modes; BYOM proxy with auto-detect support.
- Projects, tasks, and jobs with train/val/test splits, job chunking, assignment, status tracking, and archiving.
- Project setup: README editor, labels with colors, annotation type toggles, allowed models, and team members.
- File share browser with uploads, shared image registry, and a project image pool.
- Explore view with a virtualized gallery, tags and categories, attribute/size/path filters, bulk tagging, and analytics panels.
- Exports: local COCO/YOLO from the annotation app; server-side exports (COCO JSON, manifest CSV, image folders) with saved filters and history.
- JWT auth with role-based access and admin user management.

## Demo

| Demo | GIF | Description |
| --- | --- | --- |
| Landing | ![Landing page demo](assets/landing_page.gif) | Marketing landing and onboarding. |
| Annotation workflow | ![Annotation tools demo](assets/features.gif) | Prompt, mask, edit, and export in the canvas. |

## Architecture

```mermaid
flowchart LR
  user[Annotator] --> web["Web UI (React + Konva)"]
  web --> core["API Core (FastAPI)"]

  core --> inference["SAM3 Inference API"]
  inference --> sam3["SAM3 Model (HF Transformers)"]
  core -.-> byom["BYOM Endpoints"]

  core --> db[(PostgreSQL)]
  core --> redis[(Redis)]
  core --> storage["File Share + Export Storage"]
  core --> worker["Celery Worker"]
```

## Services (dev stack)

| Service | Responsibility | Port |
| --- | --- | --- |
| Web app | Annotation UI, dashboards, explore, exports | 5173 |
| API Core | Auth, projects, tasks, jobs, model registry, exports | 8001 |
| SAM3 Inference API | Text, bbox, batch segmentation | 8000 |
| API Core Worker | Export jobs and background tasks | - |
| PostgreSQL | Core data store | 5432 |
| Redis | Cache and task queue | 6379 |

## Modes

- Solo (`docker/docker-compose.solo.yml`): SAM3 + web UI only, local IndexedDB storage, no API core or auth.
- Dev (`docker/docker-compose.dev.yml`): full stack with hot reload (API core, worker, Postgres, Redis).
- Team (`docker/docker-compose.team.yml`): full stack behind Traefik with production-style routing.

## Quick Start

### Prerequisites

- Docker + Docker Compose
- HuggingFace token for `facebook/sam3` (model access is gated)

### Configure env files

```bash
cp apps/api-inference/.env.example apps/api-inference/.env
cp apps/api-core/.env.example apps/api-core/.env
cp apps/web/.env.example apps/web/.env
```

Add your HuggingFace token:

```bash
HF_TOKEN=hf_your_token_here
```

### Start the dev stack

```bash
make docker-up
```

Services:
- Web: http://localhost:5173
- SAM3 API docs: http://localhost:8000/docs
- API Core docs: http://localhost:8001/docs

### Solo mode (local annotation only)

```bash
make docker-up-solo
```

Open http://localhost:3000/annotation for local-only annotation with IndexedDB storage.

### Team mode (Traefik + full stack)

```bash
make docker-up-team
```

Frontend is available at http://localhost and Traefik at http://localhost:8080.

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

## Configuration

- `apps/api-inference/.env`
  - `HF_TOKEN` (required)
  - `SAM3_DEVICE` (`auto`, `cpu`, `cuda`)
  - `MAX_IMAGE_SIZE_MB`, `MAX_BATCH_SIZE`
- `apps/api-core/.env`
  - `DATABASE_URL`, `DATABASE_URL_SYNC`
  - `REDIS_URL`
  - `SAM3_API_URL`
  - `JWT_SECRET_KEY`
- `apps/web/.env`
  - `VITE_SAM3_API_URL`
  - `VITE_CORE_API_URL`

## API Docs

- SAM3 Inference API: http://localhost:8000/docs
- API Core: http://localhost:8001/docs
