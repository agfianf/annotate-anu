"""Mock classifier service for testing classification workflows.

This service generates realistic random classification results for demo purposes.
It uses hash-based seeding for reproducibility (same image = same results).
"""

import asyncio
import math
import random
import time

from app.schemas.inference.response import ClassificationResponse, ClassPrediction

# ImageNet-style common classes (~50 classes)
IMAGENET_SUBSET = [
    # Animals
    "cat", "dog", "bird", "fish", "horse", "elephant", "lion", "tiger", "bear", "wolf",
    "rabbit", "deer", "monkey", "penguin", "owl", "butterfly", "snake", "turtle",
    # Vehicles
    "car", "truck", "bicycle", "motorcycle", "airplane", "boat", "train", "bus",
    # People & activities
    "person",
    # Nature
    "flower", "tree", "mountain", "beach", "ocean", "forest", "lake", "sky", "sunset",
    # Food
    "apple", "banana", "orange", "pizza", "burger", "coffee", "cake", "sandwich",
    # Objects
    "book", "phone", "laptop", "chair", "table", "clock", "lamp", "guitar", "ball",
]


class MockClassifierService:
    """Mock classifier that generates random but realistic classification results.

    Features:
    - Reproducible results: Same image bytes produce same classification
    - Realistic probability distribution: Top class dominates with Dirichlet-like spread
    - Configurable latency simulation: Mimics real inference time
    """

    def __init__(
        self,
        class_list: list[str] | None = None,
        min_latency_ms: float = 50,
        max_latency_ms: float = 200,
    ):
        """Initialize mock classifier.

        Parameters
        ----------
        class_list : list[str] | None
            Custom class list. Defaults to IMAGENET_SUBSET.
        min_latency_ms : float
            Minimum simulated latency in milliseconds.
        max_latency_ms : float
            Maximum simulated latency in milliseconds.
        """
        self.classes = class_list or IMAGENET_SUBSET
        self.min_latency_ms = min_latency_ms
        self.max_latency_ms = max_latency_ms

    async def classify(
        self,
        image_bytes: bytes,
        top_k: int = 5,
    ) -> ClassificationResponse:
        """Generate mock classification result.

        Parameters
        ----------
        image_bytes : bytes
            Image data (used for seeding randomness for reproducibility).
        top_k : int
            Number of top predictions to return.

        Returns
        -------
        ClassificationResponse
            Mock classification result with realistic probability distribution.
        """
        start_time = time.time()

        # Simulate processing latency
        latency = random.uniform(self.min_latency_ms, self.max_latency_ms) / 1000
        await asyncio.sleep(latency)

        # Use image hash for reproducible results (same image = same result)
        # Take first 1000 bytes for hash to handle large images efficiently
        sample_size = min(1000, len(image_bytes))
        seed = hash(image_bytes[:sample_size])
        rng = random.Random(seed)

        # Generate probability distribution using softmax over random scores
        # This creates a realistic distribution where one class dominates
        num_classes = len(self.classes)

        # Generate raw logit scores with heavy tail (top class dominates)
        raw_scores: list[float] = []
        for i in range(num_classes):
            if i == 0:
                # Top class gets high score
                raw_scores.append(rng.uniform(3.0, 6.0))
            elif i < 5:
                # Next few classes get medium scores
                raw_scores.append(rng.uniform(0.5, 2.0))
            else:
                # Remaining classes get low scores
                raw_scores.append(rng.uniform(0.01, 0.5))

        # Shuffle to randomize which class is "top"
        rng.shuffle(raw_scores)

        # Softmax normalization: exp(x_i) / sum(exp(x))
        max_score = max(raw_scores)
        exp_scores = [math.exp(s - max_score) for s in raw_scores]
        total = sum(exp_scores)
        probabilities = [s / total for s in exp_scores]

        # Create class-probability pairs and sort by probability (descending)
        class_probs = list(zip(self.classes, probabilities))
        class_probs.sort(key=lambda x: x[1], reverse=True)

        # Build top-k predictions
        actual_top_k = min(top_k, len(class_probs))
        top_k_predictions = [
            ClassPrediction(class_name=cls, probability=round(prob, 4))
            for cls, prob in class_probs[:actual_top_k]
        ]

        # Top prediction
        predicted_class = class_probs[0][0]
        confidence = class_probs[0][1]

        # Full probability dict (rounded for cleaner output)
        class_probabilities = {cls: round(prob, 6) for cls, prob in class_probs}

        processing_time_ms = (time.time() - start_time) * 1000

        return ClassificationResponse(
            predicted_class=predicted_class,
            confidence=round(confidence, 4),
            top_k_predictions=top_k_predictions,
            class_probabilities=class_probabilities,
            processing_time_ms=round(processing_time_ms, 2),
            model_id="mock-classifier",
        )

    async def classify_by_id(
        self,
        image_id: str,
        top_k: int = 5,
    ) -> ClassificationResponse:
        """Generate mock classification result using image ID as seed.

        This method is useful when actual image bytes are not accessible,
        such as in batch processing where images may be stored remotely.

        Parameters
        ----------
        image_id : str
            Image ID (used for seeding randomness for reproducibility).
        top_k : int
            Number of top predictions to return.

        Returns
        -------
        ClassificationResponse
            Mock classification result with realistic probability distribution.
        """
        # Use image ID as bytes for seeding
        return await self.classify(image_id.encode('utf-8'), top_k=top_k)


# Singleton instance for use throughout the application
mock_classifier = MockClassifierService()
