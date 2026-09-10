"""QC review router: sessions, review queue, verdicts and manifest export."""

from datetime import datetime, timezone

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import delete, func, select, union
from sqlalchemy.ext.asyncio import AsyncConnection

from app.dependencies.auth import get_current_active_user
from app.dependencies.database import get_async_transaction_conn
from app.helpers.logger import logger
from app.helpers.response_api import JsonResponse
from app.models.annotation import detections, segmentations
from app.models.image import images
from app.models.project import labels
from app.models.qc import qc_consolidated, qc_sessions, qc_verdicts
from app.schemas.auth import UserBase
from app.services.job_status import JobStatusService
from app.services.qc import DEFAULT_CONFIG, QCService
from app.services.roi_crop import ROICropService
from app.services.storage_connection import StorageConnectionService
from app.services.storage_s3 import S3Service

router = APIRouter(prefix="/api/v1/qc", tags=["QC"])


class SessionCreate(BaseModel):
    project_id: int
    name: str = Field(..., min_length=1, max_length=255)
    mode: str = Field(default="instance", pattern="^(instance|roi)$")
    job_id: int | None = None
    config: dict | None = None
    source: dict | None = None


class VerdictCreate(BaseModel):
    item_key: str
    verdict: str = Field(..., pattern="^(good|refine|bad)$")
    image_id: UUID | None = None
    tag: str | None = None
    corrected_label_id: UUID | None = None
    note: str | None = None


class SyncRequest(BaseModel):
    job_status: str | None = Field(default=None, description="Move the linked job to this status")
    connection_id: UUID | None = Field(default=None, description="Publish the manifest here too")
    key: str | None = None


class PublishRequest(BaseModel):
    connection_id: UUID
    key: str | None = None
    settled_only: bool = False


class BulkVerdictCreate(BaseModel):
    items: list[VerdictCreate] = Field(..., min_length=1, max_length=500)


class UndoRequest(BaseModel):
    item_key: str


def _bbox_from_row(row) -> tuple[float, float, float, float] | None:
    """Prefer stored bbox columns, else derive one from the polygon."""
    if row["bbox_x_min"] is not None and row["bbox_x_max"] is not None:
        return (row["bbox_x_min"], row["bbox_y_min"], row["bbox_x_max"], row["bbox_y_max"])

    polygon = row["polygon"]
    if not polygon:
        return None
    points = polygon[0] if polygon and isinstance(polygon[0][0], (list, tuple)) else polygon
    xs = [p[0] for p in points]
    ys = [p[1] for p in points]
    if not xs or not ys:
        return None
    return (min(xs), min(ys), max(xs), max(ys))


async def _reviewable_count(connection: AsyncConnection, session: dict) -> int:
    """How many annotated images this session can actually serve."""
    annotated = union(select(segmentations.c.image_id), select(detections.c.image_id)).subquery()
    query = select(func.count()).select_from(images).where(
        images.c.id.in_(select(annotated.c.image_id))
    )
    if session["job_id"] is not None:
        query = query.where(images.c.job_id == session["job_id"])
    result = await connection.execute(query)
    return int(result.scalar() or 0)


async def _require_session(connection: AsyncConnection, session_id: UUID) -> dict:
    session = await QCService.get_session(connection, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="QC session not found")
    return session


@router.post("/sessions", response_model=JsonResponse[dict, None], status_code=201)
async def create_session(
    payload: SessionCreate,
    current_user: Annotated[UserBase, Depends(get_current_active_user)],
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)],
):
    """Create a QC session over a job or a whole project."""
    from sqlalchemy import insert

    result = await connection.execute(
        insert(qc_sessions)
        .values(
            project_id=payload.project_id,
            name=payload.name,
            mode=payload.mode,
            job_id=payload.job_id,
            config=payload.config or DEFAULT_CONFIG,
            source=payload.source,
            created_by=current_user.id,
        )
        .returning(qc_sessions)
    )
    return JsonResponse(
        data=dict(result.mappings().first()),
        message="QC session created",
        status_code=status.HTTP_201_CREATED,
    )


@router.get("/sessions", response_model=JsonResponse[list[dict], None])
async def list_sessions(
    current_user: Annotated[UserBase, Depends(get_current_active_user)],
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)],
    project_id: int | None = None,
):
    """List QC sessions, optionally filtered to one project."""
    query = select(qc_sessions).order_by(qc_sessions.c.created_at.desc())
    if project_id is not None:
        query = query.where(qc_sessions.c.project_id == project_id)
    result = await connection.execute(query)
    sessions = [dict(r) for r in result.mappings().all()]

    for session in sessions:
        session["stats"] = await QCService.stats(connection, session["id"])
        session["total_items"] = await _reviewable_count(connection, session)

    return JsonResponse(data=sessions, message=f"Found {len(sessions)} session(s)", status_code=200)


@router.get("/sessions/{session_id}", response_model=JsonResponse[dict, None])
async def get_session(
    session_id: UUID,
    current_user: Annotated[UserBase, Depends(get_current_active_user)],
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)],
):
    """One session with its current stats."""
    session = await _require_session(connection, session_id)
    session["stats"] = await QCService.stats(connection, session_id)
    session["total_items"] = await _reviewable_count(connection, session)
    return JsonResponse(data=session, message="QC session", status_code=200)


@router.delete("/sessions/{session_id}", response_model=JsonResponse[dict, None])
async def delete_session(
    session_id: UUID,
    current_user: Annotated[UserBase, Depends(get_current_active_user)],
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)],
):
    """Delete a QC session; verdicts and consolidation cascade with it."""
    session = await _require_session(connection, session_id)
    await connection.execute(delete(qc_sessions).where(qc_sessions.c.id == session_id))
    return JsonResponse(
        data={"deleted": str(session_id), "name": session["name"]},
        message=f"Deleted QC session '{session['name']}'",
        status_code=200,
    )


@router.get("/sessions/{session_id}/queue", response_model=JsonResponse[dict, None])
async def get_queue(
    session_id: UUID,
    current_user: Annotated[UserBase, Depends(get_current_active_user)],
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)],
    limit: int = Query(default=25, ge=1, le=200),
    include_reviewed: bool = False,
    annotated_only: bool = True,
):
    """Next items for this reviewer, with the shapes needed to draw overlays."""
    session = await _require_session(connection, session_id)

    query = select(images).order_by(images.c.sequence_number, images.c.created_at)
    if session["job_id"] is not None:
        query = query.where(images.c.job_id == session["job_id"])

    # QC is about judging annotations, so unannotated frames are not reviewable
    if annotated_only:
        annotated = union(
            select(segmentations.c.image_id), select(detections.c.image_id)
        ).subquery()
        query = query.where(images.c.id.in_(select(annotated.c.image_id)))

    result = await connection.execute(query)
    all_images = [dict(r) for r in result.mappings().all()]

    if not include_reviewed:
        reviewed = await QCService.reviewed_keys(connection, session_id, current_user.id)
        all_images = [img for img in all_images if str(img["id"]) not in reviewed]

    page = all_images[:limit]
    image_ids = [img["id"] for img in page]

    shapes: dict[str, list[dict]] = {str(i): [] for i in image_ids}
    if image_ids:
        seg_result = await connection.execute(
            select(
                segmentations.c.id,
                segmentations.c.image_id,
                segmentations.c.label_id,
                segmentations.c.polygon,
                segmentations.c.confidence,
                labels.c.name.label("label_name"),
                labels.c.color.label("label_color"),
            )
            .select_from(segmentations.outerjoin(labels, segmentations.c.label_id == labels.c.id))
            .where(segmentations.c.image_id.in_(image_ids))
        )
        for row in seg_result.mappings().all():
            shapes[str(row["image_id"])].append(
                {
                    "id": str(row["id"]),
                    "type": "polygon",
                    "polygon": row["polygon"],
                    "label_id": str(row["label_id"]) if row["label_id"] else None,
                    "label_name": row["label_name"],
                    "label_color": row["label_color"],
                    "confidence": row["confidence"],
                }
            )

        det_result = await connection.execute(
            select(
                detections.c.id,
                detections.c.image_id,
                detections.c.label_id,
                detections.c.x_min,
                detections.c.y_min,
                detections.c.x_max,
                detections.c.y_max,
                detections.c.confidence,
                labels.c.name.label("label_name"),
                labels.c.color.label("label_color"),
            )
            .select_from(detections.outerjoin(labels, detections.c.label_id == labels.c.id))
            .where(detections.c.image_id.in_(image_ids))
        )
        for row in det_result.mappings().all():
            shapes[str(row["image_id"])].append(
                {
                    "id": str(row["id"]),
                    "type": "bbox",
                    "bbox": [row["x_min"], row["y_min"], row["x_max"], row["y_max"]],
                    "label_id": str(row["label_id"]) if row["label_id"] else None,
                    "label_name": row["label_name"],
                    "label_color": row["label_color"],
                    "confidence": row["confidence"],
                }
            )

    items = [
        {
            "item_key": str(img["id"]),
            "image_id": str(img["id"]),
            "job_id": img["job_id"],
            "filename": img["filename"],
            "s3_key": img["s3_key"],
            "width": img["width"],
            "height": img["height"],
            "shapes": shapes[str(img["id"])],
        }
        for img in page
    ]

    return JsonResponse(
        data={"items": items, "remaining": len(all_images), "mode": session["mode"]},
        message=f"{len(items)} item(s) to review",
        status_code=200,
    )


@router.get("/sessions/{session_id}/roi-tiles", response_model=JsonResponse[dict, None])
async def get_roi_tiles(
    session_id: UUID,
    current_user: Annotated[UserBase, Depends(get_current_active_user)],
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)],
    label_id: UUID | None = None,
    limit: int = Query(default=120, ge=1, le=500),
    include_reviewed: bool = False,
):
    """Crops for one predicted class, for odd-one-out review."""
    session = await _require_session(connection, session_id)

    query = (
        select(
            segmentations.c.id,
            segmentations.c.image_id,
            segmentations.c.label_id,
            segmentations.c.bbox_x_min,
            segmentations.c.bbox_y_min,
            segmentations.c.bbox_x_max,
            segmentations.c.bbox_y_max,
            segmentations.c.confidence,
            images.c.s3_key,
            images.c.filename,
            labels.c.name.label("label_name"),
            labels.c.color.label("label_color"),
        )
        .select_from(
            segmentations.join(images, segmentations.c.image_id == images.c.id).outerjoin(
                labels, segmentations.c.label_id == labels.c.id
            )
        )
        .order_by(segmentations.c.confidence.desc().nullslast())
    )
    if session["job_id"] is not None:
        query = query.where(images.c.job_id == session["job_id"])
    if label_id is not None:
        query = query.where(segmentations.c.label_id == label_id)

    result = await connection.execute(query)
    rows = [dict(r) for r in result.mappings().all()]

    if not include_reviewed:
        reviewed = await QCService.reviewed_keys(connection, session_id, current_user.id)
        rows = [r for r in rows if str(r["id"]) not in reviewed]

    tiles = []
    for row in rows[:limit]:
        tiles.append(
            {
                "item_key": str(row["id"]),
                "image_id": str(row["image_id"]),
                "filename": row["filename"],
                "label_id": str(row["label_id"]) if row["label_id"] else None,
                "label_name": row["label_name"],
                "label_color": row["label_color"],
                "confidence": row["confidence"],
                "crop_url": f"/api/v1/qc/crop/{row['id']}",
            }
        )

    counts_result = await connection.execute(
        select(
            segmentations.c.label_id,
            labels.c.name.label("label_name"),
            labels.c.color.label("label_color"),
            func.count().label("n"),
        )
        .select_from(
            segmentations.join(images, segmentations.c.image_id == images.c.id).outerjoin(
                labels, segmentations.c.label_id == labels.c.id
            )
        )
        .where(images.c.job_id == session["job_id"] if session["job_id"] is not None else True)
        .group_by(segmentations.c.label_id, labels.c.name, labels.c.color)
        .order_by(func.count().desc())
    )
    classes = [
        {
            "label_id": str(r["label_id"]) if r["label_id"] else None,
            "label_name": r["label_name"],
            "label_color": r["label_color"],
            "count": r["n"],
        }
        for r in counts_result.mappings().all()
    ]

    return JsonResponse(
        data={"tiles": tiles, "remaining": len(rows), "classes": classes},
        message=f"{len(tiles)} crop(s)",
        status_code=200,
    )


@router.get("/crop/{annotation_id}")
async def get_crop(
    annotation_id: UUID,
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)],
):
    """Serve one cached ROI crop (no auth so it can be used as an img src)."""
    from fastapi.responses import FileResponse

    result = await connection.execute(
        select(
            segmentations.c.bbox_x_min,
            segmentations.c.bbox_y_min,
            segmentations.c.bbox_x_max,
            segmentations.c.bbox_y_max,
            segmentations.c.polygon,
            images.c.s3_key,
        )
        .select_from(segmentations.join(images, segmentations.c.image_id == images.c.id))
        .where(segmentations.c.id == annotation_id)
    )
    row = result.mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Annotation not found")

    bbox = _bbox_from_row(row)
    if bbox is None:
        raise HTTPException(status_code=422, detail="Annotation has no usable geometry")

    try:
        path = ROICropService().get_or_create(str(annotation_id), row["s3_key"], bbox)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    return FileResponse(path, media_type="image/jpeg", headers={"Cache-Control": "public, max-age=86400"})


@router.post("/sessions/{session_id}/verdicts/bulk", response_model=JsonResponse[dict, None])
async def record_bulk_verdicts(
    session_id: UUID,
    payload: BulkVerdictCreate,
    current_user: Annotated[UserBase, Depends(get_current_active_user)],
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)],
):
    """Record the same verdict for many items, as ROI tile review produces."""
    session = await _require_session(connection, session_id)

    results = []
    for item in payload.items:
        results.append(
            await QCService.record_verdict(
                connection,
                session,
                item_key=item.item_key,
                reviewer_id=current_user.id,
                verdict=item.verdict,
                image_id=item.image_id,
                tag=item.tag,
                corrected_label_id=item.corrected_label_id,
                note=item.note,
            )
        )

    stats = await QCService.stats(connection, session_id)
    return JsonResponse(
        data={"recorded": len(results), "stats": stats},
        message=f"Recorded {len(results)} verdict(s)",
        status_code=200,
    )


@router.post("/sessions/{session_id}/verdict", response_model=JsonResponse[dict, None])
async def record_verdict(
    session_id: UUID,
    payload: VerdictCreate,
    current_user: Annotated[UserBase, Depends(get_current_active_user)],
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)],
):
    """Record this reviewer's verdict and return the item's consolidation."""
    session = await _require_session(connection, session_id)
    consolidated = await QCService.record_verdict(
        connection,
        session,
        item_key=payload.item_key,
        reviewer_id=current_user.id,
        verdict=payload.verdict,
        image_id=payload.image_id,
        tag=payload.tag,
        corrected_label_id=payload.corrected_label_id,
        note=payload.note,
    )
    stats = await QCService.stats(connection, session_id)
    return JsonResponse(
        data={"consolidated": consolidated, "stats": stats},
        message=f"Recorded {payload.verdict}",
        status_code=200,
    )


@router.post("/sessions/{session_id}/undo", response_model=JsonResponse[dict, None])
async def undo_verdict(
    session_id: UUID,
    payload: UndoRequest,
    current_user: Annotated[UserBase, Depends(get_current_active_user)],
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)],
):
    """Withdraw this reviewer's verdict for one item."""
    session = await _require_session(connection, session_id)
    result = await QCService.undo_verdict(connection, session, payload.item_key, current_user.id)
    stats = await QCService.stats(connection, session_id)
    return JsonResponse(
        data={"consolidated": result, "stats": stats}, message="Verdict withdrawn", status_code=200
    )


@router.get("/sessions/{session_id}/refine-queue", response_model=JsonResponse[dict, None])
async def refine_queue(
    session_id: UUID,
    current_user: Annotated[UserBase, Depends(get_current_active_user)],
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)],
):
    """Items marked refine, as a work list to reopen in the annotation app."""
    session = await _require_session(connection, session_id)

    result = await connection.execute(
        select(
            qc_consolidated.c.item_key,
            qc_consolidated.c.image_id,
            qc_consolidated.c.n_votes,
            qc_consolidated.c.agreement,
            images.c.filename,
            images.c.s3_key,
            images.c.job_id,
        )
        .select_from(
            qc_consolidated.outerjoin(images, qc_consolidated.c.image_id == images.c.id)
        )
        .where(
            qc_consolidated.c.session_id == session_id,
            qc_consolidated.c.verdict == "refine",
        )
    )
    items = [
        {
            "item_key": r["item_key"],
            "image_id": str(r["image_id"]) if r["image_id"] else None,
            "filename": r["filename"],
            "s3_key": r["s3_key"],
            "job_id": r["job_id"],
            "n_votes": r["n_votes"],
            "agreement": r["agreement"],
        }
        for r in result.mappings().all()
    ]

    return JsonResponse(
        data={"session": {"id": str(session["id"]), "name": session["name"]}, "items": items},
        message=f"{len(items)} item(s) need refinement",
        status_code=200,
    )


@router.post("/sessions/{session_id}/publish", response_model=JsonResponse[dict, None])
async def publish_manifest(
    session_id: UUID,
    payload: PublishRequest,
    current_user: Annotated[UserBase, Depends(get_current_active_user)],
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)],
):
    """Write the verdict manifest into the bucket. Source objects are never touched."""
    session = await _require_session(connection, session_id)

    row = await StorageConnectionService.require_usable(
        connection, payload.connection_id, current_user
    )

    entries = await QCService.manifest(connection, session_id)
    if payload.settled_only:
        entries = [e for e in entries if e["settled"]]

    manifest = {
        "session": {"id": str(session["id"]), "name": session["name"], "mode": session["mode"]},
        "config": session["config"],
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "counts": {
            v: sum(1 for e in entries if e["verdict"] == v)
            for v in ("good", "refine", "bad", "disputed")
        },
        "entries": entries,
        "refine": [e["item"] for e in entries if e["verdict"] == "refine"],
    }

    key = payload.key or f"qc/{session['name'].replace('/', '_')}-{session_id}.json"
    try:
        written = S3Service(row).put_json(key, manifest)
    except Exception:
        # boto3 errors quote endpoint, bucket and credential detail; keep them in the log.
        logger.exception(f"Manifest write failed for storage connection {payload.connection_id}")
        raise HTTPException(status_code=502, detail="Manifest write failed")

    return JsonResponse(
        data={"bucket": row["bucket"], "key": written, "entries": len(entries), "counts": manifest["counts"]},
        message=f"Published {len(entries)} verdict(s)",
        status_code=200,
    )


@router.post("/sessions/{session_id}/sync", response_model=JsonResponse[dict, None])
async def sync_session(
    session_id: UUID,
    payload: SyncRequest,
    current_user: Annotated[UserBase, Depends(get_current_active_user)],
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)],
):
    """Apply QC results: tag rows, move the job on, and optionally write the manifest."""
    session = await _require_session(connection, session_id)

    applied = await QCService.apply_verdicts(connection, session)

    job_result = None
    if payload.job_status and session["job_id"]:
        try:
            job = await JobStatusService.set_status(
                connection, session["job_id"], payload.job_status
            )
            job_result = {"id": job["id"], "status": job["status"]}
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc))

    published = None
    if payload.connection_id:
        row = await StorageConnectionService.require_usable(
            connection, payload.connection_id, current_user
        )

        entries = await QCService.manifest(connection, session_id)
        manifest = {
            "session": {"id": str(session["id"]), "name": session["name"], "mode": session["mode"]},
            "config": session["config"],
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "applied": applied,
            "job": job_result,
            "counts": {
                v: sum(1 for e in entries if e["verdict"] == v)
                for v in ("good", "refine", "bad", "disputed")
            },
            "entries": entries,
            "refine": [e["item"] for e in entries if e["verdict"] == "refine"],
        }
        key = payload.key or f"qc/{session['name'].replace('/', '_')}-{session_id}.json"
        try:
            service = S3Service(row)
            written = service.put_json(key, manifest)
            published = {"bucket": row["bucket"], "key": written, "entries": len(entries)}
        except Exception:
            logger.exception(
                f"Manifest write failed for storage connection {payload.connection_id}"
            )
            raise HTTPException(status_code=502, detail="Manifest write failed")

    return JsonResponse(
        data={"applied": applied, "job": job_result, "published": published},
        message=f"Applied {applied['tagged']} verdict(s)",
        status_code=200,
    )


@router.get("/sessions/{session_id}/manifest", response_model=JsonResponse[dict, None])
async def get_manifest(
    session_id: UUID,
    current_user: Annotated[UserBase, Depends(get_current_active_user)],
    connection: Annotated[AsyncConnection, Depends(get_async_transaction_conn)],
    settled_only: bool = False,
):
    """Verdict manifest, the artifact written next to the data rather than moving it."""
    session = await _require_session(connection, session_id)
    entries = await QCService.manifest(connection, session_id)
    if settled_only:
        entries = [e for e in entries if e["settled"]]

    return JsonResponse(
        data={
            "session": {"id": str(session["id"]), "name": session["name"], "mode": session["mode"]},
            "config": session["config"],
            "entries": entries,
            "refine": [e["item"] for e in entries if e["verdict"] == "refine"],
        },
        message=f"{len(entries)} entries",
        status_code=200,
    )
