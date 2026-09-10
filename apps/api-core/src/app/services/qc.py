"""QC review service.

Consolidation mirrors the standalone QC tool's Delphi step, widened from a
good/bad vote to good/refine/bad.
"""

from collections import Counter
from typing import Any
from uuid import UUID

from sqlalchemy import delete, func, insert, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncConnection

from app.models.annotation import segmentations
from app.models.image import images
from app.models.qc import qc_consolidated, qc_sessions, qc_verdicts

DEFAULT_CONFIG = {"replicas": 1, "agreement_threshold": 0.66, "max_votes": 3}


def consolidate_votes(votes: list[dict], config: dict) -> dict:
    """Majority-consolidate one item's raw votes into a single datapoint.

    Parameters
    ----------
    votes : list[dict]
        Raw verdict rows for one item
    config : dict
        replicas, agreement_threshold and max_votes

    Returns
    -------
    dict
        Consolidated verdict with agreement and settled/consensus flags
    """
    replicas = config.get("replicas", 1)
    threshold = config.get("agreement_threshold", 0.66)
    max_votes = config.get("max_votes", 3)

    n = len(votes)
    if n == 0:
        return {
            "verdict": "bad", "tag": None, "n_votes": 0, "agreement": 0.0,
            "consensus": False, "settled": False, "votes": {},
        }

    counts = Counter(v["verdict"] for v in votes)
    majority, majority_n = counts.most_common(1)[0]
    agreement = majority_n / n
    consensus = agreement >= threshold
    settled = n >= replicas and (consensus or n >= max_votes)

    tags = [v["tag"] for v in votes if v.get("tag")]
    tag = Counter(tags).most_common(1)[0][0] if tags else None

    return {
        "verdict": majority if consensus else ("disputed" if settled else majority),
        "tag": tag,
        "n_votes": n,
        "agreement": round(agreement, 3),
        "consensus": consensus,
        "settled": settled,
        "votes": {str(v["reviewer_id"]): v["verdict"] for v in votes},
    }


class QCService:
    """Reads and writes QC verdicts, keeping the consolidated table in step."""

    @staticmethod
    async def get_session(connection: AsyncConnection, session_id: UUID) -> dict | None:
        result = await connection.execute(select(qc_sessions).where(qc_sessions.c.id == session_id))
        row = result.mappings().first()
        return dict(row) if row else None

    @staticmethod
    async def record_verdict(
        connection: AsyncConnection,
        session: dict,
        item_key: str,
        reviewer_id: UUID,
        verdict: str,
        image_id: UUID | None = None,
        tag: str | None = None,
        corrected_label_id: UUID | None = None,
        note: str | None = None,
    ) -> dict:
        """Upsert one reviewer's verdict, then recompute this item's consolidation."""
        stmt = pg_insert(qc_verdicts).values(
            session_id=session["id"],
            item_key=item_key,
            image_id=image_id,
            reviewer_id=reviewer_id,
            verdict=verdict,
            tag=tag,
            corrected_label_id=corrected_label_id,
            note=note,
        )
        await connection.execute(
            stmt.on_conflict_do_update(
                constraint="uq_qc_verdicts_reviewer_item",
                set_={
                    "verdict": stmt.excluded.verdict,
                    "tag": stmt.excluded.tag,
                    "corrected_label_id": stmt.excluded.corrected_label_id,
                    "note": stmt.excluded.note,
                    "updated_at": func.now(),
                },
            )
        )
        return await QCService.reconsolidate_item(connection, session, item_key, image_id)

    @staticmethod
    async def reconsolidate_item(
        connection: AsyncConnection, session: dict, item_key: str, image_id: UUID | None
    ) -> dict:
        result = await connection.execute(
            select(qc_verdicts).where(
                qc_verdicts.c.session_id == session["id"], qc_verdicts.c.item_key == item_key
            )
        )
        votes = [dict(r) for r in result.mappings().all()]
        consolidated = consolidate_votes(votes, session.get("config") or DEFAULT_CONFIG)

        stmt = pg_insert(qc_consolidated).values(
            session_id=session["id"], item_key=item_key, image_id=image_id, **consolidated
        )
        await connection.execute(
            stmt.on_conflict_do_update(
                constraint="uq_qc_consolidated_item",
                set_={
                    "verdict": stmt.excluded.verdict,
                    "tag": stmt.excluded.tag,
                    "n_votes": stmt.excluded.n_votes,
                    "agreement": stmt.excluded.agreement,
                    "consensus": stmt.excluded.consensus,
                    "settled": stmt.excluded.settled,
                    "votes": stmt.excluded.votes,
                    "updated_at": func.now(),
                },
            )
        )
        return {"item_key": item_key, **consolidated}

    @staticmethod
    async def undo_verdict(
        connection: AsyncConnection, session: dict, item_key: str, reviewer_id: UUID
    ) -> dict:
        """Remove this reviewer's verdict for an item and reconsolidate."""
        await connection.execute(
            delete(qc_verdicts).where(
                qc_verdicts.c.session_id == session["id"],
                qc_verdicts.c.item_key == item_key,
                qc_verdicts.c.reviewer_id == reviewer_id,
            )
        )
        result = await connection.execute(
            select(qc_verdicts.c.image_id).where(
                qc_verdicts.c.session_id == session["id"], qc_verdicts.c.item_key == item_key
            ).limit(1)
        )
        row = result.first()
        if row is None:
            await connection.execute(
                delete(qc_consolidated).where(
                    qc_consolidated.c.session_id == session["id"],
                    qc_consolidated.c.item_key == item_key,
                )
            )
            return {"item_key": item_key, "n_votes": 0, "verdict": None}
        return await QCService.reconsolidate_item(connection, session, item_key, row[0])

    @staticmethod
    async def reviewed_keys(
        connection: AsyncConnection, session_id: UUID, reviewer_id: UUID
    ) -> set[str]:
        result = await connection.execute(
            select(qc_verdicts.c.item_key).where(
                qc_verdicts.c.session_id == session_id, qc_verdicts.c.reviewer_id == reviewer_id
            )
        )
        return {r[0] for r in result.all()}

    @staticmethod
    async def stats(connection: AsyncConnection, session_id: UUID) -> dict[str, Any]:
        result = await connection.execute(
            select(
                qc_consolidated.c.verdict,
                func.count().label("n"),
            )
            .where(qc_consolidated.c.session_id == session_id)
            .group_by(qc_consolidated.c.verdict)
        )
        by_verdict = {r.verdict: r.n for r in result.all()}

        totals = await connection.execute(
            select(
                func.count().label("reviewed"),
                func.count().filter(qc_consolidated.c.settled).label("settled"),
                func.coalesce(func.avg(qc_consolidated.c.agreement), 0).label("avg_agreement"),
            ).where(qc_consolidated.c.session_id == session_id)
        )
        t = totals.mappings().first()

        return {
            "by_verdict": by_verdict,
            "reviewed": t["reviewed"],
            "settled": t["settled"],
            "disputed": by_verdict.get("disputed", 0),
            "avg_agreement": round(float(t["avg_agreement"]), 3),
        }

    @staticmethod
    async def ensure_review_session(
        connection: AsyncConnection,
        job_id: int,
        created_by: UUID | None = None,
        mode: str = "instance",
    ) -> dict | None:
        """Make sure a job entering review has a QC session waiting for it.

        Returns the existing session if there already is one, so repeated
        transitions do not pile up duplicates.
        """
        from app.models.job import jobs
        from app.models.task import tasks

        existing = await connection.execute(
            select(qc_sessions).where(
                qc_sessions.c.job_id == job_id, qc_sessions.c.mode == mode
            )
        )
        row = existing.mappings().first()
        if row:
            return dict(row)

        lookup = await connection.execute(
            select(tasks.c.project_id, tasks.c.name, jobs.c.sequence_number)
            .select_from(jobs.join(tasks, jobs.c.task_id == tasks.c.id))
            .where(jobs.c.id == job_id)
        )
        info = lookup.mappings().first()
        if not info or info["project_id"] is None:
            return None

        name = f"{info['name']} · job {info['sequence_number'] or job_id} QC"
        created = await connection.execute(
            insert(qc_sessions)
            .values(
                project_id=info["project_id"],
                name=name,
                mode=mode,
                job_id=job_id,
                config=DEFAULT_CONFIG,
                created_by=created_by,
            )
            .returning(qc_sessions)
        )
        return dict(created.mappings().first())

    @staticmethod
    async def apply_verdicts(connection: AsyncConnection, session: dict) -> dict:
        """Write consolidated verdicts onto the reviewed rows.

        Instance mode tags images; ROI mode tags segmentations and applies any
        label reassignment, keeping the original so the swap stays reversible.
        Nothing is deleted.
        """
        result = await connection.execute(
            select(qc_consolidated).where(qc_consolidated.c.session_id == session["id"])
        )
        rows = [dict(r) for r in result.mappings().all()]

        tagged = 0
        relabelled = 0

        if session["mode"] == "instance":
            for row in rows:
                if not row["image_id"]:
                    continue
                await connection.execute(
                    update(images)
                    .where(images.c.id == row["image_id"])
                    .values(qc_verdict=row["verdict"])
                )
                tagged += 1
            return {"mode": "instance", "tagged": tagged, "relabelled": 0}

        # ROI mode: the item key is the segmentation id
        corrections = await connection.execute(
            select(
                qc_verdicts.c.item_key,
                qc_verdicts.c.corrected_label_id,
            ).where(
                qc_verdicts.c.session_id == session["id"],
                qc_verdicts.c.corrected_label_id.isnot(None),
            )
        )
        correction_map = {r["item_key"]: r["corrected_label_id"] for r in corrections.mappings().all()}

        for row in rows:
            try:
                seg_id = UUID(row["item_key"])
            except (ValueError, AttributeError):
                continue

            values: dict = {"qc_verdict": row["verdict"]}
            new_label = correction_map.get(row["item_key"])
            if new_label:
                current = await connection.execute(
                    select(segmentations.c.label_id, segmentations.c.qc_original_label_id).where(
                        segmentations.c.id == seg_id
                    )
                )
                existing = current.mappings().first()
                if existing and existing["label_id"] != new_label:
                    if existing["qc_original_label_id"] is None:
                        values["qc_original_label_id"] = existing["label_id"]
                    values["label_id"] = new_label
                    relabelled += 1

            updated = await connection.execute(
                update(segmentations).where(segmentations.c.id == seg_id).values(**values)
            )
            if updated.rowcount:
                tagged += 1

        return {"mode": "roi", "tagged": tagged, "relabelled": relabelled}

    @staticmethod
    async def manifest(connection: AsyncConnection, session_id: UUID) -> list[dict]:
        """Flat export of settled verdicts, shaped for writing next to the data."""
        result = await connection.execute(
            select(qc_consolidated).where(qc_consolidated.c.session_id == session_id)
        )
        return [
            {
                "item": r["item_key"],
                "verdict": r["verdict"],
                "tag": r["tag"],
                "n_votes": r["n_votes"],
                "agreement": r["agreement"],
                "consensus": r["consensus"],
                "settled": r["settled"],
                "votes": r["votes"],
            }
            for r in result.mappings().all()
        ]
