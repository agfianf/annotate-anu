/**
 * Image thumbnail component with selection, tags, and annotation overlay
 */

import { memo, useMemo } from 'react';
import { Check, ImageOff, Loader2 } from 'lucide-react';
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
}

export const ImageThumbnail = memo(function ImageThumbnail({
  image,
  isSelected,
  onToggle,
  onDoubleClick,
  thumbnailSize,
  style,
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

  return (
    <div
      className={`relative group rounded-lg overflow-hidden border-2 cursor-pointer transition-all bg-gray-100 ${
        isSelected
          ? 'border-emerald-500 ring-2 ring-emerald-500/30'
          : 'border-gray-200 hover:border-emerald-300'
      }`}
      style={style} // Apply dynamic width/height
      onClick={onToggle}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onDoubleClick();
      }}
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

      {/* Tags indicator */}
      {image.tags.length > 0 && (
        <div className="absolute top-1 right-1 flex flex-wrap gap-0.5 max-w-[80%] justify-end">
          {image.tags.slice(0, 3).map((tag) => (
            <span
              key={tag.id}
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: tag.color }}
              title={tag.name}
            />
          ))}
          {image.tags.length > 3 && (
            <span className="text-[8px] text-white bg-black/50 px-1 rounded">
              +{image.tags.length - 3}
            </span>
          )}
        </div>
      )}

      {/* Annotation count badge */}
      {annotationCount > 0 && (
        <div className="absolute bottom-1 left-1 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded-full font-medium">
          {annotationCount}
        </div>
      )}

      {/* Filename overlay */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
        <p className="text-[10px] text-white truncate">{image.filename}</p>
      </div>
    </div>
  );
});
