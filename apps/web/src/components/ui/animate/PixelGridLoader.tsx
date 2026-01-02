import { motion } from 'framer-motion';
import { useMemo } from 'react';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { ANIMATION_COLORS } from '@/lib/motion-config';

export interface PixelGridLoaderProps {
  /**
   * Number of rows in the grid
   * @default 5
   */
  rows?: number;

  /**
   * Number of columns in the grid
   * @default 5
   */
  cols?: number;

  /**
   * Size of each pixel in pixels
   * @default 8
   */
  pixelSize?: number;

  /**
   * Gap between pixels in pixels
   * @default 4
   */
  gap?: number;

  /**
   * Wave pattern type
   * @default 'diagonal'
   */
  pattern?: 'diagonal' | 'radial' | 'horizontal';

  /**
   * Base color (inactive state)
   * @default 'rgba(16, 185, 129, 0.3)'
   */
  baseColor?: string;

  /**
   * Glow color (active state)
   * @default '#10b981'
   */
  glowColor?: string;

  /**
   * Animation duration for one complete wave in seconds
   * @default 1.5
   */
  duration?: number;

  /**
   * Additional className
   */
  className?: string;
}

/**
 * PixelGridLoader - Animated grid of pulsing pixels
 * Creates a wave effect across a grid of dots for loading states
 * Respects prefers-reduced-motion accessibility setting
 *
 * @example
 * // Basic usage
 * <PixelGridLoader />
 *
 * // Custom grid
 * <PixelGridLoader rows={7} cols={7} pattern="radial" />
 *
 * // With custom colors
 * <PixelGridLoader glowColor="#3B82F6" baseColor="rgba(59, 130, 246, 0.3)" />
 */
export function PixelGridLoader({
  rows = 5,
  cols = 5,
  pixelSize = 8,
  gap = 4,
  pattern = 'diagonal',
  baseColor = 'rgba(16, 185, 129, 0.3)',
  glowColor = ANIMATION_COLORS.primary,
  duration = 1.5,
  className = '',
}: PixelGridLoaderProps) {
  const prefersReducedMotion = useReducedMotion();

  // Generate pixel data with calculated delays
  const pixels = useMemo(() => {
    const result: Array<{ row: number; col: number; delay: number }> = [];
    const maxDiagonal = rows + cols - 2;

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        let delay = 0;

        switch (pattern) {
          case 'diagonal':
            // Top-left to bottom-right wave
            delay = ((row + col) / maxDiagonal) * duration * 0.6;
            break;
          case 'radial':
            // Center outward wave
            const centerRow = (rows - 1) / 2;
            const centerCol = (cols - 1) / 2;
            const distance = Math.sqrt(
              Math.pow(row - centerRow, 2) + Math.pow(col - centerCol, 2)
            );
            const maxDistance = Math.sqrt(
              Math.pow(centerRow, 2) + Math.pow(centerCol, 2)
            );
            delay = (distance / maxDistance) * duration * 0.6;
            break;
          case 'horizontal':
            // Left to right wave
            delay = (col / (cols - 1)) * duration * 0.6;
            break;
        }

        result.push({ row, col, delay });
      }
    }

    return result;
  }, [rows, cols, pattern, duration]);

  // Reduced motion: static grid with subtle appearance
  if (prefersReducedMotion) {
    return (
      <div
        className={`grid ${className}`}
        style={{
          gridTemplateColumns: `repeat(${cols}, ${pixelSize}px)`,
          gap: `${gap}px`,
        }}
      >
        {pixels.map((_, index) => (
          <div
            key={index}
            className="rounded-full"
            style={{
              width: pixelSize,
              height: pixelSize,
              backgroundColor: glowColor,
              opacity: 0.6,
            }}
          />
        ))}
      </div>
    );
  }

  // Full animation
  return (
    <div
      className={`grid ${className}`}
      style={{
        gridTemplateColumns: `repeat(${cols}, ${pixelSize}px)`,
        gap: `${gap}px`,
      }}
    >
      {pixels.map((pixel, index) => (
        <motion.div
          key={index}
          className="rounded-full"
          style={{
            width: pixelSize,
            height: pixelSize,
            backgroundColor: baseColor,
          }}
          animate={{
            backgroundColor: [baseColor, glowColor, baseColor],
            scale: [1, 1.15, 1],
            boxShadow: [
              `0 0 0 0 ${glowColor}00`,
              `0 0 8px 2px ${glowColor}80`,
              `0 0 0 0 ${glowColor}00`,
            ],
          }}
          transition={{
            duration: duration,
            delay: pixel.delay,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />
      ))}
    </div>
  );
}
