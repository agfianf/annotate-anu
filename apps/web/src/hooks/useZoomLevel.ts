/**
 * Zoom level management hook with localStorage persistence
 */

import { useState } from 'react';

export type ZoomLevel = '1x' | '2x' | '4x';

export interface ZoomConfig {
  key: ZoomLevel;
  label: string;
  targetRowHeight: number;
  thumbnailSize: string; // Query param for backend
}

export const ZOOM_CONFIGS: Record<ZoomLevel, ZoomConfig> = {
  '1x': {
    key: '1x',
    label: 'Small',
    targetRowHeight: 120,
    thumbnailSize: '1x',
  },
  '2x': {
    key: '2x',
    label: 'Medium',
    targetRowHeight: 200,
    thumbnailSize: '2x',
  },
  '4x': {
    key: '4x',
    label: 'Large',
    targetRowHeight: 350,
    thumbnailSize: '4x',
  },
};

const STORAGE_KEY = 'explore-zoom-level';

export function useZoomLevel(defaultZoom: ZoomLevel = '2x') {
  const [zoomLevel, setZoomLevelState] = useState<ZoomLevel>(() => {
    // Load from localStorage
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && (stored === '1x' || stored === '2x' || stored === '4x')) {
      return stored;
    }
    return defaultZoom;
  });

  const setZoomLevel = (level: ZoomLevel) => {
    setZoomLevelState(level);
    localStorage.setItem(STORAGE_KEY, level);
  };

  const config = ZOOM_CONFIGS[zoomLevel];

  return {
    zoomLevel,
    setZoomLevel,
    config,
  };
}
