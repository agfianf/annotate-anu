"""Service for computing image quality metrics."""

import asyncio
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from uuid import UUID

import cv2
import imagehash
import numpy as np
from PIL import Image
from sqlalchemy.ext.asyncio import AsyncConnection

from app.config import settings
from app.repositories.image_quality import ImageQualityRepository

logger = logging.getLogger(__name__)


# Quality thresholds for issue detection
SHARPNESS_THRESHOLD = 0.15  # Below this = blur
BRIGHTNESS_LOW_THRESHOLD = 0.15  # Below this = too dark
BRIGHTNESS_HIGH_THRESHOLD = 0.85  # Above this = overexposed
CONTRAST_THRESHOLD = 0.15  # Below this = low contrast
UNIQUENESS_THRESHOLD = 0.1  # Below this = near-duplicate


class ImageQualityService:
    """Service for computing and managing image quality metrics."""

    @staticmethod
    def compute_sharpness(image_array: np.ndarray) -> float:
        """Compute sharpness score using Laplacian variance method.

        Higher values indicate sharper images. Normalized to 0-1 range.

        Args:
            image_array: RGB image as numpy array

        Returns:
            Sharpness score (0-1), higher = sharper
        """
        # Convert to grayscale
        if len(image_array.shape) == 3:
            gray = cv2.cvtColor(image_array, cv2.COLOR_RGB2GRAY)
        else:
            gray = image_array

        # Compute Laplacian and its variance
        laplacian = cv2.Laplacian(gray, cv2.CV_64F)
        variance = laplacian.var()

        # Normalize to 0-1 (typical variance ranges from 0 to ~1000+)
        # Using 500 as normalization factor based on empirical testing
        return min(variance / 500.0, 1.0)

    @staticmethod
    def compute_brightness(image_array: np.ndarray) -> float:
        """Compute brightness score as mean pixel intensity.

        Args:
            image_array: RGB image as numpy array

        Returns:
            Brightness score (0-1), 0.3-0.7 is optimal
        """
        return float(np.mean(image_array) / 255.0)

    @staticmethod
    def compute_contrast(image_array: np.ndarray) -> float:
        """Compute contrast score as standard deviation of pixels.

        Args:
            image_array: RGB image as numpy array

        Returns:
            Contrast score (0-1), higher = more contrast
        """
        # Max theoretical std dev is ~127.5 for 8-bit images
        return float(np.std(image_array) / 127.5)

    @staticmethod
    def compute_channel_averages(image_array: np.ndarray) -> tuple[float, float, float]:
        """Compute average intensity for each RGB channel.

        Args:
            image_array: RGB image as numpy array (H, W, 3)

        Returns:
            Tuple of (red_avg, green_avg, blue_avg), each 0-1
        """
        if len(image_array.shape) != 3 or image_array.shape[2] != 3:
            # Grayscale image - return same value for all channels
            avg = float(np.mean(image_array) / 255.0)
            return (avg, avg, avg)

        red_avg = float(np.mean(image_array[:, :, 0]) / 255.0)
        green_avg = float(np.mean(image_array[:, :, 1]) / 255.0)
        blue_avg = float(np.mean(image_array[:, :, 2]) / 255.0)
        return (red_avg, green_avg, blue_avg)

    @staticmethod
    def compute_perceptual_hash(pil_image: Image.Image) -> str:
        """Compute perceptual hash for duplicate detection.

        Args:
            pil_image: PIL Image object

        Returns:
            Hex string of perceptual hash (16 chars)
        """
        phash = imagehash.phash(pil_image)
        return str(phash)

    @staticmethod
    def compute_hash_similarity(hash1: str, hash2: str) -> float:
        """Compute similarity between two perceptual hashes.

        Args:
            hash1: First perceptual hash
            hash2: Second perceptual hash

        Returns:
            Similarity score (0-1), 1 = identical, 0 = completely different
        """
        try:
            h1 = imagehash.hex_to_hash(hash1)
            h2 = imagehash.hex_to_hash(hash2)
            # Hamming distance (0 = identical, 64 = max difference for 64-bit hash)
            distance = h1 - h2
            # Convert to similarity (1 = identical)
            return 1.0 - (distance / 64.0)
        except Exception:
            return 0.0

    @staticmethod
    def compute_overall_quality(
        sharpness: float,
        brightness: float,
        contrast: float,
        uniqueness: float,
    ) -> float:
        """Compute overall quality score as weighted average.

        Args:
            sharpness: Sharpness score (0-1)
            brightness: Brightness score (0-1)
            contrast: Contrast score (0-1)
            uniqueness: Uniqueness score (0-1)

        Returns:
            Overall quality score (0-1)
        """
        # Weights for each metric
        weights = {
            "sharpness": 0.35,  # Most important for CV
            "brightness": 0.20,
            "contrast": 0.20,
            "uniqueness": 0.25,  # Important for data leakage
        }

        # Brightness is optimal around 0.5 (not too dark, not too bright)
        brightness_score = 1.0 - abs(brightness - 0.5) * 2

        weighted_sum = (
            weights["sharpness"] * sharpness
            + weights["brightness"] * brightness_score
            + weights["contrast"] * contrast
            + weights["uniqueness"] * uniqueness
        )
        return min(max(weighted_sum, 0.0), 1.0)

    @staticmethod
    def detect_issues(
        sharpness: float,
        brightness: float,
        contrast: float,
        uniqueness: float,
    ) -> list[str]:
        """Detect quality issues based on metric thresholds.

        Args:
            sharpness: Sharpness score (0-1)
            brightness: Brightness score (0-1)
            contrast: Contrast score (0-1)
            uniqueness: Uniqueness score (0-1)

        Returns:
            List of detected issue types
        """
        issues = []

        if sharpness < SHARPNESS_THRESHOLD:
            issues.append("blur")
        if brightness < BRIGHTNESS_LOW_THRESHOLD:
            issues.append("low_brightness")
        elif brightness > BRIGHTNESS_HIGH_THRESHOLD:
            issues.append("high_brightness")
        if contrast < CONTRAST_THRESHOLD:
            issues.append("low_contrast")
        if uniqueness < UNIQUENESS_THRESHOLD:
            issues.append("duplicate")

        return issues

    @staticmethod
    async def process_single_image(file_path: Path) -> dict[str, Any]:
        """Compute all quality metrics for a single image file.

        Args:
            file_path: Absolute path to the image file

        Returns:
            Dict with all computed metrics

        Raises:
            Exception: If image cannot be loaded or processed
        """
        # Load image
        pil_image = Image.open(file_path).convert("RGB")
        image_array = np.array(pil_image)

        # Compute metrics
        sharpness = ImageQualityService.compute_sharpness(image_array)
        brightness = ImageQualityService.compute_brightness(image_array)
        contrast = ImageQualityService.compute_contrast(image_array)
        red_avg, green_avg, blue_avg = ImageQualityService.compute_channel_averages(image_array)
        perceptual_hash = ImageQualityService.compute_perceptual_hash(pil_image)

        return {
            "sharpness": sharpness,
            "brightness": brightness,
            "contrast": contrast,
            "red_avg": red_avg,
            "green_avg": green_avg,
            "blue_avg": blue_avg,
            "perceptual_hash": perceptual_hash,
        }

    @staticmethod
    async def compute_uniqueness_for_batch(
        connection: AsyncConnection,
        project_id: int,
        new_hashes: dict[UUID, str],
    ) -> dict[UUID, float]:
        """Compute uniqueness scores for a batch of new images.

        Compares new image hashes against existing project hashes.

        Args:
            connection: Database connection
            project_id: Project ID
            new_hashes: Dict mapping shared_image_id to perceptual_hash

        Returns:
            Dict mapping shared_image_id to uniqueness score (0-1)
        """
        if not new_hashes:
            return {}

        # Get existing hashes from completed quality metrics in project
        from app.repositories.image_quality import ImageQualityRepository

        existing_metrics = await ImageQualityRepository.get_quality_distribution(
            connection, project_id
        )
        existing_hashes = {
            m["shared_image_id"]: m["perceptual_hash"]
            for m in existing_metrics
            if m.get("perceptual_hash")
        }

        # Compute uniqueness for each new image
        uniqueness_scores = {}
        all_hashes = list(existing_hashes.values()) + list(new_hashes.values())

        for image_id, new_hash in new_hashes.items():
            if not new_hash:
                uniqueness_scores[image_id] = 1.0
                continue

            # Find max similarity to any other image
            max_similarity = 0.0
            for other_id, other_hash in existing_hashes.items():
                if other_id != image_id and other_hash:
                    similarity = ImageQualityService.compute_hash_similarity(new_hash, other_hash)
                    max_similarity = max(max_similarity, similarity)

            # Also compare within new batch
            for other_id, other_hash in new_hashes.items():
                if other_id != image_id and other_hash:
                    similarity = ImageQualityService.compute_hash_similarity(new_hash, other_hash)
                    max_similarity = max(max_similarity, similarity)

            # Uniqueness = 1 - max_similarity
            uniqueness_scores[image_id] = 1.0 - max_similarity

        return uniqueness_scores

    @staticmethod
    async def process_batch(
        connection: AsyncConnection,
        project_id: int,
        batch_items: list[dict],
    ) -> dict[str, int]:
        """Process a batch of images for quality metrics.

        Args:
            connection: Database connection
            project_id: Project ID
            batch_items: List of dicts with 'shared_image_id' and 'file_path'

        Returns:
            Dict with counts: processed, failed, skipped
        """
        results = {"processed": 0, "failed": 0, "skipped": 0}

        if not batch_items:
            return results

        # First pass: compute individual metrics
        computed_metrics: dict[UUID, dict] = {}
        for item in batch_items:
            # Use shared_image_id from the quality metrics record
            shared_image_id = item["shared_image_id"]
            file_path = item.get("file_path")

            if not file_path:
                results["skipped"] += 1
                continue

            full_path = settings.SHARE_ROOT / file_path

            if not full_path.exists():
                logger.warning(f"Image file not found: {full_path}")
                await ImageQualityRepository.update_status(
                    connection,
                    shared_image_id,
                    "failed",
                    error_message=f"File not found: {file_path}",
                )
                results["failed"] += 1
                continue

            try:
                # Mark as processing
                await ImageQualityRepository.update_status(
                    connection, shared_image_id, "processing"
                )

                # Compute metrics
                metrics = await ImageQualityService.process_single_image(full_path)
                computed_metrics[shared_image_id] = metrics

            except Exception as e:
                logger.error(f"Failed to process image {shared_image_id}: {e}")
                await ImageQualityRepository.update_status(
                    connection,
                    shared_image_id,
                    "failed",
                    error_message=str(e)[:500],
                )
                results["failed"] += 1

        # Second pass: compute uniqueness scores using perceptual hashes
        new_hashes = {
            sid: m["perceptual_hash"]
            for sid, m in computed_metrics.items()
            if m.get("perceptual_hash")
        }
        uniqueness_scores = await ImageQualityService.compute_uniqueness_for_batch(
            connection, project_id, new_hashes
        )

        # Third pass: save all metrics
        for shared_image_id, metrics in computed_metrics.items():
            try:
                uniqueness = uniqueness_scores.get(shared_image_id, 1.0)
                overall_quality = ImageQualityService.compute_overall_quality(
                    metrics["sharpness"],
                    metrics["brightness"],
                    metrics["contrast"],
                    uniqueness,
                )
                issues = ImageQualityService.detect_issues(
                    metrics["sharpness"],
                    metrics["brightness"],
                    metrics["contrast"],
                    uniqueness,
                )

                await ImageQualityRepository.update_metrics(
                    connection,
                    shared_image_id,
                    {
                        "sharpness": metrics["sharpness"],
                        "brightness": metrics["brightness"],
                        "contrast": metrics["contrast"],
                        "red_avg": metrics["red_avg"],
                        "green_avg": metrics["green_avg"],
                        "blue_avg": metrics["blue_avg"],
                        "perceptual_hash": metrics["perceptual_hash"],
                        "uniqueness": uniqueness,
                        "overall_quality": overall_quality,
                        "issues": issues,
                        "status": "completed",
                        "computed_at": datetime.now(timezone.utc),
                    },
                )
                results["processed"] += 1

            except Exception as e:
                logger.error(f"Failed to save metrics for {shared_image_id}: {e}")
                await ImageQualityRepository.update_status(
                    connection,
                    shared_image_id,
                    "failed",
                    error_message=str(e)[:500],
                )
                results["failed"] += 1

        return results

    @staticmethod
    async def queue_quality_computation(
        connection: AsyncConnection,
        project_id: int,
        shared_image_ids: list[UUID],
    ) -> int:
        """Create pending quality metrics records for images.

        This is called after image upload to queue images for processing.

        Args:
            connection: Database connection
            project_id: Project ID
            shared_image_ids: List of shared image IDs to process

        Returns:
            Number of records created
        """
        await ImageQualityRepository.bulk_create_pending(connection, shared_image_ids)
        return len(shared_image_ids)

    @staticmethod
    async def process_pending_for_project(
        connection: AsyncConnection,
        project_id: int,
        batch_size: int = 50,
    ) -> dict[str, int]:
        """Process pending quality metrics for a project.

        This is called by background tasks or manually triggered.

        Args:
            connection: Database connection
            project_id: Project ID
            batch_size: Number of images to process per batch

        Returns:
            Dict with processing results
        """
        # Get images without metrics first
        images_without = await ImageQualityRepository.get_images_without_metrics(
            connection, project_id, limit=batch_size
        )

        # Create pending records for them
        if images_without:
            await ImageQualityRepository.bulk_create_pending(
                connection, [img["id"] for img in images_without]
            )

        # Get pending images with file paths
        pending = await ImageQualityRepository.get_pending_for_project(
            connection, project_id, limit=batch_size
        )

        if not pending:
            return {"processed": 0, "failed": 0, "skipped": 0, "remaining": 0}

        # Process batch
        results = await ImageQualityService.process_batch(connection, project_id, pending)

        # Get remaining count using accurate COUNT queries
        remaining_without = await ImageQualityRepository.count_images_without_metrics(
            connection, project_id
        )
        remaining_pending = await ImageQualityRepository.count_pending_for_project(
            connection, project_id
        )
        results["remaining"] = remaining_without + remaining_pending

        return results
