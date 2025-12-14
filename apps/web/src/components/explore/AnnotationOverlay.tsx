/**
 * SVG annotation overlay for thumbnails
 * Renders bounding box outlines on hover
 */

import type { BboxPreview } from '../../lib/data-management-client';

interface AnnotationOverlayProps {
  /** Array of bounding boxes to render */
  bboxes?: BboxPreview[];
  /** Whether to show only on hover */
  showOnHover?: boolean;
}

export function AnnotationOverlay({
  bboxes,
  showOnHover = true,
}: AnnotationOverlayProps) {
  if (!bboxes || bboxes.length === 0) return null;

  return (
    <svg
      className={`absolute inset-0 pointer-events-none transition-opacity duration-200 ${
        showOnHover ? 'opacity-0 group-hover:opacity-100' : 'opacity-100'
      }`}
      viewBox="0 0 1 1"
      preserveAspectRatio="none"
      style={{ width: '100%', height: '100%' }}
    >
      {bboxes.map((bbox, idx) => (
        <rect
          key={idx}
          x={bbox.x_min}
          y={bbox.y_min}
          width={bbox.x_max - bbox.x_min}
          height={bbox.y_max - bbox.y_min}
          fill="none"
          stroke={bbox.label_color}
          strokeWidth={0.006}
          strokeOpacity={0.9}
        />
      ))}
    </svg>
  );
}
