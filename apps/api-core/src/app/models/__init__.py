"""SQLAlchemy Core models for AnnotateANU."""

from app.models.activity import project_activity
from app.models.annotation import (
    detections,
    image_tags,
    keypoints,
    pose_skeletons,
    segmentations,
)
from app.models.attribute import attribute_schemas, image_attributes
from app.models.data_management import (
    project_images,
    shared_image_tags,
    shared_images,
    tag_categories,
    tags,
)
from app.models.history import annotation_events, version_snapshots
from app.models.image import images
from app.models.job import jobs
from app.models.project import labels, project_members, projects
from app.models.task import tasks
from app.models.user import refresh_tokens, users

__all__ = [
    # Users
    "users",
    "refresh_tokens",
    # Projects
    "projects",
    "project_members",
    "labels",
    # Tasks & Jobs
    "tasks",
    "jobs",
    # Images
    "images",
    # Annotations
    "image_tags",
    "detections",
    "segmentations",
    "keypoints",
    "pose_skeletons",
    # History
    "annotation_events",
    "version_snapshots",
    # Activity
    "project_activity",
    # Data Management
    "shared_images",
    "tag_categories",
    "tags",
    "shared_image_tags",
    "project_images",
    # Attributes
    "attribute_schemas",
    "image_attributes",
]
