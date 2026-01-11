"""Celery task for batch image classification."""

import asyncio
import logging
from uuid import UUID

import redis

from app.config import settings
from app.helpers.database import get_async_engine
from app.repositories.models import ModelAsyncRepositories
from app.services.mock_classifier import MockClassifierService
from app.tasks.main import celery_app


logger = logging.getLogger(__name__)

# Redis progress tracking TTL (1 hour)
REDIS_PROGRESS_TTL = 3600


@celery_app.task(bind=True, max_retries=3, default_retry_delay=60)
def batch_classify_images_task(
    self,
    project_id: int,
    model_id: str,
    image_ids: list[str],
    create_tags: bool = True,
    label_mapping_config: dict | None = None,
) -> dict:
    """Background task to classify multiple images.

    Args:
        project_id: Project ID for tag creation
        model_id: Model ID to use for classification
        image_ids: List of image IDs to classify
        create_tags: Whether to create tags from predictions
        label_mapping_config: Structured mapping config with format:
            {
                "mode": "uncategorized" | "categorized",
                "uncategorized": { className: { action, tagName, existingTagId } },
                "categoryMode": "existing" | "create",
                "existingCategoryId": "uuid",
                "existingCategoryTagMapping": { className: tagId },
                "newCategory": { name, color, tagNames: { className: tagName } }
            }

    Returns:
        dict with classification results
    """
    logger.info(
        f"Starting batch classification: {len(image_ids)} images, model={model_id}"
    )

    try:
        result = asyncio.run(
            _batch_classify_async(
                self.request.id,
                project_id,
                model_id,
                image_ids,
                create_tags,
                label_mapping_config,
            )
        )
        return result
    except Exception as e:
        logger.exception(f"Batch classification failed: {e}")
        raise self.retry(exc=e)


async def _batch_classify_async(
    task_id: str,
    project_id: int,
    model_id: str,
    image_ids: list[str],
    create_tags: bool,
    label_mapping_config: dict | None = None,
) -> dict:
    """Async implementation of batch classification."""
    engine = get_async_engine()
    redis_client = redis.from_url(settings.REDIS_URL, decode_responses=True)
    progress_key = f"classification:progress:{task_id}"

    results = []
    processed = 0
    failed = 0
    total = len(image_ids)

    # Cache for created category ID (for "create new category" mode)
    created_category_id: str | None = None

    try:
        async with engine.connect() as connection:
            # Get model configuration
            model = None
            custom_classes = None

            if model_id == "mock-classifier":
                # Built-in mock classifier
                pass
            else:
                # Get model from database
                model = await ModelAsyncRepositories.get_by_id(connection, model_id)
                if model.capabilities and model.capabilities.classes:
                    custom_classes = model.capabilities.classes

            # Check if this is a mock classifier
            is_mock = (
                model_id == "mock-classifier"
                or (model and model.endpoint_url == "internal://mock-classifier")
                or (model and model.capabilities and getattr(model.capabilities, "is_mock", False))
            )

            # Create classifier
            if is_mock:
                classifier = MockClassifierService(class_list=custom_classes)
            else:
                # For external models, skip for now
                logger.warning(f"External classification not implemented for model {model_id}")
                return {
                    "status": "failed",
                    "error": "External classification not yet implemented",
                    "processed": 0,
                    "failed": total,
                    "total": total,
                    "results": [],
                }

            # Initialize progress
            redis_client.hset(
                progress_key,
                mapping={
                    "status": "running",
                    "processed": 0,
                    "failed": 0,
                    "total": total,
                },
            )
            redis_client.expire(progress_key, REDIS_PROGRESS_TTL)

            # Import repositories
            from app.repositories.shared_image import SharedImageRepository
            from app.repositories.shared_image_tag import SharedImageTagRepository
            from app.repositories.tag import TagRepository

            # Get the uncategorized category (fallback)
            uncategorized_category = await TagRepository.get_uncategorized_category(
                connection, project_id
            )
            uncategorized_category_id = uncategorized_category["id"] if uncategorized_category else None

            # Pre-create category if mode is "categorized" + "create"
            config = label_mapping_config or {}
            if config.get("mode") == "categorized" and config.get("categoryMode") == "create":
                new_cat = config.get("newCategory", {})
                cat_name = new_cat.get("name", "AI Predictions")
                cat_color = new_cat.get("color", "#8B5CF6")

                # Check if category already exists
                existing_cat = await TagRepository.get_category_by_name(
                    connection, project_id, cat_name
                )
                if existing_cat:
                    created_category_id = existing_cat["id"]
                else:
                    # Create new category
                    new_category = await TagRepository.create_category(
                        connection,
                        project_id,
                        {
                            "name": cat_name,
                            "display_name": cat_name,
                            "color": cat_color,
                        },
                    )
                    await connection.commit()
                    created_category_id = new_category["id"]
                logger.info(f"Using category '{cat_name}' with ID {created_category_id}")

            for image_id in image_ids:
                try:
                    # For mock classifiers, we don't need to fetch image bytes
                    if is_mock:
                        # Verify image exists in database
                        image = await SharedImageRepository.get_by_id(
                            connection, UUID(image_id)
                        )
                        if not image:
                            logger.warning(f"Image not found: {image_id}")
                            failed += 1
                            continue

                        # Classify using image ID (no bytes needed for mock)
                        classification = await classifier.classify_by_id(image_id, top_k=1)
                    else:
                        # For real classifiers, get image bytes
                        image = await SharedImageRepository.get_by_id(
                            connection, UUID(image_id)
                        )
                        if not image:
                            logger.warning(f"Image not found: {image_id}")
                            failed += 1
                            continue

                        image_bytes = await _get_image_bytes(image)
                        if not image_bytes:
                            logger.warning(f"Could not get bytes for image: {image_id}")
                            failed += 1
                            continue

                        classification = await classifier.classify(image_bytes, top_k=1)

                    # Create/apply tag from prediction if enabled
                    if create_tags and classification.predicted_class:
                        predicted_class = classification.predicted_class
                        tag_id = await _get_or_create_tag(
                            connection,
                            project_id,
                            predicted_class,
                            label_mapping_config,
                            uncategorized_category_id,
                            created_category_id,
                            TagRepository,
                        )

                        # Add tag to image if we have a tag ID
                        if tag_id:
                            # Ensure tag_id is a UUID
                            if isinstance(tag_id, str):
                                tag_id = UUID(tag_id)
                            await SharedImageTagRepository.add_tag(
                                connection,
                                project_id,
                                UUID(image_id),
                                tag_id,
                            )
                            await connection.commit()

                    results.append({
                        "image_id": image_id,
                        "predicted_class": classification.predicted_class,
                        "confidence": classification.confidence,
                        "tag_created": create_tags and classification.predicted_class is not None,
                    })
                    processed += 1

                except Exception as e:
                    logger.error(f"Failed to classify image {image_id}: {e}")
                    failed += 1

                # Update progress
                redis_client.hset(
                    progress_key,
                    mapping={
                        "status": "running",
                        "processed": processed,
                        "failed": failed,
                        "total": total,
                    },
                )

            # Mark complete
            redis_client.hset(
                progress_key,
                mapping={
                    "status": "completed",
                    "processed": processed,
                    "failed": failed,
                    "total": total,
                },
            )

            return {
                "status": "completed",
                "processed": processed,
                "failed": failed,
                "total": total,
                "results": results,
            }

    except Exception as e:
        logger.exception(f"Batch classification failed: {e}")
        redis_client.hset(
            progress_key,
            mapping={
                "status": "failed",
                "error": str(e),
                "processed": processed,
                "failed": failed,
                "total": total,
            },
        )
        raise


async def _get_or_create_tag(
    connection,
    project_id: int,
    predicted_class: str,
    label_mapping_config: dict | None,
    uncategorized_category_id: str | None,
    created_category_id: str | None,
    TagRepository,
) -> str | None:
    """Get or create tag based on mapping configuration.

    Args:
        connection: Database connection
        project_id: Project ID
        predicted_class: The predicted class name from classifier
        label_mapping_config: Label mapping configuration
        uncategorized_category_id: ID of uncategorized category
        created_category_id: ID of newly created category (if any)
        TagRepository: Tag repository class

    Returns:
        Tag ID or None
    """
    config = label_mapping_config or {}
    mode = config.get("mode", "uncategorized")

    if mode == "uncategorized":
        # Uncategorized mode: create/use tags in uncategorized category
        uncat_config = config.get("uncategorized", {}).get(predicted_class, {})
        action = uncat_config.get("action", "create")

        if action == "existing" and uncat_config.get("existingTagId"):
            # Use existing tag directly
            return uncat_config["existingTagId"]
        else:
            # Create new tag in uncategorized
            tag_name = uncat_config.get("tagName") or predicted_class

            if not uncategorized_category_id:
                logger.warning("No uncategorized category available")
                return None

            # Find or create tag
            tag = await TagRepository.get_by_name(
                connection, tag_name, project_id, uncategorized_category_id
            )
            if not tag:
                tag = await TagRepository.create(
                    connection,
                    project_id,
                    {
                        "name": tag_name,
                        "color": "#8B5CF6",  # Violet for AI predictions
                        "category_id": uncategorized_category_id,
                    },
                )
                await connection.commit()

            return tag["id"]

    elif mode == "categorized":
        category_mode = config.get("categoryMode", "create")

        if category_mode == "existing":
            # Use existing tag from mapping
            mapping = config.get("existingCategoryTagMapping", {})
            tag_id = mapping.get(predicted_class)
            if tag_id:
                return tag_id
            else:
                logger.warning(f"No tag mapping for class '{predicted_class}' in existing category mode")
                return None

        else:  # create new category
            # Tags go to the newly created category
            if not created_category_id:
                logger.warning("No created category available")
                return None

            new_cat = config.get("newCategory", {})
            tag_names = new_cat.get("tagNames", {})
            tag_name = tag_names.get(predicted_class) or predicted_class

            # Find or create tag in the new category
            tag = await TagRepository.get_by_name(
                connection, tag_name, project_id, created_category_id
            )
            if not tag:
                tag = await TagRepository.create(
                    connection,
                    project_id,
                    {
                        "name": tag_name,
                        "color": new_cat.get("color", "#8B5CF6"),
                        "category_id": created_category_id,
                    },
                )
                await connection.commit()

            return tag["id"]

    return None


async def _get_image_bytes(image: dict) -> bytes | None:
    """Get image bytes from storage.

    Args:
        image: Image dict with storage_url or file_path

    Returns:
        Image bytes or None if not accessible
    """
    import httpx

    # Try to get from storage URL
    url = image.get("storage_url") or image.get("thumbnail_url")
    if not url:
        # Try to construct from file path - this depends on storage configuration
        file_path = image.get("file_path")
        if file_path:
            # For local storage, try to read directly
            try:
                with open(file_path, "rb") as f:
                    return f.read()
            except Exception:
                pass
        return None

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(url)
            response.raise_for_status()
            return response.content
    except Exception as e:
        logger.error(f"Failed to fetch image bytes from {url}: {e}")
        return None
