#!/usr/bin/env python
"""Repeatable latency harness for the explore gallery's server-side paths (finding G04).

What this is, and what it is not. G04 asks for a baseline taken *before* the gallery work changed anything. That baseline does not exist and cannot be recovered. What this harness produces instead is a **before/after comparison**: none of the gallery work is committed, so `29faf03` — still `HEAD` — is the "before" revision and the working tree is the "after". Point the harness at a git worktree checked out at the old revision and it drives both sides against one seeded database.

Design notes that matter for reading the numbers:

* **The database is a throwaway `postgres:16-alpine` testcontainer**, migrated with this repository's own alembic scripts. The dev stack's Postgres is never touched: the pool has to be reproducible, and a shared instance under concurrent load is neither.
* **Both revisions run against the same rows.** The driver seeds once; two long-lived worker processes, one per revision, connect to it. `app.*` resolves to a different `src` tree in each worker because `PYTHONPATH` says so, which is the only way to have two incompatible copies of the same package in one benchmark.
* **Measurements are interleaved, not batched.** The host this was written for runs other Docker stacks, sits at a load average near 2.5, and has its CPU governor on `powersave`, so a run of A followed by a run of B would hand whichever ran during a quiet minute an advantage it did not earn. Every repetition alternates revisions, and the order within the pair flips each repetition, so drift and first-mover cache effects hit both sides equally.
* **Cold and warm are separated.** A "cold" sample is the first call on a freshly created engine, pool and connection; the workers reconnect before each cold repetition. A "warm" sample reuses the connection. Cold is repeated too — a single cold sample is noise, not a result.
* **Not every operation exists on both sides.** The old revision's sidebar handler accepts `tag_ids` and nothing else, and its analytics handlers materialise at most 10 000 image rows before aggregating in Python. Those cells are recorded with `comparable: false` and a reason, because the two revisions are answering different questions there and comparing their latency alone would be misleading.

## Running it

    cd apps/api-core
    git worktree add /tmp/bench-baseline 29faf03
    .venv/bin/python bench/bench_explore.py \
        --old-src /tmp/bench-baseline/apps/api-core/src \
        --out /tmp/api-results.json

Needs Docker (for the testcontainer) and the api-core virtualenv (`sqlalchemy`, `asyncpg`, `alembic`, `testcontainers`). Seeding the four pools takes under a minute and the measurement about eight more at the default repetition counts (the run these defaults produced took 7 min 46 s). `--warm-reps` / `--cold-reps` trade runtime for confidence; `--only` restricts to named operations while iterating. Drop `--old-src` to measure the current revision alone.

`--role worker` is the internal subprocess entry point and is not meant to be invoked by hand.
"""

from __future__ import annotations

import argparse
import json
import math
import os
import platform
import subprocess
import sys
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path

BENCH_DIR = Path(__file__).resolve().parent
API_CORE_DIR = BENCH_DIR.parent
DEFAULT_NEW_SRC = API_CORE_DIR / "src"

# ---------------------------------------------------------------------------
# Dataset shapes
# ---------------------------------------------------------------------------
# Four pools. G04's acceptance check asks for small, large and annotation-heavy; the plan's
# validation table adds a 100 001-image fixture, which is here because the deep-page question
# cannot be settled at 10 100 rows.
#
# `large` is 10 100 rather than 10 000 on purpose. The pre-change analytics handlers paged the
# filtered set at `page_size=10000` and aggregated the resulting Python list, so a pool of exactly
# 10 000 would hide the truncation; 100 rows above the cap makes the old and new answers visibly
# different numbers rather than only different code.
DATASETS = {
    "small": {
        "images": 100,
        "tagged": 40,
        "quality": 60,
        "annotated_images": 25,
        "boxes_per_image": 4,
        "polygons_per_image": 2,
        "dense_images": 0,
        "dense_boxes": 0,
        "dense_polygons": 0,
    },
    "large": {
        "images": 10_100,
        "tagged": 7_000,
        "quality": 5_000,
        "annotated_images": 2_000,
        "boxes_per_image": 3,
        "polygons_per_image": 1,
        "dense_images": 0,
        "dense_boxes": 0,
        "dense_polygons": 0,
    },
    # Annotation-heavy: every image carries geometry, and 100 of them carry more than the
    # 100-box / 50-polygon per-image preview caps, so the truncation path is exercised.
    "annotation_heavy": {
        "images": 2_000,
        "tagged": 800,
        "quality": 1_000,
        "annotated_images": 2_000,
        "boxes_per_image": 12,
        "polygons_per_image": 3,
        "dense_images": 100,
        "dense_boxes": 250,
        "dense_polygons": 120,
    },
    # The plan's validation table names 100 001 images as the largest fixture. Its job here is the
    # deep-page question — whether offset pagination degrades — which 10 100 rows cannot answer,
    # since an offset scan of 10 000 rows is cheap on any plan. No annotations and no quality
    # metrics: this pool exists to make the offset large, not to make the joins wide.
    "huge": {
        "images": 100_001,
        "tagged": 50_000,
        "quality": 0,
        "annotated_images": 0,
        "boxes_per_image": 0,
        "polygons_per_image": 0,
        "dense_images": 0,
        "dense_boxes": 0,
        "dense_polygons": 0,
    },
}

PAGE_SIZE = 100
POLYGON_POINTS = 40


# ---------------------------------------------------------------------------
# Benchmark plan
# ---------------------------------------------------------------------------
def build_plan(dataset_info: dict) -> list[dict]:
    """Every (dataset, operation) cell to measure, with the parameters each one needs."""
    plan: list[dict] = []
    for name, info in dataset_info.items():
        total = info["images"]
        tag_id = info["tag_id"]
        last_page = max(1, math.ceil(total / PAGE_SIZE))
        common = {"dataset": name, "project_id": info["project_id"]}

        plan.append({**common, "op": "explore_page1", "params": {"page": 1}})
        plan.append(
            {
                **common,
                "op": "explore_deep_page",
                "params": {"page": last_page},
                "note": f"offset {(last_page - 1) * PAGE_SIZE} of {total}",
            }
        )
        plan.append(
            {
                **common,
                "op": "explore_page1",
                "variant": "filtered_tag_and_width",
                "params": {"page": 1, "filters": {"tag_ids": [tag_id], "width_min": 200}},
            }
        )
        plan.append(
            {
                **common,
                "op": "explore_page1",
                "variant": "filtered_search",
                "params": {"page": 1, "filters": {"search": "0001"}},
                "note": "substring search, the filter a user retypes on every keystroke",
            }
        )
        plan.append(
            {
                **common,
                "op": "explore_page1",
                "variant": "filtered_several_facets",
                "params": {
                    "page": 1,
                    "filters": {
                        "tag_ids": [tag_id],
                        "width_min": 200,
                        "quality_min": 0.4,
                        "is_annotated": True,
                    },
                },
                "note": "tag, dimension, quality and annotation status at once",
            }
        )
        # The dense images are seeded first and the gallery orders by filename, so page 1 of the
        # annotation-heavy pool is a page made entirely of images above the preview caps: the worst
        # page the gallery can ask for. Page 5 of the same pool is an ordinary page, and both are
        # measured, because reporting only the worst one would overstate the typical cost.
        pages = {"geometry": 1}
        if info["images_above_preview_caps"]:
            pages["geometry_typical_page"] = 5
        for label, page in pages.items():
            plan.append(
                {
                    **common,
                    "op": "explore_page_with_summaries",
                    "variant": f"{label}_on",
                    "params": {"page": page, "include_bboxes": True, "include_polygons": True},
                    "note": f"page {page}"
                    + (
                        " (every image above the preview caps)"
                        if page == 1 and info["images_above_preview_caps"]
                        else ""
                    ),
                }
            )
            plan.append(
                {
                    **common,
                    "op": "explore_page_with_summaries",
                    "variant": f"{label}_off",
                    "params": {"page": page, "include_bboxes": False, "include_polygons": False},
                    "note": f"page {page}",
                }
            )
        if info["images_above_preview_caps"]:
            # Same dense page, same flags, caps lowered by an order of magnitude. If the latency
            # does not move, the per-image cap is not saving any server work — which would mean it
            # is applied after every row has already been fetched and decoded, not in the query.
            plan.append(
                {
                    **common,
                    "op": "explore_page_with_summaries",
                    "variant": "geometry_on_tiny_caps",
                    "params": {
                        "page": 1,
                        "include_bboxes": True,
                        "include_polygons": True,
                        "max_bboxes_per_image": 10,
                        "max_polygons_per_image": 5,
                    },
                    "note": "page 1 with caps at 10 boxes / 5 polygons instead of 100 / 50",
                }
            )
        plan.append({**common, "op": "sidebar", "variant": "unfiltered", "params": {}})
        plan.append(
            {
                **common,
                "op": "sidebar",
                "variant": "filtered",
                "params": {"filters": {"tag_ids": [tag_id], "width_min": 200}},
            }
        )
        plan.append({**common, "op": "export_preview_detection", "params": {}})
        plan.append({**common, "op": "analytics_annotation_coverage", "params": {}})
        plan.append({**common, "op": "analytics_dimension_insights", "params": {}})
    return plan


#: Where the two revisions are not answering the same question. A latency difference in one of
#: these cells is not a speed-up on its own, because the old code is doing less, or something else.
NOT_LIKE_FOR_LIKE = {
    "sidebar": (
        "The pre-change handler binds `tag_ids` only and reports the project total whenever the "
        "filtered set is empty, so in the filtered cell it is running a narrower query than the "
        "new handler and returning a different number."
    ),
    "analytics_annotation_coverage": (
        "The pre-change handler paged the filtered set at `page_size=10000`, materialised those "
        "rows in Python and aggregated them there; the new handler aggregates in SQL over every "
        "matching row. Above 10 000 images the two do not compute the same answer."
    ),
    "analytics_dimension_insights": (
        "Same 10 000-row materialisation cap as annotation coverage; the old numbers are computed "
        "from at most the first 10 000 matching images."
    ),
}


def cell_key(cell: dict) -> str:
    variant = cell.get("variant")
    return f"{cell['dataset']}/{cell['op']}" + (f"/{variant}" if variant else "")


# ===========================================================================
# Worker: runs inside a subprocess with one revision's `src` on PYTHONPATH
# ===========================================================================
class Worker:
    """One revision's code, one long-lived connection, one operation at a time.

    Both revisions expose the same function *names*; they do not expose the same signatures. The
    canonical `ImageFilterParams` contract only exists on the new side, so `_filters` hands the new
    code a model and the old code loose keyword arguments, and the operations that the old side
    cannot express at all return `{"unavailable": ...}` rather than a number that looks comparable.
    """

    def __init__(self, dsn: str):
        self.dsn = dsn
        self.engine = None
        self.conn = None
        try:
            from app.schemas.image_filters import ImageFilterParams  # noqa: F401

            self.canonical_filters = True
        except ImportError:
            self.canonical_filters = False

    # -- connection lifecycle ------------------------------------------------
    async def connect(self) -> dict:
        from sqlalchemy.ext.asyncio import create_async_engine

        await self.close()
        self.engine = create_async_engine(self.dsn, pool_pre_ping=False)
        self.conn = await self.engine.connect()
        return {"ok": True}

    async def close(self) -> dict:
        if self.conn is not None:
            await self.conn.close()
            self.conn = None
        if self.engine is not None:
            await self.engine.dispose()
            self.engine = None
        return {"ok": True}

    # -- filter marshalling --------------------------------------------------
    @staticmethod
    def _decode(raw: dict | None) -> dict:
        raw = dict(raw or {})
        for key in ("tag_ids", "excluded_tag_ids", "image_uids"):
            if raw.get(key):
                raw[key] = [uuid.UUID(v) for v in raw[key]]
        return raw

    def _explore_kwargs(self, raw: dict | None) -> dict:
        """`filters=` on the new revision, loose keyword arguments on the old one."""
        decoded = self._decode(raw)
        if self.canonical_filters:
            from app.schemas.image_filters import ImageFilterParams

            return {"filters": ImageFilterParams(**decoded)}
        return decoded

    def _snapshot(self, raw: dict | None):
        """A `FilterSnapshot` both revisions validate.

        The old schema declares sixteen fields by hand; the new one *is* `ImageFilterParams`. Every
        field used here is present under the same name on both sides, so one dict builds both.
        """
        from app.schemas.export import FilterSnapshot

        return FilterSnapshot(**self._decode(raw))

    # -- operations ----------------------------------------------------------
    async def op_explore_page1(self, project_id: int, params: dict) -> dict:
        from app.repositories.project_image import ProjectImageRepository

        rows, total = await ProjectImageRepository.explore(
            self.conn,
            project_id=project_id,
            page=params.get("page", 1),
            page_size=PAGE_SIZE,
            **self._explore_kwargs(params.get("filters")),
        )
        return {"rows": len(rows), "total": total}

    op_explore_deep_page = op_explore_page1

    async def op_explore_page_with_summaries(self, project_id: int, params: dict) -> dict:
        """The whole `/explore` server path for one page, minus response serialisation.

        This is the measurement G10's `include_bbox` / `include_polygon` flags are about: the page
        query, the batched annotation summary with geometry on or off, and the batched tag lookup.
        `AnnotationSummaryRepository` is byte-identical across the two revisions, so any difference
        between revisions here comes from the page query, not from the summary.
        """
        from app.repositories.annotation import AnnotationSummaryRepository
        from app.repositories.project_image import ProjectImageRepository
        from app.repositories.shared_image import SharedImageRepository

        rows, total = await ProjectImageRepository.explore(
            self.conn,
            project_id=project_id,
            page=params.get("page", 1),
            page_size=PAGE_SIZE,
            **self._explore_kwargs(params.get("filters")),
        )
        image_ids = [row["id"] for row in rows]
        summaries = await AnnotationSummaryRepository.get_summary_for_images(
            self.conn,
            image_ids,
            include_bboxes=params["include_bboxes"],
            include_polygons=params["include_polygons"],
            max_bboxes_per_image=params.get("max_bboxes_per_image", 100),
            max_polygons_per_image=params.get("max_polygons_per_image", 50),
        )
        tags = await SharedImageRepository.get_tags_bulk(self.conn, image_ids, project_id)
        return {
            "rows": len(rows),
            "total": total,
            "bboxes": sum(len(s.get("bboxes") or []) for s in summaries.values()),
            "polygons": sum(len(s.get("polygons") or []) for s in summaries.values()),
            "detection_count": sum(s.get("detection_count", 0) for s in summaries.values()),
            "tagged_rows": sum(1 for v in tags.values() if v),
        }

    @staticmethod
    def _query_defaults(handler) -> dict:
        """Replace FastAPI `Query(...)` defaults with the values they stand for.

        The pre-change handlers declare every filter as a `Query(default=None)` parameter. Calling
        one as a plain function without naming them binds the `Query` marker object itself, which
        then reaches the SQL layer and fails; FastAPI would normally have resolved it. The new
        handlers take the whole filter as one argument and need none of this.
        """
        import inspect

        from fastapi import params as fastapi_params

        resolved = {}
        for name, parameter in inspect.signature(handler).parameters.items():
            default = parameter.default
            if isinstance(default, fastapi_params.Param):
                resolved[name] = None if default.default is ... else default.default
        return resolved

    async def op_sidebar(self, project_id: int, params: dict) -> dict:
        from app.routers.project_images import get_sidebar_aggregations

        raw = params.get("filters") or {}
        extra: dict = {}
        if self.canonical_filters:
            from app.schemas.image_filters import ImageFilterParams

            call = {"filters": ImageFilterParams(**self._decode(raw))}
        else:
            # The pre-change handler binds `tag_ids` and nothing else. Everything else in the filter
            # is silently dropped, which is the defect G11 records; the two revisions are therefore
            # not answering the same question in the filtered cell, and the check below says so.
            call = {"tag_ids": self._decode(raw).get("tag_ids")}
            extra["filters_this_revision_ignores"] = sorted(k for k in raw if k != "tag_ids")

        response = await get_sidebar_aggregations(
            project={"id": project_id},
            connection=self.conn,
            **{**self._query_defaults(get_sidebar_aggregations), **call},
        )
        data = response.data
        if not isinstance(data, dict):
            data = data.model_dump()
        return {
            "total_images": data["total_images"],
            "filtered_images": data["filtered_images"],
            "tag_rows": len(data["tags"]),
            **extra,
        }

    async def op_export_preview_detection(self, project_id: int, params: dict) -> dict:
        from app.schemas.export import ExportCreate
        from app.services.export import ExportService

        preview = await ExportService().preview_export(
            self.conn,
            project_id,
            ExportCreate(
                export_mode="detection",
                output_format="manifest_csv",
                filter_snapshot=self._snapshot(params.get("filters")),
            ),
        )
        return {
            "image_count": preview.image_count,
            "annotation_counts": dict(preview.annotation_counts or {}),
        }

    @staticmethod
    def _fields(data, names: list[str]) -> dict:
        if not isinstance(data, dict):
            data = data.model_dump()
        return {name: data.get(name) for name in names}

    async def op_analytics_annotation_coverage(self, project_id: int, params: dict) -> dict:
        from app.routers.analytics import get_annotation_coverage

        response = await self._call_analytics(get_annotation_coverage, project_id, params)
        return self._fields(response.data, ["total_images", "annotated_images"])

    async def op_analytics_dimension_insights(self, project_id: int, params: dict) -> dict:
        from app.routers.analytics import get_dimension_insights

        response = await self._call_analytics(get_dimension_insights, project_id, params)
        return self._fields(response.data, ["median_width", "median_height", "max_width"])

    async def _call_analytics(self, handler, project_id: int, params: dict):
        if self.canonical_filters:
            from app.schemas.image_filters import ImageFilterParams

            return await handler(
                {"id": project_id},
                self.conn,
                ImageFilterParams(**self._decode(params.get("filters"))),
            )
        return await handler(
            project={"id": project_id},
            connection=self.conn,
            **{**self._query_defaults(handler), **self._decode(params.get("filters"))},
        )

    # -- dispatch ------------------------------------------------------------
    async def run(self, message: dict) -> dict:
        handler = getattr(self, f"op_{message['op']}", None)
        if handler is None:
            return {"unavailable": f"no operation named {message['op']}"}
        started = time.perf_counter()
        try:
            check = await handler(message["project_id"], message.get("params") or {})
        except Exception as exc:  # noqa: BLE001 - reported, not swallowed
            await self._reset()
            return {"error": f"{type(exc).__name__}: {exc}"}
        elapsed_ms = (time.perf_counter() - started) * 1000.0
        await self._reset()
        return {"elapsed_ms": elapsed_ms, "check": check}

    async def _reset(self) -> None:
        """End the read transaction the operation opened, outside the timed region."""
        if self.conn is not None:
            await self.conn.rollback()


def worker_main(dsn: str) -> None:
    import asyncio

    loop = asyncio.new_event_loop()
    worker = Worker(dsn)
    sys.stdout.write(
        json.dumps({"ready": True, "canonical_filters": worker.canonical_filters}) + "\n"
    )
    sys.stdout.flush()
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        message = json.loads(line)
        command = message.get("cmd")
        if command == "quit":
            loop.run_until_complete(worker.close())
            return
        if command == "connect":
            reply = loop.run_until_complete(worker.connect())
        elif command == "run":
            reply = loop.run_until_complete(worker.run(message))
        else:
            reply = {"error": f"unknown command {command!r}"}
        sys.stdout.write(json.dumps(reply, default=str) + "\n")
        sys.stdout.flush()


# ===========================================================================
# Driver
# ===========================================================================
class WorkerHandle:
    """A subprocess pinned to one revision's `src`."""

    def __init__(self, label: str, src: Path, dsn: str, python: str, log_dir: Path):
        self.label = label
        self.src = src
        env = dict(os.environ)
        env["PYTHONPATH"] = str(src)
        env["PYTHONUNBUFFERED"] = "1"
        # Each revision's warnings go to its own file, so a SQLAlchemy warning can be attributed to
        # the revision that emitted it rather than to whichever worker happened to print first.
        log_dir.mkdir(parents=True, exist_ok=True)
        self.log_path = log_dir / f"worker-{label}.log"
        self._log = self.log_path.open("w")
        self.process = subprocess.Popen(
            [python, str(Path(__file__).resolve()), "--role", "worker", "--dsn", dsn],
            cwd=str(src.parent),
            env=env,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=self._log,
            text=True,
            bufsize=1,
        )
        hello = self._read()
        self.canonical_filters = hello.get("canonical_filters")

    def _read(self) -> dict:
        line = self.process.stdout.readline()
        if not line:
            raise RuntimeError(f"worker {self.label} exited unexpectedly")
        return json.loads(line)

    def send(self, message: dict) -> dict:
        self.process.stdin.write(json.dumps(message, default=str) + "\n")
        self.process.stdin.flush()
        return self._read()

    def connect(self) -> None:
        self.send({"cmd": "connect"})

    def quit(self) -> None:
        try:
            self.process.stdin.write(json.dumps({"cmd": "quit"}) + "\n")
            self.process.stdin.flush()
            self.process.wait(timeout=30)
        except Exception:  # noqa: BLE001
            self.process.kill()
        finally:
            self._log.close()


def nearest_rank(samples: list[float], q: float) -> float:
    """Nearest-rank percentile: the smallest sample at or above the qth fraction.

    Chosen over an interpolating estimator because these sample counts are small and every reported
    value should be a measurement that actually happened.
    """
    ordered = sorted(samples)
    index = max(0, math.ceil(q * len(ordered)) - 1)
    return ordered[index]


def summarise(samples: list[float]) -> dict:
    return {
        "n": len(samples),
        "min_ms": round(min(samples), 3),
        "p50_ms": round(nearest_rank(samples, 0.50), 3),
        "p95_ms": round(nearest_rank(samples, 0.95), 3),
        "max_ms": round(max(samples), 3),
        "mean_ms": round(sum(samples) / len(samples), 3),
        "samples_ms": [round(s, 3) for s in samples],
    }


def host_facts() -> dict:
    def read(path: str) -> str | None:
        try:
            return Path(path).read_text().strip()
        except OSError:
            return None

    try:
        load1, load5, load15 = os.getloadavg()
    except OSError:
        load1 = load5 = load15 = None
    cpu_model = None
    try:
        for line in Path("/proc/cpuinfo").read_text().splitlines():
            if line.startswith("model name"):
                cpu_model = line.split(":", 1)[1].strip()
                break
    except OSError:
        pass
    return {
        "platform": platform.platform(),
        "python": sys.version.split()[0],
        "cpu_model": cpu_model,
        "cpu_count": os.cpu_count(),
        "cpu_governor": read("/sys/devices/system/cpu/cpu0/cpufreq/scaling_governor"),
        "loadavg_at_start": [load1, load5, load15],
        "note": "shared developer workstation; other Docker stacks were running during the run",
    }


def seed(sync_url: str) -> dict:
    """Create the three pools. Runs once, from the current revision's models.

    `app.models.*` is unchanged between the two revisions, so seeding from either produces the same
    rows; the driver always uses the new tree because that is where it lives.
    """
    from sqlalchemy import create_engine, insert

    from app.models.annotation import detections, segmentations
    from app.models.data_management import (
        project_images,
        shared_image_tags,
        shared_images,
        tag_categories,
        tags,
    )
    from app.models.image import images as job_images
    from app.models.image_quality import image_quality_metrics
    from app.models.job import jobs
    from app.models.project import labels, projects
    from app.models.task import tasks
    from app.models.user import users

    engine = create_engine(sync_url)
    info: dict = {}
    widths = [160, 320, 640, 1280]
    with engine.begin() as conn:
        owner = conn.execute(
            insert(users)
            .values(
                email=f"bench-{uuid.uuid4()}@example.test",
                username=f"bench-{uuid.uuid4()}",
                hashed_password="x",
                full_name="bench owner",
                role="admin",
            )
            .returning(users.c.id)
        ).scalar_one()

        for name, shape in DATASETS.items():
            project_id = conn.execute(
                insert(projects)
                .values(name=f"bench-{name}", slug=f"bench-{name}-{uuid.uuid4()}", owner_id=owner)
                .returning(projects.c.id)
            ).scalar_one()

            count = shape["images"]
            rows = [
                {
                    "file_path": f"{name}/{index // 500:03d}/{index:06d}.jpg",
                    "filename": f"{index:06d}.jpg",
                    "width": widths[index % len(widths)],
                    "height": 720,
                    "aspect_ratio": widths[index % len(widths)] / 720,
                    "file_size_bytes": widths[index % len(widths)] * 900,
                }
                for index in range(count)
            ]
            image_ids: list = []
            for start in range(0, len(rows), 10_000):
                chunk = rows[start : start + 10_000]
                image_ids.extend(
                    row[0]
                    for row in conn.execute(
                        insert(shared_images).returning(shared_images.c.id), chunk
                    ).fetchall()
                )
            for start in range(0, len(image_ids), 10_000):
                conn.execute(
                    insert(project_images),
                    [
                        {"project_id": project_id, "shared_image_id": i}
                        for i in image_ids[start : start + 10_000]
                    ],
                )

            category_id = conn.execute(
                insert(tag_categories)
                .values(project_id=project_id, name="bench")
                .returning(tag_categories.c.id)
            ).scalar_one()
            tag_id = conn.execute(
                insert(tags)
                .values(project_id=project_id, category_id=category_id, name="bench-tag")
                .returning(tags.c.id)
            ).scalar_one()
            tagged = image_ids[: shape["tagged"]]
            for start in range(0, len(tagged), 10_000):
                conn.execute(
                    insert(shared_image_tags),
                    [
                        {
                            "project_id": project_id,
                            "shared_image_id": i,
                            "tag_id": tag_id,
                            "category_id": category_id,
                        }
                        for i in tagged[start : start + 10_000]
                    ],
                )

            if shape["quality"]:
                conn.execute(
                    insert(image_quality_metrics),
                    [
                        {
                            "shared_image_id": image_id,
                            "sharpness": 0.1 + (index % 9) / 10,
                            "brightness": 0.1 + (index % 7) / 10,
                            "contrast": 0.1 + (index % 5) / 10,
                            "uniqueness": 0.1 + (index % 8) / 10,
                            "red_avg": 0.1 + (index % 6) / 10,
                            "green_avg": 0.1 + (index % 4) / 10,
                            "blue_avg": 0.1 + (index % 3) / 10,
                            "overall_quality": 0.1 + (index % 9) / 10,
                            "issues": ["blur"] if index % 11 == 0 else [],
                            "status": "completed",
                        }
                        for index, image_id in enumerate(image_ids[: shape["quality"]])
                    ],
                )

            task_id = conn.execute(
                insert(tasks)
                .values(name=f"{name}-task", project_id=project_id)
                .returning(tasks.c.id)
            ).scalar_one()
            job_id = conn.execute(
                insert(jobs).values(task_id=task_id, sequence_number=1).returning(jobs.c.id)
            ).scalar_one()
            label_ids = [
                conn.execute(
                    insert(labels)
                    .values(project_id=project_id, name=f"class-{k}")
                    .returning(labels.c.id)
                ).scalar_one()
                for k in range(4)
            ]

            annotated = image_ids[: shape["annotated_images"]]
            if annotated:
                job_image_ids = [
                    row[0]
                    for row in conn.execute(
                        insert(job_images).returning(job_images.c.id),
                        [
                            {
                                "job_id": job_id,
                                "filename": f"{index:06d}.jpg",
                                "s3_key": f"{name}/{index:06d}.jpg",
                                "width": widths[index % len(widths)],
                                "height": 720,
                                "sequence_number": index,
                                "shared_image_id": image_id,
                                "is_annotated": True,
                            }
                            for index, image_id in enumerate(annotated)
                        ],
                    ).fetchall()
                ]

                box_rows = []
                polygon_rows = []
                for index, job_image_id in enumerate(job_image_ids):
                    dense = index < shape["dense_images"]
                    boxes = shape["dense_boxes"] if dense else shape["boxes_per_image"]
                    polys = shape["dense_polygons"] if dense else shape["polygons_per_image"]
                    for k in range(boxes):
                        offset = (k % 10) / 20
                        box_rows.append(
                            {
                                "image_id": job_image_id,
                                "label_id": label_ids[k % len(label_ids)],
                                "x_min": offset,
                                "y_min": offset,
                                "x_max": offset + 0.2,
                                "y_max": offset + 0.2,
                                "confidence": 0.5 + (k % 5) / 10,
                            }
                        )
                    for k in range(polys):
                        base = (k % 10) / 20
                        polygon_rows.append(
                            {
                                "image_id": job_image_id,
                                "label_id": label_ids[k % len(label_ids)],
                                "format": "polygon",
                                "polygon": [
                                    [
                                        round(
                                            base
                                            + 0.15 * math.cos(2 * math.pi * p / POLYGON_POINTS),
                                            5,
                                        ),
                                        round(
                                            base
                                            + 0.15 * math.sin(2 * math.pi * p / POLYGON_POINTS),
                                            5,
                                        ),
                                    ]
                                    for p in range(POLYGON_POINTS)
                                ],
                                "bbox_x_min": base,
                                "bbox_y_min": base,
                                "bbox_x_max": base + 0.3,
                                "bbox_y_max": base + 0.3,
                                "area": 0.09,
                                "confidence": 0.6,
                            }
                        )
                for start in range(0, len(box_rows), 5000):
                    conn.execute(insert(detections), box_rows[start : start + 5000])
                for start in range(0, len(polygon_rows), 2000):
                    conn.execute(insert(segmentations), polygon_rows[start : start + 2000])
            else:
                box_rows = []
                polygon_rows = []

            info[name] = {
                "project_id": project_id,
                "tag_id": str(tag_id),
                "images": count,
                "tagged_images": shape["tagged"],
                "images_with_quality_metrics": shape["quality"],
                "annotated_images": shape["annotated_images"],
                "detections": len(box_rows),
                "segmentations": len(polygon_rows),
                "images_above_preview_caps": shape["dense_images"],
                "shape": shape,
            }

    with engine.begin() as conn:
        from sqlalchemy import text

        conn.execute(text("ANALYZE"))
    engine.dispose()
    return info


def driver_main(args: argparse.Namespace) -> int:
    sys.path.insert(0, str(DEFAULT_NEW_SRC))

    from alembic import command
    from alembic.config import Config
    from testcontainers.community.postgres import PostgresContainer

    started_at = datetime.now(timezone.utc).isoformat()
    host = host_facts()
    with PostgresContainer(args.postgres_image) as postgres:
        sync_url = postgres.get_connection_url()
        async_url = sync_url.replace("postgresql+psycopg2://", "postgresql+asyncpg://")
        if async_url.startswith("postgresql://"):
            async_url = async_url.replace("postgresql://", "postgresql+asyncpg://", 1)

        print(f"[bench] migrating {sync_url}", file=sys.stderr)
        # `migrations/env.py` overrides whatever the Config says with `TESTING_DATABASE_URL` or the
        # application settings, so the container URL has to arrive through the environment.
        os.environ["TESTING_DATABASE_URL"] = sync_url
        config = Config(str(DEFAULT_NEW_SRC / "alembic.ini"))
        config.set_main_option("sqlalchemy.url", sync_url)
        config.set_main_option("script_location", str(DEFAULT_NEW_SRC / "migrations"))
        command.upgrade(config, "head")

        print("[bench] seeding", file=sys.stderr)
        seed_started = time.perf_counter()
        dataset_info = seed(sync_url)
        print(f"[bench] seeded in {time.perf_counter() - seed_started:.1f}s", file=sys.stderr)

        revisions: list[tuple[str, Path]] = [("new", DEFAULT_NEW_SRC)]
        if args.old_src:
            revisions.append(("old", Path(args.old_src).resolve()))

        log_dir = Path(args.out).resolve().parent / "bench-logs"
        workers = {
            label: WorkerHandle(label, src, async_url, sys.executable, log_dir)
            for label, src in revisions
        }
        for label, handle in workers.items():
            print(
                f"[bench] worker {label}: src={handle.src} canonical_filters={handle.canonical_filters}",
                file=sys.stderr,
            )

        plan = build_plan(dataset_info)
        if args.only:
            wanted = set(args.only)
            plan = [cell for cell in plan if cell["op"] in wanted]

        measurements: list[dict] = []
        notes: list[dict] = []
        try:
            for position, cell in enumerate(plan):
                key = cell_key(cell)
                print(f"[bench] {key}", file=sys.stderr)
                message = {
                    "cmd": "run",
                    "op": cell["op"],
                    "project_id": cell["project_id"],
                    "params": cell.get("params") or {},
                }
                samples: dict[str, dict[str, list[float]]] = {
                    label: {"cold": [], "warm": []} for label in workers
                }
                checks: dict[str, dict] = {}
                failures: dict[str, str] = {}

                # Cold: reconnect both workers, then one call each. The order within the pair flips
                # each repetition so neither revision always pays the first-mover cache cost.
                for rep in range(args.cold_reps):
                    order = list(workers)
                    if (rep + position) % 2:
                        order.reverse()
                    for label in order:
                        workers[label].connect()
                    for label in order:
                        reply = workers[label].send(message)
                        if "error" in reply or "unavailable" in reply:
                            failures[label] = reply.get("error") or reply["unavailable"]
                            continue
                        samples[label]["cold"].append(reply["elapsed_ms"])
                        checks[label] = reply["check"]

                # Warm: same connection, alternating, order flipped each repetition.
                for rep in range(args.warm_reps):
                    order = list(workers)
                    if (rep + position) % 2:
                        order.reverse()
                    for label in order:
                        if label in failures:
                            continue
                        reply = workers[label].send(message)
                        if "error" in reply or "unavailable" in reply:
                            failures[label] = reply.get("error") or reply["unavailable"]
                            continue
                        samples[label]["warm"].append(reply["elapsed_ms"])
                        checks[label] = reply["check"]

                for label in workers:
                    if label in failures:
                        notes.append(
                            {
                                "cell": key,
                                "revision": label,
                                "status": "not measured",
                                "reason": failures[label],
                            }
                        )
                        continue
                    for phase in ("cold", "warm"):
                        if not samples[label][phase]:
                            continue
                        measurements.append(
                            {
                                "dataset": cell["dataset"],
                                "dataset_images": dataset_info[cell["dataset"]]["images"],
                                "op": cell["op"],
                                "variant": cell.get("variant"),
                                "note": cell.get("note"),
                                "revision": label,
                                "phase": phase,
                                "page_size": PAGE_SIZE,
                                "comparable": cell["op"] not in NOT_LIKE_FOR_LIKE,
                                "not_like_for_like": NOT_LIKE_FOR_LIKE.get(cell["op"]),
                                "check": checks.get(label),
                                **summarise(samples[label][phase]),
                            }
                        )
        finally:
            for handle in workers.values():
                handle.quit()

        try:
            load = os.getloadavg()
        except OSError:
            load = None

        result = {
            "meta": {
                "finding": "G04",
                "what_this_is": (
                    "A before/after comparison, not a pre-change baseline. None of the gallery work "
                    "is committed, so HEAD (29faf03) is the 'before' revision and the working tree "
                    "is the 'after'. A true baseline taken before the code changed does not exist."
                ),
                "started_at": started_at,
                "finished_at": datetime.now(timezone.utc).isoformat(),
                "host": host,
                "loadavg_at_end": list(load) if load else None,
                "postgres_image": args.postgres_image,
                "database": "throwaway testcontainer, alembic head; the dev stack's Postgres is untouched",
                "revisions": {
                    label: {
                        "src": str(src),
                        "canonical_filters": workers[label].canonical_filters,
                    }
                    for label, src in revisions
                },
                "cold_definition": "first call on a freshly created engine, pool and connection",
                "warm_definition": "subsequent calls reusing the same connection",
                "cold_reps": args.cold_reps,
                "warm_reps": args.warm_reps,
                "interleaving": (
                    "revisions alternate every repetition and the order within each pair flips, so "
                    "drift on this shared host and first-mover cache effects land on both sides"
                ),
                "percentile_method": "nearest rank; every reported value is an observed sample",
                "timed_region": "the repository or handler call only, excluding HTTP, auth, and response serialisation",
            },
            "datasets": dataset_info,
            "measurements": measurements,
            "not_measured": notes,
        }
        Path(args.out).parent.mkdir(parents=True, exist_ok=True)
        Path(args.out).write_text(json.dumps(result, indent=2, default=str))
        print(f"[bench] wrote {args.out}", file=sys.stderr)
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--role", choices=["driver", "worker"], default="driver")
    parser.add_argument("--dsn", help="async DSN (worker role only)")
    parser.add_argument("--old-src", help="path to the pre-change revision's api-core/src")
    parser.add_argument("--out", default="api-results.json")
    parser.add_argument("--cold-reps", type=int, default=5)
    parser.add_argument("--warm-reps", type=int, default=15)
    parser.add_argument("--postgres-image", default="postgres:16-alpine")
    parser.add_argument("--only", nargs="*", help="restrict to these operation names")
    args = parser.parse_args()

    if args.role == "worker":
        worker_main(args.dsn)
        return 0
    return driver_main(args)


if __name__ == "__main__":
    raise SystemExit(main())
