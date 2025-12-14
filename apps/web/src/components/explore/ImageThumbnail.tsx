/**
 * Image thumbnail component with selection, tags, and annotation overlay
 */

import { memo, useMemo } from 'react';
import { Check, ImageOff, Loader2, X, MousePointer2, Maximize2 } from 'lucide-react';
import type { SharedImage } from '../../lib/data-management-client';
import { getAbsoluteThumbnailUrl } from '../../lib/data-management-client';
import { useAuthenticatedImage } from '../../hooks/useAuthenticatedImage';
import { AnnotationOverlay } from './AnnotationOverlay';

interface ImageThumbnailProps {
  image: SharedImage;
  isSelected: boolean;
  onToggle: () => void;
  onDoubleClick: () => void;
  thumbnailSize: string; // '1x' | '2x' | '4x'
  style?: React.CSSProperties; // For width/height
  onRemoveTag?: (tagId: string) => void;
}

export const ImageThumbnail = memo(function ImageThumbnail({
  image,
  isSelected,
  onToggle,
  onDoubleClick,
  thumbnailSize,
  style,
  onRemoveTag,
}: ImageThumbnailProps) {
  // Build thumbnail URL with size parameter
  const thumbnailUrl = useMemo(() => {
    const baseUrl = getAbsoluteThumbnailUrl(image.thumbnail_url);
    if (!baseUrl) return null;

    // Add size query parameter
    const url = new URL(baseUrl, window.location.origin);
    url.searchParams.set('size', thumbnailSize);
    return url.toString();
  }, [image.thumbnail_url, thumbnailSize]);

  // Calculate scale factor based on thumbnail size
  const scaleFactor = useMemo(() => {
    switch (thumbnailSize) {
      case '1x': return 0.9;  // Small - 90% of base size
      case '2x': return 1.2;  // Medium - 120% of base size
      case '4x': return 1.5;  // Large - 150% of base size
      default: return 1.2;
    }
  }, [thumbnailSize]);

  // Scaled sizes (base sizes are from 2x/medium)
  const tagStyles = useMemo(() => ({
    fontSize: Math.round(9 * scaleFactor), // Base: 9px
    padding: `${Math.round(2 * scaleFactor)}px ${Math.round(8 * scaleFactor)}px`, // Base: 2px 8px
    maxWidth: Math.round(80 * scaleFactor), // Base: 80px
    dotSize: Math.round(8 * scaleFactor), // Base: 8px (w-2 h-2)
    dotGap: Math.round(2 * scaleFactor), // Base: 2px
    plusFontSize: Math.round(8 * scaleFactor), // Base: 8px
    xButtonSize: Math.round(10 * scaleFactor), // Base: 10px (w-2.5 h-2.5)
    gap: Math.round(4 * scaleFactor), // Base: 4px (gap-1)
  }), [scaleFactor]);

  // Fetch image with authentication
  const { blobUrl, isLoading, error } = useAuthenticatedImage(thumbnailUrl);

  // Combine detection and segmentation bboxes for overlay
  const overlayBboxes = useMemo(() => {
    if (!image.annotation_summary) return undefined;
    return image.annotation_summary.bboxes;
  }, [image.annotation_summary]);

  const hasAnnotations =
    image.annotation_summary &&
    (image.annotation_summary.detection_count > 0 ||
      image.annotation_summary.segmentation_count > 0);

  const annotationCount = hasAnnotations
    ? image.annotation_summary!.detection_count + image.annotation_summary!.segmentation_count
    : 0;

  // Handle click area division: top 50% = select, bottom 50% = fullscreen
  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const element = e.currentTarget;
    const rect = element.getBoundingClientRect();
    const clickY = e.clientY - rect.top;
    const relativeY = clickY / rect.height;

    // Bottom 50% opens fullscreen, top 50% toggles selection
    if (relativeY >= 0.50) {
      onDoubleClick(); // Opens fullscreen modal
    } else {
      onToggle(); // Toggles checkbox selection
    }
  };

  return (
    <div
      className={`relative group rounded-lg overflow-hidden border-2 cursor-pointer transition-all bg-gray-100 ${
        isSelected
          ? 'border-emerald-500 ring-2 ring-emerald-500/30'
          : 'border-gray-200 hover:border-emerald-300'
      }`}
      style={style} // Apply dynamic width/height
      onClick={handleClick}
    >
      {/* Authenticated image loading */}
      {isLoading ? (
        <div className="w-full h-full flex items-center justify-center">
          <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
        </div>
      ) : error || !blobUrl ? (
        <div className="w-full h-full flex flex-col items-center justify-center text-gray-400">
          <ImageOff className="w-8 h-8 mb-1" />
          <p className="text-[9px] text-center px-2 text-gray-500">{image.filename}</p>
        </div>
      ) : (
        <img
          src={blobUrl}
          alt={image.filename}
          className="w-full h-full object-contain"
        />
      )}

      {/* Interactive zones gradient overlay (shows on hover) */}
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none">
        {/* Top half - Select zone */}
        <div className="absolute inset-0 bottom-1/2 bg-gradient-to-b from-emerald-500/0 via-emerald-500/8 to-emerald-500/15 flex items-center justify-center">
          <MousePointer2 className="w-5 h-5 text-white drop-shadow-lg" />
        </div>

        {/* Bottom half - Fullscreen zone */}
        <div className="absolute inset-0 top-1/2 bg-gradient-to-t from-white/0 via-white/8 to-white/15 flex items-center justify-center">
          <Maximize2 className="w-5 h-5 text-white drop-shadow-lg" />
        </div>
      </div>

      {/* Annotation overlay (shows on hover) */}
      {overlayBboxes && overlayBboxes.length > 0 && (
        <AnnotationOverlay bboxes={overlayBboxes} showOnHover />
      )}

      {/* Selection checkbox */}
      <div
        className={`absolute top-1 left-1 w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${
          isSelected
            ? 'bg-emerald-500 border-emerald-500'
            : 'bg-white/80 border-gray-300 opacity-0 group-hover:opacity-100'
        }`}
      >
        {isSelected && <Check className="w-3 h-3 text-white" />}
      </div>

      {/* Annotation count badge */}
      {annotationCount > 0 && (
        <div className="absolute top-1 right-1 bg-black text-white text-[10px] px-1.5 py-0.5 rounded-full font-medium">
          {annotationCount}
        </div>
      )}

      {/* Tags - positioned at bottom, solid background, always visible */}
      {image.tags.length > 0 && (
        <>
          {/* Default state: Show first 2 tags with text, rest as dots */}
          <div
            className="absolute bottom-1 left-1 right-1 flex flex-wrap items-center group-hover:hidden"
            style={{ gap: `${tagStyles.gap}px` }}
          >
            {/* First 2 tags with text */}
            {image.tags.slice(0, 2).map((tag) => (
              <span
                key={tag.id}
                className="rounded-md font-medium truncate"
                style={{
                  backgroundColor: tag.color,
                  color: 'white',
                  fontSize: `${tagStyles.fontSize}px`,
                  padding: tagStyles.padding,
                  maxWidth: `${tagStyles.maxWidth}px`,
                }}
                title={tag.name}
              >
                {tag.name}
              </span>
            ))}

            {/* Remaining tags as colored dots */}
            {image.tags.length > 2 && (
              <div
                className="flex items-center"
                style={{ gap: `${tagStyles.dotGap}px` }}
              >
                {image.tags.slice(2, 5).map((tag) => (
                  <span
                    key={tag.id}
                    className="rounded-full"
                    style={{
                      backgroundColor: tag.color,
                      width: `${tagStyles.dotSize}px`,
                      height: `${tagStyles.dotSize}px`,
                    }}
                    title={tag.name}
                  />
                ))}
                {image.tags.length > 5 && (
                  <span
                    className="text-white bg-black rounded font-medium"
                    style={{
                      fontSize: `${tagStyles.plusFontSize}px`,
                      padding: `0 ${tagStyles.dotGap * 2}px`,
                    }}
                  >
                    +{image.tags.length - 5}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Hover state: Show all tags with removal buttons */}
          <div
            className="absolute bottom-1 left-1 right-1 hidden group-hover:flex flex-wrap"
            style={{ gap: `${tagStyles.gap}px` }}
          >
            {image.tags.map((tag) => (
              <div
                key={tag.id}
                className="flex items-center rounded-md font-medium"
                style={{
                  backgroundColor: tag.color,
                  color: 'white',
                  fontSize: `${tagStyles.fontSize}px`,
                  padding: tagStyles.padding,
                  gap: `${tagStyles.gap}px`,
                }}
              >
                <span
                  className="truncate"
                  style={{ maxWidth: `${tagStyles.maxWidth}px` }}
                >
                  {tag.name}
                </span>
                {onRemoveTag && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemoveTag(tag.id);
                    }}
                    className="hover:text-red-300 transition-colors"
                    style={{
                      width: `${tagStyles.xButtonSize}px`,
                      height: `${tagStyles.xButtonSize}px`,
                    }}
                    title="Remove tag"
                  >
                    <X style={{ width: '100%', height: '100%' }} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
});
