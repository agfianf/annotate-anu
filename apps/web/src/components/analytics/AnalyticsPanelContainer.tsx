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
        className="w-full min-w-0 flex flex-col h-full glass-strong rounded-2xl overflow-hidden"
        role="region"
        aria-label="Analytics panels"
      >
        {/* Tab Bar */}
        <div
          className="flex items-center gap-1 px-4 py-2 border-b border-gray-200 bg-white overflow-x-auto"
          role="tablist"
          aria-label="Analytics panel tabs"
        >
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
                role="tab"
                aria-selected={isActive}
                aria-controls={`panel-${panel.id}`}
              >
                <button
                  onClick={() => setActiveTab(panel.id)}
                  className="flex items-center gap-2 flex-1"
                  aria-label={`View ${definition.name} panel`}
                  tabIndex={isActive ? 0 : -1}
                >
                  <Icon className="w-4 h-4" />
                  <span className="hidden sm:inline">{definition.name}</span>
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
