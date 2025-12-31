"""Pydantic schemas for analytics endpoints."""

from pydantic import BaseModel, Field
from typing import List, Literal


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
    """Response model for annotation coverage analytics."""
    total_images: int = Field(..., description="Total number of images in dataset")
    annotated_images: int = Field(..., description="Images with at least one annotation")
    unannotated_images: int = Field(..., description="Images with zero annotations")
    coverage_percentage: float = Field(..., description="Percentage of annotated images")
    density_histogram: List[DensityBucket] = Field(
        ..., description="Distribution of annotation counts per image"
    )
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
    """Response model for spatial heatmap analytics."""
    annotation_points: List[AnnotationPoint] = Field(
        ..., description="Normalized annotation coordinates"
    )
    center_of_mass: CenterOfMass = Field(..., description="Center of mass")
    spread: Spread = Field(..., description="Spatial spread metrics")
    clustering_score: float = Field(
        ..., ge=0.0, le=1.0, description="Clustering score (0=distributed, 1=clustered)"
    )
    total_annotations: int = Field(..., description="Total annotations analyzed")


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
