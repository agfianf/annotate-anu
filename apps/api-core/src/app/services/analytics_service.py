"""Analytics service for dataset health check computations."""

from typing import Dict, List, Tuple
from collections import Counter
import statistics
from sqlalchemy.ext.asyncio import AsyncConnection

from app.repositories.project_image import ProjectImageRepository
from app.repositories.tag import TagRepository
from app.repositories.shared_image import SharedImageRepository
from app.repositories.annotation import AnnotationSummaryRepository


class AnalyticsService:
    """Service for computing dataset analytics and health metrics."""

    @staticmethod
    async def compute_annotation_coverage(
        connection: AsyncConnection,
        project_id: int,
        images: List[Dict],
    ) -> Dict:
        """
        Compute annotation coverage metrics based on actual detections and segmentations.

        Returns:
            - total_images: Total number of images
            - annotated_images: Images with at least one detection or segmentation
            - unannotated_images: Images with zero annotations
            - coverage_percentage: % of images that are annotated
            - density_histogram: Distribution of object counts per image (Roboflow-style)
            - total_objects: Total number of annotations across all images
            - avg_objects_per_image: Average objects per image
            - median_objects_per_image: Median objects per image
        """
        total_images = len(images)

        if total_images == 0:
            return {
                "total_images": 0,
                "annotated_images": 0,
                "unannotated_images": 0,
                "coverage_percentage": 0.0,
                "density_histogram": [],
                "total_objects": 0,
                "avg_objects_per_image": 0.0,
                "median_objects_per_image": 0,
            }

        # Get shared_image_ids from images
        shared_image_ids = [img["id"] for img in images]

        # Get actual annotation counts (detections + segmentations) for all images
        annotation_counts_map = await AnnotationSummaryRepository.get_counts_for_images(
            connection, shared_image_ids
        )

        # Calculate annotation counts per image
        annotation_counts = []
        for img_id in shared_image_ids:
            counts = annotation_counts_map.get(img_id, {"detection_count": 0, "segmentation_count": 0})
            total_count = counts["detection_count"] + counts["segmentation_count"]
            annotation_counts.append(total_count)

        # Calculate summary statistics
        annotated_images = sum(1 for count in annotation_counts if count > 0)
        unannotated_images = total_images - annotated_images
        coverage_percentage = (
            (annotated_images / total_images * 100) if total_images > 0 else 0.0
        )
        total_objects = sum(annotation_counts)
        avg_objects_per_image = total_objects / total_images if total_images > 0 else 0.0
        sorted_counts = sorted(annotation_counts)
        median_objects_per_image = sorted_counts[len(sorted_counts) // 2] if sorted_counts else 0

        # Build Roboflow-style density histogram buckets
        # Buckets: 0, 1, 2-5, 6-10, 11-20, 21+
        density_buckets = [
            ("0", 0, 0),
            ("1", 1, 1),
            ("2-5", 2, 5),
            ("6-10", 6, 10),
            ("11-20", 11, 20),
            ("21+", 21, 10000),
        ]

        density_histogram = []
        for bucket_name, min_val, max_val in density_buckets:
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
            "total_objects": total_objects,
            "avg_objects_per_image": round(avg_objects_per_image, 2),
            "median_objects_per_image": median_objects_per_image,
        }

    @staticmethod
    async def compute_class_balance(
        connection: AsyncConnection,
        project_id: int,
        images: List[Dict],
        category_id = None,
    ) -> Dict:
        """
        Compute class balance and imbalance metrics.

        Args:
            category_id: Optional UUID to filter tags by category for per-category analysis

        Returns:
            - class_distribution: List of tags with annotation counts and percentages
            - imbalance_score: Gini coefficient (0 = balanced, 1 = imbalanced)
            - imbalance_level: "balanced" | "moderate" | "severe"
            - recommendations: List of actionable recommendations
        """
        # Get all tags
        all_tags = await TagRepository.list_with_usage_count(connection, project_id)

        # Filter by category if specified
        if category_id is not None:
            all_tags = [tag for tag in all_tags if tag.get("category_id") == category_id]

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
                # Only count tags that are in our filtered tag_map (handles category filtering)
                if tag_id not in tag_map:
                    continue
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
        grid_size: int = 10,
    ) -> Dict:
        """
        Compute spatial distribution of annotations for heatmap visualization.

        Returns:
            - annotation_points: List of {x, y} normalized coordinates
            - center_of_mass: {x, y} average position
            - spread: {x_std, y_std} standard deviation
            - clustering_score: 0-1 score (higher = more clustered)
            - total_annotations: Total count
            - grid_density: 2D array of counts per grid cell
            - grid_size: Size of the grid (e.g., 10 for 10x10)
            - max_cell_count: Maximum count in any cell (for color scaling)
        """
        if not images:
            return {
                "annotation_points": [],
                "center_of_mass": {"x": 0.5, "y": 0.5},
                "spread": {"x_std": 0.0, "y_std": 0.0},
                "clustering_score": 0.0,
                "total_annotations": 0,
                "grid_density": [[0] * grid_size for _ in range(grid_size)],
                "grid_size": grid_size,
                "max_cell_count": 0,
            }

        # Get shared_image_ids
        shared_image_ids = [img["id"] for img in images]

        # Get annotation centers from repository
        centers = await AnnotationSummaryRepository.get_annotation_centers(
            connection, shared_image_ids
        )

        total_annotations = len(centers)

        if total_annotations == 0:
            return {
                "annotation_points": [],
                "center_of_mass": {"x": 0.5, "y": 0.5},
                "spread": {"x_std": 0.0, "y_std": 0.0},
                "clustering_score": 0.0,
                "total_annotations": 0,
                "grid_density": [[0] * grid_size for _ in range(grid_size)],
                "grid_size": grid_size,
                "max_cell_count": 0,
            }

        # Extract x and y coordinates
        x_coords = [c["x"] for c in centers]
        y_coords = [c["y"] for c in centers]

        # Calculate center of mass
        center_x = sum(x_coords) / len(x_coords)
        center_y = sum(y_coords) / len(y_coords)

        # Calculate spread (std deviation)
        if len(x_coords) > 1:
            x_std = statistics.stdev(x_coords)
            y_std = statistics.stdev(y_coords)
        else:
            x_std = 0.0
            y_std = 0.0

        # Build grid density (NxN grid)
        grid_density = [[0] * grid_size for _ in range(grid_size)]
        for center in centers:
            # Map 0-1 coordinates to grid indices
            grid_x = min(int(center["x"] * grid_size), grid_size - 1)
            grid_y = min(int(center["y"] * grid_size), grid_size - 1)
            # Clamp to valid range
            grid_x = max(0, grid_x)
            grid_y = max(0, grid_y)
            grid_density[grid_y][grid_x] += 1

        # Find max cell count for color scaling
        max_cell_count = max(max(row) for row in grid_density)

        # Calculate clustering score
        # Simple metric: coefficient of variation of cell counts
        # Higher CV = more uneven distribution = more clustering
        all_counts = [count for row in grid_density for count in row]
        non_zero_counts = [c for c in all_counts if c > 0]

        if len(non_zero_counts) > 1 and max_cell_count > 0:
            mean_count = sum(non_zero_counts) / len(non_zero_counts)
            variance = sum((c - mean_count) ** 2 for c in non_zero_counts) / len(non_zero_counts)
            cv = (variance ** 0.5) / mean_count if mean_count > 0 else 0

            # Normalize to 0-1 range (CV of 2+ is considered highly clustered)
            clustering_score = min(cv / 2.0, 1.0)
        else:
            clustering_score = 0.0

        # Limit annotation_points to prevent huge response
        # Sample if too many (keep first 1000)
        annotation_points = centers[:1000]

        return {
            "annotation_points": [{"x": p["x"], "y": p["y"], "weight": 1} for p in annotation_points],
            "center_of_mass": {"x": round(center_x, 4), "y": round(center_y, 4)},
            "spread": {"x_std": round(x_std, 4), "y_std": round(y_std, 4)},
            "clustering_score": round(clustering_score, 3),
            "total_annotations": total_annotations,
            "grid_density": grid_density,
            "grid_size": grid_size,
            "max_cell_count": max_cell_count,
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

    @staticmethod
    def compute_dimension_insights(images: List[Dict], max_scatter_points: int = 500) -> Dict:
        """
        Compute dimension insights for Roboflow-style visualization.

        Returns:
            - median_width: Median image width
            - median_height: Median image height
            - median_aspect_ratio: Median aspect ratio
            - min_width, max_width: Width range
            - min_height, max_height: Height range
            - dimension_variance: Normalized variance score (0-1, higher = more varied)
            - recommended_resize: Suggested resize target based on data
            - scatter_data: Width/height points for scatter plot
            - aspect_ratio_distribution: Portrait/Square/Landscape/Ultra-wide counts
        """
        if not images:
            return {
                "median_width": 0,
                "median_height": 0,
                "median_aspect_ratio": 1.0,
                "min_width": 0,
                "max_width": 0,
                "min_height": 0,
                "max_height": 0,
                "dimension_variance": 0.0,
                "recommended_resize": {"width": 640, "height": 640, "reason": "No data"},
                "scatter_data": [],
                "aspect_ratio_distribution": [],
            }

        # Collect valid dimension data
        widths = []
        heights = []
        aspect_ratios = []
        scatter_data = []

        for img in images:
            width = img.get("width")
            height = img.get("height")
            if width and height and height > 0:
                widths.append(width)
                heights.append(height)
                aspect_ratios.append(width / height)
                scatter_data.append({
                    "image_id": str(img["id"]),
                    "width": width,
                    "height": height,
                    "aspect_ratio": round(width / height, 3),
                })

        if not widths:
            return {
                "median_width": 0,
                "median_height": 0,
                "median_aspect_ratio": 1.0,
                "min_width": 0,
                "max_width": 0,
                "min_height": 0,
                "max_height": 0,
                "dimension_variance": 0.0,
                "recommended_resize": {"width": 640, "height": 640, "reason": "No dimension data"},
                "scatter_data": [],
                "aspect_ratio_distribution": [],
            }

        # Sort for median calculation
        sorted_widths = sorted(widths)
        sorted_heights = sorted(heights)
        sorted_ratios = sorted(aspect_ratios)

        n = len(widths)
        median_width = sorted_widths[n // 2]
        median_height = sorted_heights[n // 2]
        median_ratio = sorted_ratios[n // 2]

        # Calculate dimension variance (normalized coefficient of variation)
        mean_width = sum(widths) / n
        mean_height = sum(heights) / n

        try:
            std_width = statistics.stdev(widths)
            std_height = statistics.stdev(heights)
            cv_width = std_width / mean_width if mean_width > 0 else 0
            cv_height = std_height / mean_height if mean_height > 0 else 0
            # Average CV, normalized to 0-1 (CV of 0.5+ is considered high variance)
            dimension_variance = min((cv_width + cv_height) / 2 / 0.5, 1.0)
        except statistics.StatisticsError:
            dimension_variance = 0.0

        # Recommended resize based on median
        # Round to common sizes (32-pixel multiples)
        def round_to_multiple(x, multiple=32):
            return max(multiple, ((x + multiple // 2) // multiple) * multiple)

        rec_width = round_to_multiple(median_width)
        rec_height = round_to_multiple(median_height)

        # If near square, recommend square
        if 0.9 <= median_ratio <= 1.1:
            rec_size = round_to_multiple((median_width + median_height) // 2)
            recommended_resize = {
                "width": rec_size,
                "height": rec_size,
                "reason": f"Near-square median ({median_ratio:.2f}), recommend square",
            }
        else:
            recommended_resize = {
                "width": rec_width,
                "height": rec_height,
                "reason": f"Based on median dimensions ({median_width}x{median_height})",
            }

        # Aspect ratio distribution
        aspect_ratio_distribution = [
            {"bucket": "Portrait (<0.9)", "count": sum(1 for r in aspect_ratios if r < 0.9), "min": 0.0, "max": 0.9},
            {"bucket": "Square (0.9-1.1)", "count": sum(1 for r in aspect_ratios if 0.9 <= r <= 1.1), "min": 0.9, "max": 1.1},
            {"bucket": "Landscape (1.1-2.0)", "count": sum(1 for r in aspect_ratios if 1.1 < r <= 2.0), "min": 1.1, "max": 2.0},
            {"bucket": "Ultra-wide (>2.0)", "count": sum(1 for r in aspect_ratios if r > 2.0), "min": 2.0, "max": 100.0},
        ]

        # Limit scatter data for performance
        if len(scatter_data) > max_scatter_points:
            # Sample evenly
            step = len(scatter_data) // max_scatter_points
            scatter_data = scatter_data[::step][:max_scatter_points]

        return {
            "median_width": median_width,
            "median_height": median_height,
            "median_aspect_ratio": round(median_ratio, 3),
            "min_width": min(widths),
            "max_width": max(widths),
            "min_height": min(heights),
            "max_height": max(heights),
            "dimension_variance": round(dimension_variance, 3),
            "recommended_resize": recommended_resize,
            "scatter_data": scatter_data,
            "aspect_ratio_distribution": aspect_ratio_distribution,
        }
