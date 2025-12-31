/**
 * Panel Registry
 * Single source of truth for all available panel types
 */

import { lazy } from 'react';
import { BarChart3, TrendingUp, Sparkles, Grid3X3, CheckCircle2, Scale, MapPin, Eye } from 'lucide-react';
import type { PanelDefinition, PanelType } from '@/types/analytics';

/**
 * Panel registry - add new panel types here
 */
export const PANEL_REGISTRY: Record<PanelType, PanelDefinition> = {
  'dataset-stats': {
    type: 'dataset-stats',
    name: 'Dataset Statistics',
    description: 'Tag distribution, dimension stats, file sizes',
    icon: BarChart3,
    component: lazy(() => import('./panels/DatasetStatsPanel')),
  },
  'annotation-coverage': {
    type: 'annotation-coverage',
    name: 'Annotation Coverage',
    description: 'Annotation completeness and density distribution',
    icon: CheckCircle2,
    component: lazy(() => import('./panels/AnnotationCoveragePanel')),
  },
  'class-balance': {
    type: 'class-balance',
    name: 'Class Balance',
    description: 'Class distribution and imbalance detection',
    icon: Scale,
    component: lazy(() => import('./panels/ClassBalancePanel')),
  },
  'spatial-heatmap': {
    type: 'spatial-heatmap',
    name: 'Spatial Heatmap',
    description: 'Annotation spatial distribution visualization',
    icon: MapPin,
    component: lazy(() => import('./panels/SpatialHeatmapPanel')),
  },
  'image-quality': {
    type: 'image-quality',
    name: 'Image Quality',
    description: 'Image quality assessment and flagging',
    icon: Eye,
    component: lazy(() => import('./panels/ImageQualityPanel')),
  },
  'prediction-analysis': {
    type: 'prediction-analysis',
    name: 'Prediction Analysis',
    description: 'Accuracy, precision/recall, error distribution',
    icon: TrendingUp,
    component: lazy(() => import('./panels/PredictionAnalysisPanel')),
    requiresJobFilter: true,
  },
  'embeddings-viewer': {
    type: 'embeddings-viewer',
    name: 'Embeddings Viewer',
    description: '2D scatter plot visualization (UMAP/t-SNE)',
    icon: Sparkles,
    component: lazy(() => import('./panels/EmbeddingsViewerPanel')),
  },
  'confusion-matrix': {
    type: 'confusion-matrix',
    name: 'Confusion Matrix',
    description: 'Classification performance heatmap',
    icon: Grid3X3,
    component: lazy(() => import('./panels/ConfusionMatrixPanel')),
    requiresJobFilter: true,
  },
  'model-comparison': {
    type: 'model-comparison',
    name: 'Model Comparison',
    description: 'Side-by-side model performance comparison',
    icon: TrendingUp,
    component: lazy(() => import('./panels/ModelComparisonPanel')),
    requiresJobFilter: true,
  },
};

/**
 * Get panel definition by type
 */
export function getPanelDefinition(type: PanelType): PanelDefinition {
  return PANEL_REGISTRY[type];
}

/**
 * Get all available panel types
 */
export function getAllPanelTypes(): PanelType[] {
  return Object.keys(PANEL_REGISTRY) as PanelType[];
}

/**
 * Get all panel definitions as array
 */
export function getAllPanelDefinitions(): PanelDefinition[] {
  return Object.values(PANEL_REGISTRY);
}
