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
      <div className="relative">
        {/* Sparkling border light effect when not in full view */}
        {!isFullView && (
          <>
            <style>{`
              @keyframes border-spin {
                from { transform: translate(-50%, -50%) rotate(0deg); }
                to { transform: translate(-50%, -50%) rotate(360deg); }
              }
            `}</style>
            <div className="absolute -inset-[2px] rounded-lg overflow-hidden">
              <div
                style={{
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  width: '200%',
                  aspectRatio: '1',
                  background: 'conic-gradient(from 0deg, transparent 0deg, transparent 260deg, #34d399 280deg, #10b981 295deg, #6ee7b7 310deg, transparent 330deg, transparent 360deg)',
                  animation: 'border-spin 2s linear infinite',
                }}
              />
            </div>
            {/* Inner background to mask the center */}
            <div className="absolute inset-0 rounded-lg bg-emerald-50" />
          </>
        )}
        <button
          onClick={onToggleFullView}
          className={`relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all text-sm font-medium ${
            isFullView
              ? 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
              : 'text-emerald-600 bg-emerald-50 hover:bg-emerald-100 border border-transparent'
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
    </div>
  );
}
