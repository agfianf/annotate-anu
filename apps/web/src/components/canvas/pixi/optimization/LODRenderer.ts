/**
 * Level-of-Detail (LOD) Renderer for annotation visualization
 *
 * At extreme zoom-out levels, simplifies annotation geometry to improve performance:
 * - LOD 0 (close): Full polygon/rectangle rendering with stroke
 * - LOD 1 (medium): Simplified shapes, no stroke details
 * - LOD 2 (far): Bounding boxes only
 * - LOD 3 (very far): Single-pixel dots or hidden
 *
 * This dramatically reduces GPU load when viewing many annotations zoomed out.
 */

import * as PIXI from 'pixi.js';
import type { RectangleAnnotation, PolygonAnnotation, Annotation } from '../../../../types/annotations';
import type { AABB } from './Quadtree';

// LOD thresholds (zoom levels)
export const LOD_THRESHOLDS = {
  FULL: 0.5,      // zoom >= 0.5: Full detail rendering
  MEDIUM: 0.3,    // zoom >= 0.3: Simplified rendering
  LOW: 0.15,      // zoom >= 0.15: Bounding boxes only
  MINIMAL: 0.08,  // zoom >= 0.08: Dots only
  // zoom < 0.08: Hide very small annotations
} as const;

export type LODLevel = 'full' | 'medium' | 'low' | 'minimal' | 'hidden';

/**
 * Determine LOD level based on zoom
 */
export function getLODLevel(zoom: number): LODLevel {
  if (zoom >= LOD_THRESHOLDS.FULL) return 'full';
  if (zoom >= LOD_THRESHOLDS.MEDIUM) return 'medium';
  if (zoom >= LOD_THRESHOLDS.LOW) return 'low';
  if (zoom >= LOD_THRESHOLDS.MINIMAL) return 'minimal';
  return 'hidden';
}

/**
 * Calculate annotation size in screen pixels
 */
export function getScreenSize(bounds: AABB, scale: number, zoom: number): number {
  const screenWidth = bounds.width * scale * zoom;
  const screenHeight = bounds.height * scale * zoom;
  return Math.max(screenWidth, screenHeight);
}

/**
 * Check if annotation is too small to render at current LOD
 */
export function shouldRenderAtLOD(
  bounds: AABB,
  scale: number,
  zoom: number,
  lodLevel: LODLevel
): boolean {
  const screenSize = getScreenSize(bounds, scale, zoom);

  switch (lodLevel) {
    case 'hidden':
      return false;
    case 'minimal':
      return screenSize >= 2; // At least 2px
    case 'low':
      return screenSize >= 4; // At least 4px
    case 'medium':
      return screenSize >= 8; // At least 8px
    case 'full':
    default:
      return true;
  }
}

/**
 * LOD Renderer options
 */
export interface LODRenderOptions {
  scale: number;
  zoom: number;
  fillAlpha?: number;
  strokeWidth?: number;
  strokeAlpha?: number;
}

/**
 * Render annotation with appropriate LOD
 */
export function renderAnnotationLOD(
  graphics: PIXI.Graphics,
  annotation: Annotation,
  color: number,
  options: LODRenderOptions
): boolean {
  const { scale, zoom, fillAlpha = 0.4, strokeWidth = 2, strokeAlpha = 1 } = options;
  const lodLevel = getLODLevel(zoom);

  // Get bounds for LOD checks
  const bounds = getAnnotationBounds(annotation);

  // Check if should render at all
  if (!shouldRenderAtLOD(bounds, scale, zoom, lodLevel)) {
    return false;
  }

  switch (lodLevel) {
    case 'full':
      return renderFull(graphics, annotation, color, scale, fillAlpha, strokeWidth, strokeAlpha);

    case 'medium':
      return renderMedium(graphics, annotation, color, scale, fillAlpha, strokeWidth);

    case 'low':
      return renderLow(graphics, bounds, color, scale, fillAlpha);

    case 'minimal':
      return renderMinimal(graphics, bounds, color, scale);

    default:
      return false;
  }
}

/**
 * Full detail rendering (LOD 0)
 */
function renderFull(
  graphics: PIXI.Graphics,
  annotation: Annotation,
  color: number,
  scale: number,
  fillAlpha: number,
  strokeWidth: number,
  strokeAlpha: number
): boolean {
  if (annotation.type === 'rectangle') {
    const rect = annotation as RectangleAnnotation;
    graphics
      .rect(rect.x * scale, rect.y * scale, rect.width * scale, rect.height * scale)
      .fill({ color, alpha: fillAlpha })
      .stroke({ width: strokeWidth, color, alpha: strokeAlpha });
    return true;
  }

  if (annotation.type === 'polygon') {
    const poly = annotation as PolygonAnnotation;
    if (poly.points.length < 3) return false;

    const points = poly.points.flatMap(p => [p.x * scale, p.y * scale]);
    graphics
      .poly(points, true)
      .fill({ color, alpha: fillAlpha })
      .stroke({ width: strokeWidth, color, alpha: strokeAlpha });
    return true;
  }

  return false;
}

/**
 * Medium detail rendering (LOD 1) - simplified, thinner stroke
 */
function renderMedium(
  graphics: PIXI.Graphics,
  annotation: Annotation,
  color: number,
  scale: number,
  fillAlpha: number,
  strokeWidth: number
): boolean {
  // Use thinner stroke for medium LOD
  const thinStroke = Math.max(1, strokeWidth * 0.5);

  if (annotation.type === 'rectangle') {
    const rect = annotation as RectangleAnnotation;
    graphics
      .rect(rect.x * scale, rect.y * scale, rect.width * scale, rect.height * scale)
      .fill({ color, alpha: fillAlpha })
      .stroke({ width: thinStroke, color, alpha: 0.8 });
    return true;
  }

  if (annotation.type === 'polygon') {
    const poly = annotation as PolygonAnnotation;
    if (poly.points.length < 3) return false;

    // For polygons at medium LOD, simplify if many points
    let points: number[];
    if (poly.points.length > 8) {
      // Use bounding box for complex polygons
      const bounds = getAnnotationBounds(annotation);
      points = [
        bounds.x * scale, bounds.y * scale,
        (bounds.x + bounds.width) * scale, bounds.y * scale,
        (bounds.x + bounds.width) * scale, (bounds.y + bounds.height) * scale,
        bounds.x * scale, (bounds.y + bounds.height) * scale,
      ];
    } else {
      points = poly.points.flatMap(p => [p.x * scale, p.y * scale]);
    }

    graphics
      .poly(points, true)
      .fill({ color, alpha: fillAlpha })
      .stroke({ width: thinStroke, color, alpha: 0.8 });
    return true;
  }

  return false;
}

/**
 * Low detail rendering (LOD 2) - bounding boxes only, no stroke
 */
function renderLow(
  graphics: PIXI.Graphics,
  bounds: AABB,
  color: number,
  scale: number,
  fillAlpha: number
): boolean {
  graphics
    .rect(bounds.x * scale, bounds.y * scale, bounds.width * scale, bounds.height * scale)
    .fill({ color, alpha: fillAlpha * 0.8 });
  return true;
}

/**
 * Minimal rendering (LOD 3) - dots/small squares
 */
function renderMinimal(
  graphics: PIXI.Graphics,
  bounds: AABB,
  color: number,
  scale: number
): boolean {
  // Render as a small dot at center
  const centerX = (bounds.x + bounds.width / 2) * scale;
  const centerY = (bounds.y + bounds.height / 2) * scale;
  const size = 3; // 3px dot

  graphics
    .rect(centerX - size / 2, centerY - size / 2, size, size)
    .fill({ color, alpha: 0.8 });
  return true;
}

/**
 * Helper: Get annotation bounds
 */
function getAnnotationBounds(annotation: Annotation): AABB {
  if (annotation.type === 'rectangle') {
    const rect = annotation as RectangleAnnotation;
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  }

  if (annotation.type === 'polygon') {
    const poly = annotation as PolygonAnnotation;
    if (poly.points.length === 0) {
      return { x: 0, y: 0, width: 0, height: 0 };
    }
    const xs = poly.points.map(p => p.x);
    const ys = poly.points.map(p => p.y);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const maxX = Math.max(...xs);
    const maxY = Math.max(...ys);
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
  }

  return { x: 0, y: 0, width: 0, height: 0 };
}

/**
 * Get LOD statistics for debugging
 */
export function getLODStats(
  annotations: Annotation[],
  scale: number,
  zoom: number
): {
  lodLevel: LODLevel;
  totalCount: number;
  renderedCount: number;
  hiddenCount: number;
  byLOD: Record<LODLevel, number>;
} {
  const lodLevel = getLODLevel(zoom);
  let renderedCount = 0;
  let hiddenCount = 0;
  const byLOD: Record<LODLevel, number> = {
    full: 0,
    medium: 0,
    low: 0,
    minimal: 0,
    hidden: 0,
  };

  for (const ann of annotations) {
    const bounds = getAnnotationBounds(ann);
    if (shouldRenderAtLOD(bounds, scale, zoom, lodLevel)) {
      renderedCount++;
      byLOD[lodLevel]++;
    } else {
      hiddenCount++;
      byLOD.hidden++;
    }
  }

  return {
    lodLevel,
    totalCount: annotations.length,
    renderedCount,
    hiddenCount,
    byLOD,
  };
}
