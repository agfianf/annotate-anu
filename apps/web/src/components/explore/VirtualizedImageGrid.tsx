/**
 * Virtualized image grid using TanStack Virtual with justified layout
 * Renders only visible rows for smooth performance with 10,000+ images
 */

import { useRef, useEffect, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Loader2 } from 'lucide-react';
import type { SharedImage } from '../../lib/data-management-client';
import { useJustifiedRows } from '../../hooks/useJustifiedRows';
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
}

export function VirtualizedImageGrid({
  images,
  selectedImages,
  onToggleImage,
  onImageDoubleClick,
  targetRowHeight,
  thumbnailSize,
  spacing = 12,
  hasNextPage,
  isFetchingNextPage,
  fetchNextPage,
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

  // Calculate justified layout
  const { layout, imagesWithRowInfo } = useJustifiedRows({
    images,
    containerWidth,
    targetRowHeight,
    spacing,
  });

  // TanStack Virtual with dynamic row heights
  const rowVirtualizer = useVirtualizer({
    count: layout.rows.length + (hasNextPage ? 1 : 0),
    getScrollElement: () => parentRef.current,
    estimateSize: (index) => {
      if (index >= layout.rows.length) return 100; // Loader row
      return layout.rows[index].height + spacing;
    },
    overscan: 2,
  });

  // Remeasure virtualizer when layout changes (container resize, zoom change)
  useEffect(() => {
    rowVirtualizer.measure();
  }, [layout, rowVirtualizer]);

  // Infinite scroll trigger
  useEffect(() => {
    const virtualItems = rowVirtualizer.getVirtualItems();
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
    rowVirtualizer.getVirtualItems(),
    layout.rows.length,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  ]);

  return (
    <div
      ref={parentRef}
      className="flex-1 overflow-auto p-3"
      style={{ contain: 'strict', minHeight: 0 }}
    >
      <div
        style={{
          height: `${rowVirtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {rowVirtualizer.getVirtualItems().map((virtualRow) => {
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
            />
          );
        })}
      </div>
    </div>
  );
}
