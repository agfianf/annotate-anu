import { ImageOff, Loader2 } from 'lucide-react';
import { useAuthenticatedImage } from '../../hooks/useAuthenticatedImage';
import { AnnotationOverlay } from './AnnotationOverlay';
import type { BboxPreview, PolygonPreview } from '../../lib/data-management-client';
import type { AnnotationDisplayState } from '../../hooks/useExploreVisibility';

interface FullscreenImageProps {
  src: string | null;
  alt: string;
  className?: string;
  /** Bounding boxes to overlay */
  bboxes?: BboxPreview[];
  /** Polygons to overlay */
  polygons?: PolygonPreview[];
  /** Display options for annotations */
  displayOptions?: AnnotationDisplayState;
}

export function FullscreenImage({
  src,
  alt,
  className = '',
  bboxes,
  polygons,
  displayOptions,
}: FullscreenImageProps) {
  const { blobUrl, isLoading, error } = useAuthenticatedImage(src);

  const hasAnnotations = (bboxes && bboxes.length > 0) || (polygons && polygons.length > 0);

  if (isLoading) {
    return (
      <div className={`flex items-center justify-center ${className}`}>
        <Loader2 className="w-8 h-8 text-emerald-600 animate-spin" />
      </div>
    );
  }

  if (error || !blobUrl) {
    return (
      <div className={`flex flex-col items-center justify-center text-gray-400 ${className}`}>
        <ImageOff className="w-8 h-8 mb-2" />
        <p className="text-sm">Failed to load image</p>
      </div>
    );
  }

  return (
    <div className={`relative ${className}`}>
      <img
        src={blobUrl}
        alt={alt}
        className="w-full h-full object-contain"
      />
      {hasAnnotations && (
        <AnnotationOverlay
          bboxes={bboxes}
          polygons={polygons}
          displayOptions={displayOptions}
          showOnHover={false}
        />
      )}
    </div>
  );
}
