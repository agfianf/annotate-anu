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
  file_size_stats: FileSizeStats;
}

export interface TagDistribution {
  tag_id: string;
  name: string;
  count: number;
  color?: string;                      // Tag color for chart
}

export interface DimensionBucket {
  bucket: string;                      // e.g., "0-500", "500-1000"
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
