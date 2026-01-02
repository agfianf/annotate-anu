"""Celery task for processing image quality metrics."""

import asyncio
import logging
from datetime import datetime, timezone
from uuid import UUID

import redis

from app.config import settings
from app.helpers.database import get_async_engine
from app.repositories.image_quality import ImageQualityRepository
from app.repositories.quality_job import QualityJobRepository
from app.services.image_quality_service import ImageQualityService
from app.tasks.main import celery_app


logger = logging.getLogger(__name__)

# Redis progress tracking TTL (1 hour)
REDIS_PROGRESS_TTL = 3600


@celery_app.task(bind=True, max_retries=3, default_retry_delay=60)
def process_quality_metrics_task(
    self,
    job_id: str | None,
    project_id: int,
    batch_size: int = 50,
) -> dict:
    """Background task to process quality metrics for a project.

    Args:
        job_id: UUID string of quality_job record (None for auto-triggered jobs)
        project_id: Project ID to process
        batch_size: Number of images per batch

    Returns:
        dict with processing results
    """
    logger.info(f"Starting quality metrics processing for project {project_id}")

    try:
        result = asyncio.run(
            _process_quality_async(
                self.request.id,
                job_id,
                project_id,
                batch_size,
            )
        )
        return result
    except Exception as e:
        logger.exception(f"Quality processing failed for project {project_id}: {e}")
        if job_id:
            asyncio.run(_update_job_failed(job_id, str(e), project_id))
        raise self.retry(exc=e)


async def _process_quality_async(
    task_id: str,
    job_id: str | None,
    project_id: int,
    batch_size: int,
) -> dict:
    """Async implementation of quality processing."""
    engine = get_async_engine()
    redis_client = redis.from_url(settings.REDIS_URL, decode_responses=True)
    progress_key = f"quality:progress:{project_id}"

    try:
        async with engine.connect() as connection:
            # Update job status to processing
            if job_id:
                await QualityJobRepository.update_status(
                    connection, UUID(job_id), "processing"
                )
                await connection.commit()

            # Get accurate total count for progress tracking
            total_without = await ImageQualityRepository.count_images_without_metrics(
                connection, project_id
            )
            total_pending = await ImageQualityRepository.count_pending_for_project(
                connection, project_id
            )
            total_to_process = total_without + total_pending

            if total_to_process == 0:
                # Nothing to process
                logger.info(f"No images to process for project {project_id}")
                if job_id:
                    await QualityJobRepository.update_status(
                        connection, UUID(job_id), "completed"
                    )
                    await connection.commit()
                return {
                    "status": "completed",
                    "processed": 0,
                    "failed": 0,
                    "total": 0,
                }

            # Initialize Redis progress
            redis_client.hset(
                progress_key,
                mapping={
                    "job_id": job_id or "",
                    "task_id": task_id or "",
                    "total": total_to_process,
                    "processed": 0,
                    "failed": 0,
                    "status": "processing",
                    "started_at": datetime.now(timezone.utc).isoformat(),
                },
            )
            redis_client.expire(progress_key, REDIS_PROGRESS_TTL)

            # Update job with total
            if job_id:
                await QualityJobRepository.update_progress(
                    connection, UUID(job_id), 0, 0
                )
                # Also update total_images if different
                job = await QualityJobRepository.get_by_id(connection, UUID(job_id))
                if job and job["total_images"] != total_to_process:
                    from sqlalchemy import update
                    from app.models.image_quality import quality_jobs

                    stmt = (
                        update(quality_jobs)
                        .where(quality_jobs.c.id == UUID(job_id))
                        .values(total_images=total_to_process)
                    )
                    await connection.execute(stmt)
                await connection.commit()

            # Process in batches
            total_processed = 0
            total_failed = 0
            batch_count = 0
            max_batches = (total_to_process // batch_size) + 10  # Safety limit

            while batch_count < max_batches:
                batch_count += 1

                # Process one batch
                results = await ImageQualityService.process_pending_for_project(
                    connection, project_id, batch_size=batch_size
                )
                await connection.commit()

                batch_processed = results.get("processed", 0)
                batch_failed = results.get("failed", 0)
                remaining = results.get("remaining", 0)

                total_processed += batch_processed
                total_failed += batch_failed

                # Update Redis progress
                redis_client.hset(
                    progress_key,
                    mapping={
                        "processed": total_processed,
                        "failed": total_failed,
                        "remaining": remaining,
                    },
                )

                # Update job record
                if job_id:
                    await QualityJobRepository.update_progress(
                        connection, UUID(job_id), total_processed, total_failed
                    )
                    await connection.commit()

                logger.info(
                    f"Batch {batch_count}: processed={batch_processed}, "
                    f"failed={batch_failed}, remaining={remaining}"
                )

                # Check if done
                if remaining == 0 or (batch_processed == 0 and batch_failed == 0):
                    break

            # Mark as completed
            redis_client.hset(progress_key, "status", "completed")
            redis_client.expire(progress_key, REDIS_PROGRESS_TTL)

            if job_id:
                await QualityJobRepository.update_status(
                    connection, UUID(job_id), "completed"
                )
                await connection.commit()

            logger.info(
                f"Quality processing completed for project {project_id}: "
                f"processed={total_processed}, failed={total_failed}"
            )

            return {
                "status": "completed",
                "processed": total_processed,
                "failed": total_failed,
                "total": total_to_process,
            }

    except Exception as e:
        # Update Redis with failure
        redis_client.hset(
            progress_key,
            mapping={
                "status": "failed",
                "error": str(e)[:500],
            },
        )
        redis_client.expire(progress_key, REDIS_PROGRESS_TTL)
        raise

    finally:
        redis_client.close()


async def _update_job_failed(job_id: str, error_message: str, project_id: int) -> None:
    """Update job status to failed."""
    engine = get_async_engine()
    redis_client = redis.from_url(settings.REDIS_URL, decode_responses=True)

    try:
        async with engine.connect() as connection:
            await QualityJobRepository.update_status(
                connection,
                UUID(job_id),
                "failed",
                error_message=error_message[:500],
            )
            await connection.commit()

        # Update Redis
        progress_key = f"quality:progress:{project_id}"
        redis_client.hset(
            progress_key,
            mapping={
                "status": "failed",
                "error": error_message[:500],
            },
        )
        redis_client.expire(progress_key, REDIS_PROGRESS_TTL)

    finally:
        redis_client.close()
