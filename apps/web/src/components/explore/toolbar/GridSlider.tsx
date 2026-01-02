/**
 * GridSlider - Discrete 5-stop slider for grid zoom control
 * Replaces the dropdown ZoomControl with a more intuitive slider
 */

import { useCallback, useRef, useState } from 'react';
import { Grid3X3, Grid2X2, LayoutGrid, Square, Grip } from 'lucide-react';

export type GridSize = 'xs' | 's' | 'm' | 'l' | 'xl';

interface GridSizeConfig {
  key: GridSize;
  label: string;
  shortLabel: string;
  targetRowHeight: number;
  thumbnailSize: string;
}

export const GRID_SIZE_CONFIGS: Record<GridSize, GridSizeConfig> = {
  xs: {
    key: 'xs',
    label: 'Extra Small',
    shortLabel: 'XS',
    targetRowHeight: 80,
    thumbnailSize: '1x',
  },
  s: {
    key: 's',
    label: 'Small',
    shortLabel: 'S',
    targetRowHeight: 120,
    thumbnailSize: '1x',
  },
  m: {
    key: 'm',
    label: 'Medium',
    shortLabel: 'M',
    targetRowHeight: 200,
    thumbnailSize: '2x',
  },
  l: {
    key: 'l',
    label: 'Large',
    shortLabel: 'L',
    targetRowHeight: 300,
    thumbnailSize: '4x',
  },
  xl: {
    key: 'xl',
    label: 'Extra Large',
    shortLabel: 'XL',
    targetRowHeight: 400,
    thumbnailSize: '4x',
  },
};

const GRID_SIZES: GridSize[] = ['xs', 's', 'm', 'l', 'xl'];
// Percentage positions with padding so thumb doesn't overlap edges/icon
const STOP_POSITIONS = [8, 29, 50, 71, 92]; // 5 stops with ~8% edge padding

interface GridSliderProps {
  value: GridSize;
  onChange: (size: GridSize) => void;
  className?: string;
}

// Map grid sizes to appropriate icons (more items = smaller grid = more dots)
const GRID_ICONS: Record<GridSize, typeof Grid3X3> = {
  xs: Grip,        // Most items, smallest thumbnails - 5x5 dots
  s: Grid3X3,      // Many items - 3x3 grid
  m: Grid2X2,      // Medium items - 2x2 grid
  l: LayoutGrid,   // Fewer items - layout grid
  xl: Square,      // Fewest items, largest thumbnails - single square
};

export function GridSlider({ value, onChange, className = '' }: GridSliderProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const currentIndex = GRID_SIZES.indexOf(value);
  const thumbPosition = STOP_POSITIONS[currentIndex];

  // Get the appropriate icon for current grid size
  const GridIcon = GRID_ICONS[value];

  // Find nearest stop from a percentage position
  const findNearestStop = useCallback((percent: number): GridSize => {
    let nearestIndex = 0;
    let minDistance = Math.abs(percent - STOP_POSITIONS[0]);

    for (let i = 1; i < STOP_POSITIONS.length; i++) {
      const distance = Math.abs(percent - STOP_POSITIONS[i]);
      if (distance < minDistance) {
        minDistance = distance;
        nearestIndex = i;
      }
    }

    return GRID_SIZES[nearestIndex];
  }, []);

  // Handle click/drag on track
  const handleTrackInteraction = useCallback((clientX: number) => {
    if (!trackRef.current) return;

    const rect = trackRef.current.getBoundingClientRect();
    const percent = Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));
    const newSize = findNearestStop(percent);

    if (newSize !== value) {
      onChange(newSize);
    }
  }, [findNearestStop, onChange, value]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    setIsDragging(true);
    handleTrackInteraction(e.clientX);

    const handleMouseMove = (moveEvent: MouseEvent) => {
      handleTrackInteraction(moveEvent.clientX);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [handleTrackInteraction]);

  // Keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    const currentIdx = GRID_SIZES.indexOf(value);

    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (currentIdx < GRID_SIZES.length - 1) {
        onChange(GRID_SIZES[currentIdx + 1]);
      }
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      e.preventDefault();
      if (currentIdx > 0) {
        onChange(GRID_SIZES[currentIdx - 1]);
      }
    } else if (e.key === 'Home') {
      e.preventDefault();
      onChange(GRID_SIZES[0]);
    } else if (e.key === 'End') {
      e.preventDefault();
      onChange(GRID_SIZES[GRID_SIZES.length - 1]);
    }
  }, [onChange, value]);

  const config = GRID_SIZE_CONFIGS[value];

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      {/* Dynamic grid icon based on current size */}
      <GridIcon className="w-4 h-4 text-emerald-600 flex-shrink-0 transition-all duration-150" />

      {/* Slider track */}
      <div
        ref={trackRef}
        className="relative w-32 h-6 flex items-center cursor-pointer select-none"
        onMouseDown={handleMouseDown}
        role="slider"
        aria-valuemin={0}
        aria-valuemax={4}
        aria-valuenow={currentIndex}
        aria-valuetext={config.label}
        aria-label="Grid size"
        tabIndex={0}
        onKeyDown={handleKeyDown}
      >
        {/* Track background - spans between first and last stop */}
        <div
          className="absolute inset-y-2.5 bg-gray-200 rounded-full h-1"
          style={{ left: `${STOP_POSITIONS[0]}%`, right: `${100 - STOP_POSITIONS[STOP_POSITIONS.length - 1]}%` }}
        />

        {/* Active track fill - from first stop to current position */}
        <div
          className="absolute inset-y-2.5 bg-emerald-500 rounded-full h-1 transition-all duration-150"
          style={{
            left: `${STOP_POSITIONS[0]}%`,
            width: `${thumbPosition - STOP_POSITIONS[0]}%`
          }}
        />

        {/* Stop markers */}
        {STOP_POSITIONS.map((pos, idx) => (
          <div
            key={pos}
            className={`absolute w-1.5 h-1.5 rounded-full -translate-x-1/2 transition-colors ${
              idx <= currentIndex ? 'bg-emerald-500' : 'bg-gray-300'
            }`}
            style={{ left: `${pos}%`, top: '50%', transform: 'translate(-50%, -50%)' }}
          />
        ))}

        {/* Thumb */}
        <div
          className={`absolute w-4 h-4 bg-white rounded-full shadow-md border-2 -translate-x-1/2 transition-all duration-150 ${
            isDragging
              ? 'border-emerald-600 scale-110 shadow-lg'
              : 'border-emerald-500 hover:border-emerald-600 hover:scale-105'
          }`}
          style={{ left: `${thumbPosition}%`, top: '50%', transform: 'translate(-50%, -50%)' }}
        />
      </div>

      {/* Size label */}
      <span className="text-xs font-medium text-gray-600 w-6 text-center flex-shrink-0">
        {config.shortLabel}
      </span>
    </div>
  );
}

// Hook to manage grid size with localStorage persistence
const GRID_SIZE_STORAGE_KEY = 'explore-grid-size';

export function useGridSize(defaultSize: GridSize = 'm') {
  const [size, setSizeState] = useState<GridSize>(() => {
    const stored = localStorage.getItem(GRID_SIZE_STORAGE_KEY);
    if (stored && GRID_SIZES.includes(stored as GridSize)) {
      return stored as GridSize;
    }
    return defaultSize;
  });

  const setSize = useCallback((newSize: GridSize) => {
    setSizeState(newSize);
    localStorage.setItem(GRID_SIZE_STORAGE_KEY, newSize);
  }, []);

  const config = GRID_SIZE_CONFIGS[size];

  return {
    size,
    setSize,
    config,
  };
}
