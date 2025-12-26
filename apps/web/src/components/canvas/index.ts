/**
 * Canvas components for annotation rendering
 *
 * Exports:
 * - AnnotationCanvasGL: PixiJS-based WebGL canvas for bulk rendering
 * - HybridCanvas: Hooks and utilities for hybrid Konva + PixiJS rendering
 */

export {
  AnnotationCanvasGL,
  useShouldUseWebGL,
  useAnnotationSplit,
} from './AnnotationCanvasGL';

export {
  WebGLBackgroundLayer,
  useHybridRenderingMode,
  useKonvaAnnotations,
  useHybridCanvasStats,
  type HybridCanvasStats,
} from './HybridCanvas';
