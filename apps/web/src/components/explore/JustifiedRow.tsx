/**
 * Justified row component for image grid
 * Renders a single row with dynamic aspect ratios
 */

import { memo, useCallback, useMemo } from 'react';
import type { LayoutRow } from '../../lib/justified-layout';
import type { ImageWithRowInfo } from '../../hooks/useJustifiedRows';
import type { VisibilityState } from '../../hooks/useExploreVisibility';
import { ImageThumbnail } from './ImageThumbnail';

interface JustifiedRowProps {
  /** Vertical offset of the row inside the virtualized container (px) */
  top: number;
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

interface RowThumbnailProps {
  image: ImageWithRowInfo;
  width: number;
  height: number;
  isSelected: boolean;
  onToggleImage: (id: string) => void;
  onImageDoubleClick: (image: ImageWithRowInfo) => void;
  thumbnailSize: string;
  onRemoveTag?: (imageId: string, tagId: string) => void;
  visibility?: VisibilityState;
  categoryColorMap?: Record<string, string>;
  shouldShowAnnotation?: (labelId?: string, confidence?: number) => boolean;
}

/**
 * Per-image adapter that binds the row-level callbacks to one image id with
 * stable references, so the memoized ImageThumbnail below it only re-renders
 * when its own inputs change.
 */
const RowThumbnail = memo(function RowThumbnail({
  image,
  width,
  height,
  isSelected,
  onToggleImage,
  onImageDoubleClick,
  thumbnailSize,
  onRemoveTag,
  visibility,
  categoryColorMap,
  shouldShowAnnotation,
}: RowThumbnailProps) {
  const imageId = image.id;

  const handleToggle = useCallback(() => {
    onToggleImage(imageId);
  }, [onToggleImage, imageId]);

  const handleDoubleClick = useCallback(() => {
    onImageDoubleClick(image);
  }, [onImageDoubleClick, image]);

  const handleRemoveTag = useMemo(() => {
    if (!onRemoveTag) return undefined;
    return (tagId: string) => onRemoveTag(imageId, tagId);
  }, [onRemoveTag, imageId]);

  const style = useMemo<React.CSSProperties>(
    () => ({
      width: `${width}px`,
      height: `${height}px`,
      flexShrink: 0,
    }),
    [width, height]
  );

  return (
    <ImageThumbnail
      image={image}
      isSelected={isSelected}
      onToggle={handleToggle}
      onDoubleClick={handleDoubleClick}
      thumbnailSize={thumbnailSize}
      style={style}
      onRemoveTag={handleRemoveTag}
      visibility={visibility}
      categoryColorMap={categoryColorMap}
      shouldShowAnnotation={shouldShowAnnotation}
    />
  );
});

export const JustifiedRow = memo(function JustifiedRow({
  top,
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
  const rowStyle = useMemo<React.CSSProperties>(
    () => ({
      position: 'absolute',
      top: 0,
      left: 0,
      width: '100%',
      height: `${row.height}px`,
      transform: `translateY(${top}px)`,
      display: 'flex',
      gap: `${spacing}px`,
      paddingBottom: `${spacing}px`,
    }),
    [row.height, top, spacing]
  );

  return (
    <div style={rowStyle}>
      {images.map((image) => {
        const aspectRatio = image.width && image.height
          ? image.width / image.height
          : 1.33;
        const width = row.height * aspectRatio;

        return (
          <RowThumbnail
            key={image.id}
            image={image}
            width={width}
            height={row.height}
            isSelected={selectedImages.has(image.id)}
            onToggleImage={onToggleImage}
            onImageDoubleClick={onImageDoubleClick}
            thumbnailSize={thumbnailSize}
            onRemoveTag={onRemoveTag}
            visibility={visibility}
            categoryColorMap={categoryColorMap}
            shouldShowAnnotation={shouldShowAnnotation}
          />
        );
      })}
    </div>
  );
});
