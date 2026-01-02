"""Pydantic schemas for analytics endpoints."""

from pydantic import BaseModel, Field
from typing import List, Literal, Optional

from app.schemas.data_management import (
    TagDistribution,
    DimensionBucket,
    AspectRatioBucket as DataMgmtAspectRatioBucket,
    FileSizeStats,
)


# ============================================================================
# Annotation Coverage Schemas
# ============================================================================

class DensityBucket(BaseModel):
    """Annotation density histogram bucket."""
    bucket: str = Field(..., description="Bucket label (e.g., '0', '1-5', '6-10')")
    count: int = Field(..., description="Number of images in this bucket")
    min: int = Field(..., description="Minimum annotations in bucket")
    max: int = Field(..., description="Maximum annotations in bucket")


class CoverageByCategory(BaseModel):
    """Coverage breakdown by tag category."""
    category: str = Field(..., description="Category name")
    annotated: int = Field(..., description="Number of annotated images in category")
    total: int = Field(..., description="Total images in category")


class AnnotationCoverageResponse(BaseModel):
    """Response model for annotation coverage analytics.

    Note: Counts actual detections and segmentations, not project-level tags.
    """
    total_images: int = Field(..., description="Total number of images in dataset")
    annotated_images: int = Field(..., description="Images with at least one detection or segmentation")
    unannotated_images: int = Field(..., description="Images with zero annotations")
    coverage_percentage: float = Field(..., description="Percentage of annotated images")
    density_histogram: List[DensityBucket] = Field(
        ..., description="Distribution of object counts per image (Roboflow-style buckets: 0, 1, 2-5, 6-10, 11-20, 21+)"
    )
    # New fields for enhanced statistics
    total_objects: int = Field(default=0, description="Total number of annotations (detections + segmentations) across all images")
    avg_objects_per_image: float = Field(default=0.0, description="Average number of objects per image")
    median_objects_per_image: int = Field(default=0, description="Median number of objects per image")
    # Keep for backward compatibility
    coverage_by_category: List[CoverageByCategory] = Field(
        default_factory=list, description="Coverage breakdown by tag category"
    )


# ============================================================================
# Class Balance Schemas
# ============================================================================

class ClassDistribution(BaseModel):
    """Class/tag distribution data."""
    tag_id: str = Field(..., description="Tag ID")
    tag_name: str = Field(..., description="Tag name")
    annotation_count: int = Field(..., description="Total annotations with this tag")
    image_count: int = Field(..., description="Unique images with this tag")
    percentage: float = Field(..., description="Percentage of total annotations")
    status: Literal["healthy", "underrepresented", "severely_underrepresented"] = Field(
        ..., description="Health status based on representation"
    )


class ClassBalanceResponse(BaseModel):
    """Response model for class balance analytics."""
    class_distribution: List[ClassDistribution] = Field(
        ..., description="Distribution of annotations across classes"
    )
    imbalance_score: float = Field(
        ..., ge=0.0, le=1.0, description="Gini coefficient (0=balanced, 1=imbalanced)"
    )
    imbalance_level: Literal["balanced", "moderate", "severe"] = Field(
        ..., description="Overall imbalance level"
    )
    recommendations: List[str] = Field(
        ..., description="Actionable recommendations for dataset improvement"
    )


# ============================================================================
# Spatial Heatmap Schemas
# ============================================================================

class AnnotationPoint(BaseModel):
    """Normalized annotation coordinate point."""
    x: float = Field(..., ge=0.0, le=1.0, description="Normalized X coordinate (0-1)")
    y: float = Field(..., ge=0.0, le=1.0, description="Normalized Y coordinate (0-1)")
    weight: int = Field(default=1, description="Weight/count of annotations at this point")


class CenterOfMass(BaseModel):
    """Center of mass for annotation distribution."""
    x: float = Field(..., description="Average X coordinate")
    y: float = Field(..., description="Average Y coordinate")


class Spread(BaseModel):
    """Standard deviation spread of annotations."""
    x_std: float = Field(..., description="Standard deviation of X coordinates")
    y_std: float = Field(..., description="Standard deviation of Y coordinates")


class SpatialHeatmapResponse(BaseModel):
    """Response model for spatial heatmap analytics.

    Includes grid-based density for Canvas heatmap rendering.
    """
    annotation_points: List[AnnotationPoint] = Field(
        ..., description="Normalized annotation coordinates (limited to 1000)"
    )
    center_of_mass: CenterOfMass = Field(..., description="Center of mass")
    spread: Spread = Field(..., description="Spatial spread metrics")
    clustering_score: float = Field(
        ..., ge=0.0, le=1.0, description="Clustering score (0=distributed, 1=clustered)"
    )
    total_annotations: int = Field(..., description="Total annotations analyzed")
    # Grid density for heatmap rendering
    grid_density: List[List[int]] = Field(
        default_factory=list, description="2D array of annotation counts per grid cell (row-major)"
    )
    grid_size: int = Field(default=10, description="Grid dimension (e.g., 10 for 10x10)")
    max_cell_count: int = Field(default=0, description="Maximum count in any cell (for color scaling)")


# ============================================================================
# Image Quality Schemas
# ============================================================================

class QualityBucket(BaseModel):
    """Image quality score histogram bucket."""
    bucket: str = Field(..., description="Quality range label")
    count: int = Field(..., description="Number of images in this quality range")
    min: float = Field(..., description="Minimum quality score in bucket")
    max: float = Field(..., description="Maximum quality score in bucket")


class IssueBreakdown(BaseModel):
    """Breakdown of image quality issues."""
    blur_detected: int = Field(default=0, description="Images with blur detected")
    low_brightness: int = Field(default=0, description="Images with low brightness")
    high_brightness: int = Field(default=0, description="Images with high brightness")
    low_contrast: int = Field(default=0, description="Images with low contrast")
    corrupted: int = Field(default=0, description="Corrupted or unreadable images")


class FlaggedImage(BaseModel):
    """Image flagged for quality issues."""
    image_id: str = Field(..., description="Image ID")
    filename: str = Field(..., description="Image filename")
    quality_score: float = Field(..., description="Overall quality score (0-1)")
    issues: List[str] = Field(..., description="List of detected issues")
    blur_score: float = Field(default=0.0, description="Blur detection score")
    brightness: float = Field(default=0.0, description="Brightness level (0-255)")
    contrast: float = Field(default=0.0, description="Contrast score")


class ImageQualityResponse(BaseModel):
    """Response model for image quality analytics."""
    quality_distribution: List[QualityBucket] = Field(
        ..., description="Distribution of quality scores"
    )
    issue_breakdown: IssueBreakdown = Field(..., description="Breakdown of issues")
    flagged_images: List[FlaggedImage] = Field(
        ..., description="Images flagged for quality issues"
    )


# ============================================================================
# Enhanced Dataset Statistics Schemas (extends existing)
# ============================================================================

class TagDistributionByCategory(BaseModel):
    """Tag distribution grouped by category."""
    category_name: str = Field(..., description="Category name")
    tags: List[dict] = Field(..., description="Tags in this category with counts")


class DimensionOutliers(BaseModel):
    """Dimension outlier detection results."""
    count: int = Field(..., description="Number of outlier images")
    image_ids: List[str] = Field(..., description="IDs of outlier images")


class AspectRatioBucket(BaseModel):
    """Aspect ratio histogram bucket."""
    bucket: str = Field(..., description="Aspect ratio range label")
    count: int = Field(..., description="Number of images in this range")
    min: float = Field(..., description="Minimum aspect ratio")
    max: float = Field(..., description="Maximum aspect ratio")


class FileSizeBucket(BaseModel):
    """File size histogram bucket."""
    bucket: str = Field(..., description="File size range label")
    count: int = Field(..., description="Number of images in this range")
    min: int = Field(..., description="Minimum file size (bytes)")
    max: int = Field(..., description="Maximum file size (bytes)")


# ============================================================================
# Dimension Analysis Schemas
# ============================================================================

class ScatterPoint(BaseModel):
    """Width vs height scatter plot point."""
    image_id: str = Field(..., description="Image ID")
    width: int = Field(..., description="Image width in pixels")
    height: int = Field(..., description="Image height in pixels")
    aspect_ratio: float = Field(..., description="Width/height ratio")


class DimensionOutlier(BaseModel):
    """Dimension outlier with deviation metrics."""
    image_id: str = Field(..., description="Image ID")
    width: int = Field(..., description="Image width")
    height: int = Field(..., description="Image height")
    deviation: float = Field(..., description="Deviation from mean (in std devs)")


class MedianDimensions(BaseModel):
    """Median image dimensions."""
    width: int = Field(..., description="Median width")
    height: int = Field(..., description="Median height")


class RecommendedResize(BaseModel):
    """Recommended resize target."""
    width: int = Field(..., description="Recommended width")
    height: int = Field(..., description="Recommended height")
    reason: str = Field(..., description="Explanation for recommendation")


class DimensionAnalysisResponse(BaseModel):
    """Response model for dimension analysis."""
    scatter_points: List[ScatterPoint] = Field(
        ..., description="Width vs height scatter plot data"
    )
    outliers: List[DimensionOutlier] = Field(..., description="Dimension outliers")
    median_dimensions: MedianDimensions = Field(..., description="Median dimensions")
    recommended_resize: RecommendedResize = Field(..., description="Resize recommendation")


# ============================================================================
# Dimension Insights Schemas (Roboflow-style)
# ============================================================================

class AspectRatioDistributionBucket(BaseModel):
    """Aspect ratio distribution bucket."""
    bucket: str = Field(..., description="Bucket label (Portrait, Square, etc.)")
    count: int = Field(..., description="Number of images")
    min: float = Field(..., description="Minimum ratio")
    max: float = Field(..., description="Maximum ratio")


class DimensionInsightsRecommendedResize(BaseModel):
    """Recommended resize dimensions."""
    width: int = Field(..., description="Recommended width")
    height: int = Field(..., description="Recommended height")
    reason: str = Field(..., description="Reason for recommendation")


class DimensionInsightsScatterPoint(BaseModel):
    """Scatter plot data point."""
    image_id: str = Field(..., description="Image ID")
    width: int = Field(..., description="Image width")
    height: int = Field(..., description="Image height")
    aspect_ratio: float = Field(..., description="Width/height ratio")


class DimensionInsightsResponse(BaseModel):
    """Response model for dimension insights analytics (Roboflow-style)."""
    # Median values
    median_width: int = Field(..., description="Median image width")
    median_height: int = Field(..., description="Median image height")
    median_aspect_ratio: float = Field(..., description="Median aspect ratio")
    # Range values
    min_width: int = Field(..., description="Minimum image width")
    max_width: int = Field(..., description="Maximum image width")
    min_height: int = Field(..., description="Minimum image height")
    max_height: int = Field(..., description="Maximum image height")
    # Variance
    dimension_variance: float = Field(
        ..., ge=0.0, le=1.0, description="Normalized variance score (0=uniform, 1=varied)"
    )
    # Recommendation
    recommended_resize: DimensionInsightsRecommendedResize = Field(
        ..., description="Suggested resize target"
    )
    # Scatter plot data
    scatter_data: List[DimensionInsightsScatterPoint] = Field(
        ..., description="Width vs height scatter plot data (limited to 500 points)"
    )
    # Aspect ratio distribution
    aspect_ratio_distribution: List[AspectRatioDistributionBucket] = Field(
        ..., description="Portrait/Square/Landscape/Ultra-wide distribution"
    )


# ============================================================================
# Image Quality Enhanced Schemas
# ============================================================================

class ChannelAverages(BaseModel):
    """RGB channel average values."""
    red_avg: float = Field(..., ge=0.0, le=1.0, description="Average red channel intensity (0-1)")
    green_avg: float = Field(..., ge=0.0, le=1.0, description="Average green channel intensity (0-1)")
    blue_avg: float = Field(..., ge=0.0, le=1.0, description="Average blue channel intensity (0-1)")


class QualityMetricsAverages(BaseModel):
    """Average quality metrics across dataset."""
    sharpness: Optional[float] = Field(None, description="Average sharpness score (0-1)")
    brightness: Optional[float] = Field(None, description="Average brightness score (0-1)")
    contrast: Optional[float] = Field(None, description="Average contrast score (0-1)")
    uniqueness: Optional[float] = Field(None, description="Average uniqueness score (0-1)")
    red_avg: Optional[float] = Field(None, description="Average red channel intensity (0-1)")
    green_avg: Optional[float] = Field(None, description="Average green channel intensity (0-1)")
    blue_avg: Optional[float] = Field(None, description="Average blue channel intensity (0-1)")
    overall_quality: Optional[float] = Field(None, description="Average overall quality score (0-1)")


class IssueBreakdownEnhanced(BaseModel):
    """Enhanced breakdown of image quality issues."""
    blur: int = Field(default=0, description="Images with blur detected")
    low_brightness: int = Field(default=0, description="Images with low brightness")
    high_brightness: int = Field(default=0, description="Images with high brightness/overexposure")
    low_contrast: int = Field(default=0, description="Images with low contrast")
    duplicate: int = Field(default=0, description="Near-duplicate images detected")


class FlaggedImageEnhanced(BaseModel):
    """Enhanced flagged image with quality metrics."""
    shared_image_id: str = Field(..., description="Shared image UUID")
    filename: str = Field(..., description="Image filename")
    file_path: str = Field(..., description="Relative file path")
    overall_quality: float = Field(..., description="Overall quality score (0-1)")
    sharpness: Optional[float] = Field(None, description="Sharpness score (0-1)")
    brightness: Optional[float] = Field(None, description="Brightness score (0-1)")
    issues: List[str] = Field(default_factory=list, description="List of detected issues")


class QualityStatusCounts(BaseModel):
    """Quality computation status counts."""
    pending: int = Field(default=0, description="Images awaiting quality computation")
    processing: int = Field(default=0, description="Images currently being processed")
    completed: int = Field(default=0, description="Images with completed quality metrics")
    failed: int = Field(default=0, description="Images where quality computation failed")


# ============================================================================
# Enhanced Dataset Stats Response (Consolidated)
# ============================================================================

class EnhancedDatasetStatsResponse(BaseModel):
    """
    Consolidated response model for enhanced dataset statistics.

    Combines: Original Dataset Stats + Dimension Insights + Class Balance + Image Quality
    """
    # === Original Dataset Stats ===
    tag_distribution: List[TagDistribution] = Field(
        default_factory=list, description="Tag distribution with counts and colors"
    )
    dimension_histogram: List[DimensionBucket] = Field(
        default_factory=list, description="Dimension histogram with dynamic bins"
    )
    aspect_ratio_histogram: List[DataMgmtAspectRatioBucket] = Field(
        default_factory=list, description="Aspect ratio histogram"
    )
    file_size_stats: FileSizeStats = Field(
        ..., description="File size statistics (min, max, avg, median)"
    )

    # === From Dimension Insights ===
    median_width: int = Field(default=0, description="Median image width")
    median_height: int = Field(default=0, description="Median image height")
    median_aspect_ratio: float = Field(default=0.0, description="Median aspect ratio")
    min_width: int = Field(default=0, description="Minimum image width")
    max_width: int = Field(default=0, description="Maximum image width")
    min_height: int = Field(default=0, description="Minimum image height")
    max_height: int = Field(default=0, description="Maximum image height")
    dimension_variance: float = Field(
        default=0.0, ge=0.0, le=1.0, description="Normalized variance score"
    )
    recommended_resize: Optional[DimensionInsightsRecommendedResize] = Field(
        None, description="Suggested resize target"
    )
    scatter_data: List[DimensionInsightsScatterPoint] = Field(
        default_factory=list, description="Width vs height scatter plot data"
    )
    aspect_ratio_distribution: List[AspectRatioDistributionBucket] = Field(
        default_factory=list, description="Portrait/Square/Landscape distribution"
    )

    # === From Class Balance ===
    class_distribution: List[ClassDistribution] = Field(
        default_factory=list, description="Class distribution for balance analysis"
    )
    imbalance_score: float = Field(
        default=0.0, ge=0.0, le=1.0, description="Gini coefficient (0=balanced, 1=imbalanced)"
    )
    imbalance_level: Literal["balanced", "moderate", "severe"] = Field(
        default="balanced", description="Overall imbalance level"
    )
    class_recommendations: List[str] = Field(
        default_factory=list, description="Recommendations for class balance improvement"
    )

    # === Image Quality (NEW) ===
    quality_status: Literal["complete", "partial", "pending"] = Field(
        default="pending", description="Overall quality computation status"
    )
    quality_status_counts: QualityStatusCounts = Field(
        default_factory=QualityStatusCounts, description="Status counts for quality computation"
    )
    quality_averages: Optional[QualityMetricsAverages] = Field(
        None, description="Average quality metrics across dataset"
    )
    quality_distribution: List[QualityBucket] = Field(
        default_factory=list, description="Overall quality score distribution"
    )
    issue_breakdown: IssueBreakdownEnhanced = Field(
        default_factory=IssueBreakdownEnhanced, description="Breakdown of quality issues"
    )
    flagged_images: List[FlaggedImageEnhanced] = Field(
        default_factory=list, description="Images flagged for quality issues"
    )


# ============================================================================
# Annotation Analysis Response (Consolidated)
# ============================================================================

class AnnotationAnalysisResponse(BaseModel):
    """
    Consolidated response model for annotation analysis.

    Combines: Annotation Coverage + Spatial Heatmap
    """
    # === From Annotation Coverage ===
    total_images: int = Field(..., description="Total number of images")
    annotated_images: int = Field(..., description="Images with at least one annotation")
    unannotated_images: int = Field(..., description="Images with zero annotations")
    coverage_percentage: float = Field(..., description="Percentage of annotated images")
    density_histogram: List[DensityBucket] = Field(
        default_factory=list, description="Object count distribution (0, 1, 2-5, 6-10, 11-20, 21+)"
    )
    total_objects: int = Field(default=0, description="Total annotations across all images")
    avg_objects_per_image: float = Field(default=0.0, description="Average objects per image")
    median_objects_per_image: int = Field(default=0, description="Median objects per image")

    # === From Spatial Heatmap ===
    grid_density: List[List[int]] = Field(
        default_factory=list, description="2D grid density array (row-major)"
    )
    grid_size: int = Field(default=10, description="Grid dimension (e.g., 10 for 10x10)")
    max_cell_count: int = Field(default=0, description="Maximum count in any grid cell")
    center_of_mass: CenterOfMass = Field(
        default_factory=lambda: CenterOfMass(x=0.5, y=0.5),
        description="Center of mass of annotations"
    )
    spread: Spread = Field(
        default_factory=lambda: Spread(x_std=0.0, y_std=0.0),
        description="Spatial spread (standard deviation)"
    )
    clustering_score: float = Field(
        default=0.0, ge=0.0, le=1.0, description="Clustering score (0=distributed, 1=clustered)"
    )
    total_annotations: int = Field(default=0, description="Total annotations analyzed for heatmap")
    annotation_points: List[AnnotationPoint] = Field(
        default_factory=list, description="Sample of annotation center points (limited)"
    )


# ============================================================================
# Quality Computation Trigger Response
# ============================================================================

class ComputeQualityResponse(BaseModel):
    """Response for quality computation trigger."""
    queued: int = Field(..., description="Number of images queued for processing")
    already_computed: int = Field(default=0, description="Images already with quality metrics")
    processing: int = Field(default=0, description="Images currently being processed")


class ProcessQualityResponse(BaseModel):
    """Response for manual quality processing."""
    processed: int = Field(..., description="Images successfully processed")
    failed: int = Field(default=0, description="Images that failed processing")
    skipped: int = Field(default=0, description="Images skipped (no file path)")
    remaining: int = Field(default=0, description="Remaining images to process")


# ============================================================================
# Quality Job Schemas (Background Processing)
# ============================================================================

class StartQualityJobResponse(BaseModel):
    """Response for starting a quality processing job."""
    job_id: str = Field(..., description="UUID of the quality job")
    total_images: int = Field(..., description="Total images to process")
    status: Literal["pending", "processing", "completed", "failed", "cancelled"] = Field(
        ..., description="Job status"
    )
    message: str = Field(default="", description="Status message")


class QualityProgressResponse(BaseModel):
    """Response for quality processing progress."""
    job_id: Optional[str] = Field(None, description="UUID of active job (null if no active job)")
    total: int = Field(default=0, description="Total images to process")
    processed: int = Field(default=0, description="Successfully processed images")
    failed: int = Field(default=0, description="Failed images")
    remaining: int = Field(default=0, description="Remaining images")
    status: Literal["idle", "pending", "processing", "completed", "failed", "cancelled"] = Field(
        default="idle", description="Current job status"
    )
    progress_pct: float = Field(default=0.0, description="Progress percentage (0-100)")
    started_at: Optional[str] = Field(None, description="ISO timestamp when processing started")


class CancelQualityJobResponse(BaseModel):
    """Response for cancelling a quality job."""
    cancelled: bool = Field(..., description="Whether the job was cancelled")
    message: str = Field(default="", description="Status message")
