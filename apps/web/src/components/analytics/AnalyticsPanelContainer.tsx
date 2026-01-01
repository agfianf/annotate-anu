/**
 * Analytics Panel Container
 * Main container for analytics panels with tab/stacked layout
 * Optimized for stable rendering to prevent flickering during filter updates
 */

import { Suspense, memo, useMemo, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import { X } from 'lucide-react';
import { useAnalyticsPanels } from '@/hooks/useAnalyticsPanels';
import { getPanelDefinition } from './panelRegistry';
import { PanelWrapper } from './PanelWrapper';
import type { ExploreFilters } from '@/lib/data-management-client';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { PanelSkeleton } from './PanelSkeleton';

interface AnalyticsPanelContainerProps {
  projectId: string;
  filters: ExploreFilters;
  onFilterUpdate: (filters: Partial<ExploreFilters>) => void;
}

/**
 * Panel loading fallback
 */
function PanelLoading() {
  return <PanelSkeleton />;
}

/**
 * Memoized panel renderer
 * Custom comparison: only re-render if projectId or panelType changes
 * Filter changes are handled internally by each panel's data hooks
 */
const MemoizedRenderPanel = memo(function MemoizedRenderPanel({
  panelType,
  projectId,
  filters,
  onFilterUpdate,
}: {
  panelType: string;
  projectId: string;
  filters: ExploreFilters;
  onFilterUpdate: (filters: Partial<ExploreFilters>) => void;
}) {
  const definition = getPanelDefinition(panelType as any);
  const PanelComponent = definition.component;

  return (
    <Suspense fallback={<PanelLoading />}>
      <PanelComponent
        projectId={projectId}
        filters={filters}
        onFilterUpdate={onFilterUpdate}
      />
    </Suspense>
  );
}, (prevProps, nextProps) => {
  // Custom comparison: only re-render if projectId or panelType changes
  // Filter changes don't require re-render since data hooks handle caching independently
  return (
    prevProps.projectId === nextProps.projectId &&
    prevProps.panelType === nextProps.panelType
  );
});

export const AnalyticsPanelContainer = memo(function AnalyticsPanelContainer({
  projectId,
  filters,
  onFilterUpdate,
}: AnalyticsPanelContainerProps) {
  const {
    panels,
    layoutMode,
    activeTabId,
    setActiveTab,
    removePanel,
  } = useAnalyticsPanels();

  const prefersReducedMotion = useReducedMotion();

  // Stabilize onFilterUpdate callback to prevent unnecessary re-renders
  const onFilterUpdateRef = useRef(onFilterUpdate);
  onFilterUpdateRef.current = onFilterUpdate;
  const stableOnFilterUpdate = useCallback(
    (updates: Partial<ExploreFilters>) => onFilterUpdateRef.current(updates),
    []
  );

  // Generate stable container key based on panel configuration only
  const panelContainerKey = useMemo(
    () => `panels-${panels.map(p => p.id).join('-')}-${layoutMode}`,
    [panels, layoutMode]
  );

  if (panels.length === 0) {
    return null;
  }

  // Tabbed layout - uses CSS visibility switching instead of AnimatePresence
  if (layoutMode === 'tabs') {
    const activePanelId = activeTabId || panels[0]?.id;

    return (
      <motion.div
        key={panelContainerKey}
        initial={prefersReducedMotion ? {} : { opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: prefersReducedMotion ? 0.01 : 0.25 }}
        className="w-full min-w-0 flex flex-col h-full glass-strong rounded-xl overflow-hidden"
        role="region"
        aria-label="Analytics panels"
      >
        {/* Tab Bar - compact style matching gallery header */}
        <div
          className="flex items-center gap-0.5 px-2 py-1.5 border-b border-gray-100 bg-gradient-to-r from-gray-50 to-white overflow-x-auto scrollbar-none"
          role="tablist"
          aria-label="Analytics panel tabs"
        >
          {panels.map((panel) => {
            const definition = getPanelDefinition(panel.type);
            const Icon = definition.icon;
            const isActive = panel.id === activePanelId;
            return (
              <button
                key={panel.id}
                id={`tab-${panel.id}`}
                onClick={() => setActiveTab(panel.id)}
                className={`group flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors whitespace-nowrap ${
                  isActive
                    ? 'bg-emerald-100/80 text-emerald-700'
                    : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
                }`}
                role="tab"
                aria-selected={isActive}
                aria-controls={`panel-${panel.id}`}
                title={definition.name}
              >
                <Icon className="w-3.5 h-3.5 flex-shrink-0" />
                <span className="truncate max-w-[80px]">{definition.name}</span>
                <span
                  onClick={(e) => {
                    e.stopPropagation();
                    removePanel(panel.id);
                  }}
                  className="ml-0.5 p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-gray-200/80 transition-opacity"
                  role="button"
                  aria-label={`Close ${definition.name}`}
                >
                  <X className="w-3 h-3" />
                </span>
              </button>
            );
          })}
        </div>

        {/* Tab Panel Content - CSS visibility switching for smooth transitions */}
        <div className="flex-1 overflow-hidden relative">
          {panels.map((panel) => (
            <div
              key={panel.id}
              id={`panel-${panel.id}`}
              role="tabpanel"
              aria-labelledby={`tab-${panel.id}`}
              aria-hidden={panel.id !== activePanelId}
              className={`absolute inset-0 overflow-auto transition-opacity duration-200 ${
                panel.id === activePanelId
                  ? 'opacity-100 z-10'
                  : 'opacity-0 z-0 pointer-events-none'
              }`}
            >
              <MemoizedRenderPanel
                panelType={panel.type}
                projectId={projectId}
                filters={filters}
                onFilterUpdate={stableOnFilterUpdate}
              />
            </div>
          ))}
        </div>
      </motion.div>
    );
  }

  // Stacked layout
  return (
    <motion.div
      key={panelContainerKey}
      initial={prefersReducedMotion ? {} : { opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: prefersReducedMotion ? 0.01 : 0.25 }}
      className="w-full min-w-0 flex flex-col h-full overflow-hidden"
      role="region"
      aria-label="Analytics panels (stacked layout)"
    >
      {/* Stacked Panels with elegant scrollbar */}
      <div className="flex-1 flex flex-col gap-1.5 overflow-y-auto overflow-x-hidden pr-1">
        {panels.map((panel, index) => (
          <PanelWrapper
            key={panel.id}
            panel={panel}
            className="min-h-[250px] sm:min-h-[300px] flex-shrink-0"
            aria-label={`Panel ${index + 1} of ${panels.length}`}
          >
            <MemoizedRenderPanel
              panelType={panel.type}
              projectId={projectId}
              filters={filters}
              onFilterUpdate={stableOnFilterUpdate}
            />
          </PanelWrapper>
        ))}
      </div>
    </motion.div>
  );
});
