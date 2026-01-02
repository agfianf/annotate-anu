/**
 * Panel Registry
 * Single source of truth for all available panel types
 *
 * ACTIVE PANELS:
 * - dataset-stats: Enhanced panel with tabs (Overview, Dimensions, Class Balance, Quality)
 * - annotation-analysis: Combined coverage + spatial heatmap
 *
 * COMING SOON:
 * - model-analysis: Prediction analysis, confusion matrix, model comparison
 */

import { lazy } from 'react';
import { BarChart3, Target, Brain } from 'lucide-react';
import type { PanelDefinition, PanelType, PanelCategory } from '@/types/analytics';

/**
 * Panel registry - add new panel types here
 */
export const PANEL_REGISTRY: Record<PanelType, PanelDefinition> = {
  // ============================================================================
  // ACTIVE PANELS
  // ============================================================================
  'dataset-stats': {
    type: 'dataset-stats',
    name: 'Dataset Statistics',
    description: 'Comprehensive stats: tags, dimensions, class balance, quality',
    icon: BarChart3,
    component: lazy(() => import('./panels/EnhancedDatasetStatsPanel')),
    category: 'active',
  },
  'annotation-analysis': {
    type: 'annotation-analysis',
    name: 'Annotation Analysis',
    description: 'Coverage metrics and spatial distribution heatmap',
    icon: Target,
    component: lazy(() => import('./panels/AnnotationAnalysisPanel')),
    category: 'active',
  },

  // ============================================================================
  // COMING SOON PANELS
  // ============================================================================
  'model-analysis': {
    type: 'model-analysis',
    name: 'Model Analysis',
    description: 'Advanced model performance analytics',
    icon: Brain,
    component: lazy(() => import('./panels/ComingSoonPanel')),
    category: 'coming-soon',
    features: ['Prediction Analysis', 'Confusion Matrix', 'Model Comparison'],
  },
};

/**
 * Get recommended panels for new users (primary panels only)
 */
export function getRecommendedPanels(): PanelType[] {
  return ['dataset-stats', 'annotation-analysis'];
}

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

/**
 * Get panels organized by category
 */
export function getPanelsByCategory(): {
  active: PanelDefinition[];
  comingSoon: PanelDefinition[];
} {
  const panels = Object.values(PANEL_REGISTRY);
  return {
    active: panels.filter(p => p.category === 'active'),
    comingSoon: panels.filter(p => p.category === 'coming-soon'),
  };
}
