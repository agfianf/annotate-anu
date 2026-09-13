/**
 * Image thumbnail component with selection, tags, and annotation overlay
 */

import { memo, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Check, ImageOff, Loader2, RefreshCw, X, MousePointer2, Maximize2 } from '@/components/ui/icons';
import type { SharedImage } from '../../lib/data-management-client';
import { getAbsoluteThumbnailUrl } from '../../lib/data-management-client';
import { useAuthenticatedImage } from '../../hooks/useAuthenticatedImage';
import { AnnotationOverlay } from './AnnotationOverlay';
import type { VisibilityState } from '../../hooks/useExploreVisibility';
import { MetadataBadge } from './MetadataBadge';
import { getTextColorForBackground } from '../../lib/colors';

/** Longest-side bound the server fits each thumbnail tier into (see `share.py` `size` query param). */
const THUMBNAIL_TIER_PX: Record<string, number> = { '1x': 256, '2x': 512, '3x': 768, '4x': 1024 };
/**
 * Ordered smallest-first; `selectThumbnailTier` takes the first tier that covers the request.
 * `3x` exists for the retina case: a tile around 330 CSS px needs 660 device px at DPR 2, which
 * `2x` misses and `4x` overshoots by 364 px of longest side on every tile in the grid.
 */
const THUMBNAIL_TIERS = ['1x', '2x', '3x', '4x'] as const;
/** Device pixel ratios above 2 cost bytes without a matching gain in perceived sharpness. */
const MAX_EFFECTIVE_DPR = 2;
/** Minimum hit area for tile actions, in CSS px (WCAG 2.2 SC 2.5.8 Target Size (Minimum)). */
const MIN_TARGET_PX = 24;

/**
 * Smallest tier whose delivered pixels cover the rendered bounds. The server fits the image
 * inside a square of `tier` px, so a small source never gains from a larger tier.
 */
function selectThumbnailTier(
  renderedWidth: number,
  renderedHeight: number,
  sourceWidth: number | null | undefined,
  sourceHeight: number | null | undefined,
  devicePixelRatio: number
): string {
  const needed = Math.max(renderedWidth, renderedHeight) * Math.min(devicePixelRatio, MAX_EFFECTIVE_DPR);
  const sourceLongestSide =
    sourceWidth && sourceHeight ? Math.max(sourceWidth, sourceHeight) : Number.POSITIVE_INFINITY;

  for (const tier of THUMBNAIL_TIERS) {
    if (Math.min(THUMBNAIL_TIER_PX[tier], sourceLongestSide) >= needed) return tier;
  }
  return THUMBNAIL_TIERS[THUMBNAIL_TIERS.length - 1];
}

// Device pixel ratio is shared by every tile, so it is tracked once in a module-level store
// rather than with one matchMedia listener per thumbnail.
let currentDevicePixelRatio = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1;
const dprListeners = new Set<() => void>();
let dprQuery: MediaQueryList | null = null;

function detachDprQuery(): void {
  dprQuery?.removeEventListener('change', handleDprChange);
  dprQuery = null;
}

function attachDprQuery(): void {
  detachDprQuery();
  dprQuery = window.matchMedia(`(resolution: ${currentDevicePixelRatio}dppx)`);
  dprQuery.addEventListener('change', handleDprChange);
}

function handleDprChange(): void {
  currentDevicePixelRatio = window.devicePixelRatio || 1;
  // The query only matches the previous ratio, so re-arm it against the new one.
  attachDprQuery();
  dprListeners.forEach((listener) => listener());
}

function subscribeDevicePixelRatio(listener: () => void): () => void {
  if (dprListeners.size === 0 && typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    attachDprQuery();
  }
  dprListeners.add(listener);
  return () => {
    dprListeners.delete(listener);
    if (dprListeners.size === 0) detachDprQuery();
  };
}

function getDevicePixelRatio(): number {
  return currentDevicePixelRatio;
}

type ThumbnailFailureKind = 'missing' | 'unauthorized' | 'transient';

function readErrorStatus(error: Error): number | null {
  const withStatus = error as Error & { status?: unknown };
  if (typeof withStatus.status === 'number') return withStatus.status;
  const match = /(\d{3})\s*$/.exec(error.message);
  return match ? Number(match[1]) : null;
}

function classifyFailure(error: Error | null): ThumbnailFailureKind {
  if (!error) return 'transient';
  const status = readErrorStatus(error);
  if (status === 404 || status === 410) return 'missing';
  if (status === 401 || status === 403) return 'unauthorized';
  return 'transient';
}

const FAILURE_MESSAGES: Record<ThumbnailFailureKind, string> = {
  missing: 'Image not found on the server',
  unauthorized: 'Session expired — sign in again',
  transient: "Couldn't load this image",
};

interface ImageThumbnailProps {
  image: SharedImage;
  isSelected: boolean;
  onToggle: () => void;
  onDoubleClick: () => void;
  thumbnailSize: string; // '1x' | '2x' | '4x'
  style?: React.CSSProperties; // For width/height
  onRemoveTag?: (tagId: string) => void;
  /** Optional visibility state to filter displayed tags */
  visibility?: VisibilityState;
  /** Map of category_id to category color for border styling */
  categoryColorMap?: Record<string, string>;
  /** Optional filter function for annotation confidence filtering */
  shouldShowAnnotation?: (labelId?: string, confidence?: number) => boolean;
  /**
   * Explicit open action (contract C7). When provided the tile renders a labelled checkbox and a
   * labelled open control instead of the half-tile hover zones, and both are keyboard reachable.
   * When absent the tile keeps today's upper-half-selects / lower-half-opens behaviour.
   */
  onOpen?: (image: SharedImage) => void;
  /**
   * True when this tile is the grid's roving tab stop. Only used with `onOpen`. It gates the tile's
   * controls as a group rather than reducing them to one stop: with it set, the open button, the
   * selection checkbox, a retry button when the thumbnail failed, and one remove-tag button per
   * visible tag all become tabbable, so a tile showing six tags is eight tab stops. Tab therefore
   * walks the active tile's controls and then leaves the grid; arrow keys move between tiles. The
   * extra stops are all real, labelled actions, so they are reachable rather than skipped.
   */
  isActive?: boolean;
  /** Rendered CSS width of the tile; drives thumbnail tier selection when known. */
  renderedWidth?: number;
  /** Rendered CSS height of the tile; drives thumbnail tier selection when known. */
  renderedHeight?: number;
}

export const ImageThumbnail = memo(function ImageThumbnail({
  image,
  isSelected,
  onToggle,
  onDoubleClick,
  thumbnailSize,
  style,
  onRemoveTag,
  visibility,
  categoryColorMap = {},
  shouldShowAnnotation,
  onOpen,
  isActive = false,
  renderedWidth,
  renderedHeight,
}: ImageThumbnailProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const devicePixelRatio = useSyncExternalStore(
    subscribeDevicePixelRatio,
    getDevicePixelRatio,
    getDevicePixelRatio
  );

  // Explicit controls replace the half-tile geometry only when a caller supplies onOpen.
  const hasExplicitActions = Boolean(onOpen);

  // Scoped retry: a new token changes the request URL, which gives this one tile a fresh
  // cache entry and a fresh fetch without touching any other tile or the whole gallery.
  const [retryToken, setRetryToken] = useState(0);

  // Smallest tier that covers the rendered bounds at this device pixel ratio. Falls back to the
  // density-derived tier when the caller does not know the rendered size.
  const resolvedTier = useMemo(() => {
    if (!renderedWidth || !renderedHeight) return thumbnailSize;
    return selectThumbnailTier(renderedWidth, renderedHeight, image.width, image.height, devicePixelRatio);
  }, [renderedWidth, renderedHeight, image.width, image.height, devicePixelRatio, thumbnailSize]);

  // Build thumbnail URL with size parameter
  const thumbnailUrl = useMemo(() => {
    const baseUrl = getAbsoluteThumbnailUrl(image.thumbnail_url);
    if (!baseUrl) return null;

    // Add size query parameter
    const url = new URL(baseUrl, window.location.origin);
    url.searchParams.set('size', resolvedTier);
    if (retryToken > 0) url.searchParams.set('retry', String(retryToken));
    return url.toString();
  }, [image.thumbnail_url, resolvedTier, retryToken]);

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

  // Hover is tracked in state so the full tag list (with remove buttons) is only
  // mounted for the one thumbnail under the cursor, not for every thumbnail in
  // the grid.
  const [isHovered, setIsHovered] = useState(false);
  const handleMouseEnter = useCallback(() => setIsHovered(true), []);
  const handleMouseLeave = useCallback(() => setIsHovered(false), []);

  // Keyboard users reach the tag remove buttons through focus, and touch users through an
  // explicit tap on the tile; neither can produce a hover.
  const [isFocusWithin, setIsFocusWithin] = useState(false);
  const [isTouchRevealed, setIsTouchRevealed] = useState(false);

  const handleFocus = useCallback(() => setIsFocusWithin(true), []);
  const handleBlur = useCallback((event: React.FocusEvent<HTMLDivElement>) => {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
    setIsFocusWithin(false);
  }, []);

  useEffect(() => {
    if (!isTouchRevealed) return;
    const handleOutside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setIsTouchRevealed(false);
    };
    document.addEventListener('pointerdown', handleOutside);
    return () => document.removeEventListener('pointerdown', handleOutside);
  }, [isTouchRevealed]);

  const showTagActions = isHovered || isFocusWithin || isTouchRevealed;

  // Filter tags based on visibility state
  const visibleTags = useMemo(() => {
    if (!visibility) return image.tags; // Show all if no visibility control
    return image.tags.filter((tag) => {
      // Check if individual tag is visible (default to visible if not set)
      return visibility.tags[tag.id] !== false;
    });
  }, [image.tags, visibility]);

  // Touch and pen have no hover, so the first tap on a tile that has removable tags reveals the
  // tag actions instead of opening the image; the next tap opens it. Mouse input is untouched.
  const suppressNextOpenRef = useRef(false);
  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.pointerType === 'mouse') return;
      if (isTouchRevealed || !onRemoveTag || visibleTags.length === 0) return;
      setIsTouchRevealed(true);
      suppressNextOpenRef.current = true;
    },
    [isTouchRevealed, onRemoveTag, visibleTags.length]
  );

  // Filter metadata based on visibility state
  const visibleMetadata = useMemo(() => {
    if (!visibility) return [];
    const fields: Array<{ field: 'filename' | 'width' | 'height' | 'fileSize' | 'filepath' | 'imageId'; color: string }> = [];

    // Handle both old (boolean) and new (object) visibility formats
    const getVisibility = (field: keyof typeof visibility.metadata) => {
      const value = visibility.metadata[field];
      if (typeof value === 'boolean') {
        // Old format: boolean
        return { visible: value, color: '#10B981' };
      } else if (value && typeof value === 'object') {
        // New format: { visible: boolean, color: string }
        return { visible: value.visible, color: value.color || '#10B981' };
      }
      return { visible: false, color: '#10B981' };
    };

    const filename = getVisibility('filename');
    const width = getVisibility('width');
    const height = getVisibility('height');
    const fileSize = getVisibility('fileSize');
    const filepath = getVisibility('filepath');
    const imageIds = getVisibility('imageId');

    if (filename.visible) fields.push({ field: 'filename', color: filename.color });
    if (width.visible) fields.push({ field: 'width', color: width.color });
    if (height.visible) fields.push({ field: 'height', color: height.color });
    if (fileSize.visible) fields.push({ field: 'fileSize', color: fileSize.color });
    if (filepath.visible) fields.push({ field: 'filepath', color: filepath.color });
    if (imageIds.visible) fields.push({ field: 'imageId', color: imageIds.color });

    return fields;
  }, [visibility]);

  // Format metadata values for display
  const getMetadataValue = (image: SharedImage, field: 'filename' | 'width' | 'height' | 'fileSize' | 'filepath' | 'imageId'): string => {
    switch (field) {
      case 'filename':
        return image.filename;
      case 'width':
        return image.width ? `${image.width}px` : 'N/A';
      case 'height':
        return image.height ? `${image.height}px` : 'N/A';
      case 'fileSize':
        return image.file_size_bytes
          ? `${(image.file_size_bytes / (1024 * 1024)).toFixed(1)} MB`
          : 'N/A';
      case 'filepath':
        return image.file_path || 'N/A';
      case 'imageId':
        return image.id.slice(0, 8) + '...';
      default:
        return '';
    }
  };

  // Extract bboxes for overlay
  const overlayBboxes = useMemo(() => {
    if (!image.annotation_summary) return undefined;
    return image.annotation_summary.bboxes;
  }, [image.annotation_summary]);

  // Extract polygons for overlay
  const overlayPolygons = useMemo(() => {
    if (!image.annotation_summary) return undefined;
    return image.annotation_summary.polygons;
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

  const handleOpen = useCallback(() => {
    if (suppressNextOpenRef.current) {
      suppressNextOpenRef.current = false;
      return;
    }
    if (onOpen) onOpen(image);
    else onDoubleClick();
  }, [onOpen, onDoubleClick, image]);

  const handleRetry = useCallback((event: React.MouseEvent) => {
    event.stopPropagation();
    setRetryToken((token) => token + 1);
  }, []);

  const failureKind = classifyFailure(error);
  const tileTabIndex = isActive ? 0 : -1;
  const accessibleName = annotationCount > 0
    ? `${image.filename}, ${annotationCount} annotations`
    : image.filename;
  // Failure text needs room; very small tiles keep only the icon-sized retry control.
  const showFailureText = !renderedHeight || renderedHeight >= 96;

  return (
    <div
      ref={rootRef}
      // `isolate` is load-bearing for scroll performance, not for looks. Every tile stacks its own
      // chrome with z-10..z-50, and without a stacking context of its own those chunks interleave
      // with every other tile's in one global paint order, so the compositor's per-frame Layerize
      // pass grows with the number of mounted tiles. Measured at XS density (164 tiles): Layerize
      // 17.6 ms/frame without it against 3.3 ms/frame with it, which is a scroll frame interval
      // p50/p95 of 43.3/82.0 ms against 30.1/52.6 ms. It changes nothing about layout or painting
      // order inside a tile, because every z-index here is already relative to the tile.
      className={`isolate relative group rounded-lg overflow-hidden border-2 transition-all bg-gray-100 ${
        hasExplicitActions ? '' : 'cursor-pointer'
      } ${
        isSelected
          ? 'border-emerald-500 ring-2 ring-emerald-500/30'
          : 'border-gray-200 hover:border-emerald-300'
      }`}
      style={style} // Apply dynamic width/height
      data-image-id={image.id}
      role={hasExplicitActions ? 'group' : undefined}
      aria-label={hasExplicitActions ? accessibleName : undefined}
      onClick={hasExplicitActions ? undefined : handleClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onPointerDown={handlePointerDown}
    >
      {/* Authenticated image loading */}
      {isLoading ? (
        <div className="w-full h-full flex items-center justify-center">
          <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
        </div>
      ) : error || !blobUrl ? (
        <div className="w-full h-full flex flex-col items-center justify-center gap-1 text-gray-400 px-1">
          <ImageOff className="w-6 h-6" />
          {showFailureText && (
            <>
              <p className="text-[9px] text-center text-gray-600 leading-tight">{FAILURE_MESSAGES[failureKind]}</p>
              <p className="text-[9px] text-center px-2 text-gray-500 truncate max-w-full">{image.filename}</p>
            </>
          )}
          <button
            type="button"
            onClick={handleRetry}
            data-tile-control="retry"
            tabIndex={hasExplicitActions ? tileTabIndex : 0}
            aria-label={`Retry loading ${image.filename}`}
            title="Retry"
            className="relative z-40 flex items-center justify-center gap-1 rounded border border-gray-300 bg-white/90 px-1.5 text-[9px] font-medium text-gray-700 hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
            style={{ minWidth: MIN_TARGET_PX, minHeight: MIN_TARGET_PX }}
          >
            <RefreshCw className="w-3 h-3" />
            {showFailureText && <span>Retry</span>}
          </button>
        </div>
      ) : (
        <img
          src={blobUrl}
          alt={image.filename}
          decoding="async"
          className="w-full h-full object-contain"
        />
      )}

      {hasExplicitActions ? (
        /* Explicit open control: a real button covering the tile, labelled and keyboard reachable */
        <button
          type="button"
          onClick={handleOpen}
          tabIndex={tileTabIndex}
          data-tile-control="open"
          aria-label={`Open ${image.filename}`}
          className="absolute inset-0 z-10 w-full h-full cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-600"
        >
          <span
            className={`absolute inset-x-0 bottom-0 top-1/2 flex items-end justify-center bg-gradient-to-t from-black/25 to-transparent pb-1 transition-opacity duration-200 ${
              showTagActions ? 'opacity-100' : 'opacity-0'
            }`}
          >
            <Maximize2 className="w-5 h-5 text-white drop-shadow-lg" />
          </span>
        </button>
      ) : (
        /* Interactive zones gradient overlay (shows on hover) - z-50 for highest priority */
        <div className="absolute inset-0 z-50 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none">
          {/* Top half - Select zone */}
          <div className="absolute inset-0 bottom-1/2 bg-gradient-to-b from-emerald-500/0 via-emerald-500/8 to-emerald-500/15 flex items-center justify-center">
            <MousePointer2 className="w-5 h-5 text-white drop-shadow-lg" />
          </div>

          {/* Bottom half - Fullscreen zone */}
          <div className="absolute inset-0 top-1/2 bg-gradient-to-t from-white/0 via-white/8 to-white/15 flex items-center justify-center">
            <Maximize2 className="w-5 h-5 text-white drop-shadow-lg" />
          </div>
        </div>
      )}

      {/* Annotation overlay (render when annotations exist OR highlight mode is on) */}
      {(overlayBboxes?.length || overlayPolygons?.length || visibility?.annotationDisplay?.highlightMode) && (
        <AnnotationOverlay
          bboxes={overlayBboxes}
          polygons={overlayPolygons}
          displayOptions={visibility?.annotationDisplay}
          showOnHover={false}
          shouldShowAnnotation={shouldShowAnnotation}
        />
      )}

      {/* Selection checkbox */}
      {hasExplicitActions ? (
        <label
          className="absolute top-1 left-1 z-30 flex items-center justify-center"
          style={{ width: MIN_TARGET_PX, height: MIN_TARGET_PX }}
        >
          <input
            type="checkbox"
            checked={isSelected}
            onChange={onToggle}
            tabIndex={tileTabIndex}
            data-tile-control="select"
            aria-label={`Select ${image.filename}`}
            className="peer sr-only"
          />
          <span
            aria-hidden="true"
            className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all peer-focus-visible:ring-2 peer-focus-visible:ring-emerald-600 peer-focus-visible:ring-offset-1 ${
              isSelected
                ? 'bg-emerald-500 border-emerald-500'
                : 'bg-white/80 border-gray-400'
            }`}
          >
            {isSelected && <Check className="w-3 h-3 text-white" />}
          </span>
        </label>
      ) : (
        <div
          className={`absolute top-1 left-1 z-30 w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${
            isSelected
              ? 'bg-emerald-500 border-emerald-500'
              : 'bg-white/80 border-gray-300 opacity-0 group-hover:opacity-100'
          }`}
        >
          {isSelected && <Check className="w-3 h-3 text-white" />}
        </div>
      )}

      {/* Annotation count badge */}
      {annotationCount > 0 && (
        <div className="absolute top-1 right-1 z-20 bg-black text-white text-[10px] px-1.5 py-0.5 rounded-full font-medium pointer-events-none">
          {annotationCount}
        </div>
      )}

      {/* Tags - positioned at bottom, solid background, always visible */}
      {visibleTags.length > 0 && (
        <>
          {/* Default state: Show first 2 tags with text, rest as dots */}
          {!showTagActions && (
          <div
            className="absolute bottom-1 left-1 right-1 z-20 flex flex-wrap items-center pointer-events-none"
            style={{ gap: `${tagStyles.gap}px` }}
          >
            {/* First 2 tags with text */}
            {visibleTags.slice(0, 2).map((tag) => {
              const categoryColor = tag.category_id ? categoryColorMap[tag.category_id] : undefined;
              const background = categoryColor && tag.color
                ? `linear-gradient(to right, ${tag.color} 25%, ${categoryColor} 25%)`
                : tag.color || categoryColor || '#10B981';
              const textColor = categoryColor
                ? getTextColorForBackground(categoryColor)
                : getTextColorForBackground(tag.color || '#10B981');

              return (
                <span
                  key={tag.id}
                  className="font-medium truncate"
                  style={{
                    background,
                    color: textColor,
                    fontSize: `${tagStyles.fontSize}px`,
                    padding: tagStyles.padding,
                    maxWidth: `${tagStyles.maxWidth}px`,
                    borderRadius: '2px',
                  }}
                  title={tag.name}
                >
                  {tag.name}
                </span>
              );
            })}

            {/* Remaining tags as colored dots */}
            {visibleTags.length > 2 && (
              <div
                className="flex items-center"
                style={{ gap: `${tagStyles.dotGap}px` }}
              >
                {visibleTags.slice(2, 5).map((tag) => (
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
                {visibleTags.length > 5 && (
                  <span
                    className="text-white bg-black rounded font-medium"
                    style={{
                      fontSize: `${tagStyles.plusFontSize}px`,
                      padding: `0 ${tagStyles.dotGap * 2}px`,
                    }}
                  >
                    +{visibleTags.length - 5}
                  </span>
                )}
              </div>
            )}
          </div>
          )}

          {/* Revealed state: all tags with removal buttons, mounted only while this tile is
              hovered, focused, or touch-activated */}
          {showTagActions && (
          <div
            className="absolute bottom-1 left-1 right-1 z-20 flex flex-wrap pointer-events-none"
            style={{ gap: `${tagStyles.gap}px` }}
          >
            {visibleTags.map((tag) => {
              const categoryColor = tag.category_id ? categoryColorMap[tag.category_id] : undefined;
              const background = categoryColor && tag.color
                ? `linear-gradient(to right, ${tag.color} 25%, ${categoryColor} 25%)`
                : tag.color || categoryColor || '#10B981';
              const textColor = categoryColor
                ? getTextColorForBackground(categoryColor)
                : getTextColorForBackground(tag.color || '#10B981');

              return (
                <div
                  key={tag.id}
                  className="flex items-center font-medium"
                  style={{
                    background,
                    color: textColor,
                    fontSize: `${tagStyles.fontSize}px`,
                    padding: tagStyles.padding,
                    gap: `${tagStyles.gap}px`,
                    borderRadius: '2px',
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
                      tabIndex={hasExplicitActions ? tileTabIndex : 0}
                      data-tile-control="remove-tag"
                      aria-label={`Remove tag ${tag.name}`}
                      className="pointer-events-auto flex items-center justify-center hover:text-red-300 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
                      style={{
                        // Small glyph, large hit area: the negative margin keeps the 24px target
                        // from inflating the chip's label.
                        minWidth: MIN_TARGET_PX,
                        minHeight: MIN_TARGET_PX,
                        margin: '-4px 0',
                      }}
                      title="Remove tag"
                    >
                      <X style={{ width: `${tagStyles.xButtonSize}px`, height: `${tagStyles.xButtonSize}px` }} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          )}
        </>
      )}

      {/* Metadata badges - positioned at top-left */}
      {visibleMetadata.length > 0 && (
        <div
          className="absolute top-1 left-1 z-20 flex flex-col items-start pointer-events-none"
          style={{ gap: `${Math.round(2 * scaleFactor)}px` }}
        >
          {visibleMetadata.map(({ field, color }) => (
            <MetadataBadge
              key={field}
              field={field}
              value={getMetadataValue(image, field)}
              scaleFactor={scaleFactor}
              color={color}
            />
          ))}
        </div>
      )}
    </div>
  );
});
