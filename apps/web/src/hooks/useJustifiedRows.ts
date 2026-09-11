/**
 * Hook to calculate justified layout from images array
 */

import { useMemo } from 'react';
import type { SharedImage } from '../lib/data-management-client';
import {
  calculateJustifiedLayout,
  type ImageDimensions,
} from '../lib/justified-layout';

interface UseJustifiedRowsOptions {
  images: SharedImage[];
  containerWidth: number;
  targetRowHeight: number;
  spacing: number;
}

export interface ImageWithRowInfo extends SharedImage {
  rowIndex: number;
  columnIndex: number;
  scaleFactor: number;
}

export function useJustifiedRows({
  images,
  containerWidth,
  targetRowHeight,
  spacing,
}: UseJustifiedRowsOptions) {
  // Index images by id once per images array so row assembly is O(n), not O(n²)
  const imagesById = useMemo(() => {
    const map = new Map<string, SharedImage>();
    for (const img of images) {
      map.set(img.id, img);
    }
    return map;
  }, [images]);

  const layout = useMemo(() => {
    if (containerWidth === 0 || images.length === 0) {
      return { rows: [], totalHeight: 0 };
    }

    // Convert to ImageDimensions
    const imageDimensions: ImageDimensions[] = images.map((img) => ({
      id: img.id,
      width: img.width || 800, // Fallback width
      height: img.height || 600, // Fallback height
      aspectRatio: img.width && img.height ? img.width / img.height : 1.33,
    }));

    return calculateJustifiedLayout(imageDimensions, {
      containerWidth,
      targetRowHeight,
      spacing,
      lastRowAlignment: 'left',
    });
  }, [images, containerWidth, targetRowHeight, spacing]);

  // Create flat array with row metadata
  const imagesWithRowInfo = useMemo(() => {
    const result: ImageWithRowInfo[] = [];

    layout.rows.forEach((row, rowIndex) => {
      row.images.forEach((imageId, columnIndex) => {
        const image = imagesById.get(imageId);
        if (image) {
          result.push({
            ...image,
            rowIndex,
            columnIndex,
            scaleFactor: row.scaleFactor,
          });
        }
      });
    });

    return result;
  }, [layout, imagesById]);

  return {
    layout,
    imagesWithRowInfo,
  };
}
