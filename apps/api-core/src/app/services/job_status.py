"""Job lifecycle state machine.

Drives the annotate -> review -> QC -> curate -> approve flow that the jobs
table has always documented but never enforced.
"""

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncConnection

from app.models.job import jobs

PENDING = "pending"
ASSIGNED = "assigned"
IN_PROGRESS = "in_progress"
COMPLETED = "completed"
REVIEW = "review"
CURATE = "curate"
APPROVED = "approved"
REJECTED = "rejected"

STATUSES = (PENDING, ASSIGNED, IN_PROGRESS, COMPLETED, REVIEW, CURATE, APPROVED, REJECTED)

# Which moves are legal from each state
TRANSITIONS: dict[str, set[str]] = {
    PENDING: {ASSIGNED, IN_PROGRESS},
    ASSIGNED: {IN_PROGRESS, PENDING},
    IN_PROGRESS: {COMPLETED, REVIEW, PENDING},
    COMPLETED: {REVIEW, IN_PROGRESS},
    REVIEW: {CURATE, APPROVED, REJECTED, IN_PROGRESS},
    CURATE: {REVIEW, APPROVED, IN_PROGRESS},
    APPROVED: {REVIEW},
    REJECTED: {IN_PROGRESS, REVIEW},
}

# Statuses where QC review makes sense
QC_STATUSES = {REVIEW, CURATE}


def can_transition(current: str, target: str) -> bool:
    return target in TRANSITIONS.get(current, set())


def allowed_targets(current: str) -> list[str]:
    return sorted(TRANSITIONS.get(current, set()))


class JobStatusService:
    """Reads and applies validated job status changes."""

    @staticmethod
    async def get(connection: AsyncConnection, job_id: int) -> dict | None:
        result = await connection.execute(select(jobs).where(jobs.c.id == job_id))
        row = result.mappings().first()
        return dict(row) if row else None

    @staticmethod
    async def set_status(
        connection: AsyncConnection, job_id: int, target: str, force: bool = False
    ) -> dict:
        """Move a job to a new status, rejecting moves the machine disallows.

        Raises
        ------
        ValueError
            If the job is missing, the status is unknown, or the move is illegal
        """
        if target not in STATUSES:
            raise ValueError(f"Unknown status '{target}'. Valid: {', '.join(STATUSES)}")

        job = await JobStatusService.get(connection, job_id)
        if not job:
            raise ValueError(f"Job {job_id} not found")

        current = job["status"]
        if current == target:
            return job
        if not force and not can_transition(current, target):
            raise ValueError(
                f"Cannot move job from '{current}' to '{target}'. "
                f"Allowed: {', '.join(allowed_targets(current)) or 'none'}"
            )

        values: dict = {"status": target}
        if target == APPROVED:
            values["is_approved"] = True
        elif target in (REVIEW, REJECTED, CURATE):
            values["is_approved"] = False

        result = await connection.execute(
            update(jobs).where(jobs.c.id == job_id).values(**values).returning(jobs)
        )
        return dict(result.mappings().first())
