# CLAUDE.md

**AnnotateANU** — self-hosted image annotation. SAM3-assisted segmentation plus BYOM inference, a React/Konva canvas, and two FastAPI services.

## Architecture

Three apps in `apps/`, run together by `docker/docker-compose.dev.yml`:

| Path | Responsibility | Compose service | Container | Host port → container port |
| --- | --- | --- | --- | --- |
| `apps/api-inference` | SAM3 segmentation: text, bbox, and batch prompts | `backend` | `anu-backend-inference-dev` | 18710 → 8000 |
| `apps/api-core` | Auth, projects, tasks, jobs, analytics, BYOM registry, exports | `api-core` | `anu-api-core-dev` | 18711 → 8001 |
| `apps/web` | React 18 + Vite + TypeScript + Tailwind + Konva UI | `frontend` | `anu-frontend-dev` | 18712 → 5173 |

Also running: `anu-api-core-worker-dev` (Celery), `anu-postgres-dev` (5432), `anu-redis-dev` (internal only).

Things you cannot infer from the code:

- **Host ports are deliberately off the defaults** (8000 / 8001 / 5173) to avoid colliding with other stacks on this machine. Container-internal ports are unchanged, so service-to-service URLs like `SAM3_API_URL=http://backend:8000` keep the internal port. Only host-facing URLs use the 1871x block.
- **Compose service names ≠ container names.** `make docker-*` and `docker-compose` take `backend` / `api-core` / `frontend`; `docker logs` and `docker exec` take `anu-*`.
- **Postgres is used in every mode, including dev.** There is no SQLite path despite what older docs claim.
- **The web app talks to both backends directly.** Annotation prompts go to SAM3 via `VITE_SAM3_API_URL`; everything else goes to api-core via `VITE_CORE_API_URL`. api-core has its own inference proxy, used for BYOM endpoints.
- **GPU-first.** The dev compose reserves an nvidia device for `backend`. `SAM3_DEVICE=auto` falls back to CPU, which is very slow.

## Commands

Run from the repo root. `make help` lists all targets.

```bash
make docker-up                       # start the dev stack — the normal way to run this project
make docker-down
make docker-rebuild                  # build → down → up
make docker-rebuild-service service=frontend   # rebuild and restart one service
make docker-logs service=backend     # backend | api-core | api-core-worker | frontend | postgres | redis
make docker-restart service=frontend
make docker-shell service=api-core
make frontend-clear-cache            # clear Vite cache and restart the frontend container
```

Quality gates:

```bash
make core-format                     # ruff format, api-core
make core-lint                       # ruff check, api-core
make core-test                       # pytest, api-core
make backend-format                  # ruff format, api-inference
make backend-lint                    # ruff check, api-inference
cd apps/web && npm run lint          # eslint
cd apps/web && npm run build         # tsc -b && vite build
```

- `npm run build` is the **only** frontend typecheck — there is no separate `typecheck` script. Run it after any non-trivial frontend change.
- `apps/web` requires **Node >= 22.12.0** (`engines` in `package.json`, and the `frontend-*` and `install` Makefile targets run a `check-node` guard). This host's default `node` is v18, so on the host run `nvm use 22` first, or run `npm run build` / `npm run lint` inside the container via `make docker-shell service=frontend`.
- `make backend-test` is currently broken: it runs `pytest src/tests/` in `apps/api-inference`, and that directory does not exist. Only `apps/api-core/src/tests` has tests.

## Required configuration

`HF_TOKEN` in `apps/api-inference/.env` is mandatory. `facebook/sam3` is a gated model and the service will not start without it — request access at https://huggingface.co/facebook/sam3.

Exact env var names, which are easy to get wrong:

| File | Variables |
| --- | --- |
| `apps/api-inference/.env` | `HF_TOKEN`, `SAM3_MODEL_NAME`, `SAM3_DEVICE` (`auto`/`cuda`/`cpu`), `MAX_IMAGE_SIZE_MB` |
| `apps/api-core/.env` | `DATABASE_URL`, `DATABASE_URL_SYNC`, `REDIS_URL`, `SAM3_API_URL`, `JWT_SECRET_KEY`, `CORS_ORIGINS` |
| `apps/web/.env` | `VITE_SAM3_API_URL`, `VITE_CORE_API_URL`, `VITE_ENV` |

- It is `JWT_SECRET_KEY`, not `JWT_SECRET`.
- `VITE_*` values are baked into the browser bundle, so they must be host-reachable URLs (`http://localhost:18711`), never container names.
- `apps/web/src/lib/classification-client.ts` reads `VITE_API_CORE_URL`, while every other client reads `VITE_CORE_API_URL`. That variable is unset, so the client falls back to a hardcoded `http://localhost:8001` — a port nothing listens on any more. **Use `VITE_CORE_API_URL` in new code**; fixing the existing typo is a pending cleanup.
- Changing a host port means updating four places in lockstep: `ports:` in `docker/docker-compose.dev.yml`, `apps/web/.env`, `CORS_ORIGINS` (in *both* the compose override and `apps/api-core/.env`), and the URLs echoed by the `Makefile`.

## Conventions

- **Routing is code-based.** TanStack Router routes are declared by hand in `apps/web/src/routes/__root.tsx`. There is no file-based route generation — a new page is not reachable until you add a `createRoute()` entry and wire it into `routeTree`.
- **Never build a new color picker.** Use `apps/web/src/components/ui/ColorPickerPopup.tsx` for every color selection UI.
- **Backend layering is Router → Service → Repository → Model.** Do not query the database from a router.
- Alembic migrations live in `apps/api-core/src/migrations`; run `alembic` from `apps/api-core/src` inside the api-core container.
- Design and implementation plans go in `.claude/plans/` (the `brainstorming` skill writes `<topic>-design.md` there).
- Never add AI attribution (`Co-Authored-By` trailers, "Generated with" footers) to commits or PRs.

Path-scoped detail lives in `.claude/rules/` and loads automatically when you open matching files: `frontend.md` for `apps/web/**`, `backend.md` for the two API apps. `AGENTS.md` is only a pointer to this file for other agent harnesses; keep project guidance here.

## Docs

- `docs/README.md` — documentation index
- `docs/development/getting-started.md`, `docs/development/byom-integration.md`, `docs/development/api-specs.md`
- `docs/architecture/` — system overview, database schema, canvas and sync design
- `docs/features/quality-metrics-workflow.md` — image quality pipeline
- `docker/README.md` — deployment modes (dev / solo / team; team adds Traefik and MinIO)
- Live API references: http://localhost:18710/docs (SAM3) and http://localhost:18711/docs (api-core)
