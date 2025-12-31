/**
 * Virtualized image grid using TanStack Virtual with justified layout
 * Renders only visible rows for smooth performance with 10,000+ images
 */

import { useVirtualizer } from '@tanstack/react-virtual';
import { Loader2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { VisibilityState } from '../../hooks/useExploreVisibility';
import { useJustifiedRows } from '../../hooks/useJustifiedRows';
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
}: VirtualizedImageGridProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);

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
      if (index >= layout.rows.length) return 100; // Loader row
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

  // Infinite scroll trigger
  useEffect(() => {
    const lastItem = virtualItems[virtualItems.length - 1];

    if (
      lastItem &&
      lastItem.index >= layout.rows.length - 2 &&
      hasNextPage &&
      !isFetchingNextPage
    ) {
      fetchNextPage();
    }
  }, [
    virtualItems.length, // Use length instead of calling getVirtualItems() in dependency
    layout.rows.length,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  ]);

  return (
    <div
      ref={parentRef}
      className="absolute inset-0 overflow-auto p-3"
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
                {isFetchingNextPage && (
                  <div className="flex items-center gap-2 text-gray-500">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span className="text-sm">Loading more...</span>
                  </div>
                )}
              </div>
            );
          }

          const row = layout.rows[virtualRow.index];
          const rowImages = row.images
            .map((id) => imagesWithRowInfo.find((img) => img.id === id))
            .filter(Boolean) as typeof imagesWithRowInfo;

          return (
            <JustifiedRow
              key={virtualRow.index}
              virtualRow={virtualRow}
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
            />
          );
        })}
      </div>
    </div>
  );
}
