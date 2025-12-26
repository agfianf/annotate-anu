"""Celery tasks for background processing."""

from app.tasks.main import celery_app

__all__ = ["celery_app"]
