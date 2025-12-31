/**
 * Analytics Panel Context
 * Manages panel state, layout, and filter synchronization
 */

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type {
  AnalyticsPanelContextValue,
  AnalyticsPanelState,
  LayoutMode,
  PanelConfig,
  PanelType,
} from '@/types/analytics';
import type { ExploreFilters } from '@/lib/data-management-client';

const AnalyticsPanelContext = createContext<AnalyticsPanelContextValue | null>(null);

interface AnalyticsPanelProviderProps {
  children: React.ReactNode;
  projectId: string;
  onFilterUpdate?: (filters: Partial<ExploreFilters>) => void;
}

/**
 * Generate unique panel ID
 */
function generatePanelId(type: PanelType): string {
  return `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Get localStorage key for project
 */
function getStorageKey(projectId: string, key: 'panels' | 'layout'): string {
  return `explore-analytics-${key}-${projectId}`;
}

/**
 * Load state from localStorage
 */
function loadState(projectId: string): Partial<AnalyticsPanelState> {
  try {
    const panelsKey = getStorageKey(projectId, 'panels');
    const layoutKey = getStorageKey(projectId, 'layout');

    const savedPanels = localStorage.getItem(panelsKey);
    const savedLayout = localStorage.getItem(layoutKey);

    return {
      panels: savedPanels ? JSON.parse(savedPanels) : [],
      layoutMode: savedLayout ? (JSON.parse(savedLayout) as LayoutMode) : 'tabs',
    };
  } catch (error) {
    console.error('Failed to load analytics panel state:', error);
    return {};
  }
}

/**
 * Save state to localStorage
 */
function saveState(
  projectId: string,
  panels: PanelConfig[],
  layoutMode: LayoutMode
): void {
  try {
    const panelsKey = getStorageKey(projectId, 'panels');
    const layoutKey = getStorageKey(projectId, 'layout');

    localStorage.setItem(panelsKey, JSON.stringify(panels));
    localStorage.setItem(layoutKey, JSON.stringify(layoutMode));
  } catch (error) {
    console.error('Failed to save analytics panel state:', error);
  }
}

export function AnalyticsPanelProvider({
  children,
  projectId,
  onFilterUpdate,
}: AnalyticsPanelProviderProps) {
  // Load initial state from localStorage
  const [state, setState] = useState<AnalyticsPanelState>(() => {
    const loaded = loadState(projectId);
    return {
      panels: loaded.panels || [],
      layoutMode: loaded.layoutMode || 'tabs',
      activeTabId: loaded.panels?.[0]?.id || null,
      isVisible: (loaded.panels?.length || 0) > 0,
    };
  });

  // Save to localStorage when state changes
  useEffect(() => {
    saveState(projectId, state.panels, state.layoutMode);
  }, [projectId, state.panels, state.layoutMode]);

  // Reset state when project changes
  useEffect(() => {
    const loaded = loadState(projectId);
    setState({
      panels: loaded.panels || [],
      layoutMode: loaded.layoutMode || 'tabs',
      activeTabId: loaded.panels?.[0]?.id || null,
      isVisible: (loaded.panels?.length || 0) > 0,
    });
  }, [projectId]);

  /**
   * Add a new panel
   */
  const addPanel = useCallback(
    (type: PanelType, mode: 'tab' | 'stack' = 'tab') => {
      setState((prev) => {
        const newPanel: PanelConfig = {
          id: generatePanelId(type),
          type,
          position: {
            row: mode === 'stack' ? prev.panels.length : 0,
            col: 0,
          },
        };

        const newPanels = [...prev.panels, newPanel];

        return {
          ...prev,
          panels: newPanels,
          activeTabId: mode === 'tab' ? newPanel.id : prev.activeTabId,
          isVisible: true,
        };
      });
    },
    []
  );

  /**
   * Remove a panel
   */
  const removePanel = useCallback((id: string) => {
    setState((prev) => {
      const newPanels = prev.panels.filter((p) => p.id !== id);

      // If removing active tab, select first remaining panel
      let newActiveTabId = prev.activeTabId;
      if (prev.activeTabId === id) {
        newActiveTabId = newPanels[0]?.id || null;
      }

      return {
        ...prev,
        panels: newPanels,
        activeTabId: newActiveTabId,
        isVisible: newPanels.length > 0,
      };
    });
  }, []);

  /**
   * Set layout mode (tabs or stacked)
   */
  const setLayoutMode = useCallback((mode: LayoutMode) => {
    setState((prev) => ({
      ...prev,
      layoutMode: mode,
    }));
  }, []);

  /**
   * Set active tab (for tab mode)
   */
  const setActiveTab = useCallback((id: string | null) => {
    setState((prev) => ({
      ...prev,
      activeTabId: id,
    }));
  }, []);

  /**
   * Update filters (propagate to parent via callback)
   */
  const updateFilters = useCallback(
    (filters: Partial<ExploreFilters>) => {
      onFilterUpdate?.(filters);
    },
    [onFilterUpdate]
  );

  /**
   * Toggle panel visibility
   */
  const toggleVisibility = useCallback(() => {
    setState((prev) => ({
      ...prev,
      isVisible: !prev.isVisible,
    }));
  }, []);

  const value: AnalyticsPanelContextValue = {
    state,
    addPanel,
    removePanel,
    setLayoutMode,
    setActiveTab,
    updateFilters,
    toggleVisibility,
  };

  return (
    <AnalyticsPanelContext.Provider value={value}>
      {children}
    </AnalyticsPanelContext.Provider>
  );
}

/**
 * Hook to use analytics panel context
 */
export function useAnalyticsPanelContext(): AnalyticsPanelContextValue {
  const context = useContext(AnalyticsPanelContext);
  if (!context) {
    throw new Error(
      'useAnalyticsPanelContext must be used within AnalyticsPanelProvider'
    );
  }
  return context;
}
