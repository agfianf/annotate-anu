import { ImageOff, Loader2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
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

/**
 * Calculate the actual rendered position and size of an image with object-contain
 */
function calculateImageBounds(
  containerWidth: number,
  containerHeight: number,
  imageWidth: number,
  imageHeight: number
): { left: number; top: number; width: number; height: number } {
  const containerAspect = containerWidth / containerHeight;
  const imageAspect = imageWidth / imageHeight;

  let renderedWidth: number;
  let renderedHeight: number;

  if (imageAspect > containerAspect) {
    // Image is wider than container - fit to width
    renderedWidth = containerWidth;
    renderedHeight = containerWidth / imageAspect;
  } else {
    // Image is taller than container - fit to height
    renderedHeight = containerHeight;
    renderedWidth = containerHeight * imageAspect;
  }

  const left = (containerWidth - renderedWidth) / 2;
  const top = (containerHeight - renderedHeight) / 2;

  return { left, top, width: renderedWidth, height: renderedHeight };
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
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [imageBounds, setImageBounds] = useState<{
    left: number;
    top: number;
    width: number;
    height: number;
  } | null>(null);

  const hasAnnotations = (bboxes && bboxes.length > 0) || (polygons && polygons.length > 0);

  const updateBounds = useCallback(() => {
    if (!containerRef.current || !imgRef.current) return;

    const container = containerRef.current;
    const img = imgRef.current;

    if (img.naturalWidth === 0 || img.naturalHeight === 0) return;

    const bounds = calculateImageBounds(
      container.clientWidth,
      container.clientHeight,
      img.naturalWidth,
      img.naturalHeight
    );

    setImageBounds(bounds);
  }, []);

  // Update bounds when image loads
  const handleImageLoad = useCallback(() => {
    updateBounds();
  }, [updateBounds]);

  // Update bounds on resize
  useEffect(() => {
    if (!hasAnnotations) return;

    const resizeObserver = new ResizeObserver(() => {
      updateBounds();
    });

    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    return () => resizeObserver.disconnect();
  }, [hasAnnotations, updateBounds]);

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
    <div ref={containerRef} className={`relative ${className}`}>
      <img
        ref={imgRef}
        src={blobUrl}
        alt={alt}
        className="w-full h-full object-contain"
        onLoad={handleImageLoad}
      />
      {hasAnnotations && imageBounds && (
        <div
          className="absolute pointer-events-none"
          style={{
            left: imageBounds.left,
            top: imageBounds.top,
            width: imageBounds.width,
            height: imageBounds.height,
          }}
        >
          <AnnotationOverlay
            bboxes={bboxes}
            polygons={polygons}
            displayOptions={displayOptions}
            showOnHover={false}
          />
        </div>
      )}
    </div>
  );
}
