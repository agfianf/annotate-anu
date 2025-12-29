/**
 * Performance optimization modules for PixiJS canvas rendering
 *
 * These modules dramatically improve rendering performance for 500-1,000+ annotations
 */

export { Quadtree, getAnnotationBounds, type AABB } from './Quadtree';
export { DirtyTracker, useAnnotationDiffer } from './DirtyTracker';
export { useQuadtreeWorker, type QueryResult } from './useQuadtreeWorker';
export {
  LOD_THRESHOLDS,
  getLODLevel,
  getScreenSize,
  shouldRenderAtLOD,
  renderAnnotationLOD,
  getLODStats,
  type LODLevel,
  type LODRenderOptions,
} from './LODRenderer';
