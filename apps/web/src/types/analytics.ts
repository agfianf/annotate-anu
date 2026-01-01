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
  | 'dataset-stats'
  | 'annotation-coverage'
  | 'spatial-heatmap'
  | 'image-quality'
  | 'prediction-analysis'
  | 'embeddings-viewer'
  | 'confusion-matrix'
  | 'model-comparison';

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
 */
export interface AnnotationCoverageResponse {
  total_images: number;
  annotated_images: number;
  unannotated_images: number;
  coverage_percentage: number;
  density_histogram: DensityBucket[];
  coverage_by_category?: CoverageByCategory[];
}

export interface DensityBucket {
  bucket: string;                      // e.g., "0", "1-5", "6-10"
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
 */
export interface SpatialHeatmapResponse {
  annotation_points: AnnotationPoint[];
  center_of_mass: { x: number; y: number };
  spread: { x_std: number; y_std: number };
  clustering_score: number;            // 0-1
  total_annotations: number;
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
