/**
 * Justified row component for image grid
 * Renders a single row with dynamic aspect ratios
 */

import type { VirtualItem } from '@tanstack/react-virtual';
import type { LayoutRow } from '../../lib/justified-layout';
import type { ImageWithRowInfo } from '../../hooks/useJustifiedRows';
import type { VisibilityState } from '../../hooks/useExploreVisibility';
import { ImageThumbnail } from './ImageThumbnail';

interface JustifiedRowProps {
  virtualRow: VirtualItem;
  row: LayoutRow;
  images: ImageWithRowInfo[];
  selectedImages: Set<string>;
  onToggleImage: (id: string) => void;
  onImageDoubleClick: (image: ImageWithRowInfo) => void;
  thumbnailSize: string;
  spacing: number;
  onRemoveTag?: (imageId: string, tagId: string) => void;
  /** Optional visibility state for filtering displayed tags */
  visibility?: VisibilityState;
  /** Map of category_id to category color for thumbnail tag borders */
  categoryColorMap?: Record<string, string>;
  /** Optional filter function for annotation confidence filtering */
  shouldShowAnnotation?: (labelId?: string, confidence?: number) => boolean;
}

export function JustifiedRow({
  virtualRow,
  row,
  images,
  selectedImages,
  onToggleImage,
  onImageDoubleClick,
  thumbnailSize,
  spacing,
  onRemoveTag,
  visibility,
  categoryColorMap,
  shouldShowAnnotation,
}: JustifiedRowProps) {
  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: `${row.height}px`,
        transform: `translateY(${virtualRow.start}px)`,
        display: 'flex',
        gap: `${spacing}px`,
        paddingBottom: `${spacing}px`,
      }}
    >
      {images.map((image) => {
        const aspectRatio = image.width && image.height
          ? image.width / image.height
          : 1.33;
        const width = row.height * aspectRatio;

        return (
          <ImageThumbnail
            key={image.id}
            image={image}
            isSelected={selectedImages.has(image.id)}
            onToggle={() => onToggleImage(image.id)}
            onDoubleClick={() => onImageDoubleClick(image)}
            thumbnailSize={thumbnailSize}
            style={{
              width: `${width}px`,
              height: `${row.height}px`,
              flexShrink: 0,
            }}
            onRemoveTag={onRemoveTag ? (tagId: string) => onRemoveTag(image.id, tagId) : undefined}
            visibility={visibility}
            categoryColorMap={categoryColorMap}
            shouldShowAnnotation={shouldShowAnnotation}
          />
        );
      })}
    </div>
  );
}
