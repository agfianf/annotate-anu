/**
 * Hybrid Canvas that combines PixiJS (WebGL) for bulk rendering with Konva for editing
 *
 * Architecture:
 * - When annotation count > threshold, uses hybrid mode:
 *   - PixiJS layer (z-index 1): Renders all unselected annotations efficiently
 *   - Konva layer (z-index 2): Renders only selected annotations with full interactivity
 * - When annotation count <= threshold, uses Konva-only mode for simplicity
 */

import { useMemo } from 'react';
import { AnnotationCanvasGL, useShouldUseWebGL } from './AnnotationCanvasGL';
import type { Annotation, Label } from '../../types/annotations';

interface HybridCanvasProps {
  annotations: Annotation[];
  selectedAnnotations: string[];
  labels: Label[];
  scale: number;
  dimensions: { width: number; height: number };
  zoomLevel: number;
  stagePosition: { x: number; y: number };
  onAnnotationClick: (id: string) => void;
  /** Threshold for switching to hybrid mode (default: 100 annotations) */
  webglThreshold?: number;
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
  webglThreshold = 100,
}: HybridCanvasProps) {
  const { isHybridMode } = useHybridRenderingMode(annotations.length, webglThreshold);

  // In hybrid mode, render PixiJS layer for unselected annotations
  if (!isHybridMode) return null;

  return (
    <AnnotationCanvasGL
      annotations={annotations}
      selectedAnnotationIds={selectedAnnotations}
      labels={labels}
      scale={scale}
      width={dimensions.width}
      height={dimensions.height}
      zoomLevel={zoomLevel}
      stagePosition={stagePosition}
      onAnnotationClick={onAnnotationClick}
    />
  );
}

/**
 * Hook to filter annotations for Konva rendering
 * In hybrid mode, only returns selected annotations
 * In normal mode, returns all annotations
 */
export function useKonvaAnnotations(
  annotations: Annotation[],
  selectedAnnotationIds: string[],
  threshold: number = 100
): Annotation[] {
  const { isHybridMode } = useHybridRenderingMode(annotations.length, threshold);

  return useMemo(() => {
    if (!isHybridMode) {
      // Normal mode: Konva renders all annotations
      return annotations;
    }

    // Hybrid mode: Konva renders only selected annotations
    const selectedSet = new Set(selectedAnnotationIds);
    return annotations.filter(a => selectedSet.has(a.id));
  }, [annotations, selectedAnnotationIds, isHybridMode]);
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
