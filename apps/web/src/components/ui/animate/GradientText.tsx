import { motion } from 'framer-motion';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { type ReactNode } from 'react';

interface GradientTextProps {
  /**
   * Children text to render
   */
  children: ReactNode;

  /**
   * Gradient direction
   * @default 'to-r'
   */
  direction?: 'to-r' | 'to-l' | 'to-b' | 'to-t' | 'to-br' | 'to-bl';

  /**
   * Color scheme
   * @default 'emerald'
   */
  colors?: 'emerald' | 'emerald-chartreuse' | 'rainbow' | 'sunset';

  /**
   * Animate the gradient
   * @default false
   */
  animate?: boolean;

  /**
   * Additional className
   */
  className?: string;

  /**
   * HTML tag to use
   * @default 'span'
   */
  as?: 'span' | 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'p';
}

/**
 * GradientText component for eye-catching text with gradient effects
 * Perfect for headings, CTAs, and hero sections
 * Automatically respects prefers-reduced-motion
 *
 * @example
 * <GradientText colors="emerald-chartreuse" as="h1" animate>
 *   Beautiful Gradient Text
 * </GradientText>
 */
export function GradientText({
  children,
  direction = 'to-r',
  colors = 'emerald',
  animate = false,
  className = '',
  as: Component = 'span',
}: GradientTextProps) {
  const prefersReducedMotion = useReducedMotion();

  const gradientClasses = {
    emerald: 'from-emerald-600 via-emerald-500 to-emerald-400',
    'emerald-chartreuse': 'from-emerald-600 via-emerald-400 to-chartreuse-500',
    rainbow: 'from-purple-600 via-pink-500 to-red-500',
    sunset: 'from-orange-600 via-red-500 to-pink-500',
  };

  const directionClass = `bg-gradient-${direction}`;
  const gradientClass = gradientClasses[colors];

  const baseClasses = `${directionClass} ${gradientClass} bg-clip-text text-transparent font-bold`;

  if (animate && !prefersReducedMotion) {
    return (
      <motion.div
        className={`${baseClasses} ${className}`}
        style={{
          backgroundSize: '200% auto',
        }}
        animate={{
          backgroundPosition: ['0% center', '100% center', '0% center'],
        }}
        transition={{
          duration: 3,
          repeat: Infinity,
          ease: 'linear',
        }}
      >
        <Component>{children}</Component>
      </motion.div>
    );
  }

  const MotionComponent = motion[Component as keyof typeof motion] as any;

  return <MotionComponent className={`${baseClasses} ${className}`}>{children}</MotionComponent>;
}
