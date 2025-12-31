"""Analytics service for dataset health check computations."""

from typing import Dict, List, Tuple
from collections import Counter
import statistics
from sqlalchemy.ext.asyncio import AsyncConnection

from app.repositories.project_image import ProjectImageRepository
from app.repositories.tag import TagRepository
from app.repositories.shared_image import SharedImageRepository


class AnalyticsService:
    """Service for computing dataset analytics and health metrics."""

    @staticmethod
    async def compute_annotation_coverage(
        connection: AsyncConnection,
        project_id: int,
        images: List[Dict],
    ) -> Dict:
        """
        Compute annotation coverage metrics.

        Returns:
            - total_images: Total number of images
            - annotated_images: Images with at least one annotation
            - unannotated_images: Images with zero annotations
            - coverage_percentage: % of images that are annotated
            - density_histogram: Distribution of annotation counts per image
        """
        total_images = len(images)

        # Count annotations per image
        annotation_counts = []
        for img in images:
            # Get tags/annotations for this image
            image_tags = await SharedImageRepository.get_tags(
                connection, img["id"], project_id
            )
            annotation_counts.append(len(image_tags))

        annotated_images = sum(1 for count in annotation_counts if count > 0)
        unannotated_images = total_images - annotated_images
        coverage_percentage = (
            (annotated_images / total_images * 100) if total_images > 0 else 0.0
        )

        # Build density histogram
        density_buckets = {
            "0": (0, 0),
            "1-5": (1, 5),
            "6-10": (6, 10),
            "11-20": (11, 20),
            "21+": (21, 10000),
        }

        density_histogram = []
        for bucket_name, (min_val, max_val) in density_buckets.items():
            count = sum(
                1 for c in annotation_counts
                if min_val <= c <= max_val
            )
            density_histogram.append({
                "bucket": bucket_name,
                "count": count,
                "min": min_val,
                "max": max_val,
            })

        return {
            "total_images": total_images,
            "annotated_images": annotated_images,
            "unannotated_images": unannotated_images,
            "coverage_percentage": round(coverage_percentage, 2),
            "density_histogram": density_histogram,
        }

    @staticmethod
    async def compute_class_balance(
        connection: AsyncConnection,
        project_id: int,
        images: List[Dict],
    ) -> Dict:
        """
        Compute class balance and imbalance metrics.

        Returns:
            - class_distribution: List of tags with annotation counts and percentages
            - imbalance_score: Gini coefficient (0 = balanced, 1 = imbalanced)
            - imbalance_level: "balanced" | "moderate" | "severe"
            - recommendations: List of actionable recommendations
        """
        # Get all tags
        all_tags = await TagRepository.list_with_usage_count(connection, project_id)
        tag_map = {tag["id"]: tag for tag in all_tags}

        # Count annotations per tag (not images, but actual annotation instances)
        tag_annotation_counts = Counter()
        tag_image_counts = Counter()

        for img in images:
            image_tags = await SharedImageRepository.get_tags(
                connection, img["id"], project_id
            )
            seen_tags = set()
            for tag in image_tags:
                tag_id = tag["id"]
                tag_annotation_counts[tag_id] += 1
                if tag_id not in seen_tags:
                    tag_image_counts[tag_id] += 1
                    seen_tags.add(tag_id)

        total_annotations = sum(tag_annotation_counts.values())

        # Build class distribution
        class_distribution = []
        percentages = []

        for tag_id, annotation_count in tag_annotation_counts.most_common():
            tag_info = tag_map.get(tag_id)
            if not tag_info:
                continue

            percentage = (
                (annotation_count / total_annotations * 100)
                if total_annotations > 0 else 0.0
            )
            percentages.append(percentage)

            # Determine status
            if percentage < 5:
                status = "severely_underrepresented"
            elif percentage < 15:
                status = "underrepresented"
            else:
                status = "healthy"

            class_distribution.append({
                "tag_id": str(tag_id),
                "tag_name": tag_info["name"],
                "annotation_count": annotation_count,
                "image_count": tag_image_counts[tag_id],
                "percentage": round(percentage, 2),
                "status": status,
            })

        # Compute Gini coefficient for imbalance
        imbalance_score = AnalyticsService._gini_coefficient(
            list(tag_annotation_counts.values())
        )

        # Determine imbalance level
        if imbalance_score < 0.3:
            imbalance_level = "balanced"
        elif imbalance_score < 0.6:
            imbalance_level = "moderate"
        else:
            imbalance_level = "severe"

        # Generate recommendations
        recommendations = AnalyticsService._generate_balance_recommendations(
            class_distribution, imbalance_score
        )

        return {
            "class_distribution": class_distribution,
            "imbalance_score": round(imbalance_score, 3),
            "imbalance_level": imbalance_level,
            "recommendations": recommendations,
        }

    @staticmethod
    def _gini_coefficient(values: List[int]) -> float:
        """
        Compute Gini coefficient for imbalance measurement.
        0 = perfect equality, 1 = perfect inequality
        """
        if not values or sum(values) == 0:
            return 0.0

        sorted_values = sorted(values)
        n = len(sorted_values)
        cumsum = 0

        for i, val in enumerate(sorted_values):
            cumsum += (2 * (i + 1) - n - 1) * val

        return cumsum / (n * sum(sorted_values))

    @staticmethod
    def _generate_balance_recommendations(
        class_distribution: List[Dict],
        imbalance_score: float
    ) -> List[str]:
        """Generate actionable recommendations based on class balance."""
        recommendations = []

        if imbalance_score > 0.6:
            recommendations.append(
                "⚠️ Severe class imbalance detected. Consider collecting more data for underrepresented classes."
            )
        elif imbalance_score > 0.3:
            recommendations.append(
                "⚠️ Moderate class imbalance. Review underrepresented classes and consider augmentation."
            )

        # Find severely underrepresented classes
        severely_under = [
            c["tag_name"] for c in class_distribution
            if c["status"] == "severely_underrepresented"
        ]

        if severely_under:
            class_names = ", ".join(severely_under[:3])
            if len(severely_under) > 3:
                class_names += f", and {len(severely_under) - 3} more"
            recommendations.append(
                f"📊 Classes with <5% representation: {class_names}"
            )

        # Check for dominant class
        if class_distribution and class_distribution[0]["percentage"] > 50:
            recommendations.append(
                f"⚠️ '{class_distribution[0]['tag_name']}' dominates with {class_distribution[0]['percentage']:.1f}% of annotations."
            )

        if not recommendations:
            recommendations.append(
                "✅ Class balance looks healthy! No immediate action needed."
            )

        return recommendations

    @staticmethod
    async def compute_spatial_heatmap(
        connection: AsyncConnection,
        project_id: int,
        images: List[Dict],
    ) -> Dict:
        """
        Compute spatial distribution of annotations.

        Returns normalized coordinates (0-1) for heatmap rendering.
        Placeholder implementation - full logic requires annotation bbox data.
        """
        # TODO: Implement actual coordinate aggregation from annotation bboxes
        # For now, return stub data

        return {
            "annotation_points": [],
            "center_of_mass": {"x": 0.5, "y": 0.5},
            "spread": {"x_std": 0.2, "y_std": 0.2},
            "clustering_score": 0.0,
            "total_annotations": 0,
        }

    @staticmethod
    async def compute_image_quality(
        connection: AsyncConnection,
        project_id: int,
        images: List[Dict],
    ) -> Dict:
        """
        Compute image quality metrics.

        Returns quality scores and issue breakdown.
        Placeholder - actual quality analysis requires async image processing.
        """
        # TODO: Implement actual quality analysis (blur, brightness, contrast)
        # This will be done via Celery tasks

        return {
            "quality_distribution": [
                {"bucket": "Poor (0-0.3)", "count": 0, "min": 0.0, "max": 0.3},
                {"bucket": "Fair (0.3-0.6)", "count": 0, "min": 0.3, "max": 0.6},
                {"bucket": "Good (0.6-1.0)", "count": len(images), "min": 0.6, "max": 1.0},
            ],
            "issue_breakdown": {
                "blur_detected": 0,
                "low_brightness": 0,
                "high_brightness": 0,
                "low_contrast": 0,
                "corrupted": 0,
            },
            "flagged_images": [],
        }

    @staticmethod
    def compute_dimension_outliers(images: List[Dict]) -> Dict:
        """
        Detect outlier images based on dimensions.

        Returns images with extreme dimensions (>3 std devs from mean).
        """
        if not images:
            return {"count": 0, "image_ids": []}

        widths = [img["width"] for img in images if img.get("width")]
        heights = [img["height"] for img in images if img.get("height")]

        if not widths or not heights:
            return {"count": 0, "image_ids": []}

        mean_width = statistics.mean(widths)
        mean_height = statistics.mean(heights)

        try:
            std_width = statistics.stdev(widths)
            std_height = statistics.stdev(heights)
        except statistics.StatisticsError:
            # Not enough data for std dev
            return {"count": 0, "image_ids": []}

        outliers = []
        for img in images:
            width = img.get("width")
            height = img.get("height")

            if not width or not height:
                continue

            width_z = abs(width - mean_width) / std_width if std_width > 0 else 0
            height_z = abs(height - mean_height) / std_height if std_height > 0 else 0

            if width_z > 3 or height_z > 3:
                outliers.append(str(img["id"]))

        return {
            "count": len(outliers),
            "image_ids": outliers,
        }

    @staticmethod
    def compute_aspect_ratio_histogram(images: List[Dict]) -> List[Dict]:
        """
        Compute aspect ratio distribution histogram.
        """
        buckets = {
            "Portrait (0.5-0.9)": (0.5, 0.9),
            "Square (0.9-1.1)": (0.9, 1.1),
            "Landscape (1.1-2.0)": (1.1, 2.0),
            "Ultra-wide (>2.0)": (2.0, 100.0),
        }

        histogram = []
        for bucket_name, (min_ratio, max_ratio) in buckets.items():
            count = 0
            for img in images:
                width = img.get("width")
                height = img.get("height")
                if width and height and height > 0:
                    ratio = width / height
                    if min_ratio <= ratio < max_ratio:
                        count += 1

            histogram.append({
                "bucket": bucket_name,
                "count": count,
                "min": min_ratio,
                "max": max_ratio,
            })

        return histogram

    @staticmethod
    def compute_file_size_histogram(images: List[Dict]) -> List[Dict]:
        """
        Compute file size distribution histogram.
        """
        buckets = {
            "<100KB": (0, 102400),
            "100KB-500KB": (102400, 512000),
            "500KB-1MB": (512000, 1048576),
            "1MB-5MB": (1048576, 5242880),
            ">5MB": (5242880, 999999999),
        }

        histogram = []
        for bucket_name, (min_size, max_size) in buckets.items():
            count = sum(
                1 for img in images
                if img.get("file_size_bytes")
                and min_size <= img["file_size_bytes"] < max_size
            )

            histogram.append({
                "bucket": bucket_name,
                "count": count,
                "min": min_size,
                "max": max_size,
            })

        return histogram
