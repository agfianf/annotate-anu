/**
 * WebGL-based annotation overlay for high-performance rendering of 1000+ bounding boxes
 * Uses PixiJS for GPU-accelerated 2D rendering
 */

import { useEffect, useRef, useCallback, memo } from 'react';
import * as PIXI from 'pixi.js';
import type { BboxPreview } from '../../lib/data-management-client';

interface WebGLAnnotationLayerProps {
  /** Array of bounding boxes in normalized coordinates (0-1) */
  bboxes: BboxPreview[];
  /** Whether to show only on hover */
  showOnHover?: boolean;
  /** Container dimensions */
  width: number;
  height: number;
  /** Level of detail threshold - show only top N largest boxes when below this size */
  lodThreshold?: number;
  /** Maximum boxes to render when LOD is active */
  lodMaxBoxes?: number;
}

/**
 * Convert hex color string to numeric value for PixiJS tint
 */
function hexToNumber(hex: string): number {
  const cleanHex = hex.replace('#', '');
  return parseInt(cleanHex, 16);
}

/**
 * Calculate box area for LOD sorting
 */
function calculateArea(bbox: BboxPreview): number {
  return (bbox.x_max - bbox.x_min) * (bbox.y_max - bbox.y_min);
}

/**
 * Apply LOD filtering - show only largest boxes when thumbnail is small
 */
function applyLOD(
  bboxes: BboxPreview[],
  thumbnailWidth: number,
  lodThreshold: number,
  lodMaxBoxes: number
): BboxPreview[] {
  if (thumbnailWidth >= lodThreshold || bboxes.length <= lodMaxBoxes) {
    return bboxes;
  }

  // Sort by area descending and take top N
  return [...bboxes]
    .sort((a, b) => calculateArea(b) - calculateArea(a))
    .slice(0, lodMaxBoxes);
}

export const WebGLAnnotationLayer = memo(function WebGLAnnotationLayer({
  bboxes,
  showOnHover = true,
  width,
  height,
  lodThreshold = 150,
  lodMaxBoxes = 20,
}: WebGLAnnotationLayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<PIXI.Application | null>(null);
  const graphicsRef = useRef<PIXI.Graphics | null>(null);
  const isInitializedRef = useRef(false);

  // Initialize PixiJS application
  const initPixi = useCallback(async () => {
    if (!containerRef.current || isInitializedRef.current) return;
    if (width <= 0 || height <= 0) return;

    try {
      const app = new PIXI.Application();

      await app.init({
        width,
        height,
        backgroundAlpha: 0,
        antialias: true,
        resolution: window.devicePixelRatio || 1,
        autoDensity: true,
      });

      // Apply styles to canvas
      if (app.canvas) {
        app.canvas.style.position = 'absolute';
        app.canvas.style.top = '0';
        app.canvas.style.left = '0';
        app.canvas.style.width = '100%';
        app.canvas.style.height = '100%';
        app.canvas.style.pointerEvents = 'none';
      }

      containerRef.current.appendChild(app.canvas);

      // Create graphics object for drawing
      const graphics = new PIXI.Graphics();
      app.stage.addChild(graphics);

      appRef.current = app;
      graphicsRef.current = graphics;
      isInitializedRef.current = true;
    } catch (error) {
      console.error('Failed to initialize PixiJS:', error);
    }
  }, [width, height]);

  // Draw bounding boxes
  const drawBoxes = useCallback(() => {
    const graphics = graphicsRef.current;
    const app = appRef.current;

    if (!graphics || !app || !bboxes.length) return;

    // Clear previous drawings
    graphics.clear();

    // Apply LOD filtering
    const visibleBoxes = applyLOD(bboxes, width, lodThreshold, lodMaxBoxes);

    // Calculate stroke width based on container size
    const strokeWidth = Math.max(1, Math.min(3, width / 100));

    // Draw each bounding box
    for (const bbox of visibleBoxes) {
      const x = bbox.x_min * width;
      const y = bbox.y_min * height;
      const boxWidth = (bbox.x_max - bbox.x_min) * width;
      const boxHeight = (bbox.y_max - bbox.y_min) * height;

      const color = hexToNumber(bbox.label_color);

      graphics
        .rect(x, y, boxWidth, boxHeight)
        .stroke({ width: strokeWidth, color, alpha: 0.9 });
    }
  }, [bboxes, width, height, lodThreshold, lodMaxBoxes]);

  // Initialize on mount
  useEffect(() => {
    initPixi();

    return () => {
      if (appRef.current) {
        appRef.current.destroy(true, { children: true, texture: true });
        appRef.current = null;
        graphicsRef.current = null;
        isInitializedRef.current = false;
      }
    };
  }, [initPixi]);

  // Redraw when bboxes or dimensions change
  useEffect(() => {
    if (isInitializedRef.current) {
      drawBoxes();
    }
  }, [drawBoxes]);

  // Handle resize
  useEffect(() => {
    const app = appRef.current;
    if (app && width > 0 && height > 0) {
      app.renderer.resize(width, height);
      drawBoxes();
    }
  }, [width, height, drawBoxes]);

  if (!bboxes || bboxes.length === 0) return null;

  return (
    <div
      ref={containerRef}
      className={`absolute inset-0 pointer-events-none transition-opacity duration-200 ${
        showOnHover ? 'opacity-0 group-hover:opacity-100' : 'opacity-100'
      }`}
      style={{ width: '100%', height: '100%' }}
    />
  );
});

/**
 * Utility hook to detect WebGL support
 */
export function useWebGLSupport(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return !!(canvas.getContext('webgl') || canvas.getContext('webgl2'));
  } catch {
    return false;
  }
}

/**
 * Smart annotation overlay that uses WebGL for large datasets, SVG for small ones
 */
export function useAnnotationRenderer(boxCount: number, threshold = 100) {
  const hasWebGL = useWebGLSupport();
  return {
    useWebGL: hasWebGL && boxCount > threshold,
    hasWebGL,
  };
}
