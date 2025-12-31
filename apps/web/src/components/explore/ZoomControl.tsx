/**
 * Zoom control component for image grid - compact click dropdown
 */

import { useState, useRef, useEffect } from 'react';
import { Grid3X3, LayoutGrid, Grid2X2, Square } from 'lucide-react';
import type { ZoomLevel } from '../../hooks/useZoomLevel';
import { ZOOM_CONFIGS } from '../../hooks/useZoomLevel';

const ZOOM_ICONS: Record<ZoomLevel, React.ElementType> = {
  '1x': LayoutGrid,  // Many small items
  '2x': Grid2X2,     // Medium grid
  '4x': Square,      // Large items
};

interface ZoomControlProps {
  currentZoom: ZoomLevel;
  onZoomChange: (zoom: ZoomLevel) => void;
}

export function ZoomControl({ currentZoom, onZoomChange }: ZoomControlProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const levels: ZoomLevel[] = ['1x', '2x', '4x'];

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  return (
    <div ref={containerRef} className="relative">
      {/* Compact icon button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-1.5 px-2 py-1.5 border rounded-lg transition-all ${
          isOpen
            ? 'bg-white border-emerald-300 text-emerald-700'
            : 'bg-white/50 border-gray-200 text-gray-600 hover:text-gray-800 hover:bg-white/80'
        }`}
        title={`Grid size: ${ZOOM_CONFIGS[currentZoom].label}`}
      >
        <Grid3X3 className="w-4 h-4" />
        <span className="text-xs font-medium">{ZOOM_CONFIGS[currentZoom].label}</span>
      </button>

      {/* Click dropdown */}
      {isOpen && (
        <div className="absolute top-full right-0 mt-1 bg-white/90 backdrop-blur-sm border border-gray-200 rounded-lg shadow-lg p-1 z-50 min-w-[140px]">
          {levels.map((level) => {
            const Icon = ZOOM_ICONS[level];
            const config = ZOOM_CONFIGS[level];
            return (
              <button
                key={level}
                onClick={() => {
                  onZoomChange(level);
                  setIsOpen(false);
                }}
                className={`w-full px-2.5 py-2 rounded text-xs font-medium text-left transition-all flex items-center gap-2 ${
                  currentZoom === level
                    ? 'bg-emerald-600 text-white'
                    : 'text-gray-600 hover:text-gray-800 hover:bg-gray-100'
                }`}
              >
                <Icon className="w-4 h-4 flex-shrink-0" />
                <span className="flex-1">{config.label}</span>
                <span className={`text-[10px] ${currentZoom === level ? 'text-emerald-100' : 'text-gray-400'}`}>
                  {config.targetRowHeight}px
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
