/**
 * Virtualized image grid using TanStack Virtual with justified layout
 * Renders only visible rows for smooth performance with 10,000+ images
 */

import { useVirtualizer } from '@tanstack/react-virtual';
import { AlertCircle, Loader2, RefreshCw } from '@/components/ui/icons';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { VisibilityState } from '../../hooks/useExploreVisibility';
import { useJustifiedRows, type ImageWithRowInfo } from '../../hooks/useJustifiedRows';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import type { SharedImage } from '../../lib/data-management-client';
import { JustifiedRow } from './JustifiedRow';

interface VirtualizedImageGridProps {
  images: SharedImage[];
  selectedImages: Set<string>;
  onToggleImage: (id: string) => void;
  onImageDoubleClick: (image: SharedImage) => void;
  targetRowHeight: number; // From zoom config
  thumbnailSize: string; // '1x' | '2x' | '4x'
  spacing?: number; // Gap between images
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: () => void;
  onRemoveTag?: (imageId: string, tagId: string) => void;
  /** Optional visibility state for filtering displayed tags */
  visibility?: VisibilityState;
  /** Map of category_id to category color for thumbnail tag borders */
  categoryColorMap?: Record<string, string>;
  /** Optional filter function for annotation confidence filtering */
  shouldShowAnnotation?: (labelId?: string, confidence?: number) => boolean;
  /**
   * Explicit open action (contract C7). Supplying it turns on the keyboard-operable tile controls
   * — a labelled checkbox and a labelled open button per tile, with arrow-key movement across rows —
   * in place of the half-tile hover zones. Omitting it keeps today's behaviour exactly.
   */
  onOpenImage?: (image: SharedImage) => void;
  /** Error from the last failed next-page fetch (contract C8); loaded rows are kept. */
  nextPageError?: Error | null;
  /** Retry just the failed next page (contract C8). */
  onRetryNextPage?: () => void;
}

const EMPTY_ROW: ImageWithRowInfo[] = [];

/** Keys the grid consumes for tile-to-tile movement. */
const NAVIGATION_KEYS = new Set([
  'ArrowRight',
  'ArrowLeft',
  'ArrowDown',
  'ArrowUp',
  'Home',
  'End',
  'PageDown',
  'PageUp',
]);

/** Rows skipped by PageUp/PageDown. */
const PAGE_ROW_STEP = 5;

type TileControl = 'open' | 'select' | 'remove-tag' | 'retry';

function escapeAttributeValue(value: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') return CSS.escape(value);
  return value.replace(/["\\]/g, '\\$&');
}

export function VirtualizedImageGrid({
  images,
  selectedImages,
  onToggleImage,
  onImageDoubleClick,
  targetRowHeight,
  thumbnailSize,
  spacing = 4,
  hasNextPage,
  isFetchingNextPage,
  fetchNextPage,
  onRemoveTag,
  visibility,
  categoryColorMap,
  shouldShowAnnotation,
  onOpenImage,
  nextPageError = null,
  onRetryNextPage,
}: VirtualizedImageGridProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const prefersReducedMotion = useReducedMotion();

  // Measure container width with ResizeObserver
  useEffect(() => {
    if (!parentRef.current) return;

    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        // Subtract padding (3 * 4 = 12px on each side = 24px total)
        setContainerWidth(entry.contentRect.width - 24);
      }
    });

    resizeObserver.observe(parentRef.current);
    return () => resizeObserver.disconnect();
  }, []);

  // Force re-render state - used by onChange to trigger updates outside React's render cycle
  const [, forceUpdate] = useState(0);

  // Calculate justified layout
  const { layout, imagesWithRowInfo } = useJustifiedRows({
    images,
    containerWidth,
    targetRowHeight,
    spacing,
  });

  // Resolve each row's image list once per layout, not per visible row per scroll tick.
  // Rows are stable array references so memoized JustifiedRow instances skip re-rendering
  // while scrolling.
  const rowImageLists = useMemo(() => {
    const byId = new Map<string, ImageWithRowInfo>();
    for (const img of imagesWithRowInfo) {
      byId.set(img.id, img);
    }
    return layout.rows.map((row) => {
      const list: ImageWithRowInfo[] = [];
      for (const id of row.images) {
        const img = byId.get(id);
        if (img) list.push(img);
      }
      return list;
    });
  }, [layout, imagesWithRowInfo]);

  // Custom onChange handler that defers updates to avoid flushSync warning
  // See: https://github.com/TanStack/virtual/issues/613
  const handleOnChange = useCallback(() => {
    // Use queueMicrotask to defer the state update outside of React's render cycle
    // This prevents the "flushSync was called from inside a lifecycle method" warning
    queueMicrotask(() => {
      forceUpdate((prev) => prev + 1);
    });
  }, []);

  // TanStack Virtual with dynamic row heights
  const rowVirtualizer = useVirtualizer({
    count: layout.rows.length + (hasNextPage ? 1 : 0),
    getScrollElement: () => parentRef.current,
    estimateSize: (index) => {
      // Reserve the height an incoming row will occupy so arriving pages do not shove the
      // already-loaded tiles around when the sentinel is replaced by real rows.
      if (index >= layout.rows.length) return Math.max(targetRowHeight, 96) + spacing;
      return layout.rows[index].height + spacing;
    },
    overscan: 2,
    // Custom onChange to avoid flushSync warning
    onChange: handleOnChange,
  });

  // Remeasure virtualizer when layout changes (container resize, zoom change)
  // Use requestAnimationFrame to defer measure() outside React's render cycle
  // This prevents the "flushSync called from inside lifecycle" warning
  useEffect(() => {
    const rafId = requestAnimationFrame(() => {
      rowVirtualizer.measure();
    });
    return () => cancelAnimationFrame(rafId);
  }, [layout, rowVirtualizer]);

  // Get virtual items for rendering and infinite scroll
  const virtualItems = rowVirtualizer.getVirtualItems();
  const lastVisibleIndex = virtualItems.length > 0 ? virtualItems[virtualItems.length - 1].index : -1;

  // Infinite scroll trigger. A failed next page stops the loop: retry is explicit, so the
  // sentinel cannot spin (or refetch) forever.
  useEffect(() => {
    if (
      lastVisibleIndex >= 0 &&
      lastVisibleIndex >= layout.rows.length - 2 &&
      hasNextPage &&
      !isFetchingNextPage &&
      !nextPageError
    ) {
      fetchNextPage();
    }
  }, [
    lastVisibleIndex,
    layout.rows.length,
    hasNextPage,
    isFetchingNextPage,
    nextPageError,
    fetchNextPage,
  ]);

  // ---------------------------------------------------------------------------
  // Keyboard navigation (enabled only alongside the explicit tile controls)
  // ---------------------------------------------------------------------------

  const [activeImageId, setActiveImageId] = useState<string | null>(null);
  /** Tile whose control last held focus, so focus can be recovered after the virtualizer unmounts it. */
  const focusedImageIdRef = useRef<string | null>(null);
  const focusRequestRef = useRef<{ imageId: string; control: TileControl } | null>(null);

  /** Row/column of every laid-out image, so arrow keys can move by geometry rather than DOM order. */
  const positionById = useMemo(() => {
    const positions = new Map<string, { row: number; column: number }>();
    layout.rows.forEach((row, rowIndex) => {
      row.images.forEach((imageId, columnIndex) => {
        positions.set(imageId, { row: rowIndex, column: columnIndex });
      });
    });
    return positions;
  }, [layout]);

  // Exactly one tile owns the tab stop. If the active image disappears (filters changed, page
  // replaced) the first image takes over, so Tab always reaches the gallery.
  const effectiveActiveId =
    activeImageId && positionById.has(activeImageId)
      ? activeImageId
      : layout.rows[0]?.images[0] ?? null;

  const resolveTarget = useCallback(
    (key: string, withModifier: boolean): string | null => {
      if (!effectiveActiveId) return null;
      const current = positionById.get(effectiveActiveId);
      if (!current) return null;

      const rows = layout.rows;
      const rowImages = rows[current.row]?.images ?? [];

      const atRow = (rowIndex: number, columnIndex: number): string | null => {
        const target = rows[rowIndex]?.images;
        if (!target || target.length === 0) return null;
        return target[Math.min(columnIndex, target.length - 1)] ?? null;
      };

      switch (key) {
        case 'ArrowRight':
          if (current.column < rowImages.length - 1) return rowImages[current.column + 1];
          return atRow(current.row + 1, 0);
        case 'ArrowLeft':
          if (current.column > 0) return rowImages[current.column - 1];
          return current.row > 0 ? (rows[current.row - 1].images.at(-1) ?? null) : null;
        case 'ArrowDown':
          return atRow(current.row + 1, current.column);
        case 'ArrowUp':
          return atRow(current.row - 1, current.column);
        case 'PageDown':
          return atRow(Math.min(current.row + PAGE_ROW_STEP, rows.length - 1), current.column);
        case 'PageUp':
          return atRow(Math.max(current.row - PAGE_ROW_STEP, 0), current.column);
        case 'Home':
          return withModifier ? (rows[0]?.images[0] ?? null) : (rowImages[0] ?? null);
        case 'End':
          return withModifier
            ? (rows.at(-1)?.images.at(-1) ?? null)
            : (rowImages.at(-1) ?? null);
        default:
          return null;
      }
    },
    [effectiveActiveId, positionById, layout]
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (!onOpenImage) return;
      if (!NAVIGATION_KEYS.has(event.key)) return;
      if (event.altKey || event.metaKey) return;

      // Let text entry own its own caret keys if a field is ever placed inside a tile.
      const target = event.target as HTMLElement;
      const tag = target.tagName;
      if (tag === 'TEXTAREA' || target.isContentEditable) return;
      if (tag === 'INPUT' && (target as HTMLInputElement).type !== 'checkbox') return;

      const nextId = resolveTarget(event.key, event.ctrlKey);
      if (!nextId || nextId === effectiveActiveId) return;

      event.preventDefault();

      // Keep the same kind of control focused while moving between tiles.
      const control = (target.closest('[data-tile-control]')?.getAttribute('data-tile-control') ??
        'open') as TileControl;
      const focusControl: TileControl = control === 'remove-tag' || control === 'retry' ? 'open' : control;

      setActiveImageId(nextId);
      focusRequestRef.current = { imageId: nextId, control: focusControl };

      // The target row may be virtualized out; scroll it in and let the post-render effect
      // place focus once it mounts.
      const position = positionById.get(nextId);
      if (position) rowVirtualizer.scrollToIndex(position.row, { align: 'auto' });
    },
    [onOpenImage, resolveTarget, effectiveActiveId, positionById, rowVirtualizer]
  );

  const handleFocusCapture = useCallback((event: React.FocusEvent<HTMLDivElement>) => {
    const tile = (event.target as HTMLElement).closest('[data-image-id]');
    const imageId = tile?.getAttribute('data-image-id');
    if (!imageId) return;
    focusedImageIdRef.current = imageId;
    setActiveImageId((current) => (current === imageId ? current : imageId));
  }, []);

  const handleBlurCapture = useCallback((event: React.FocusEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    // A disconnected target means the virtualizer unmounted the focused tile; keep the id so
    // the effect below can put focus back into the grid instead of letting it fall to <body>.
    if (!target.isConnected) return;
    if (event.relatedTarget && parentRef.current?.contains(event.relatedTarget as Node)) return;
    focusedImageIdRef.current = null;
  }, []);

  // Focus follows the image id, not a DOM position: it lands on the requested tile as soon as
  // the virtualizer mounts it, and falls back to the scroll container when a focused tile is
  // unmounted mid-scroll, so arrow keys keep working.
  useEffect(() => {
    if (!onOpenImage) return;
    const container = parentRef.current;
    if (!container) return;

    const request = focusRequestRef.current;
    if (request) {
      const selector = `[data-image-id="${escapeAttributeValue(request.imageId)}"] [data-tile-control="${request.control}"]`;
      const element = container.querySelector<HTMLElement>(selector);
      if (element) {
        focusRequestRef.current = null;
        focusedImageIdRef.current = request.imageId;
        element.focus();
        return;
      }
    }

    const trackedId = focusedImageIdRef.current;
    if (!trackedId || document.activeElement !== document.body) return;
    const stillMounted = container.querySelector(`[data-image-id="${escapeAttributeValue(trackedId)}"]`);
    if (stillMounted) return;
    container.focus({ preventScroll: true });
  });

  // ---------------------------------------------------------------------------

  const skeletonCount = useMemo(() => {
    if (containerWidth <= 0) return 0;
    const approximateTileWidth = targetRowHeight * 1.33 + spacing;
    return Math.max(1, Math.min(8, Math.floor(containerWidth / approximateTileWidth)));
  }, [containerWidth, targetRowHeight, spacing]);

  return (
    <div
      ref={parentRef}
      className="absolute inset-0 overflow-auto p-3 focus:outline-none"
      tabIndex={onOpenImage ? -1 : undefined}
      role={onOpenImage ? 'group' : undefined}
      aria-label={onOpenImage ? 'Image gallery' : undefined}
      onKeyDown={onOpenImage ? handleKeyDown : undefined}
      onFocusCapture={onOpenImage ? handleFocusCapture : undefined}
      onBlurCapture={onOpenImage ? handleBlurCapture : undefined}
    >
      <div
        style={{
          height: `${rowVirtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {virtualItems.map((virtualRow) => {
          const isLoaderRow = virtualRow.index >= layout.rows.length;

          if (isLoaderRow) {
            return (
              <div
                key="loader"
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: `${virtualRow.size}px`,
                  transform: `translateY(${virtualRow.start}px)`,
                }}
                className="flex items-center justify-center"
              >
                {nextPageError ? (
                  <div
                    role="alert"
                    className="flex flex-col items-center gap-2 text-center px-4"
                  >
                    <p className="flex items-center gap-2 text-sm text-gray-700">
                      <AlertCircle className="w-4 h-4 text-amber-600" />
                      Couldn't load more images. The images already shown are still available.
                    </p>
                    {onRetryNextPage && (
                      <button
                        type="button"
                        onClick={onRetryNextPage}
                        className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
                        style={{ minHeight: 24 }}
                      >
                        <RefreshCw className="w-4 h-4" />
                        Retry loading more
                      </button>
                    )}
                  </div>
                ) : isFetchingNextPage ? (
                  <div className="flex w-full flex-col items-center gap-2">
                    {/* Placeholders occupy the space the incoming row will take */}
                    <div
                      aria-hidden="true"
                      className="flex w-full items-stretch justify-center"
                      style={{ gap: `${spacing}px`, height: `${Math.max(targetRowHeight * 0.5, 40)}px` }}
                    >
                      {Array.from({ length: skeletonCount }, (_, index) => (
                        <div
                          key={index}
                          className={`flex-1 rounded-lg bg-gray-200 ${prefersReducedMotion ? '' : 'animate-pulse'}`}
                          style={{ maxWidth: `${targetRowHeight * 1.33}px` }}
                        />
                      ))}
                    </div>
                    <div role="status" className="flex items-center gap-2 text-gray-500">
                      <Loader2 className={`w-5 h-5 ${prefersReducedMotion ? '' : 'animate-spin'}`} />
                      <span className="text-sm">Loading more...</span>
                    </div>
                  </div>
                ) : null}
              </div>
            );
          }

          const row = layout.rows[virtualRow.index];
          const rowImages = rowImageLists[virtualRow.index] ?? EMPTY_ROW;

          return (
            <JustifiedRow
              key={virtualRow.index}
              top={virtualRow.start}
              row={row}
              images={rowImages}
              selectedImages={selectedImages}
              onToggleImage={onToggleImage}
              onImageDoubleClick={onImageDoubleClick}
              thumbnailSize={thumbnailSize}
              spacing={spacing}
              onRemoveTag={onRemoveTag}
              visibility={visibility}
              categoryColorMap={categoryColorMap}
              shouldShowAnnotation={shouldShowAnnotation}
              onOpenImage={onOpenImage}
              activeImageId={effectiveActiveId}
            />
          );
        })}
      </div>
    </div>
  );
}
