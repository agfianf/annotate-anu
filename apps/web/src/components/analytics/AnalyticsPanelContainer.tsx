/**
 * Analytics Panel Container
 * Main container for analytics panels with tab/stacked layout
 */

import { Suspense, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
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
 * Render panel content with lazy loading
 */
function RenderPanel({
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
}

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

  if (panels.length === 0) {
    return null;
  }

  // Tabbed layout
  if (layoutMode === 'tabs') {
    const activePanelId = activeTabId || panels[0]?.id;
    const activePanel = panels.find(p => p.id === activePanelId);

    return (
      <motion.div
        initial={prefersReducedMotion ? {} : { opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        exit={prefersReducedMotion ? {} : { opacity: 0, x: -20 }}
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

        {/* Tab Panel Content */}
        <div
          className="flex-1 overflow-auto"
          role="tabpanel"
          id={activePanel ? `panel-${activePanel.id}` : undefined}
          aria-labelledby={activePanel ? `tab-${activePanel.id}` : undefined}
        >
          <AnimatePresence mode="wait">
            {activePanel && (
              <motion.div
                key={activePanel.id}
                initial={prefersReducedMotion ? {} : { opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={prefersReducedMotion ? {} : { opacity: 0, y: -10 }}
                transition={{ duration: prefersReducedMotion ? 0.01 : 0.2 }}
                className="h-full overflow-auto"
              >
                <RenderPanel
                  panelType={activePanel.type}
                  projectId={projectId}
                  filters={filters}
                  onFilterUpdate={onFilterUpdate}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    );
  }

  // Stacked layout
  return (
    <motion.div
      initial={prefersReducedMotion ? {} : { opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={prefersReducedMotion ? {} : { opacity: 0, x: -20 }}
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
            <RenderPanel
              panelType={panel.type}
              projectId={projectId}
              filters={filters}
              onFilterUpdate={onFilterUpdate}
            />
          </PanelWrapper>
        ))}
      </div>
    </motion.div>
  );
});
