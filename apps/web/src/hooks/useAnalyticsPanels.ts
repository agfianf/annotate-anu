/**
 * Analytics Panels Hook
 * Simplified interface for managing analytics panels
 */

import { useAnalyticsPanelContext } from '@/contexts/AnalyticsPanelContext';
import type { PanelType, LayoutMode, PanelConfig } from '@/types/analytics';
import type { ExploreFilters } from '@/lib/data-management-client';

export interface UseAnalyticsPanelsReturn {
  // State
  panels: PanelConfig[];
  layoutMode: LayoutMode;
  activeTabId: string | null;
  isVisible: boolean;

  // Computed
  hasPanel: boolean;
  activePanel: PanelConfig | null;
  panelCount: number;

  // Actions
  addPanel: (type: PanelType, mode?: 'tab' | 'stack') => void;
  removePanel: (id: string) => void;
  setLayoutMode: (mode: LayoutMode) => void;
  setActiveTab: (id: string | null) => void;
  updateFilters: (filters: Partial<ExploreFilters>) => void;
  toggleVisibility: () => void;
}

/**
 * Hook for managing analytics panels
 */
export function useAnalyticsPanels(): UseAnalyticsPanelsReturn {
  const context = useAnalyticsPanelContext();

  const { state, ...actions } = context;
  const { panels, layoutMode, activeTabId, isVisible } = state;

  // Computed values
  const hasPanel = panels.length > 0;
  const panelCount = panels.length;
  const activePanel = panels.find((p) => p.id === activeTabId) || null;

  return {
    // State
    panels,
    layoutMode,
    activeTabId,
    isVisible,

    // Computed
    hasPanel,
    activePanel,
    panelCount,

    // Actions
    ...actions,
  };
}
