/**
 * Hybrid Canvas that combines PixiJS (WebGL) for bulk rendering with Konva for editing
 *
 * Architecture:
 * - When annotation count > threshold, uses hybrid mode:
 *   - PixiJS layer (z-index 1): Renders all unselected annotations efficiently
 *   - Konva layer (z-index 2): Renders only selected annotations with full interactivity
 * - When annotation count <= threshold, uses Konva-only mode for simplicity
 *
 * Camera Synchronization (v2):
 * - pixi-viewport controls zoom/pan with smooth interactions
 * - Camera state is emitted via onCameraChange callback
 * - Parent syncs Konva Stage to follow pixi-viewport
 * - Eliminates drift between layers
 */

import { useMemo } from 'react';
import type { Annotation, Label } from '../../types/annotations';
import { AnnotationCanvasGLSimple as AnnotationCanvasGLLegacy, useShouldUseWebGL } from './AnnotationCanvasGL.simple';
import { AnnotationCanvasGLViewport } from './AnnotationCanvasGL.viewport';

interface CameraState {
  x: number;
  y: number;
  scale: number;
}

interface HybridCanvasProps {
  annotations: Annotation[];
  selectedAnnotations: string[];
  labels: Label[];
  scale: number;
  dimensions: { width: number; height: number };
  zoomLevel: number;
  stagePosition: { x: number; y: number };
  onAnnotationClick: (id: string, isShiftClick?: boolean) => void;
  /** Callback when camera changes (for syncing Konva) */
  onCameraChange?: (camera: CameraState) => void;
  /** Is shift key pressed (for multi-select) */
  isShiftPressed?: boolean;
  /** Image dimensions (for Quadtree bounds) */
  imageWidth?: number;
  imageHeight?: number;
  /** Threshold for switching to hybrid mode (default: 100 annotations) */
  webglThreshold?: number;
  /** Use legacy renderer (no pixi-viewport) */
  useLegacyRenderer?: boolean;
  /** Callback when PixiJS is ready (for deferred hybrid mode activation) */
  onReady?: () => void;
  /** Fix 5: Image source URL for rendering in PixiJS (eliminates Konva image layer) */
  imageSrc?: string;
  /** Fix 5: Whether to render the background image in PixiJS */
  renderImage?: boolean;
}

/**
 * Hook to manage hybrid rendering mode
 */
export function useHybridRenderingMode(
  annotationCount: number,
  threshold: number = 100
) {
  const shouldUseWebGL = useShouldUseWebGL(annotationCount, threshold);

  return {
    isHybridMode: shouldUseWebGL,
    threshold,
  };
}

/**
 * Component that renders the WebGL layer for unselected annotations
 * This sits behind the Konva layer in hybrid mode
 *
 * Uses pixi-viewport for camera control (emits camera changes via callback)
 */
export function WebGLBackgroundLayer({
  annotations,
  selectedAnnotations,
  labels,
  scale,
  dimensions,
  zoomLevel,
  stagePosition,
  onAnnotationClick,
  onCameraChange,
  isShiftPressed = false,
  imageWidth,
  imageHeight,
  webglThreshold = 100,
  useLegacyRenderer = false,
  onReady,
  imageSrc,
  renderImage = false,
}: HybridCanvasProps) {
  const { isHybridMode } = useHybridRenderingMode(annotations.length, webglThreshold);

  // In hybrid mode, render PixiJS layer for unselected annotations
  if (!isHybridMode) return null;

  // Handle click with optional shift state
  const handleAnnotationClick = (id: string, isShiftClick?: boolean) => {
    onAnnotationClick(id, isShiftClick);
  };

  // Use legacy renderer if requested (for debugging/comparison)
  if (useLegacyRenderer) {
    return (
      <AnnotationCanvasGLLegacy
        annotations={annotations}
        selectedAnnotationIds={selectedAnnotations}
        labels={labels}
        scale={scale}
        width={dimensions.width}
        height={dimensions.height}
        zoomLevel={zoomLevel}
        stagePosition={stagePosition}
        onAnnotationClick={(id) => handleAnnotationClick(id, false)}
      />
    );
  }

  // Use viewport-enabled renderer with pixi-viewport for camera control
  return (
    <AnnotationCanvasGLViewport
      annotations={annotations}
      selectedAnnotationIds={selectedAnnotations}
      labels={labels}
      scale={scale}
      width={dimensions.width}
      height={dimensions.height}
      initialZoomLevel={zoomLevel}
      initialStagePosition={stagePosition}
      onCameraChange={onCameraChange}
      onAnnotationClick={handleAnnotationClick}
      isShiftPressed={isShiftPressed}
      imageWidth={imageWidth}
      imageHeight={imageHeight}
      onReady={onReady}
      imageSrc={imageSrc}
      renderImage={renderImage}
    />
  );
}

/**
 * Hook to filter annotations for Konva rendering
 * In hybrid mode, only returns selected annotations (once PixiJS is ready)
 * In normal mode, returns all annotations
 *
 * @param annotations - All visible annotations
 * @param selectedAnnotationIds - IDs of selected annotations
 * @param threshold - Annotation count threshold for hybrid mode (default: 100)
 * @param pixiReady - Whether PixiJS has finished initializing (default: false)
 */
export function useKonvaAnnotations(
  annotations: Annotation[],
  selectedAnnotationIds: string[],
  threshold: number = 100,
  pixiReady: boolean = false
): Annotation[] {
  const { isHybridMode } = useHybridRenderingMode(annotations.length, threshold);

  return useMemo(() => {
    if (!isHybridMode) {
      // Normal mode: Konva renders all annotations
      return annotations;
    }

    // Hybrid mode: Only hide Konva annotations when PixiJS is ready
    // This prevents blank canvas during PixiJS initialization
    if (!pixiReady) {
      // PixiJS not ready yet - Konva shows all annotations as fallback
      console.log('[KONVA] Hybrid mode active but PixiJS not ready - showing all annotations');
      return annotations;
    }

    // Hybrid mode + PixiJS ready: Konva renders only selected annotations
    const selectedSet = new Set(selectedAnnotationIds);
    return annotations.filter(a => selectedSet.has(a.id));
  }, [annotations, selectedAnnotationIds, isHybridMode, pixiReady]);
}

/**
 * Performance stats for the hybrid canvas
 */
export interface HybridCanvasStats {
  totalAnnotations: number;
  konvaAnnotations: number;
  webglAnnotations: number;
  isHybridMode: boolean;
}

/**
 * Hook to get performance stats
 */
export function useHybridCanvasStats(
  annotations: Annotation[],
  selectedAnnotationIds: string[],
  threshold: number = 100
): HybridCanvasStats {
  const { isHybridMode } = useHybridRenderingMode(annotations.length, threshold);

  return useMemo(() => {
    if (!isHybridMode) {
      return {
        totalAnnotations: annotations.length,
        konvaAnnotations: annotations.length,
        webglAnnotations: 0,
        isHybridMode: false,
      };
    }

    const selectedSet = new Set(selectedAnnotationIds);
    const konvaCount = annotations.filter(a => selectedSet.has(a.id)).length;
    const webglCount = annotations.length - konvaCount;

    return {
      totalAnnotations: annotations.length,
      konvaAnnotations: konvaCount,
      webglAnnotations: webglCount,
      isHybridMode: true,
    };
  }, [annotations, selectedAnnotationIds, isHybridMode]);
}

// Re-export for convenience
export { AnnotationCanvasGL, useShouldUseWebGL } from './AnnotationCanvasGL';
export { AnnotationCanvasGLViewport } from './AnnotationCanvasGL.viewport';
