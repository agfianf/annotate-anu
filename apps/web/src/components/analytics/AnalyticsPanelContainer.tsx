/**
 * Analytics Panel Container
 * Main container for analytics panels with tab/stacked layout
 */

import { Suspense, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, X } from 'lucide-react';
import { useAnalyticsPanels } from '@/hooks/useAnalyticsPanels';
import { getPanelDefinition } from './panelRegistry';
import { PanelWrapper } from './PanelWrapper';
import type { ExploreFilters } from '@/lib/data-management-client';
import { useReducedMotion } from '@/hooks/useReducedMotion';

interface AnalyticsPanelContainerProps {
  projectId: string;
  filters: ExploreFilters;
  onFilterUpdate: (filters: Partial<ExploreFilters>) => void;
}

/**
 * Panel loading fallback
 */
function PanelLoading() {
  return (
    <div className="flex items-center justify-center h-full">
      <Loader2 className="w-8 h-8 text-emerald-600 animate-spin" />
    </div>
  );
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
        className="flex flex-col h-full glass-strong rounded-2xl overflow-hidden"
      >
        {/* Tab Bar */}
        <div className="flex items-center gap-1 px-4 py-2 border-b border-gray-200 bg-white overflow-x-auto">
          {panels.map((panel) => {
            const definition = getPanelDefinition(panel.type);
            const Icon = definition.icon;
            const isActive = panel.id === activePanelId;
            return (
              <div
                key={panel.id}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                  isActive
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`}
              >
                <button
                  onClick={() => setActiveTab(panel.id)}
                  className="flex items-center gap-2 flex-1"
                  aria-label={`View ${definition.name} panel`}
                  aria-selected={isActive}
                >
                  <Icon className="w-4 h-4" />
                  {definition.name}
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    removePanel(panel.id);
                  }}
                  className="p-0.5 hover:bg-gray-200 rounded transition-colors"
                  aria-label={`Close ${definition.name} panel`}
                  title={`Close ${definition.name}`}
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            );
          })}
        </div>

        {/* Tab Panel Content */}
        <div className="flex-1 overflow-hidden">
          <AnimatePresence mode="wait">
            {activePanel && (
              <motion.div
                key={activePanel.id}
                initial={prefersReducedMotion ? {} : { opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={prefersReducedMotion ? {} : { opacity: 0, y: -10 }}
                transition={{ duration: prefersReducedMotion ? 0.01 : 0.2 }}
                className="h-full"
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
      className="flex flex-col h-full gap-3"
    >
      {/* Stacked Panels */}
      <div className="flex-1 flex flex-col gap-3 overflow-auto">
        {panels.map((panel) => (
          <PanelWrapper
            key={panel.id}
            panel={panel}
            className="min-h-[300px]"
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
