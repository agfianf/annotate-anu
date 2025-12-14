/**
 * Zoom control component for image grid
 */

import type { ZoomLevel } from '../../hooks/useZoomLevel';
import { ZOOM_CONFIGS } from '../../hooks/useZoomLevel';

interface ZoomControlProps {
  currentZoom: ZoomLevel;
  onZoomChange: (zoom: ZoomLevel) => void;
}

export function ZoomControl({ currentZoom, onZoomChange }: ZoomControlProps) {
  const levels: ZoomLevel[] = ['1x', '2x', '4x'];

  return (
    <div className="flex items-center gap-1 bg-white/50 border border-gray-200 rounded-lg p-1">
      {levels.map((level) => (
        <button
          key={level}
          onClick={() => onZoomChange(level)}
          className={`px-3 py-1.5 rounded text-xs font-medium transition-all ${
            currentZoom === level
              ? 'bg-emerald-600 text-white shadow-sm'
              : 'text-gray-600 hover:text-gray-800 hover:bg-gray-100'
          }`}
          title={ZOOM_CONFIGS[level].label}
        >
          {ZOOM_CONFIGS[level].label}
        </button>
      ))}
    </div>
  );
}
