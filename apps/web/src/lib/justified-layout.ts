/**
 * Justified layout algorithm for image grids
 * Maintains aspect ratios while ensuring consistent row heights
 */

export interface ImageDimensions {
  id: string;
  width: number;
  height: number;
  aspectRatio: number;
}

export interface LayoutRow {
  images: string[]; // Image IDs
  scaleFactor: number; // How much to scale images to fit width
  height: number; // Computed row height in pixels
}

export interface JustifiedLayoutResult {
  rows: LayoutRow[];
  totalHeight: number;
}

export interface JustifiedLayoutOptions {
  containerWidth: number;
  targetRowHeight: number; // Base height for zoom level
  spacing: number; // Gap between images
  lastRowAlignment?: 'left' | 'justify'; // Default 'left'
  aspectRatioTolerance?: number; // Default 0.02 for aspect ratio fallback
}

/**
 * Calculate justified layout rows from images with aspect ratios.
 *
 * This is a greedy algorithm that:
 * 1. Accumulates images in a row until width is filled
 * 2. Scales images proportionally to fit exact container width
 * 3. Maintains aspect ratios while ensuring consistent row heights
 *
 * @param images - Array of images with dimensions
 * @param options - Layout options
 * @returns Layout result with rows and total height
 */
export function calculateJustifiedLayout(
  images: ImageDimensions[],
  options: JustifiedLayoutOptions
): JustifiedLayoutResult {
  const {
    containerWidth,
    targetRowHeight,
    spacing,
    lastRowAlignment = 'left',
  } = options;

  const rows: LayoutRow[] = [];
  let currentRow: ImageDimensions[] = [];
  let currentRowWidth = 0;

  for (let i = 0; i < images.length; i++) {
    const image = images[i];

    // Fallback for images without dimensions
    const aspectRatio = image.aspectRatio ||
      (image.width && image.height ? image.width / image.height : 1.33);

    // Calculate width this image would take at target height
    const imageWidth = targetRowHeight * aspectRatio;

    // Add to current row
    currentRow.push({ ...image, aspectRatio });
    currentRowWidth += imageWidth;

    // Account for spacing
    const totalSpacing = (currentRow.length - 1) * spacing;
    const rowWidthWithSpacing = currentRowWidth + totalSpacing;

    // Check if row is complete or overfilled
    const isLastImage = i === images.length - 1;
    const shouldFinishRow = rowWidthWithSpacing >= containerWidth || isLastImage;

    if (shouldFinishRow) {
      // Calculate scale factor to fit container width
      let scaleFactor: number;
      let finalHeight: number;

      if (isLastImage && lastRowAlignment === 'left' && rowWidthWithSpacing < containerWidth) {
        // Last row: don't stretch, keep target height
        scaleFactor = 1;
        finalHeight = targetRowHeight;
      } else {
        // Justify: scale to fit exact width
        const availableWidth = containerWidth - totalSpacing;
        scaleFactor = availableWidth / currentRowWidth;
        finalHeight = targetRowHeight * scaleFactor;
      }

      rows.push({
        images: currentRow.map(img => img.id),
        scaleFactor,
        height: finalHeight,
      });

      // Reset for next row
      currentRow = [];
      currentRowWidth = 0;
    }
  }

  // Calculate total height
  const totalHeight = rows.reduce((sum, row, idx) => {
    return sum + row.height + (idx < rows.length - 1 ? spacing : 0);
  }, 0);

  return { rows, totalHeight };
}
