/**
 * Analytics Panel System Types
 * Type definitions for the flexible analytics panel system
 */

import type { LucideIcon } from 'lucide-react';
import type { ExploreFilters } from '@/lib/data-management-client';

/**
 * Available panel types
 */
export type PanelType =
  | 'dataset-stats'           // Enhanced (combines: dataset-stats + dimension-insights + class-balance + image-quality)
  | 'annotation-analysis'     // Combines annotation-coverage + spatial-heatmap
  | 'model-analysis';         // Coming Soon: Combines prediction-analysis + confusion-matrix + model-comparison

/**
 * Panel categories for organization
 */
export type PanelCategory = 'active' | 'coming-soon';

/**
 * Layout modes for panel arrangement
 */
export type LayoutMode = 'tabs' | 'stacked';

/**
 * Panel configuration
 */
export interface PanelConfig {
  id: string;                          // Unique panel instance ID
  type: PanelType;                     // Panel type
  position: {                          // Grid position
    row: number;
    col: number;
  };
}

/**
 * Analytics panel state
 */
export interface AnalyticsPanelState {
  panels: PanelConfig[];               // Active panels
  layoutMode: LayoutMode;              // Tab or stacked layout
  activeTabId: string | null;          // Current active tab (tab mode only)
  isVisible: boolean;                  // Panel container visibility
}

/**
 * Panel component props
 */
export interface PanelProps {
  projectId: string;
  filters: ExploreFilters;
  onFilterUpdate: (filters: Partial<ExploreFilters>) => void;
}

/**
 * Panel definition for registry
 */
export interface PanelDefinition {
  type: PanelType;
  name: string;
  description: string;
  icon: LucideIcon;
  component: React.LazyExoticComponent<React.ComponentType<PanelProps>>;
  category: PanelCategory;             // Panel category for organization
  features?: string[];                 // Features list for coming soon panels
  requiresJobFilter?: boolean;         // Show warning if no job selected
  requiresTaskFilter?: boolean;        // Show warning if no task selected
}

/**
 * Dataset statistics API response
 */
export interface DatasetStatsResponse {
  tag_distribution: TagDistribution[];
  dimension_histogram: DimensionBucket[];
  aspect_ratio_histogram: AspectRatioBucket[];
  file_size_stats: FileSizeStats;
}

export interface TagDistribution {
  tag_id: string;
  name: string;
  count: number;
  color?: string;                      // Tag color for chart
  category_id?: string;                // Category ID for grouping
  category_name?: string;              // Category name for display
  category_color?: string;             // Category color for stripe
}

export interface DimensionBucket {
  bucket: string;                      // e.g., "320-640px", "640-1024px"
  count: number;
  min: number;                         // Bucket min value
  max: number;                         // Bucket max value
}

export interface AspectRatioBucket {
  bucket: string;                      // e.g., "0.50-0.75", "1.00-1.25"
  count: number;
  min: number;                         // Bucket min value
  max: number;                         // Bucket max value
}

export interface FileSizeStats {
  min: number;
  max: number;
  avg: number;
  median?: number;
}

/**
 * Prediction analysis API response
 */
export interface PredictionStatsResponse {
  accuracy: number;
  precision: number;
  recall: number;
  f1_score: number;
  per_class: PerClassMetrics[];
  errors: PredictionError[];
}

export interface PerClassMetrics {
  class_name: string;
  precision: number;
  recall: number;
  f1_score: number;
  support: number;                     // Number of samples
}

export interface PredictionError {
  image_id: string;
  confidence: number;
  is_correct: boolean;
  predicted_class: string;
  true_class: string;
}

/**
 * Confusion matrix API response
 */
export interface ConfusionMatrixResponse {
  classes: string[];
  matrix: number[][];                  // matrix[truth_idx][pred_idx] = count
}

/**
 * Embeddings API response
 */
export interface EmbeddingsResponse {
  points: EmbeddingPoint[];
  bounds: {
    x_min: number;
    x_max: number;
    y_min: number;
    y_max: number;
  };
  method: 'umap' | 'tsne';
}

export interface EmbeddingPoint {
  image_id: string;
  x: number;
  y: number;
  metadata?: {
    tag_ids?: string[];
    prediction?: string;
    confidence?: number;
  };
}

/**
 * Panel context value
 */
export interface AnalyticsPanelContextValue {
  state: AnalyticsPanelState;
  addPanel: (type: PanelType, mode?: 'tab' | 'stack') => void;
  removePanel: (id: string) => void;
  setLayoutMode: (mode: LayoutMode) => void;
  setActiveTab: (id: string | null) => void;
  updateFilters: (filters: Partial<ExploreFilters>) => void;
  toggleVisibility: () => void;
}

// ============================================================================
// NEW ANALYTICS ENDPOINTS (Phase 1)
// ============================================================================

/**
 * Annotation Coverage API response
 * Now counts actual detections/segmentations, not tags.
 */
export interface AnnotationCoverageResponse {
  total_images: number;
  annotated_images: number;
  unannotated_images: number;
  coverage_percentage: number;
  density_histogram: DensityBucket[];
  coverage_by_category?: CoverageByCategory[];
  // New fields for enhanced statistics
  total_objects: number;                // Total annotations across all images
  avg_objects_per_image: number;        // Average objects per image
  median_objects_per_image: number;     // Median objects per image
}

export interface DensityBucket {
  bucket: string;                      // e.g., "0", "1-5", "6-10"
  count: number;
  min: number;
  max: number;
}

/**
 * BBox annotation count distribution bucket (dynamic binning)
 */
export interface BboxCountBucket {
  bucket: string;                      // e.g., "0", "1-2", "3-5" (dynamic)
  count: number;
  min: number;
  max: number;
}

/**
 * Polygon annotation count distribution bucket (dynamic binning)
 */
export interface PolygonCountBucket {
  bucket: string;                      // e.g., "0", "1-2", "3-5" (dynamic)
  count: number;
  min: number;
  max: number;
}

export interface CoverageByCategory {
  category: string;
  annotated: number;
  total: number;
}

/**
 * Class Balance API response
 */
export interface ClassBalanceResponse {
  class_distribution: ClassDistribution[];
  imbalance_score: number;             // 0-1, Gini coefficient
  imbalance_level: 'balanced' | 'moderate' | 'severe';
  recommendations: string[];
}

export interface ClassDistribution {
  tag_id: string;
  tag_name: string;
  annotation_count: number;
  image_count: number;
  percentage: number;
  status: 'healthy' | 'underrepresented' | 'severely_underrepresented';
}

/**
 * Spatial Heatmap API response
 * Now includes grid density for Canvas-based heatmap rendering.
 */
export interface SpatialHeatmapResponse {
  annotation_points: AnnotationPoint[];
  center_of_mass: { x: number; y: number };
  spread: { x_std: number; y_std: number };
  clustering_score: number;            // 0-1
  total_annotations: number;
  // Grid density for Canvas heatmap
  grid_density: number[][];            // 2D array of counts per cell
  grid_size: number;                   // Grid dimension (e.g., 10 for 10x10)
  max_cell_count: number;              // Maximum count in any cell (for color scaling)
}

export interface AnnotationPoint {
  x: number;                           // Normalized 0-1
  y: number;                           // Normalized 0-1
  weight?: number;
}

/**
 * Image Quality API response
 */
export interface ImageQualityResponse {
  quality_distribution: QualityBucket[];
  issue_breakdown: IssueBreakdown;
  flagged_images: FlaggedImage[];
}

export interface QualityBucket {
  bucket: string;                      // e.g., "Poor (0-0.3)"
  count: number;
  min: number;
  max: number;
}

export interface IssueBreakdown {
  blur_detected: number;
  low_brightness: number;
  high_brightness: number;
  low_contrast: number;
  corrupted: number;
}

export interface FlaggedImage {
  image_id: string;
  filename: string;
  quality_score: number;
  issues: string[];
  blur_score?: number;
  brightness?: number;
  contrast?: number;
}

// ============================================================================
// Dimension Insights (Roboflow-style)
// ============================================================================

/**
 * Dimension Insights API response
 */
export interface DimensionInsightsResponse {
  // Median values
  median_width: number;
  median_height: number;
  median_aspect_ratio: number;
  // Range values
  min_width: number;
  max_width: number;
  min_height: number;
  max_height: number;
  // Variance
  dimension_variance: number;          // 0-1 (higher = more varied)
  // Recommendation
  recommended_resize: {
    width: number;
    height: number;
    reason: string;
  };
  // Scatter plot data
  scatter_data: DimensionScatterPoint[];
  // Aspect ratio distribution
  aspect_ratio_distribution: AspectRatioDistributionBucket[];
}

export interface DimensionScatterPoint {
  image_id: string;
  width: number;
  height: number;
  aspect_ratio: number;
}

export interface AspectRatioDistributionBucket {
  bucket: string;                      // e.g., "Portrait (<0.9)"
  count: number;
  min: number;
  max: number;
}


// ============================================================================
// CONSOLIDATED ANALYTICS TYPES (Panel Consolidation)
// ============================================================================

/**
 * Quality Status Counts
 */
export interface QualityStatusCounts {
  pending: number;
  processing: number;
  completed: number;
  failed: number;
}

/**
 * Quality Metrics Averages
 */
export interface QualityMetricsAverages {
  sharpness?: number;
  brightness?: number;
  contrast?: number;
  uniqueness?: number;
  red_avg?: number;
  green_avg?: number;
  blue_avg?: number;
  overall_quality?: number;
}

/**
 * Enhanced Issue Breakdown
 */
export interface IssueBreakdownEnhanced {
  blur: number;
  low_brightness: number;
  high_brightness: number;
  low_contrast: number;
  duplicate: number;
}

/**
 * Flagged Image Enhanced
 */
export interface FlaggedImageEnhanced {
  shared_image_id: string;
  filename: string;
  file_path: string;
  overall_quality: number;
  sharpness?: number;
  brightness?: number;
  issues: string[];
}

/**
 * Enhanced Dataset Stats Response (Consolidated)
 * Combines: Dataset Stats + Dimension Insights + Class Balance + Image Quality
 */
export interface EnhancedDatasetStatsResponse {
  // Original Dataset Stats
  tag_distribution: TagDistribution[];
  dimension_histogram: DimensionBucket[];
  aspect_ratio_histogram: AspectRatioBucket[];
  file_size_stats: FileSizeStats;

  // From Dimension Insights
  median_width: number;
  median_height: number;
  median_aspect_ratio: number;
  min_width: number;
  max_width: number;
  min_height: number;
  max_height: number;
  dimension_variance: number;
  recommended_resize?: {
    width: number;
    height: number;
    reason: string;
  };
  scatter_data: DimensionScatterPoint[];
  aspect_ratio_distribution: AspectRatioDistributionBucket[];

  // From Class Balance
  class_distribution: ClassDistribution[];
  imbalance_score: number;
  imbalance_level: 'balanced' | 'moderate' | 'severe';
  class_recommendations: string[];

  // Image Quality (NEW)
  quality_status: 'complete' | 'partial' | 'pending';
  quality_status_counts: QualityStatusCounts;
  quality_averages?: QualityMetricsAverages;
  quality_distribution: QualityBucket[];
  // Individual metric histograms for interactive filtering
  sharpness_histogram: QualityBucket[];
  brightness_histogram: QualityBucket[];
  contrast_histogram: QualityBucket[];
  uniqueness_histogram: QualityBucket[];
  // RGB channel histograms
  red_histogram: QualityBucket[];
  green_histogram: QualityBucket[];
  blue_histogram: QualityBucket[];
  issue_breakdown: IssueBreakdownEnhanced;
  flagged_images: FlaggedImageEnhanced[];
}

/**
 * Annotation Analysis Response (Consolidated)
 * Combines: Annotation Coverage + Spatial Heatmap
 */
export interface AnnotationAnalysisResponse {
  // From Annotation Coverage
  total_images: number;
  annotated_images: number;
  unannotated_images: number;
  coverage_percentage: number;
  density_histogram: DensityBucket[];
  total_objects: number;
  avg_objects_per_image: number;
  median_objects_per_image: number;

  // Annotation Type Distribution (Dynamic Binning)
  bbox_count_histogram: BboxCountBucket[];
  polygon_count_histogram: PolygonCountBucket[];

  // From Spatial Heatmap
  grid_density: number[][];
  grid_size: number;
  max_cell_count: number;
  center_of_mass: { x: number; y: number };
  spread: { x_std: number; y_std: number };
  clustering_score: number;
  total_annotations: number;
  annotation_points: AnnotationPoint[];
}

/**
 * Process Quality Response
 */
export interface ProcessQualityResponse {
  processed: number;
  failed: number;
  skipped: number;
  remaining: number;
}
