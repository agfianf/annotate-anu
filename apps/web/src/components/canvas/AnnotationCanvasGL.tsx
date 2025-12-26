/**
 * WebGL-based annotation canvas for high-performance rendering of 1000+ annotations
 * Uses PixiJS for GPU-accelerated 2D rendering
 *
 * This component renders UNSELECTED annotations efficiently, while selected annotations
 * are rendered by the Konva layer for full interactivity (transformer, point editing)
 */

import { useEffect, useRef, useCallback, memo, useMemo } from 'react';
import * as PIXI from 'pixi.js';
import type { Annotation, Label, RectangleAnnotation, PolygonAnnotation } from '../../types/annotations';

interface AnnotationCanvasGLProps {
  /** All annotations (will filter to unselected) */
  annotations: Annotation[];
  /** IDs of selected annotations (these will be skipped - rendered by Konva) */
  selectedAnnotationIds: string[];
  /** Labels for color lookup */
  labels: Label[];
  /** Scale factor for coordinate transformation */
  scale: number;
  /** Canvas dimensions */
  width: number;
  height: number;
  /** Zoom level for stroke width adjustment */
  zoomLevel: number;
  /** Stage position offset for panning */
  stagePosition: { x: number; y: number };
  /** Click handler for annotation selection */
  onAnnotationClick?: (annotationId: string) => void;
  /** Optional: Only show annotations for specific label IDs */
  visibleLabelIds?: string[];
}

// Constants matching Canvas.tsx
const ANNOTATION_FILL_OPACITY_UNSELECTED = 0.4;
const ANNOTATION_STROKE_OPACITY = 1;
const ANNOTATION_STROKE_WIDTH = 2;

/**
 * Convert hex color string to numeric value for PixiJS
 */
function hexToNumber(hex: string): number {
  const cleanHex = hex.replace('#', '');
  return parseInt(cleanHex, 16);
}

// NOTE: For future optimization, implement polygon tessellation using earcut library
// for efficient WebGL rendering of complex concave polygons

export const AnnotationCanvasGL = memo(function AnnotationCanvasGL({
  annotations,
  selectedAnnotationIds,
  labels,
  scale,
  width,
  height,
  zoomLevel,
  stagePosition,
  onAnnotationClick,
  visibleLabelIds,
}: AnnotationCanvasGLProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<PIXI.Application | null>(null);
  const graphicsContainerRef = useRef<PIXI.Container | null>(null);
  const isInitializedRef = useRef(false);
  const hitAreasRef = useRef<Map<string, PIXI.Graphics>>(new Map());

  // Build label color lookup map
  const labelColorMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const label of labels) {
      map.set(label.id, label.color);
    }
    return map;
  }, [labels]);

  // Filter to only unselected annotations
  const unselectedAnnotations = useMemo(() => {
    const selectedSet = new Set(selectedAnnotationIds);
    return annotations.filter(a => {
      if (selectedSet.has(a.id)) return false;
      if (visibleLabelIds && !visibleLabelIds.includes(a.labelId)) return false;
      return true;
    });
  }, [annotations, selectedAnnotationIds, visibleLabelIds]);

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
        // Allow clicks through to Konva layer for selected annotations
        app.canvas.style.pointerEvents = 'auto';
      }

      containerRef.current.appendChild(app.canvas);

      // Create main container for all graphics
      const graphicsContainer = new PIXI.Container();
      graphicsContainer.eventMode = 'static';
      app.stage.addChild(graphicsContainer);

      appRef.current = app;
      graphicsContainerRef.current = graphicsContainer;
      isInitializedRef.current = true;
    } catch (error) {
      console.error('Failed to initialize PixiJS for annotation canvas:', error);
    }
  }, [width, height]);

  // Draw all annotations
  const drawAnnotations = useCallback(() => {
    const container = graphicsContainerRef.current;
    const app = appRef.current;

    if (!container || !app) return;

    // Clear previous drawings
    container.removeChildren();
    hitAreasRef.current.clear();

    // Calculate adjusted stroke width for zoom
    const adjustedStrokeWidth = zoomLevel > 1
      ? ANNOTATION_STROKE_WIDTH / zoomLevel
      : ANNOTATION_STROKE_WIDTH;

    // Create a single graphics object for batch rendering
    const graphics = new PIXI.Graphics();

    // Apply stage position for panning
    graphics.x = stagePosition.x;
    graphics.y = stagePosition.y;

    // Draw all unselected annotations
    for (const annotation of unselectedAnnotations) {
      const color = labelColorMap.get(annotation.labelId) || '#f97316';
      const colorNum = hexToNumber(color);

      if (annotation.type === 'rectangle') {
        const rect = annotation as RectangleAnnotation;
        const x = rect.x * scale;
        const y = rect.y * scale;
        const w = rect.width * scale;
        const h = rect.height * scale;

        // Draw filled rectangle
        graphics
          .rect(x, y, w, h)
          .fill({ color: colorNum, alpha: ANNOTATION_FILL_OPACITY_UNSELECTED })
          .stroke({
            width: adjustedStrokeWidth,
            color: colorNum,
            alpha: ANNOTATION_STROKE_OPACITY
          });

        // Create invisible hit area for click detection
        if (onAnnotationClick) {
          const hitArea = new PIXI.Graphics();
          hitArea.rect(x + stagePosition.x, y + stagePosition.y, w, h);
          hitArea.fill({ color: 0x000000, alpha: 0.001 });
          hitArea.eventMode = 'static';
          hitArea.cursor = 'pointer';
          hitArea.on('pointerdown', () => onAnnotationClick(annotation.id));
          container.addChild(hitArea);
          hitAreasRef.current.set(annotation.id, hitArea);
        }

      } else if (annotation.type === 'polygon') {
        const poly = annotation as PolygonAnnotation;
        if (poly.points.length < 3) continue;

        const scaledPoints = poly.points.map(p => ({
          x: p.x * scale,
          y: p.y * scale,
        }));

        // Draw filled polygon
        graphics.poly(scaledPoints.flatMap(p => [p.x, p.y]), true);
        graphics.fill({ color: colorNum, alpha: ANNOTATION_FILL_OPACITY_UNSELECTED });
        graphics.stroke({
          width: adjustedStrokeWidth,
          color: colorNum,
          alpha: ANNOTATION_STROKE_OPACITY
        });

        // Create invisible hit area for click detection
        if (onAnnotationClick) {
          const hitArea = new PIXI.Graphics();
          hitArea.poly(scaledPoints.flatMap(p => [p.x + stagePosition.x, p.y + stagePosition.y]), true);
          hitArea.fill({ color: 0x000000, alpha: 0.001 });
          hitArea.eventMode = 'static';
          hitArea.cursor = 'pointer';
          hitArea.on('pointerdown', () => onAnnotationClick(annotation.id));
          container.addChild(hitArea);
          hitAreasRef.current.set(annotation.id, hitArea);
        }
      }
    }

    container.addChild(graphics);
  }, [unselectedAnnotations, labelColorMap, scale, zoomLevel, stagePosition, onAnnotationClick]);

  // Initialize on mount
  useEffect(() => {
    initPixi();

    return () => {
      if (appRef.current) {
        appRef.current.destroy(true, { children: true, texture: true });
        appRef.current = null;
        graphicsContainerRef.current = null;
        isInitializedRef.current = false;
        hitAreasRef.current.clear();
      }
    };
  }, [initPixi]);

  // Redraw when annotations or view changes
  useEffect(() => {
    if (isInitializedRef.current) {
      drawAnnotations();
    }
  }, [drawAnnotations]);

  // Handle resize
  useEffect(() => {
    const app = appRef.current;
    if (app && width > 0 && height > 0) {
      app.renderer.resize(width, height);
      drawAnnotations();
    }
  }, [width, height, drawAnnotations]);

  // Skip rendering if no unselected annotations
  if (unselectedAnnotations.length === 0) return null;

  return (
    <div
      ref={containerRef}
      className="absolute inset-0"
      style={{
        width: '100%',
        height: '100%',
        zIndex: 1, // Below Konva layer (z-index 2)
      }}
    />
  );
});

// Cache WebGL availability check result at module level
// This prevents creating new WebGL contexts on every hook call
let webglAvailabilityCache: boolean | null = null;

/**
 * Check WebGL availability once and cache the result
 * Properly cleans up the test context to prevent leaks
 */
function checkWebGLAvailability(): boolean {
  if (webglAvailabilityCache !== null) {
    return webglAvailabilityCache;
  }

  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');

    if (gl) {
      // Properly clean up the test context
      const loseContext = gl.getExtension('WEBGL_lose_context');
      if (loseContext) {
        loseContext.loseContext();
      }
      webglAvailabilityCache = true;
    } else {
      webglAvailabilityCache = false;
    }

    // Remove canvas from memory
    canvas.width = 0;
    canvas.height = 0;
  } catch {
    webglAvailabilityCache = false;
  }

  return webglAvailabilityCache;
}

/**
 * Hook to determine if WebGL rendering should be used based on annotation count
 * Uses cached WebGL availability check to prevent context leaks
 */
export function useShouldUseWebGL(annotationCount: number, threshold = 100): boolean {
  // Use cached check - no new contexts created
  const hasWebGL = checkWebGLAvailability();
  return hasWebGL && annotationCount > threshold;
}

/**
 * Hook to split annotations into selected and unselected groups
 */
export function useAnnotationSplit(
  annotations: Annotation[],
  selectedIds: string[]
): { selected: Annotation[]; unselected: Annotation[] } {
  return useMemo(() => {
    const selectedSet = new Set(selectedIds);
    const selected: Annotation[] = [];
    const unselected: Annotation[] = [];

    for (const annotation of annotations) {
      if (selectedSet.has(annotation.id)) {
        selected.push(annotation);
      } else {
        unselected.push(annotation);
      }
    }

    return { selected, unselected };
  }, [annotations, selectedIds]);
}
