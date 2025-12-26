import { motion } from 'framer-motion';
import { useState, type ReactNode } from 'react';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { SPRING_CONFIGS } from '@/lib/motion-config';

interface ImageZoomProps {
  /**
   * Children (typically an img element)
   */
  children: ReactNode;

  /**
   * Zoom scale on hover
   * @default 1.05
   */
  scale?: number;

  /**
   * Enable shadow increase on hover
   * @default true
   */
  shadow?: boolean;

  /**
   * Border radius
   * @default 'rounded-lg'
   */
  rounded?: string;

  /**
   * Additional className
   */
  className?: string;

  /**
   * Callback when clicked
   */
  onClick?: () => void;
}

/**
 * ImageZoom component with smooth zoom on hover
 * Perfect for image galleries and thumbnails
 * Automatically respects prefers-reduced-motion
 *
 * @example
 * <ImageZoom scale={1.1} shadow>
 *   <img src="image.jpg" alt="Gallery item" />
 * </ImageZoom>
 */
export function ImageZoom({
  children,
  scale = 1.05,
  shadow = true,
  rounded = 'rounded-lg',
  className = '',
  onClick,
}: ImageZoomProps) {
  const [isHovered, setIsHovered] = useState(false);
  const prefersReducedMotion = useReducedMotion();

  const hoverVariants = prefersReducedMotion
    ? {}
    : {
        scale,
        y: -4,
      };

  const shadowClass = shadow && isHovered && !prefersReducedMotion
    ? 'shadow-2xl shadow-emerald-500/10'
    : 'shadow-lg';

  return (
    <motion.div
      className={`relative overflow-hidden ${rounded} ${shadowClass} transition-shadow duration-300 ${
        onClick ? 'cursor-pointer' : ''
      } ${className}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={onClick}
      whileHover={hoverVariants}
      whileTap={prefersReducedMotion ? {} : { scale: scale - 0.02 }}
      transition={prefersReducedMotion ? {} : SPRING_CONFIGS.responsive}
      style={{
        willChange: isHovered ? 'transform, box-shadow' : 'auto',
      }}
    >
      {children}

      {/* Hover overlay */}
      {isHovered && !prefersReducedMotion && (
        <motion.div
          className="absolute inset-0 bg-gradient-to-t from-black/10 to-transparent pointer-events-none"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        />
      )}
    </motion.div>
  );
}
