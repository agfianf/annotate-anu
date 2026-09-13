"""Canonical image-membership filter contract.

``ImageFilterParams`` is the single description of *which* images a request is about. The gallery (`/explore`), export, and analytics all resolve their image set from it through `ProjectImageRepository.build_filtered_query`, so a filter that narrows the gallery narrows every count and every export built from the same filters.

It deliberately carries no paging or display fields (`page`, `page_size`, `include_annotations`, `include_bbox`, `include_polygon`): those change how a matching set is presented, not which images match.

This module also holds the request and response models built directly on top of the contract — the filter-scoped bulk-tag request, and the explore response with per-image geometry truncation flags.
"""

from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, model_validator

from app.schemas.data_management import (
    AnnotationSummary,
    ExploreResponse,
    SharedImageWithAnnotations,
)

MatchMode = Literal["AND", "OR"]

#: Upper bound on how many images a filter-scoped bulk action may resolve in one request.
MAX_FILTER_RESOLVED_IMAGES = 50_000


class ImageFilterParams(BaseModel):
    """Canonical set of image-membership filters, shared by gallery, export, and analytics.

    Every field is optional and defaults to "no constraint". An empty instance matches every image in the project pool. Semantics of the less obvious fields:

    - `include_match_mode` / `exclude_match_mode` apply to `tag_ids` / `excluded_tag_ids` respectively. `OR` means any of the tags, `AND` means all of them. Exclusion is applied before inclusion, and in `AND` mode only images carrying *all* the excluded tags are removed.
    - `job_id` wins over `task_ids`: when a job is given, task ids are ignored. `is_annotated` is evaluated inside whichever scope applies — within that job, within those tasks, or across every job when neither is given.
    - `is_annotated` means **an annotation of any kind**: a tag (`image_tags`), a box (`detections`), a mask (`segmentations`), or a pose (`keypoints`). Those are exactly the four tables that maintain the `images.is_annotated` column, and the predicate is built from the same mapping the write path uses, so the filter and the column can never disagree. It is not a per-kind filter: an image carrying only a classification tag matches `is_annotated=True` even though it has no geometry, and `is_annotated=False` means no annotation of any kind.
    - `filepath_pattern` is a glob (`*`, `?`) matched case-insensitively against the whole path; `filepath_paths` are directory prefixes combined with OR.
    - Quality, RGB, and `issues` constraints only ever match images whose quality metrics finished computing; an image without completed metrics is excluded as soon as any of them is set.
    """

    # Tags
    tag_ids: list[UUID] | None = None
    excluded_tag_ids: list[UUID] | None = None
    include_match_mode: MatchMode = "OR"
    exclude_match_mode: MatchMode = "OR"

    # Task / job hierarchy and annotation status
    task_ids: list[int] | None = None
    job_id: int | None = None
    is_annotated: bool | None = Field(
        default=None,
        description="True matches images carrying an annotation of any kind — tag, box, mask, or keypoint; False matches images carrying none. Not per-annotation-kind: a classification-only image counts as annotated.",
    )

    # Identity and path
    search: str | None = Field(default=None, max_length=255)
    filepath_pattern: str | None = Field(default=None, max_length=255)
    filepath_paths: list[str] | None = None
    image_uids: list[UUID] | None = None

    # Dimensions
    width_min: int | None = Field(default=None, ge=0)
    width_max: int | None = Field(default=None, ge=0)
    height_min: int | None = Field(default=None, ge=0)
    height_max: int | None = Field(default=None, ge=0)
    file_size_min: int | None = Field(default=None, ge=0)
    file_size_max: int | None = Field(default=None, ge=0)
    aspect_ratio_min: float | None = Field(default=None, ge=0)
    aspect_ratio_max: float | None = Field(default=None, ge=0)

    # Annotation counts
    object_count_min: int | None = Field(default=None, ge=0)
    object_count_max: int | None = Field(default=None, ge=0)
    bbox_count_min: int | None = Field(default=None, ge=0)
    bbox_count_max: int | None = Field(default=None, ge=0)
    polygon_count_min: int | None = Field(default=None, ge=0)
    polygon_count_max: int | None = Field(default=None, ge=0)

    # Quality metrics
    quality_min: float | None = Field(default=None, ge=0, le=1)
    quality_max: float | None = Field(default=None, ge=0, le=1)
    sharpness_min: float | None = Field(default=None, ge=0, le=1)
    sharpness_max: float | None = Field(default=None, ge=0, le=1)
    brightness_min: float | None = Field(default=None, ge=0, le=1)
    brightness_max: float | None = Field(default=None, ge=0, le=1)
    contrast_min: float | None = Field(default=None, ge=0, le=1)
    contrast_max: float | None = Field(default=None, ge=0, le=1)
    uniqueness_min: float | None = Field(default=None, ge=0, le=1)
    uniqueness_max: float | None = Field(default=None, ge=0, le=1)

    # RGB channel averages
    red_min: float | None = Field(default=None, ge=0, le=1)
    red_max: float | None = Field(default=None, ge=0, le=1)
    green_min: float | None = Field(default=None, ge=0, le=1)
    green_max: float | None = Field(default=None, ge=0, le=1)
    blue_min: float | None = Field(default=None, ge=0, le=1)
    blue_max: float | None = Field(default=None, ge=0, le=1)

    # Quality issues: blur, low_brightness, high_brightness, low_contrast, duplicate
    issues: list[str] | None = None

    def is_empty(self) -> bool:
        """True when no constraint is set, i.e. the filter matches the whole project pool."""
        return self == ImageFilterParams()


class FilterScope(BaseModel):
    """A filter set minus a handful of individually excluded images.

    Used by bulk actions that operate on "everything matching the current filters". Membership is resolved **at action time**: the server runs the filter when the request arrives, so images added to the project after the user pressed the button are included and images that stopped matching are not. `excluded_image_ids` are removed from whatever the filter resolves to.
    """

    filters: ImageFilterParams = Field(default_factory=ImageFilterParams)
    excluded_image_ids: list[UUID] = Field(default_factory=list)


class BulkTagScopedRequest(BaseModel):
    """Bulk tag request that names its targets either explicitly or by filter.

    Send `shared_image_ids` for an explicit list (the original request shape, unchanged), or `scope` to act on every image matching a filter set. Exactly one of the two must be present.
    """

    shared_image_ids: list[UUID] | None = Field(
        default=None,
        max_length=500,
        description="Explicit image IDs to act on. Omit when using `scope`.",
    )
    tag_ids: list[UUID] = Field(
        ...,
        min_length=1,
        max_length=50,
        description="Tag IDs to add",
    )
    scope: FilterScope | None = Field(
        default=None,
        description="Act on every image matching these filters, minus `excluded_image_ids`. Resolved at action time.",
    )

    @model_validator(mode="after")
    def _exactly_one_target(self) -> "BulkTagScopedRequest":
        has_ids = bool(self.shared_image_ids)
        has_scope = self.scope is not None
        if has_ids == has_scope:
            raise ValueError("Provide either a non-empty shared_image_ids list or scope, not both")
        return self

    def resolved_scope(self) -> FilterScope:
        """The filter scope to resolve, for a request that did not name its images explicitly."""
        if self.scope is None:
            raise ValueError("Request names its images explicitly; there is no scope to resolve")
        return self.scope


class BulkTagPreviewScopedRequest(BulkTagScopedRequest):
    """Preview request for a bulk tag operation, targeted the same way as the operation itself."""


class AnnotationSummaryWithTruncation(AnnotationSummary):
    """Annotation summary that says when its geometry preview was capped.

    `detection_count` and `segmentation_count` are always exact. `bboxes` and `polygons` are only populated when the caller asked for geometry, and each is capped per image; the matching `*_truncated` flag is true when that cap was reached, so the UI can label the image as showing a partial overlay.
    """

    bboxes_truncated: bool = Field(
        default=False, description="True when the bbox preview hit its per-image cap"
    )
    polygons_truncated: bool = Field(
        default=False, description="True when the polygon preview hit its per-image cap"
    )


class SharedImageWithAnnotationPreview(SharedImageWithAnnotations):
    """Shared image whose annotation summary carries truncation flags.

    Narrows `annotation_summary` to the truncation-aware summary. That is a subtype of what the base declares, so anything reading a base instance still reads a valid one; nothing constructs a base `SharedImageWithAnnotations` with a plain summary and then assigns it here.
    """

    annotation_summary: AnnotationSummaryWithTruncation | None = None


class ExplorePageResponse(ExploreResponse):
    """Explore response whose images carry geometry truncation flags."""

    images: list[SharedImageWithAnnotationPreview]
