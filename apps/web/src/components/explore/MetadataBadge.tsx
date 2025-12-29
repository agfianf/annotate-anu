/**
 * MetadataBadge - Display metadata fields as emerald-themed badges
 * Positioned on image thumbnails at top-left
 */

import { memo, useMemo } from 'react';

export type MetadataField = 'filename' | 'width' | 'height' | 'fileSize' | 'imageId' | 'filepath';

interface MetadataBadgeProps {
  field: MetadataField;
  value: string | number;
  scaleFactor: number;
  color?: string; // Custom background color (defaults to emerald-500)
}

export const MetadataBadge = memo(function MetadataBadge({
  field,
  value,
  scaleFactor,
  color,
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

  // Use custom color or default to emerald-500
  const backgroundColor = color || '#10B981';

  return (
    <div
      className="text-white font-mono rounded backdrop-blur-sm shadow-sm whitespace-nowrap overflow-hidden text-ellipsis"
      style={{
        backgroundColor: `${backgroundColor}E6`, // Add E6 for 90% opacity
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
