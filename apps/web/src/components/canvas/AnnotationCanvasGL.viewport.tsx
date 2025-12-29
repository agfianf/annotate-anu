/**
 * AnnotationCanvasGL with pixi-viewport integration for improved zoom/pan
 *
 * This version uses pixi-viewport as the camera controller:
 * - pixi-viewport handles zoom/pan events with smooth interactions
 * - Camera state is emitted via callback to parent
 * - Parent syncs Konva to follow pixi-viewport
 * - Eliminates drift between layers
 *
 * Features:
 * - Viewport culling with Quadtree for O(log n) queries
 * - DirtyTracker for incremental rendering
 * - Shift+Click for multi-select
 * - Smooth wheel zoom, drag pan, pinch-to-zoom
 */

import { useEffect, useRef, useCallback, memo, useMemo, useState } from 'react';
import * as PIXI from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import type { Annotation, Label, RectangleAnnotation, PolygonAnnotation } from '../../types/annotations';
import { Quadtree, getAnnotationBounds, type AABB } from './pixi/optimization/Quadtree';
import { DirtyTracker } from './pixi/optimization/DirtyTracker';
import { renderAnnotationLOD, getLODLevel, getLODStats } from './pixi/optimization/LODRenderer';

interface CameraState {
  x: number;
  y: number;
  scale: number;
}

interface AnnotationCanvasGLViewportProps {
  /** All annotations (will filter to unselected) */
  annotations: Annotation[];
  /** IDs of selected annotations (these will be skipped - rendered by Konva) */
  selectedAnnotationIds: string[];
  /** Labels for color lookup */
  labels: Label[];
  /** Scale factor for coordinate transformation (image fit to canvas) */
  scale: number;
  /** Canvas dimensions */
  width: number;
  height: number;
  /** Initial zoom level */
  initialZoomLevel?: number;
  /** Initial stage position */
  initialStagePosition?: { x: number; y: number };
  /** Callback when camera changes (for syncing Konva) */
  onCameraChange?: (camera: CameraState) => void;
  /** Click handler for annotation selection */
  onAnnotationClick?: (annotationId: string, isShiftClick: boolean) => void;
  /** Is shift key pressed (for multi-select) */
  isShiftPressed?: boolean;
  /** Optional: Only show annotations for specific label IDs */
  visibleLabelIds?: string[];
  /** Image dimensions (for Quadtree bounds) */
  imageWidth?: number;
  imageHeight?: number;
  /** Callback when PixiJS is ready (for deferred hybrid mode activation) */
  onReady?: () => void;
  /** Fix 5: Image source URL for rendering in PixiJS (eliminates Konva image layer) */
  imageSrc?: string;
  /** Fix 5: Whether to render the background image in PixiJS */
  renderImage?: boolean;
}

// Constants matching Canvas.tsx
const ANNOTATION_FILL_OPACITY_UNSELECTED = 0.4;
const ANNOTATION_STROKE_OPACITY = 1;
const ANNOTATION_STROKE_WIDTH = 2;

// Viewport settings
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 5;

// Debug settings - set to true to enable performance logging
const DEBUG_PERFORMANCE = true;

// Performance tracking
let drawCallCount = 0;
let cameraMoveCount = 0;
let lastDrawTime = 0;

// Debug logger
const perfLog = (category: string, message: string, data?: object) => {
  if (!DEBUG_PERFORMANCE) return;
  const timestamp = performance.now().toFixed(1);
  const style = category === 'DRAW'
    ? 'color: #ff6b6b; font-weight: bold'
    : category === 'CAMERA'
    ? 'color: #4ecdc4'
    : 'color: #ffe66d';
  console.log(`%c[${timestamp}ms] [${category}] ${message}`, style, data || '');
};

/**
 * Convert hex color string to numeric value for PixiJS
 */
function hexToNumber(hex: string): number {
  const cleanHex = hex.replace('#', '');
  return parseInt(cleanHex, 16);
}

/**
 * Fix 6: Check if two AABB bounds overlap by a given threshold (0-1)
 * Used to determine if cached query results are still valid
 */
function boundsOverlap(a: AABB, b: AABB, threshold: number): boolean {
  // Calculate intersection
  const xOverlap = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
  const yOverlap = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  const intersectionArea = xOverlap * yOverlap;

  // Calculate areas
  const areaA = a.width * a.height;
  const areaB = b.width * b.height;
  const minArea = Math.min(areaA, areaB);

  // Check if intersection is significant
  return minArea > 0 && (intersectionArea / minArea) >= threshold;
}

export const AnnotationCanvasGLViewport = memo(function AnnotationCanvasGLViewport({
  annotations,
  selectedAnnotationIds,
  labels,
  scale,
  width,
  height,
  initialZoomLevel = 1,
  initialStagePosition = { x: 0, y: 0 },
  onCameraChange,
  onAnnotationClick,
  isShiftPressed = false,
  visibleLabelIds,
  imageWidth,
  imageHeight,
  onReady,
  imageSrc,
  renderImage = false,
}: AnnotationCanvasGLViewportProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<PIXI.Application | null>(null);
  const viewportRef = useRef<Viewport | null>(null);

  // Fix 3: Separate Graphics per annotation (instead of single shared Graphics)
  const annotationContainerRef = useRef<PIXI.Container | null>(null);
  const annotationGraphicsRef = useRef<Map<string, PIXI.Graphics>>(new Map());

  const hitAreasContainerRef = useRef<PIXI.Container | null>(null);
  const hitAreasRef = useRef<Map<string, PIXI.Graphics>>(new Map());

  // Fix 5: Image sprite ref for background image rendering
  const imageSpriteRef = useRef<PIXI.Sprite | null>(null);
  const loadedImageSrcRef = useRef<string | null>(null);

  // Use state to trigger re-render after initialization
  const [isInitialized, setIsInitialized] = useState(false);
  // Use ref to prevent double initialization (doesn't trigger re-renders)
  const isInitializingRef = useRef(false);

  // Optimization refs
  const quadtreeRef = useRef<Quadtree | null>(null);
  const dirtyTrackerRef = useRef<DirtyTracker>(new DirtyTracker());
  const prevAnnotationsRef = useRef<Annotation[]>([]);
  const lastCameraRef = useRef<CameraState>({ x: initialStagePosition.x, y: initialStagePosition.y, scale: initialZoomLevel });

  // Fix 6: Cache for Quadtree query results
  const visibleIdsCacheRef = useRef<{ bounds: AABB; ids: Set<string>; zoom: number } | null>(null);

  // Refs to store callbacks and initial values (prevents re-initialization on prop changes)
  const onCameraChangeRef = useRef(onCameraChange);
  const onReadyRef = useRef(onReady);
  const initialZoomRef = useRef(initialZoomLevel);
  const initialPositionRef = useRef(initialStagePosition);
  const cameraThrottleRef = useRef<number | null>(null);
  const needsRenderRef = useRef(true); // Flag to trigger render on next tick
  const drawAnnotationsRef = useRef<(() => void) | null>(null);

  // Keep callback refs updated
  useEffect(() => {
    onCameraChangeRef.current = onCameraChange;
  }, [onCameraChange]);

  useEffect(() => {
    onReadyRef.current = onReady;
  }, [onReady]);

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

  // Initialize/update Quadtree when image dimensions change
  useEffect(() => {
    if (imageWidth && imageHeight) {
      quadtreeRef.current = new Quadtree({
        x: 0,
        y: 0,
        width: imageWidth,
        height: imageHeight,
      });
      console.log('[PIXI VIEWPORT] Quadtree initialized:', { imageWidth, imageHeight });
    }
  }, [imageWidth, imageHeight]);

  // Populate Quadtree when annotations change
  useEffect(() => {
    const qt = quadtreeRef.current;
    if (!qt) return;

    qt.clear();
    unselectedAnnotations.forEach(ann => {
      const bounds = getAnnotationBounds(ann);
      qt.insert(ann.id, bounds);
    });

    console.log('[PIXI VIEWPORT] Quadtree populated with', unselectedAnnotations.length, 'annotations');
  }, [unselectedAnnotations]);

  // Track annotation changes for dirty tracking
  useEffect(() => {
    const dirty = dirtyTrackerRef.current;
    const prev = prevAnnotationsRef.current;
    const prevMap = new Map(prev.map(a => [a.id, a]));
    const currMap = new Map(unselectedAnnotations.map(a => [a.id, a]));

    const dirtyIds: string[] = [];

    // Check for removed/modified
    prev.forEach(ann => {
      if (!currMap.has(ann.id)) {
        dirtyIds.push(ann.id); // Removed
      } else {
        const curr = currMap.get(ann.id)!;
        if (hasAnnotationChanged(ann, curr)) {
          dirtyIds.push(ann.id); // Modified
        }
      }
    });

    // Check for added
    unselectedAnnotations.forEach(ann => {
      if (!prevMap.has(ann.id)) {
        dirtyIds.push(ann.id); // Added
      }
    });

    if (dirtyIds.length > 0) {
      dirty.markManyDirty(dirtyIds);
      console.log('[PIXI VIEWPORT] Marked', dirtyIds.length, 'annotations as dirty');
    }

    prevAnnotationsRef.current = unselectedAnnotations;
  }, [unselectedAnnotations]);

  // Initialize PixiJS with viewport
  const initPixi = useCallback(async () => {
    // Use ref for guard to prevent infinite loop (state changes trigger re-renders)
    if (!containerRef.current || isInitializingRef.current || appRef.current) return;
    if (width <= 0 || height <= 0) return;

    isInitializingRef.current = true;

    try {
      const app = new PIXI.Application();

      // WebGPU Migration: Prefer WebGPU for better performance, fallback to WebGL
      await app.init({
        width,
        height,
        backgroundAlpha: 0,
        antialias: false, // Better performance
        resolution: window.devicePixelRatio || 1,
        autoDensity: true,
        preference: 'webgpu', // Use WebGPU when available (Chrome 113+, Edge 113+)
        // PixiJS v8 automatically falls back to WebGL if WebGPU is not supported
      });

      // Log which renderer is being used
      const rendererType = app.renderer.type === 1 ? 'WebGL' : app.renderer.type === 2 ? 'WebGPU' : 'Unknown';
      console.log(`[PIXI VIEWPORT] Using ${rendererType} renderer`);

      if (app.canvas) {
        app.canvas.style.position = 'absolute';
        app.canvas.style.top = '0';
        app.canvas.style.left = '0';
        app.canvas.style.width = '100%';
        app.canvas.style.height = '100%';
        app.canvas.style.pointerEvents = 'auto';
      }

      containerRef.current.appendChild(app.canvas);

      // Create viewport for camera control
      const worldWidth = (imageWidth || width / scale) * scale;
      const worldHeight = (imageHeight || height / scale) * scale;

      const viewport = new Viewport({
        screenWidth: width,
        screenHeight: height,
        worldWidth,
        worldHeight,
        events: app.renderer.events,
      });

      // Configure viewport plugins
      viewport
        .drag({ mouseButtons: 'left' })
        .wheel({ smooth: 3 })
        .pinch()
        .clampZoom({ minScale: MIN_ZOOM, maxScale: MAX_ZOOM });

      // Set initial position and scale (use refs to avoid dependency issues)
      viewport.scale.set(initialZoomRef.current);
      viewport.x = initialPositionRef.current.x;
      viewport.y = initialPositionRef.current.y;

      app.stage.addChild(viewport);

      // Fix 3: Create container for individual annotation Graphics (instead of single shared)
      const annotationContainer = new PIXI.Container();
      annotationContainer.eventMode = 'none'; // Hit areas handle clicks
      viewport.addChild(annotationContainer);

      // Create hit areas container
      const hitAreasContainer = new PIXI.Container();
      hitAreasContainer.eventMode = 'static';
      viewport.addChild(hitAreasContainer);

      // Subscribe to viewport movement
      // PERFORMANCE FIX: pixi-viewport handles transforms automatically via GPU matrices
      // We only need to emit camera changes for Konva sync - NO redraw needed on pan/zoom!
      viewport.on('moved', () => {
        // Invalidate visible IDs cache when viewport moves significantly
        // (cache will be refreshed on next query if bounds changed too much)

        // Throttle camera change callback using requestAnimationFrame
        if (cameraThrottleRef.current === null) {
          cameraThrottleRef.current = requestAnimationFrame(() => {
            cameraThrottleRef.current = null;

            const camera: CameraState = {
              x: viewport.x,
              y: viewport.y,
              scale: viewport.scale.x,
            };

            // Only emit if camera actually changed
            if (
              camera.x !== lastCameraRef.current.x ||
              camera.y !== lastCameraRef.current.y ||
              camera.scale !== lastCameraRef.current.scale
            ) {
              lastCameraRef.current = camera;
              // Use ref to always have latest callback without causing re-init
              onCameraChangeRef.current?.(camera);
            }
          });
        }
      });

      // Add ticker for render loop (only renders when needed)
      app.ticker.add(() => {
        if (needsRenderRef.current && annotationContainerRef.current && hitAreasContainerRef.current) {
          needsRenderRef.current = false;
          // We'll call the draw function from here - it's stored in a ref
          drawAnnotationsRef.current?.();
        }
      });

      appRef.current = app;
      viewportRef.current = viewport;
      annotationContainerRef.current = annotationContainer;
      hitAreasContainerRef.current = hitAreasContainer;
      setIsInitialized(true);

      // Notify parent that PixiJS is ready (for deferred hybrid mode activation)
      onReadyRef.current?.();

      console.log('[PIXI VIEWPORT] Initialized with pixi-viewport');
    } catch (error) {
      console.error('[PIXI VIEWPORT] Failed to initialize:', error);
      isInitializingRef.current = false;
    }
    // Note: initialZoomLevel, initialStagePosition, onCameraChange intentionally excluded
    // They use refs to prevent re-initialization when camera changes
  }, [width, height, scale, imageWidth, imageHeight]);

  // Fix 6: Get visible annotation IDs with caching
  // Cache results to avoid repeated queries when viewport hasn't moved significantly
  const getVisibleAnnotationIds = useCallback((): Set<string> => {
    const viewport = viewportRef.current;
    const qt = quadtreeRef.current;

    // If no viewport or quadtree, return all
    if (!viewport || !qt) {
      return new Set(unselectedAnnotations.map(a => a.id));
    }

    // Calculate current viewport bounds
    const currentZoom = viewport.scale.x;
    const currentBounds: AABB = {
      x: -viewport.x / (scale * currentZoom),
      y: -viewport.y / (scale * currentZoom),
      width: viewport.screenWidth / (scale * currentZoom),
      height: viewport.screenHeight / (scale * currentZoom),
    };

    // Add margin for smoother experience
    const margin = 0.5; // 50% margin
    currentBounds.x -= currentBounds.width * margin;
    currentBounds.y -= currentBounds.height * margin;
    currentBounds.width *= (1 + 2 * margin);
    currentBounds.height *= (1 + 2 * margin);

    // Check cache validity (Fix 6)
    const cache = visibleIdsCacheRef.current;
    if (cache && Math.abs(cache.zoom - currentZoom) < 0.1) {
      // Check if bounds overlap significantly (90%)
      const overlap = boundsOverlap(cache.bounds, currentBounds, 0.9);
      if (overlap) {
        return cache.ids;
      }
    }

    // Query quadtree and cache result
    const visibleIds = qt.query(currentBounds);
    const idsSet = new Set(visibleIds);
    visibleIdsCacheRef.current = { bounds: currentBounds, ids: idsSet, zoom: currentZoom };

    return idsSet;
  }, [scale, unselectedAnnotations]);

  // Draw annotations using Fix 3 (separate Graphics per annotation)
  const drawAnnotations = useCallback(() => {
    const annotationContainer = annotationContainerRef.current;
    const hitAreasContainer = hitAreasContainerRef.current;
    const viewport = viewportRef.current;
    const dirty = dirtyTrackerRef.current;

    if (!annotationContainer || !hitAreasContainer || !viewport) return;

    // Get visible annotations
    const visibleIds = getVisibleAnnotationIds();
    const visibleAnnotations = unselectedAnnotations.filter(a => visibleIds.has(a.id));

    // Get current zoom level for LOD calculation
    const currentZoom = viewport.scale.x;
    const lodLevel = getLODLevel(currentZoom);

    // Determine what needs updating
    const isFullRedraw = dirty.isAllDirty();
    const dirtyIds = isFullRedraw ? new Set<string>() : new Set(dirty.getDirtyIds());
    const currentAnnotationIds = new Set(visibleAnnotations.map(a => a.id));

    // Remove graphics for annotations that no longer exist
    for (const [id, graphics] of annotationGraphicsRef.current.entries()) {
      if (!currentAnnotationIds.has(id)) {
        graphics.destroy();
        annotationGraphicsRef.current.delete(id);
      }
    }

    // Remove hit areas for annotations that no longer exist
    for (const [id, hitArea] of hitAreasRef.current.entries()) {
      if (!currentAnnotationIds.has(id)) {
        hitArea.destroy();
        hitAreasRef.current.delete(id);
      }
    }

    // Track rendered count for LOD stats
    let renderedCount = 0;
    let updatedCount = 0;

    // Draw/update visible annotations
    for (const annotation of visibleAnnotations) {
      const needsUpdate = isFullRedraw || dirtyIds.has(annotation.id) || !annotationGraphicsRef.current.has(annotation.id);

      if (needsUpdate) {
        const color = labelColorMap.get(annotation.labelId) || '#f97316';
        const colorNum = hexToNumber(color);

        // Fix 3: Get or create individual Graphics for this annotation
        let graphics = annotationGraphicsRef.current.get(annotation.id);

        if (!graphics) {
          graphics = new PIXI.Graphics();
          graphics.eventMode = 'none';
          graphics.label = annotation.id;
          annotationContainer.addChild(graphics);
          annotationGraphicsRef.current.set(annotation.id, graphics);
        }

        // Use LOD renderer for all annotations
        graphics.clear();
        renderAnnotationLOD(graphics, annotation, colorNum, {
          scale,
          zoom: currentZoom,
          fillAlpha: ANNOTATION_FILL_OPACITY_UNSELECTED,
          strokeWidth: ANNOTATION_STROKE_WIDTH,
          strokeAlpha: ANNOTATION_STROKE_OPACITY,
        });

        updatedCount++;
      }

      // Create/update hit areas
      if (onAnnotationClick && (needsUpdate || !hitAreasRef.current.has(annotation.id))) {
        let hitArea = hitAreasRef.current.get(annotation.id);

        if (!hitArea) {
          hitArea = new PIXI.Graphics();
          hitArea.eventMode = 'static';
          hitArea.cursor = 'pointer';

          const annId = annotation.id;
          hitArea.on('pointerdown', (e: PIXI.FederatedPointerEvent) => {
            e.stopPropagation();
            console.log('[PIXI VIEWPORT] Click on annotation:', annId, 'shift:', isShiftPressed);
            onAnnotationClick(annId, isShiftPressed);
          });

          hitAreasContainer.addChild(hitArea);
          hitAreasRef.current.set(annotation.id, hitArea);
        }

        // Draw hit area based on annotation type
        hitArea.clear();
        if (annotation.type === 'rectangle') {
          const rect = annotation as RectangleAnnotation;
          hitArea.rect(rect.x * scale, rect.y * scale, rect.width * scale, rect.height * scale);
        } else if (annotation.type === 'polygon') {
          const poly = annotation as PolygonAnnotation;
          if (poly.points.length >= 3) {
            const points = poly.points.flatMap(p => [p.x * scale, p.y * scale]);
            hitArea.poly(points, true);
          }
        }
        hitArea.fill({ color: 0x000000, alpha: 0.001 });
      }

      renderedCount++;
    }

    // Clear dirty state
    dirty.clear();

    // Log with stats
    const mode = isFullRedraw ? 'FULL' : `INCREMENTAL (${updatedCount} updated)`;
    console.log(`[PIXI VIEWPORT] ${mode}: ${renderedCount}/${visibleAnnotations.length} annotations (LOD: ${lodLevel}, zoom: ${currentZoom.toFixed(2)})`);

  }, [unselectedAnnotations, labelColorMap, scale, getVisibleAnnotationIds, onAnnotationClick, isShiftPressed]);

  // Initialize on mount
  useEffect(() => {
    initPixi();

    return () => {
      if (appRef.current) {
        // Clean up hit areas
        for (const hitArea of hitAreasRef.current.values()) {
          hitArea.destroy();
        }
        hitAreasRef.current.clear();

        // Clean up annotation graphics (Fix 3)
        for (const graphics of annotationGraphicsRef.current.values()) {
          graphics.destroy();
        }
        annotationGraphicsRef.current.clear();

        // Clean up image sprite (Fix 5)
        if (imageSpriteRef.current) {
          imageSpriteRef.current.destroy();
          imageSpriteRef.current = null;
          loadedImageSrcRef.current = null;
        }

        appRef.current.destroy(true, { children: true, texture: true });
        appRef.current = null;
        viewportRef.current = null;
        annotationContainerRef.current = null;
        hitAreasContainerRef.current = null;
        isInitializingRef.current = false;
        visibleIdsCacheRef.current = null; // Clear cache (Fix 6)
        setIsInitialized(false);
      }
    };
  }, [initPixi]);

  // Fix 5: Load and render background image in PixiJS
  useEffect(() => {
    if (!renderImage || !imageSrc || !isInitialized) return;
    if (loadedImageSrcRef.current === imageSrc) return; // Already loaded

    const viewport = viewportRef.current;
    if (!viewport) return;

    // Load image as PixiJS texture
    const loadImage = async () => {
      try {
        // Remove old sprite if exists
        if (imageSpriteRef.current) {
          imageSpriteRef.current.destroy();
          imageSpriteRef.current = null;
        }

        // Load texture from URL
        const texture = await PIXI.Assets.load(imageSrc);
        const sprite = new PIXI.Sprite(texture);

        // Scale sprite to match canvas dimensions
        sprite.width = (imageWidth || texture.width) * scale;
        sprite.height = (imageHeight || texture.height) * scale;
        sprite.position.set(0, 0);
        sprite.eventMode = 'none';
        sprite.label = 'background-image';

        // Add as first child (behind annotations)
        viewport.addChildAt(sprite, 0);
        imageSpriteRef.current = sprite;
        loadedImageSrcRef.current = imageSrc;

        console.log('[PIXI VIEWPORT] Background image loaded:', imageSrc);
      } catch (error) {
        console.error('[PIXI VIEWPORT] Failed to load image:', error);
      }
    };

    loadImage();
  }, [imageSrc, renderImage, isInitialized, imageWidth, imageHeight, scale]);

  // Keep draw function ref updated for ticker to use
  useEffect(() => {
    drawAnnotationsRef.current = drawAnnotations;
    // Request render when draw function changes (new annotations, etc.)
    needsRenderRef.current = true;
  }, [drawAnnotations]);

  // Initial render after initialization
  useEffect(() => {
    if (isInitialized) {
      needsRenderRef.current = true;
    }
  }, [isInitialized]);

  // Handle resize
  useEffect(() => {
    const app = appRef.current;
    const viewport = viewportRef.current;

    if (app && viewport && width > 0 && height > 0) {
      app.renderer.resize(width, height);
      viewport.resize(width, height);
      dirtyTrackerRef.current.markAllDirty();
      needsRenderRef.current = true;
    }
  }, [width, height]);

  // Note: We intentionally don't sync external camera state back to viewport
  // pixi-viewport is the single source of truth for camera in hybrid mode
  // It emits camera changes → parent updates state → Konva follows

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

/**
 * Check if annotation changed (for dirty tracking)
 */
function hasAnnotationChanged(prev: Annotation, curr: Annotation): boolean {
  if (prev.type !== curr.type) return true;
  if (prev.labelId !== curr.labelId) return true;

  if (prev.type === 'rectangle') {
    const prevRect = prev as RectangleAnnotation;
    const currRect = curr as RectangleAnnotation;
    return (
      prevRect.x !== currRect.x ||
      prevRect.y !== currRect.y ||
      prevRect.width !== currRect.width ||
      prevRect.height !== currRect.height
    );
  }

  if (prev.type === 'polygon') {
    const prevPoly = prev as PolygonAnnotation;
    const currPoly = curr as PolygonAnnotation;
    if (prevPoly.points.length !== currPoly.points.length) return true;
    for (let i = 0; i < prevPoly.points.length; i++) {
      if (prevPoly.points[i].x !== currPoly.points[i].x ||
          prevPoly.points[i].y !== currPoly.points[i].y) {
        return true;
      }
    }
  }

  return false;
}

// Re-export hooks from original module
export { useShouldUseWebGL, useAnnotationSplit } from './AnnotationCanvasGL';
