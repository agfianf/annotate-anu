"""Mock segmenter service for testing segmentation workflows.

This service generates realistic random segmentation results for demo purposes.
It uses hash-based seeding for reproducibility (same image = same results).

Supports three modes:
- auto: Generate random detections with polygon masks
- text: Generate instances of the specified class
- bbox: Generate polygon masks inside provided bounding boxes
"""

import asyncio
import math
import random
import time

from app.schemas.inference.response import InferenceResponse, MaskPolygon

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


def generate_organic_polygon(
    bbox: list[float],
    rng: random.Random,
    num_points: int = 20,
    irregularity: float = 0.2,
) -> list[list[float]]:
    """Generate an organic-looking polygon within a bounding box.

    Uses ellipse + noise approach for realistic segmentation masks.
    The polygon follows an elliptical shape with random perturbations.

    Parameters
    ----------
    bbox : list[float]
        Bounding box [x1, y1, x2, y2].
    rng : random.Random
        Random number generator for reproducibility.
    num_points : int
        Number of points in the polygon.
    irregularity : float
        Amount of random perturbation (0.0-1.0).

    Returns
    -------
    list[list[float]]
        List of [x, y] coordinates forming the polygon.
    """
    x1, y1, x2, y2 = bbox
    cx = (x1 + x2) / 2
    cy = (y1 + y2) / 2
    rx = (x2 - x1) / 2 * 0.9  # Slightly smaller than box
    ry = (y2 - y1) / 2 * 0.9

    points: list[list[float]] = []
    angle_step = 2 * math.pi / num_points

    for i in range(num_points):
        angle = i * angle_step

        # Base ellipse point
        base_x = cx + rx * math.cos(angle)
        base_y = cy + ry * math.sin(angle)

        # Add random perturbation
        # Scale perturbation by distance from center for more natural shapes
        perturb_scale = min(rx, ry) * irregularity
        dx = rng.gauss(0, perturb_scale)
        dy = rng.gauss(0, perturb_scale)

        # Apply perturbation
        px = base_x + dx
        py = base_y + dy

        # Clamp to bounding box with small margin
        margin = 2
        px = max(x1 + margin, min(x2 - margin, px))
        py = max(y1 + margin, min(y2 - margin, py))

        points.append([round(px, 2), round(py, 2)])

    return points


def calculate_polygon_area(polygon: list[list[float]]) -> float:
    """Calculate the area of a polygon using the shoelace formula.

    Parameters
    ----------
    polygon : list[list[float]]
        List of [x, y] coordinates forming the polygon.

    Returns
    -------
    float
        Area of the polygon in pixels.
    """
    n = len(polygon)
    if n < 3:
        return 0.0

    area = 0.0
    for i in range(n):
        j = (i + 1) % n
        area += polygon[i][0] * polygon[j][1]
        area -= polygon[j][0] * polygon[i][1]

    return abs(area) / 2.0


class MockSegmenterService:
    """Mock segmenter that generates random but realistic segmentation results.

    Features:
    - Reproducible results: Same image bytes produce same segmentations
    - Image-aware placement: Objects positioned realistically based on image dimensions
    - Organic polygon shapes: Natural-looking masks (not rectangles)
    - Multiple modes: auto, text prompt, bbox prompt
    - Configurable latency simulation: Mimics real inference time
    """

    def __init__(
        self,
        class_list: list[str] | None = None,
        min_latency_ms: float = 50,
        max_latency_ms: float = 200,
    ):
        """Initialize mock segmenter.

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
        """Generate a center-weighted position using Gaussian distribution."""
        cx = rng.gauss(image_width / 2, image_width / 4)
        cy = rng.gauss(image_height / 2, image_height / 4)

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
        """Generate a single bounding box with realistic dimensions."""
        cx, cy = self._generate_center_weighted_position(rng, image_width, image_height)

        min_size_ratio = 0.05
        max_size_ratio = 0.40

        size_ratio_w = rng.betavariate(2, 5) * (max_size_ratio - min_size_ratio) + min_size_ratio
        size_ratio_h = rng.betavariate(2, 5) * (max_size_ratio - min_size_ratio) + min_size_ratio

        box_w = image_width * size_ratio_w
        box_h = image_height * size_ratio_h

        x1 = max(0, cx - box_w / 2)
        y1 = max(0, cy - box_h / 2)
        x2 = min(image_width, cx + box_w / 2)
        y2 = min(image_height, cy + box_h / 2)

        return [x1, y1, x2, y2]

    def _generate_confidence_score(self, rng: random.Random) -> float:
        """Generate a realistic confidence score (0.50-0.95)."""
        return rng.betavariate(5, 2) * 0.45 + 0.50

    def _generate_mask_from_box(
        self,
        box: list[float],
        rng: random.Random,
    ) -> MaskPolygon:
        """Generate a polygon mask from a bounding box."""
        # Generate organic polygon
        num_points = rng.randint(16, 24)
        irregularity = rng.uniform(0.15, 0.25)
        polygon = generate_organic_polygon(box, rng, num_points, irregularity)

        # Calculate area
        area = calculate_polygon_area(polygon)

        return MaskPolygon(
            polygons=[polygon],  # Single polygon per mask
            area=round(area, 2),
        )

    async def segment(
        self,
        image_bytes: bytes,
        image_width: int,
        image_height: int,
        mode: str,
        text_prompt: str | None = None,
        bounding_boxes: list[list[float]] | None = None,
        threshold: float = 0.5,
        class_filter: list[str] | None = None,
    ) -> InferenceResponse:
        """Generate mock segmentation result.

        Parameters
        ----------
        image_bytes : bytes
            Image data (used for seeding randomness for reproducibility).
        image_width : int
            Width of the image in pixels.
        image_height : int
            Height of the image in pixels.
        mode : str
            Inference mode: 'auto', 'text', or 'bbox'.
        text_prompt : str | None
            Text prompt for 'text' mode (the class name to segment).
        bounding_boxes : list[list[float]] | None
            Bounding boxes for 'bbox' mode [[x1, y1, x2, y2, label], ...].
        threshold : float
            Confidence threshold for filtering detections.
        class_filter : list[str] | None
            Optional list of classes to include (for 'auto' mode).

        Returns
        -------
        InferenceResponse
            Mock segmentation result with polygon masks.
        """
        start_time = time.time()

        # Simulate processing latency
        latency = random.uniform(self.min_latency_ms, self.max_latency_ms) / 1000
        await asyncio.sleep(latency)

        # Use image hash for reproducible results
        sample_size = min(1000, len(image_bytes))
        seed = hash(image_bytes[:sample_size])
        rng = random.Random(seed)

        boxes: list[list[float]] = []
        scores: list[float] = []
        masks: list[MaskPolygon] = []
        labels: list[str] = []

        if mode == "bbox" and bounding_boxes:
            # Bbox prompt mode: generate masks inside provided boxes
            for bbox_input in bounding_boxes:
                # bbox_input can be [x1, y1, x2, y2] or [x1, y1, x2, y2, label_idx]
                if len(bbox_input) >= 4:
                    box = [float(bbox_input[0]), float(bbox_input[1]),
                           float(bbox_input[2]), float(bbox_input[3])]

                    # Generate mask for this box
                    mask = self._generate_mask_from_box(box, rng)
                    score = self._generate_confidence_score(rng)

                    # Use generic label for bbox mode
                    label = "object"

                    boxes.append([round(x, 2) for x in box])
                    scores.append(round(score, 4))
                    masks.append(mask)
                    labels.append(label)

        elif mode == "text" and text_prompt:
            # Text prompt mode: generate 1-3 instances of the prompted class
            # Normalize the prompt
            target_class = text_prompt.strip().lower()

            # Check if class exists in our vocabulary
            matching_class = None
            for c in self.classes:
                if c.lower() == target_class:
                    matching_class = c
                    break

            if matching_class is None:
                # If not in vocabulary, use the prompt as-is
                matching_class = text_prompt.strip()

            # Generate 1-3 instances
            num_instances = rng.randint(1, 3)

            for _ in range(num_instances):
                box = self._generate_box(rng, image_width, image_height)
                mask = self._generate_mask_from_box(box, rng)
                score = self._generate_confidence_score(rng)

                if score >= threshold:
                    boxes.append([round(x, 2) for x in box])
                    scores.append(round(score, 4))
                    masks.append(mask)
                    labels.append(matching_class)

        else:
            # Auto mode: generate random detections with masks
            available_classes = self.classes
            if class_filter:
                available_classes = [c for c in self.classes if c in class_filter]
                if not available_classes:
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

            # Generate 2-8 detections
            num_raw_detections = rng.randint(2, 8)

            for _ in range(num_raw_detections):
                score = self._generate_confidence_score(rng)

                if score < threshold:
                    continue

                box = self._generate_box(rng, image_width, image_height)
                mask = self._generate_mask_from_box(box, rng)
                label = rng.choice(available_classes)

                boxes.append([round(x, 2) for x in box])
                scores.append(round(score, 4))
                masks.append(mask)
                labels.append(label)

        # Sort by score descending
        if boxes:
            sorted_indices = sorted(range(len(scores)), key=lambda i: scores[i], reverse=True)
            boxes = [boxes[i] for i in sorted_indices]
            scores = [scores[i] for i in sorted_indices]
            masks = [masks[i] for i in sorted_indices]
            labels = [labels[i] for i in sorted_indices]

        processing_time_ms = (time.time() - start_time) * 1000

        return InferenceResponse(
            num_objects=len(boxes),
            boxes=boxes,
            scores=scores,
            masks=masks,
            labels=labels,
            processing_time_ms=round(processing_time_ms, 2),
            visualization_base64=None,
        )

    async def segment_by_id(
        self,
        image_id: str,
        image_width: int,
        image_height: int,
        mode: str,
        text_prompt: str | None = None,
        bounding_boxes: list[list[float]] | None = None,
        threshold: float = 0.5,
        class_filter: list[str] | None = None,
    ) -> InferenceResponse:
        """Generate mock segmentation result using image ID as seed.

        This method is useful when actual image bytes are not accessible.

        Parameters
        ----------
        image_id : str
            Image ID (used for seeding randomness for reproducibility).
        Other parameters are the same as segment().

        Returns
        -------
        InferenceResponse
            Mock segmentation result with polygon masks.
        """
        return await self.segment(
            image_id.encode("utf-8"),
            image_width,
            image_height,
            mode,
            text_prompt=text_prompt,
            bounding_boxes=bounding_boxes,
            threshold=threshold,
            class_filter=class_filter,
        )


# Singleton instance for use throughout the application
mock_segmenter = MockSegmenterService()
