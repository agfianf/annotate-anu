import { motion } from 'framer-motion';
import { type ReactNode } from 'react';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { ANIMATION_COLORS } from '@/lib/motion-config';

interface PulseGlowProps {
  /**
   * Whether the glow is active
   */
  active: boolean;

  /**
   * Children to render
   */
  children: ReactNode;

  /**
   * Glow color
   * @default emerald (#10b981)
   */
  color?: string;

  /**
   * Glow intensity (0-1)
   * @default 0.4
   */
  intensity?: number;

  /**
   * Pulse speed (duration in seconds)
   * @default 1.5
   */
  speed?: number;

  /**
   * Additional className
   */
  className?: string;
}

/**
 * PulseGlow component for selection feedback
 * Perfect for selected annotations, active items
 * Automatically respects prefers-reduced-motion
 *
 * @example
 * <PulseGlow active={isSelected} color="#10b981">
 *   <div className="annotation-item">Selected Annotation</div>
 * </PulseGlow>
 */
export function PulseGlow({
  active,
  children,
  color = ANIMATION_COLORS.primary,
  intensity = 0.4,
  speed = 1.5,
  className = '',
}: PulseGlowProps) {
  const prefersReducedMotion = useReducedMotion();

  // Convert hex to rgba
  const hexToRgba = (hex: string, alpha: number) => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  };

  const glowColor = color.startsWith('#') ? hexToRgba(color, intensity) : color;

  const pulseVariants = {
    inactive: {
      boxShadow: `0 0 0 0 ${hexToRgba(color, 0)}`,
    },
    active: {
      boxShadow: [
        `0 0 0 0 ${glowColor}`,
        `0 0 20px 4px ${hexToRgba(color, intensity * 0.7)}`,
        `0 0 0 0 ${glowColor}`,
      ],
    },
  };

  const scaleVariants = {
    inactive: { scale: 1 },
    active: { scale: 1.02 },
  };

  if (prefersReducedMotion) {
    return (
      <div
        className={className}
        style={{
          boxShadow: active ? `0 0 0 2px ${color}` : 'none',
        }}
      >
        {children}
      </div>
    );
  }

  return (
    <motion.div
      className={className}
      variants={pulseVariants}
      animate={active ? 'active' : 'inactive'}
      transition={{
        duration: speed,
        repeat: active ? Infinity : 0,
        ease: 'easeInOut',
      }}
    >
      <motion.div
        variants={scaleVariants}
        animate={active ? 'active' : 'inactive'}
        transition={{ duration: 0.2 }}
      >
        {children}
      </motion.div>
    </motion.div>
  );
}
