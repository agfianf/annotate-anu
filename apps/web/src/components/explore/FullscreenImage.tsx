import { ImageOff, Loader2, RefreshCw } from '@/components/ui/icons';
import { useCallback, useEffect, useState } from 'react';
import { useAuthenticatedImage } from '../../hooks/useAuthenticatedImage';
import { AnnotationOverlay } from './AnnotationOverlay';
import type { AnnotationSummary, BboxPreview, PolygonPreview } from '../../lib/data-management-client';
import type { AnnotationDisplayState } from '../../hooks/useExploreVisibility';
import type { AnnotationVisibilityPredicate } from '../../hooks/useAnnotationFilters';

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
  /**
   * Annotation display filter, shared with the gallery thumbnails so both draw
   * the same shapes. Display-only: it never changes which images match or how
   * many results are reported. Omitted means every annotation is drawn.
   */
  shouldShowAnnotation?: AnnotationVisibilityPredicate;
  /**
   * The image's own annotation summary. Only its counts are read, to report
   * when the previewed geometry is a capped subset of the image's annotations.
   */
  annotationSummary?: AnnotationSummary;
  /** Source image width in pixels, used to label the preview resolution honestly. */
  sourceWidth?: number | null;
  /** Source image height in pixels, used to label the preview resolution honestly. */
  sourceHeight?: number | null;
}

/**
 * Bounds of the rendered image, tagged with the blob URL they were measured
 * from. The tag lets a measurement taken for the previous image be ignored
 * instead of positioning the next image's overlay with it.
 */
interface MeasuredBounds {
  left: number;
  top: number;
  width: number;
  height: number;
  /** Natural pixel size of the decoded preview, used for the resolution label */
  naturalWidth: number;
  naturalHeight: number;
  src: string;
}

/**
 * Per-image geometry caps the gallery endpoint applies (contract C10). The response carries
 * `bboxes_truncated` / `polygons_truncated`, so these are only the fallback for a server that
 * predates those flags: the array being exactly cap-sized is the one thing a client can check.
 */
const BBOX_PREVIEW_CAP = 100;
const POLYGON_PREVIEW_CAP = 50;

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

/**
 * The loader reports transport failures as `Failed to fetch image: <status>`.
 * Translate the ones a reviewer can act on instead of showing the raw status.
 */
function describeImageError(error: Error | null): string {
  const status = Number(error?.message.match(/Failed to fetch image: (\d+)/)?.[1]);
  if (status === 401 || status === 403) {
    return 'Your session may have expired. Sign in again, then retry.';
  }
  if (status === 404) {
    return 'This image is no longer available at its registered path.';
  }
  if (status >= 500) {
    return 'The server could not return this image. This is usually temporary.';
  }
  return 'The image could not be loaded. Check your connection, then retry.';
}

/**
 * Retrying a failed image means remounting the loader: `useAuthenticatedImage`
 * restarts a failed fetch when the last subscriber releases the cache entry and
 * a new one acquires it, and exposes no imperative retry. The outer component
 * owns the attempt counter so the inner one can unmount and remount cleanly.
 */
export function FullscreenImage(props: FullscreenImageProps) {
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((previous) => previous + 1), []);

  return (
    <FullscreenImageContent
      key={`${props.src ?? ''}#${attempt}`}
      {...props}
      onRetry={retry}
    />
  );
}

function FullscreenImageContent({
  src,
  alt,
  className = '',
  bboxes,
  polygons,
  displayOptions,
  shouldShowAnnotation,
  annotationSummary,
  sourceWidth,
  sourceHeight,
  onRetry,
}: FullscreenImageProps & { onRetry: () => void }) {
  const { blobUrl, isLoading, error } = useAuthenticatedImage(src);
  // The container and the image are held in state, not refs: the component
  // renders a spinner before either exists, so an effect that only watched
  // refs never saw the real nodes mount and left the container unobserved.
  const [containerEl, setContainerEl] = useState<HTMLDivElement | null>(null);
  const [imgEl, setImgEl] = useState<HTMLImageElement | null>(null);
  const [bounds, setBounds] = useState<MeasuredBounds | null>(null);

  const hasAnnotations = (bboxes && bboxes.length > 0) || (polygons && polygons.length > 0);
  const shouldShowOverlay = hasAnnotations || displayOptions?.highlightMode;

  const updateBounds = useCallback(() => {
    if (!containerEl || !imgEl || !blobUrl) return;
    if (imgEl.naturalWidth === 0 || imgEl.naturalHeight === 0) return;
    // A container measured at zero (still opening, or hidden) would produce NaN
    // bounds; the observer fires again once it has a size.
    if (containerEl.clientWidth === 0 || containerEl.clientHeight === 0) return;

    const next = calculateImageBounds(
      containerEl.clientWidth,
      containerEl.clientHeight,
      imgEl.naturalWidth,
      imgEl.naturalHeight
    );

    setBounds((previous) =>
      previous &&
      previous.src === blobUrl &&
      previous.left === next.left &&
      previous.top === next.top &&
      previous.width === next.width &&
      previous.height === next.height
        ? previous
        : {
            ...next,
            naturalWidth: imgEl.naturalWidth,
            naturalHeight: imgEl.naturalHeight,
            src: blobUrl,
          }
    );
  }, [containerEl, imgEl, blobUrl]);

  // Observe the container for as long as it exists. The node arrives through a
  // state setter, so this effect re-runs the moment the spinner is replaced by
  // the real element, and again when the image element mounts. ResizeObserver
  // delivers an initial callback on observe, which measures a cached image
  // whose load event fired before this element existed.
  useEffect(() => {
    if (!containerEl) return;

    const resizeObserver = new ResizeObserver(() => {
      updateBounds();
    });
    resizeObserver.observe(containerEl);

    return () => resizeObserver.disconnect();
  }, [containerEl, updateBounds]);

  // Update bounds when the image finishes decoding
  const handleImageLoad = useCallback(() => {
    updateBounds();
  }, [updateBounds]);

  // Bounds measured for a previous source would misplace this image's overlay,
  // so they count as absent until the new image has been measured.
  const imageBounds = bounds && bounds.src === blobUrl ? bounds : null;

  // The server says only that a preview hit its per-image cap, never by how much, and no
  // denominator for what arrived is derivable here: `bboxes` mixes detection boxes with the
  // bounding boxes of segmentations, so `detection_count` is not the total for it — an image with
  // 10 detections and 200 segmentations would otherwise read "100 of 10". The badge therefore
  // states what was loaded and that more exists, and promises no total. Truncation is only
  // meaningful while geometry is being drawn: with overlays off none is requested, and the display
  // filter above hides shapes without changing what was loaded.
  const loadedBboxes = bboxes?.length ?? 0;
  const loadedPolygons = polygons?.length ?? 0;
  const bboxesTruncated = annotationSummary?.bboxes_truncated ?? loadedBboxes >= BBOX_PREVIEW_CAP;
  const polygonsTruncated =
    annotationSummary?.polygons_truncated ?? loadedPolygons >= POLYGON_PREVIEW_CAP;
  const truncationNotice = shouldShowOverlay
    ? [
        bboxesTruncated && loadedBboxes > 0 ? `${loadedBboxes} boxes` : null,
        polygonsTruncated && loadedPolygons > 0 ? `${loadedPolygons} shapes` : null,
      ].filter(Boolean)
    : [];

  // The preview is a thumbnail tier, not the original file. Say so rather than
  // implying that a larger source has been inspected at full resolution.
  const isDownscaled =
    imageBounds != null &&
    sourceWidth != null &&
    sourceHeight != null &&
    (imageBounds.naturalWidth < sourceWidth || imageBounds.naturalHeight < sourceHeight);

  if (isLoading) {
    return (
      <div className={`flex items-center justify-center ${className}`}>
        <Loader2 className="w-8 h-8 text-emerald-600 animate-spin" />
      </div>
    );
  }

  if (!src) {
    return (
      <div className={`flex flex-col items-center justify-center text-gray-400 ${className}`}>
        <ImageOff className="w-8 h-8 mb-2" />
        <p className="text-sm">No preview available for this image</p>
      </div>
    );
  }

  if (error || !blobUrl) {
    return (
      <div className={`flex flex-col items-center justify-center text-gray-400 ${className}`}>
        <ImageOff className="w-8 h-8 mb-2" />
        <p className="text-sm">Failed to load image</p>
        <p className="mt-1 max-w-xs text-center text-xs text-gray-500">
          {describeImageError(error)}
        </p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-gray-600 px-3 py-1.5 text-sm text-gray-200 transition-colors hover:bg-gray-700"
        >
          <RefreshCw className="h-4 w-4" />
          Retry
        </button>
      </div>
    );
  }

  return (
    <div ref={setContainerEl} className={`relative ${className}`}>
      <img
        ref={setImgEl}
        src={blobUrl}
        alt={alt}
        className="w-full h-full object-contain"
        onLoad={handleImageLoad}
      />
      {shouldShowOverlay && imageBounds && (
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
            shouldShowAnnotation={shouldShowAnnotation}
          />
        </div>
      )}
      {(isDownscaled || truncationNotice.length > 0) && (
        <div className="absolute bottom-2 left-2 right-2 flex flex-wrap gap-1.5 pointer-events-none">
          {isDownscaled && imageBounds && (
            <span className="rounded bg-black/60 px-2 py-1 text-[11px] text-white">
              Preview {imageBounds.naturalWidth} × {imageBounds.naturalHeight} · source{' '}
              {sourceWidth} × {sourceHeight}
            </span>
          )}
          {truncationNotice.length > 0 && (
            <span className="rounded bg-amber-900/70 px-2 py-1 text-[11px] text-amber-50">
              Preview capped: showing the first {truncationNotice.join(' and ')}; this image has more
            </span>
          )}
        </div>
      )}
    </div>
  );
}
