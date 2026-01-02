/**
 * ViewZone - Grid size slider and sidebar expand toggle
 * Middle section of the toolbar for view controls
 */

import { Maximize2, Minimize2 } from 'lucide-react';
import { GridSlider, type GridSize } from './GridSlider';

interface ViewZoneProps {
  // Grid size
  gridSize: GridSize;
  onGridSizeChange: (size: GridSize) => void;

  // Sidebar expand toggle
  isFullView: boolean;
  onToggleFullView: () => void;
}

export function ViewZone({
  gridSize,
  onGridSizeChange,
  isFullView,
  onToggleFullView,
}: ViewZoneProps) {
  return (
    <div className="flex items-center gap-4">
      {/* Grid Size Slider with Label */}
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-gray-500">Grid</span>
        <GridSlider value={gridSize} onChange={onGridSizeChange} />
      </div>

      {/* Sidebar Toggle with Label */}
      <button
        onClick={onToggleFullView}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all text-sm font-medium ${
          isFullView
            ? 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
            : 'text-emerald-600 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200'
        }`}
        title={isFullView ? 'Show sidebar (ESC)' : 'Hide sidebar for full view'}
        aria-label={isFullView ? 'Show sidebar' : 'Hide sidebar'}
      >
        {isFullView ? (
          <>
            <Minimize2 className="w-4 h-4" />
            <span>Exit Full</span>
          </>
        ) : (
          <>
            <Maximize2 className="w-4 h-4" />
            <span>Full View</span>
          </>
        )}
      </button>
    </div>
  );
}
