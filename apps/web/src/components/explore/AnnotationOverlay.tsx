/**
 * SVG annotation overlay for thumbnails
 * Renders bounding boxes and polygons with configurable display options
 * Supports highlight mode to dim image and spotlight annotations
 */

import { useId } from 'react';
import type { BboxPreview, PolygonPreview } from '../../lib/data-management-client';
import type { AnnotationDisplayState, DimLevel } from '../../hooks/useExploreVisibility';

// Stroke width mapping (relative to viewBox 0-1)
const STROKE_WIDTH_MAP: Record<AnnotationDisplayState['strokeWidth'], number> = {
  'thin': 0.004,
  'normal': 0.008,
  'medium': 0.012,
  'thick': 0.018,
  'extra-thick': 0.025,
};

// Fill opacity mapping
const FILL_OPACITY_MAP: Record<AnnotationDisplayState['fillOpacity'], number> = {
  'none': 0,
  'light': 0.1,
  'medium': 0.25,
  'strong': 0.4,
  'solid': 0.6,
};

// Dim level mapping for highlight mode (image dimming opacity)
const DIM_LEVEL_MAP: Record<DimLevel, number> = {
  'subtle': 0.3,
  'medium': 0.5,
  'strong': 0.7,
};

interface AnnotationOverlayProps {
  /** Array of bounding boxes to render */
  bboxes?: BboxPreview[];
  /** Array of polygons to render */
  polygons?: PolygonPreview[];
  /** Display options for annotations */
  displayOptions?: AnnotationDisplayState;
  /** Whether to show only on hover */
  showOnHover?: boolean;
}

/**
 * Convert polygon points to SVG path string
 */
function pointsToPath(points: [number, number][]): string {
  if (!points || points.length === 0) return '';
  const [first, ...rest] = points;
  return `M ${first[0]},${first[1]} ` +
         rest.map((p) => `L ${p[0]},${p[1]}`).join(' ') +
         ' Z';
}

/**
 * Calculate centroid of a polygon for label positioning
 */
function getCentroid(points: [number, number][]): [number, number] {
  if (!points || points.length === 0) return [0, 0];
  const n = points.length;
  const x = points.reduce((sum, p) => sum + p[0], 0) / n;
  const y = points.reduce((sum, p) => sum + p[1], 0) / n;
  return [x, y];
}

/**
 * Get label position for a bbox (above center)
 */
function getBboxLabelPosition(bbox: BboxPreview): [number, number] {
  return [
    (bbox.x_min + bbox.x_max) / 2,
    bbox.y_min - 0.02, // Position above bbox
  ];
}

const defaultDisplayOptions: AnnotationDisplayState = {
  strokeWidth: 'normal',
  showLabels: false,
  showBboxes: true,
  showPolygons: true,
  fillOpacity: 'none',
  highlightMode: false,
  dimLevel: 'medium',
};

// Font styling for annotation labels
const LABEL_FONT_FAMILY = "'Source Sans 3', 'Source Sans Pro', sans-serif";
const LABEL_FONT_SIZE = 0.022;
const LABEL_FONT_WEIGHT = '600';

export function AnnotationOverlay({
  bboxes,
  polygons,
  displayOptions = defaultDisplayOptions,
  showOnHover = true,
}: AnnotationOverlayProps) {
  // Generate unique ID for mask to avoid conflicts with multiple overlays
  const maskId = useId();

  const showBboxes = displayOptions.showBboxes && bboxes && bboxes.length > 0;
  const showPolygons = displayOptions.showPolygons && polygons && polygons.length > 0;
  const highlightMode = displayOptions.highlightMode ?? false;

  // Return null only if no annotations AND highlight mode is off
  // (highlight mode should dim all images even without annotations)
  if (!showBboxes && !showPolygons && !highlightMode) return null;

  const strokeWidth = STROKE_WIDTH_MAP[displayOptions.strokeWidth];
  const fillOpacity = FILL_OPACITY_MAP[displayOptions.fillOpacity];
  const showLabels = displayOptions.showLabels;
  const dimLevel = DIM_LEVEL_MAP[displayOptions.dimLevel ?? 'medium'];

  return (
    <svg
      className={`absolute inset-0 pointer-events-none transition-opacity duration-200 ${
        showOnHover ? 'opacity-0 group-hover:opacity-100' : 'opacity-100'
      }`}
      viewBox="0 0 1 1"
      preserveAspectRatio="none"
      style={{ width: '100%', height: '100%' }}
    >
      {/* Highlight mode: dim overlay with annotation cutouts */}
      {highlightMode && (
        <>
          <defs>
            <mask id={maskId}>
              {/* White background = fully visible (dimmed area) */}
              <rect x="0" y="0" width="1" height="1" fill="white" />

              {/* Black cutouts for bboxes = fully transparent (spotlight) */}
              {showBboxes && bboxes?.map((bbox, idx) => (
                <rect
                  key={`mask-bbox-${idx}`}
                  x={bbox.x_min}
                  y={bbox.y_min}
                  width={bbox.x_max - bbox.x_min}
                  height={bbox.y_max - bbox.y_min}
                  fill="black"
                />
              ))}

              {/* Black cutouts for polygons = fully transparent (spotlight) */}
              {showPolygons && polygons?.map((poly, idx) => {
                const pathD = pointsToPath(poly.points);
                if (!pathD) return null;
                return (
                  <path
                    key={`mask-poly-${idx}`}
                    d={pathD}
                    fill="black"
                  />
                );
              })}
            </mask>
          </defs>

          {/* Dark overlay with mask (annotation areas are cut out) */}
          <rect
            x="0"
            y="0"
            width="1"
            height="1"
            fill="black"
            fillOpacity={dimLevel}
            mask={`url(#${maskId})`}
          />
        </>
      )}

      {/* Render bboxes (detections) */}
      {showBboxes && bboxes?.map((bbox, idx) => {
        const labelPos = getBboxLabelPosition(bbox);
        return (
          <g key={`bbox-${idx}`}>
            <rect
              x={bbox.x_min}
              y={bbox.y_min}
              width={bbox.x_max - bbox.x_min}
              height={bbox.y_max - bbox.y_min}
              fill={bbox.label_color}
              fillOpacity={fillOpacity}
              stroke={bbox.label_color}
              strokeWidth={strokeWidth}
              strokeOpacity={0.9}
            />
            {showLabels && bbox.label_name && (
              <text
                x={labelPos[0]}
                y={labelPos[1]}
                fill={bbox.label_color}
                fontFamily={LABEL_FONT_FAMILY}
                fontSize={LABEL_FONT_SIZE}
                fontWeight={LABEL_FONT_WEIGHT}
                textAnchor="middle"
                dominantBaseline="auto"
                style={{
                  paintOrder: 'stroke',
                  stroke: 'white',
                  strokeWidth: 0.004,
                  strokeLinejoin: 'round',
                }}
              >
                {bbox.label_name}
              </text>
            )}
          </g>
        );
      })}

      {/* Render polygons (segmentations) */}
      {showPolygons && polygons?.map((poly, idx) => {
        const centroid = getCentroid(poly.points);
        const pathD = pointsToPath(poly.points);
        if (!pathD) return null;
        return (
          <g key={`poly-${idx}`}>
            <path
              d={pathD}
              fill={poly.label_color}
              fillOpacity={fillOpacity}
              stroke={poly.label_color}
              strokeWidth={strokeWidth}
              strokeOpacity={0.9}
              strokeLinejoin="round"
            />
            {showLabels && poly.label_name && (
              <text
                x={centroid[0]}
                y={centroid[1]}
                fill={poly.label_color}
                fontFamily={LABEL_FONT_FAMILY}
                fontSize={LABEL_FONT_SIZE}
                fontWeight={LABEL_FONT_WEIGHT}
                textAnchor="middle"
                dominantBaseline="middle"
                style={{
                  paintOrder: 'stroke',
                  stroke: 'white',
                  strokeWidth: 0.004,
                  strokeLinejoin: 'round',
                }}
              >
                {poly.label_name}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
