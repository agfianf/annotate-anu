/**
 * MetadataBadge - Display metadata fields as emerald-themed badges
 * Positioned on image thumbnails at top-left
 */

import { memo, useMemo } from 'react';

export type MetadataField = 'filename' | 'dimensions' | 'fileSize' | 'imageId';

interface MetadataBadgeProps {
  field: MetadataField;
  value: string | number;
  scaleFactor: number;
}

export const MetadataBadge = memo(function MetadataBadge({
  field,
  value,
  scaleFactor,
}: MetadataBadgeProps) {
  // Calculate scaled styles
  const badgeStyles = useMemo(() => ({
    fontSize: Math.round(9 * scaleFactor), // Base: 9px
    paddingY: Math.round(2 * scaleFactor), // Base: 2px
    paddingX: Math.round(6 * scaleFactor), // Base: 6px
    maxWidth: Math.round(120 * scaleFactor), // Base: 120px
  }), [scaleFactor]);

  // Format display value
  const displayValue = useMemo(() => {
    if (typeof value === 'string') {
      // Truncate long filenames
      if (field === 'filename' && value.length > 20) {
        return value.slice(0, 17) + '...';
      }
      return value;
    }
    return String(value);
  }, [value, field]);

  return (
    <div
      className="bg-emerald-500/90 text-white font-mono rounded backdrop-blur-sm shadow-sm whitespace-nowrap overflow-hidden text-ellipsis"
      style={{
        fontSize: `${badgeStyles.fontSize}px`,
        padding: `${badgeStyles.paddingY}px ${badgeStyles.paddingX}px`,
        maxWidth: `${badgeStyles.maxWidth}px`,
      }}
      title={typeof value === 'string' ? value : undefined} // Full value on hover
    >
      {displayValue}
    </div>
  );
});
