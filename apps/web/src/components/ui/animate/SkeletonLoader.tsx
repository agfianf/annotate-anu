import { motion } from 'framer-motion';
import { useReducedMotion } from '@/hooks/useReducedMotion';

interface SkeletonLoaderProps {
  /**
   * Width of the skeleton
   */
  width?: string | number;

  /**
   * Height of the skeleton
   */
  height?: string | number;

  /**
   * Border radius
   * @default 'rounded-md'
   */
  rounded?: string;

  /**
   * Animation type
   * @default 'shimmer'
   */
  animation?: 'shimmer' | 'pulse' | 'wave';

  /**
   * Base color
   * @default 'bg-gray-200'
   */
  baseColor?: string;

  /**
   * Highlight color
   * @default emerald tint
   */
  highlightColor?: string;

  /**
   * Number of lines (for text skeleton)
   */
  lines?: number;

  /**
   * Additional className
   */
  className?: string;
}

/**
 * SkeletonLoader component for loading states
 * Beautiful shimmer effect with emerald theme
 * Automatically respects prefers-reduced-motion
 *
 * @example
 * // Single skeleton
 * <SkeletonLoader width="100%" height={40} />
 *
 * // Text skeleton (multiple lines)
 * <SkeletonLoader lines={3} />
 *
 * // Card skeleton
 * <SkeletonLoader width={300} height={200} rounded="rounded-xl" />
 */
export function SkeletonLoader({
  width = '100%',
  height = 20,
  rounded = 'rounded-md',
  animation = 'shimmer',
  baseColor = 'bg-gray-200',
  highlightColor = 'rgba(16, 185, 129, 0.1)',
  lines,
  className = '',
}: SkeletonLoaderProps) {
  const prefersReducedMotion = useReducedMotion();

  // If multiple lines, render a text skeleton
  if (lines) {
    return (
      <div className={`space-y-2 ${className}`}>
        {Array.from({ length: lines }).map((_, i) => (
          <SkeletonLoader
            key={i}
            width={i === lines - 1 ? '70%' : '100%'}
            height={height}
            rounded={rounded}
            animation={animation}
            baseColor={baseColor}
            highlightColor={highlightColor}
          />
        ))}
      </div>
    );
  }

  const shimmerVariants = {
    animate: {
      backgroundPosition: ['200% 0', '-200% 0'],
      transition: {
        duration: prefersReducedMotion ? 0 : 2,
        repeat: Infinity,
        ease: 'linear',
      },
    },
  };

  const pulseVariants = {
    animate: {
      opacity: [0.5, 1, 0.5],
      transition: {
        duration: prefersReducedMotion ? 0 : 1.5,
        repeat: Infinity,
        ease: 'easeInOut',
      },
    },
  };

  const waveVariants = {
    animate: {
      scale: [1, 1.02, 1],
      opacity: [0.7, 1, 0.7],
      transition: {
        duration: prefersReducedMotion ? 0 : 1.5,
        repeat: Infinity,
        ease: 'easeInOut',
      },
    },
  };

  const getVariants = () => {
    if (prefersReducedMotion) {
      return {};
    }
    switch (animation) {
      case 'pulse':
        return pulseVariants;
      case 'wave':
        return waveVariants;
      case 'shimmer':
      default:
        return shimmerVariants;
    }
  };

  const style: React.CSSProperties = {
    width: typeof width === 'number' ? `${width}px` : width,
    height: typeof height === 'number' ? `${height}px` : height,
  };

  if (animation === 'shimmer' && !prefersReducedMotion) {
    style.background = `linear-gradient(90deg, transparent, ${highlightColor}, transparent)`;
    style.backgroundSize = '200% 100%';
  }

  return (
    <motion.div
      className={`${baseColor} ${rounded} ${className}`}
      style={style}
      variants={getVariants()}
      animate="animate"
    />
  );
}

/**
 * Preset skeleton components
 */
export function SkeletonCard({ className = '' }: { className?: string }) {
  return (
    <div className={`glass p-6 rounded-xl ${className}`}>
      <SkeletonLoader width="60%" height={24} className="mb-4" />
      <SkeletonLoader lines={3} height={16} className="mb-4" />
      <div className="flex gap-2">
        <SkeletonLoader width={80} height={32} rounded="rounded-lg" />
        <SkeletonLoader width={80} height={32} rounded="rounded-lg" />
      </div>
    </div>
  );
}

export function SkeletonImage({ className = '' }: { className?: string }) {
  return (
    <SkeletonLoader
      width="100%"
      height={200}
      rounded="rounded-xl"
      animation="wave"
      className={className}
    />
  );
}

export function SkeletonAvatar({ size = 40, className = '' }: { size?: number; className?: string }) {
  return (
    <SkeletonLoader
      width={size}
      height={size}
      rounded="rounded-full"
      animation="pulse"
      className={className}
    />
  );
}
