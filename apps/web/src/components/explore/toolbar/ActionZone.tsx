/**
 * ActionZone - Add Panel and Export buttons
 * Right section of the toolbar for primary actions
 */

import { Plus } from 'lucide-react';
import { PanelLibrary } from '../../analytics/PanelLibrary';

interface ActionZoneProps {
  onExport: () => void;
  // Panel count for layout mode toggle (optional)
  panelCount?: number;
  layoutMode?: 'tabs' | 'stacked';
  onLayoutModeChange?: (mode: 'tabs' | 'stacked') => void;
  isPanelsVisible?: boolean;
}

export function ActionZone({
  onExport,
}: ActionZoneProps) {
  return (
    <div className="flex items-center gap-2">
      {/* Add Panel Button - using PanelLibrary component */}
      <PanelLibrary />

      {/* Export Button - Secondary/Outline style */}
      <button
        onClick={onExport}
        className="px-4 py-2 border border-gray-300 text-gray-600 rounded-lg transition-all flex items-center gap-2 text-sm font-medium hover:border-gray-400 hover:bg-gray-50 hover:text-gray-700"
        title="Export filtered dataset"
      >
        <span>Export</span>
      </button>
    </div>
  );
}
