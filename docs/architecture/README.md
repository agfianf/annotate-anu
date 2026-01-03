# Architecture

AnnotateANU is a full-stack system for image annotation with AI-assisted segmentation.
It combines a React/Konva UI, a core API for collaboration and data management, and a
separate inference service for SAM3.

## Components

- Web UI (React, Konva, TanStack Router)
- API Core (FastAPI, SQLAlchemy, Alembic)
- API Core Worker (Celery)
- SAM3 Inference API (FastAPI + HF Transformers)
- PostgreSQL (primary data store)
- Redis (cache, queue)
- File share storage (`/data/share`) and export storage (`/data/exports`)

## Supported Stack

The supported runtime is the Docker dev stack in `docker/docker-compose.dev.yml`
with the services listed above.

## Request Flows

### Inference

1. UI selects a model (SAM3 or BYOM).
2. UI calls API Core `/api/v1/inference/*`.
3. API Core proxies to SAM3 or the BYOM endpoint and normalizes the response.

### Annotation Sync (job mode)

1. UI stores edits locally and marks pending changes.
2. Auto-save batches create/update/delete operations by image.
3. API Core persists to Postgres and returns updated IDs.

See `docs/architecture/annotation-sync.md` for details.

### Exports

1. User configures an export in Project > Explore.
2. API Core creates an export record and enqueues a Celery task.
3. Worker builds artifacts and updates status/history.

See `docs/features/export-workflow.md` for details.

## Data Management: Labels and Tags

The system organizes image tagging through a hierarchical Labels/Tags structure with
a constraint that enforces data quality.

### Label Hierarchy

- **Labels** (formerly "Categories") are top-level groupings for tags (e.g., "Weather", "Scene Type")
- **Tags** belong to exactly one Label (e.g., "Sunny", "Cloudy" under "Weather")
- A special **Uncategorized** Label exists for tags that don't fit a specific grouping

### One Tag Per Label Constraint

To prevent conflicting classifications, the system enforces a rule:
**Only one tag from each Label can be applied to an image** (except Uncategorized).

For example, if an image has the tag "Sunny" from the "Weather" Label, adding "Cloudy"
from the same Label will automatically replace "Sunny".

### Implementation

The constraint is optimized for O(1) conflict detection through denormalization:

```
shared_image_tags
├── shared_image_id (FK)
├── tag_id (FK)
├── category_id (FK, denormalized)  ← Enables fast conflict lookup
└── Composite index: (project_id, shared_image_id, category_id)
```

- **Single tag operations**: Auto-replace with toast notification
- **Bulk operations**: Preview conflicts before confirmation
- The `is_uncategorized` flag on Labels exempts Uncategorized tags from the constraint

See `docs/architecture/database-schema.dbml` for the full schema.

## Related Docs

- Annotation sync: `docs/architecture/annotation-sync.md`
- Canvas architecture: `docs/architecture/hybrid-canvas.md`
- Pixi experiments: `docs/architecture/pixi-performance.md`
- Database schema: `docs/architecture/database-schema.dbml`

## Diagrams

- System overview: `docs/architecture/system-overview.mmd`
- Collaboration flow: `docs/architecture/collaboration-workflow.mmd`
