"""Mock detector service for testing detection workflows.

This service generates realistic random detection results for demo purposes.
It uses hash-based seeding for reproducibility (same image = same results).
"""

import asyncio
import random
import time

from app.schemas.inference.response import InferenceResponse

# COCO-style common classes (~24 classes)
COCO_SUBSET = [
    # People
    "person",
    # Vehicles
    "car", "truck", "bicycle", "motorcycle", "bus",
    # Animals
    "dog", "cat", "bird", "horse", "sheep", "cow", "elephant", "bear", "zebra", "giraffe",
    # Objects
    "backpack", "umbrella", "handbag", "bottle", "cup", "chair", "couch", "bed",
]


class MockDetectorService:
    """Mock detector that generates random but realistic detection results.

    Features:
    - Reproducible results: Same image bytes produce same detections
    - Image-aware placement: Boxes positioned realistically based on image dimensions
    - Center-weighted distribution: More objects appear near the center
    - Configurable latency simulation: Mimics real inference time
    """

    def __init__(
        self,
        class_list: list[str] | None = None,
        min_latency_ms: float = 50,
        max_latency_ms: float = 200,
    ):
        """Initialize mock detector.

        Parameters
        ----------
        class_list : list[str] | None
            Custom class list. Defaults to COCO_SUBSET.
        min_latency_ms : float
            Minimum simulated latency in milliseconds.
        max_latency_ms : float
            Maximum simulated latency in milliseconds.
        """
        self.classes = class_list or COCO_SUBSET
        self.min_latency_ms = min_latency_ms
        self.max_latency_ms = max_latency_ms

    def _generate_center_weighted_position(
        self,
        rng: random.Random,
        image_width: int,
        image_height: int,
    ) -> tuple[float, float]:
        """Generate a center-weighted position using Gaussian distribution.

        Objects are more likely to appear near the center of the image.
        """
        # Use Gaussian with mean at center, std = 1/4 of dimension
        cx = rng.gauss(image_width / 2, image_width / 4)
        cy = rng.gauss(image_height / 2, image_height / 4)

        # Clamp to image bounds with some margin
        margin = 0.05
        cx = max(image_width * margin, min(image_width * (1 - margin), cx))
        cy = max(image_height * margin, min(image_height * (1 - margin), cy))

        return cx, cy

    def _generate_box(
        self,
        rng: random.Random,
        image_width: int,
        image_height: int,
    ) -> list[float]:
        """Generate a single bounding box with realistic dimensions.

        Box sizes are 5-40% of image dimensions, placed with center-weighted
        distribution.
        """
        # Get center position
        cx, cy = self._generate_center_weighted_position(rng, image_width, image_height)

        # Generate box size (5-40% of image dimensions)
        min_size_ratio = 0.05
        max_size_ratio = 0.40

        # Use beta distribution for more natural size variation (smaller objects more common)
        size_ratio_w = rng.betavariate(2, 5) * (max_size_ratio - min_size_ratio) + min_size_ratio
        size_ratio_h = rng.betavariate(2, 5) * (max_size_ratio - min_size_ratio) + min_size_ratio

        box_w = image_width * size_ratio_w
        box_h = image_height * size_ratio_h

        # Calculate box coordinates
        x1 = cx - box_w / 2
        y1 = cy - box_h / 2
        x2 = cx + box_w / 2
        y2 = cy + box_h / 2

        # Clamp to image bounds
        x1 = max(0, x1)
        y1 = max(0, y1)
        x2 = min(image_width, x2)
        y2 = min(image_height, y2)

        return [x1, y1, x2, y2]

    def _generate_confidence_score(self, rng: random.Random) -> float:
        """Generate a realistic confidence score.

        Uses beta distribution to simulate typical detector output
        where high-confidence detections are more common after NMS.
        """
        # Beta(5, 2) gives scores biased toward higher values
        return rng.betavariate(5, 2) * 0.45 + 0.50  # Range: 0.50-0.95

    async def detect(
        self,
        image_bytes: bytes,
        image_width: int,
        image_height: int,
        threshold: float = 0.5,
        class_filter: list[str] | None = None,
    ) -> InferenceResponse:
        """Generate mock detection result.

        Parameters
        ----------
        image_bytes : bytes
            Image data (used for seeding randomness for reproducibility).
        image_width : int
            Width of the image in pixels.
        image_height : int
            Height of the image in pixels.
        threshold : float
            Confidence threshold for filtering detections.
        class_filter : list[str] | None
            Optional list of classes to include. If None, all classes are possible.

        Returns
        -------
        InferenceResponse
            Mock detection result with realistic bounding boxes and labels.
        """
        start_time = time.time()

        # Simulate processing latency
        latency = random.uniform(self.min_latency_ms, self.max_latency_ms) / 1000
        await asyncio.sleep(latency)

        # Use image hash for reproducible results (same image = same result)
        sample_size = min(1000, len(image_bytes))
        seed = hash(image_bytes[:sample_size])
        rng = random.Random(seed)

        # Determine available classes
        available_classes = self.classes
        if class_filter:
            available_classes = [c for c in self.classes if c in class_filter]
            if not available_classes:
                # If no matching classes, return empty result
                processing_time_ms = (time.time() - start_time) * 1000
                return InferenceResponse(
                    num_objects=0,
                    boxes=[],
                    scores=[],
                    masks=[],
                    labels=[],
                    processing_time_ms=round(processing_time_ms, 2),
                    visualization_base64=None,
                )

        # Generate number of detections (2-8, biased toward fewer)
        num_raw_detections = rng.randint(2, 8)

        boxes: list[list[float]] = []
        scores: list[float] = []
        labels: list[str] = []

        for _ in range(num_raw_detections):
            # Generate confidence score
            score = self._generate_confidence_score(rng)

            # Apply threshold filter
            if score < threshold:
                continue

            # Generate bounding box
            box = self._generate_box(rng, image_width, image_height)

            # Assign random class from available classes
            label = rng.choice(available_classes)

            boxes.append([round(x, 2) for x in box])
            scores.append(round(score, 4))
            labels.append(label)

        # Sort by score descending
        if boxes:
            sorted_indices = sorted(range(len(scores)), key=lambda i: scores[i], reverse=True)
            boxes = [boxes[i] for i in sorted_indices]
            scores = [scores[i] for i in sorted_indices]
            labels = [labels[i] for i in sorted_indices]

        processing_time_ms = (time.time() - start_time) * 1000

        return InferenceResponse(
            num_objects=len(boxes),
            boxes=boxes,
            scores=scores,
            masks=[],  # Detection-only, no masks
            labels=labels,
            processing_time_ms=round(processing_time_ms, 2),
            visualization_base64=None,
        )

    async def detect_by_id(
        self,
        image_id: str,
        image_width: int,
        image_height: int,
        threshold: float = 0.5,
        class_filter: list[str] | None = None,
    ) -> InferenceResponse:
        """Generate mock detection result using image ID as seed.

        This method is useful when actual image bytes are not accessible,
        such as in batch processing where images may be stored remotely.

        Parameters
        ----------
        image_id : str
            Image ID (used for seeding randomness for reproducibility).
        image_width : int
            Width of the image in pixels.
        image_height : int
            Height of the image in pixels.
        threshold : float
            Confidence threshold for filtering detections.
        class_filter : list[str] | None
            Optional list of classes to include.

        Returns
        -------
        InferenceResponse
            Mock detection result with realistic bounding boxes and labels.
        """
        return await self.detect(
            image_id.encode("utf-8"),
            image_width,
            image_height,
            threshold=threshold,
            class_filter=class_filter,
        )


# Singleton instance for use throughout the application
mock_detector = MockDetectorService()
