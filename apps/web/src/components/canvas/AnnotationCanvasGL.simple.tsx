/**
 * SIMPLE & FAST WebGL renderer for display-only annotations
 *
 * Simple optimization: ONLY render annotations visible in viewport
 * No complex dirty tracking, no caching - just simple and fast!
 *
 * COORDINATE SYSTEM ARCHITECTURE:
 *
 * Three-layer transformation:
 *
 * Layer 1: IMAGE COORDINATES (native image size)
 *   - Annotations stored here (e.g., 0-4000 for a 4000px image)
 *   - Viewport culling operates in this space
 *   - Independent of display size
 *
 * Layer 2: CANVAS COORDINATES (autofit scaled)
 *   - imageCoords × scale = canvasCoords
 *   - Konva renders in this space
 *   - Example: 4000px image × 0.2 scale = 800px canvas
 *
 * Layer 3: DISPLAY COORDINATES (zoom + pan)
 *   - canvasCoords × zoomLevel + stagePosition = displayCoords
 *   - What user sees on screen
 *   - Example: 800px canvas × 2 zoom + pan offset
 *
 * VIEWPORT CALCULATION:
 * To convert display → image coords for culling:
 *   imageCoords = (displayCoords - stagePosition) ÷ zoomLevel ÷ scale
 */

import { useEffect, useRef, useCallback, memo, useMemo } from 'react';
import * as PIXI from 'pixi.js';
import type { Annotation, Label, RectangleAnnotation, PolygonAnnotation } from '../../types/annotations';

interface AnnotationCanvasGLProps {
  annotations: Annotation[];
  selectedAnnotationIds: string[];
  labels: Label[];
  scale: number;
  width: number;
  height: number;
  zoomLevel: number;
  stagePosition: { x: number; y: number };
  onAnnotationClick?: (annotationId: string) => void;
  visibleLabelIds?: string[];
}

const ANNOTATION_FILL_OPACITY_UNSELECTED = 0.4;
const ANNOTATION_STROKE_OPACITY = 1;
const ANNOTATION_STROKE_WIDTH = 2;

function hexToNumber(hex: string): number {
  const cleanHex = hex.replace('#', '');
  return parseInt(cleanHex, 16);
}

/**
 * Simple viewport check - is annotation visible?
 */
function isAnnotationInViewport(
  annotation: Annotation,
  viewport: { x: number; y: number; width: number; height: number }
): boolean {
  if (annotation.type === 'rectangle') {
    const rect = annotation as RectangleAnnotation;
    // AABB intersection test
    return !(
      rect.x + rect.width < viewport.x ||
      rect.x > viewport.x + viewport.width ||
      rect.y + rect.height < viewport.y ||
      rect.y > viewport.y + viewport.height
    );
  } else if (annotation.type === 'polygon') {
    const poly = annotation as PolygonAnnotation;
    if (poly.points.length === 0) return false;

    // Check if bounding box intersects viewport
    const xs = poly.points.map(p => p.x);
    const ys = poly.points.map(p => p.y);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const maxX = Math.max(...xs);
    const maxY = Math.max(...ys);

    return !(
      maxX < viewport.x ||
      minX > viewport.x + viewport.width ||
      maxY < viewport.y ||
      minY > viewport.y + viewport.height
    );
  }
  return true;
}

export const AnnotationCanvasGLSimple = memo(function AnnotationCanvasGLSimple({
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
  const graphicsRef = useRef<PIXI.Graphics | null>(null);
  const hitAreasRef = useRef<Map<string, PIXI.Graphics>>(new Map());
  const isInitializedRef = useRef(false);
  const lastAnnotationIdsRef = useRef<string>(''); // Track annotation changes

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

  // Calculate viewport bounds (in IMAGE coordinates for correct culling)
  // Transformation: screen → canvas coords → image coords
  const viewport = useMemo(() => {
    const margin = 0.2; // 20% margin for smoother panning

    // Convert canvas dimensions to image coordinates
    // Canvas coords = image coords × scale, so: image coords = canvas coords ÷ scale
    const viewWidth = (width / scale / zoomLevel) * (1 + margin);
    const viewHeight = (height / scale / zoomLevel) * (1 + margin);

    // Convert stage position (panning offset) to image coordinates
    const viewX = (-stagePosition.x / scale / zoomLevel) - (viewWidth * margin / 2);
    const viewY = (-stagePosition.y / scale / zoomLevel) - (viewHeight * margin / 2);

    return { x: viewX, y: viewY, width: viewWidth, height: viewHeight };
  }, [width, height, scale, zoomLevel, stagePosition]);

  // Filter to only visible annotations (VIEWPORT CULLING!)
  const visibleAnnotations = useMemo(() => {
    const visible = unselectedAnnotations.filter(ann => isAnnotationInViewport(ann, viewport));

    // Log culling stats (can remove later)
    if (unselectedAnnotations.length > 0) {
      const cullPercent = Math.round((1 - visible.length / unselectedAnnotations.length) * 100);
      console.log(`[PIXI SIMPLE] Culled ${cullPercent}% (${visible.length}/${unselectedAnnotations.length} visible)`);
      console.log(`[PIXI SIMPLE] Viewport:`, viewport, `Scale: ${scale}, Zoom: ${zoomLevel}`);
    }

    return visible;
  }, [unselectedAnnotations, viewport]);

  // Initialize PixiJS (once on mount)
  const initPixi = useCallback(async () => {
    if (!containerRef.current || isInitializedRef.current) return;
    if (width <= 0 || height <= 0) return;

    try {
      const app = new PIXI.Application();

      await app.init({
        width,
        height,
        backgroundAlpha: 0,
        antialias: false, // Disable for better performance
        resolution: window.devicePixelRatio || 1,
        autoDensity: true,
      });

      if (app.canvas) {
        app.canvas.style.position = 'absolute';
        app.canvas.style.top = '0';
        app.canvas.style.left = '0';
        app.canvas.style.width = '100%';
        app.canvas.style.height = '100%';
        app.canvas.style.pointerEvents = 'auto';
      }

      containerRef.current.appendChild(app.canvas);

      // Create single graphics object (reused every frame)
      const graphics = new PIXI.Graphics();
      graphics.eventMode = 'none'; // Don't intercept pointer events - let hit areas handle clicks
      app.stage.addChild(graphics);

      appRef.current = app;
      graphicsRef.current = graphics;
      isInitializedRef.current = true;

      console.log('[PIXI SIMPLE] Initialized');
    } catch (error) {
      console.error('Failed to initialize PixiJS:', error);
    }
  }, []); // Remove width/height dependencies - init once only

  // Resize canvas when dimensions change
  useEffect(() => {
    if (appRef.current && width > 0 && height > 0) {
      appRef.current.renderer.resize(width, height);
    }
  }, [width, height]);

  // Draw annotations (called on every change)
  const drawAnnotations = useCallback(() => {
    const app = appRef.current;
    const graphics = graphicsRef.current;

    if (!app || !graphics) return;

    const adjustedStrokeWidth = zoomLevel > 1 ? ANNOTATION_STROKE_WIDTH / zoomLevel : ANNOTATION_STROKE_WIDTH;

    // Check if annotations changed or just transformation (zoom/pan)
    const currentAnnotationIds = visibleAnnotations.map(a => a.id).sort().join(',');
    const annotationsChanged = currentAnnotationIds !== lastAnnotationIdsRef.current;

    // Clear previous frame
    graphics.clear();

    // Only recreate hit areas if annotations changed (performance optimization)
    if (annotationsChanged) {
      // Remove hit areas for annotations that no longer exist
      const currentIds = new Set(visibleAnnotations.map(a => a.id));
      for (const [id, hitArea] of hitAreasRef.current.entries()) {
        if (!currentIds.has(id)) {
          hitArea.destroy();
          hitAreasRef.current.delete(id);
        }
      }
      console.log('[PIXI DRAW] Annotations changed, cleaned up obsolete hit areas');
      lastAnnotationIdsRef.current = currentAnnotationIds;
    } else {
      console.log('[PIXI DRAW] Only transformation changed, reusing', hitAreasRef.current.size, 'hit areas');
    }

    // Set graphics position and scale to match Konva Stage transformation
    // Konva applies: scale THEN translate, so we do the same in PixiJS
    graphics.scale.set(zoomLevel, zoomLevel);
    graphics.x = stagePosition.x;
    graphics.y = stagePosition.y;

    // Draw ONLY visible annotations (viewport culling applied)
    for (const annotation of visibleAnnotations) {
      const color = labelColorMap.get(annotation.labelId) || '#f97316';
      const colorNum = hexToNumber(color);

      if (annotation.type === 'rectangle') {
        const rect = annotation as RectangleAnnotation;
        const x = rect.x * scale;
        const y = rect.y * scale;
        const w = rect.width * scale;
        const h = rect.height * scale;

        graphics
          .rect(x, y, w, h)
          .fill({ color: colorNum, alpha: ANNOTATION_FILL_OPACITY_UNSELECTED })
          .stroke({ width: adjustedStrokeWidth, color: colorNum, alpha: ANNOTATION_STROKE_OPACITY });

        // Hit area for clicks
        if (onAnnotationClick) {
          let hitArea = hitAreasRef.current.get(annotation.id);

          // Only create new hit area if annotations changed
          if (annotationsChanged || !hitArea) {
            // Remove old hit area if it exists
            if (hitArea) {
              hitArea.destroy();
            }

            hitArea = new PIXI.Graphics();
            hitArea.rect(x, y, w, h);
            hitArea.fill({ color: 0x000000, alpha: 0.001 });
            hitArea.eventMode = 'static';
            hitArea.cursor = 'pointer';
            hitArea.on('pointerdown', () => {
              console.log('[PIXI CLICK] Rectangle hit area clicked:', annotation.id)
              onAnnotationClick(annotation.id)
            });
            app.stage.addChild(hitArea);
            hitAreasRef.current.set(annotation.id, hitArea);
          }

          // Always update transformation (for zoom/pan)
          hitArea.scale.set(zoomLevel, zoomLevel);
          hitArea.x = stagePosition.x;
          hitArea.y = stagePosition.y;
        }

      } else if (annotation.type === 'polygon') {
        const poly = annotation as PolygonAnnotation;
        if (poly.points.length < 3) continue;

        const points = poly.points.flatMap(p => [p.x * scale, p.y * scale]);

        graphics
          .poly(points, true)
          .fill({ color: colorNum, alpha: ANNOTATION_FILL_OPACITY_UNSELECTED })
          .stroke({ width: adjustedStrokeWidth, color: colorNum, alpha: ANNOTATION_STROKE_OPACITY });

        // Hit area for clicks
        if (onAnnotationClick) {
          let hitArea = hitAreasRef.current.get(annotation.id);

          // Only create new hit area if annotations changed
          if (annotationsChanged || !hitArea) {
            // Remove old hit area if it exists
            if (hitArea) {
              hitArea.destroy();
            }

            hitArea = new PIXI.Graphics();
            hitArea.poly(points, true);
            hitArea.fill({ color: 0x000000, alpha: 0.001 });
            hitArea.eventMode = 'static';
            hitArea.cursor = 'pointer';
            hitArea.on('pointerdown', () => {
              console.log('[PIXI CLICK] Polygon hit area clicked:', annotation.id)
              onAnnotationClick(annotation.id)
            });
            app.stage.addChild(hitArea);
            hitAreasRef.current.set(annotation.id, hitArea);
          }

          // Always update transformation (for zoom/pan)
          hitArea.scale.set(zoomLevel, zoomLevel);
          hitArea.x = stagePosition.x;
          hitArea.y = stagePosition.y;
        }
      }
    }

    console.log('[PIXI DRAW] Created', hitAreasRef.current.size, 'hit areas for', visibleAnnotations.length, 'visible annotations')
  }, [visibleAnnotations, labelColorMap, scale, zoomLevel, stagePosition, onAnnotationClick]);

  // Initialize on mount ONCE
  useEffect(() => {
    initPixi();

    return () => {
      if (appRef.current) {
        for (const hitArea of hitAreasRef.current.values()) {
          hitArea.destroy();
        }
        hitAreasRef.current.clear();

        appRef.current.destroy(true, { children: true, texture: true });
        appRef.current = null;
        graphicsRef.current = null;
        isInitializedRef.current = false;
      }
    };
  }, []); // Empty deps - run only on mount/unmount

  // Redraw when needed
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

  if (unselectedAnnotations.length === 0) return null;

  return (
    <div
      ref={containerRef}
      className="absolute inset-0"
      style={{
        width: '100%',
        height: '100%',
        zIndex: 1,
      }}
    />
  );
});

// Re-export hooks
export { useShouldUseWebGL, useAnnotationSplit } from './AnnotationCanvasGL';
