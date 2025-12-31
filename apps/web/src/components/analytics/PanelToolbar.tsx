/**
 * Panel Toolbar
 * Layout mode toggle and panel management controls
 */

import { memo } from 'react';
import { LayoutGrid, LayoutPanelTop } from 'lucide-react';
import { PanelLibrary } from './PanelLibrary';
import { useAnalyticsPanels } from '@/hooks/useAnalyticsPanels';

export const PanelToolbar = memo(function PanelToolbar() {
  const { layoutMode, setLayoutMode, panelCount } = useAnalyticsPanels();

  return (
    <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 bg-white">
      <div className="flex items-center gap-3">
        {/* Layout Mode Toggle */}
        {panelCount > 1 && (
          <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => setLayoutMode('tabs')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                layoutMode === 'tabs'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
              aria-label="Tab layout"
            >
              <div className="flex items-center gap-1.5">
                <LayoutPanelTop className="w-3.5 h-3.5" />
                <span>Tabs</span>
              </div>
            </button>
            <button
              onClick={() => setLayoutMode('stacked')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                layoutMode === 'stacked'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
              aria-label="Stacked layout"
            >
              <div className="flex items-center gap-1.5">
                <LayoutGrid className="w-3.5 h-3.5" />
                <span>Stacked</span>
              </div>
            </button>
          </div>
        )}

        <div className="text-xs text-gray-500">
          {panelCount} {panelCount === 1 ? 'panel' : 'panels'}
        </div>
      </div>

      {/* Add Panel Button */}
      <PanelLibrary />
    </div>
  );
});
