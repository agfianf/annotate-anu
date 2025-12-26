import { motion, type HTMLMotionProps, type Variants } from 'framer-motion';
import { useMemo } from 'react';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { ANIMATION_TIMINGS, SPRING_CONFIGS } from '@/lib/motion-config';

export interface SlideInProps extends Omit<HTMLMotionProps<'div'>, 'variants'> {
  /**
   * Direction to slide from
   * @default 'left'
   */
  direction?: 'up' | 'down' | 'left' | 'right';

  /**
   * Distance to slide (in pixels)
   * @default 20
   */
  distance?: number;

  /**
   * Delay before animation starts (in seconds)
   * @default 0
   */
  delay?: number;

  /**
   * Duration of the animation (in seconds)
   * @default 0.25
   */
  duration?: number;

  /**
   * Use spring physics for natural motion
   * @default true
   */
  spring?: boolean;

  /**
   * Include fade effect with slide
   * @default true
   */
  fade?: boolean;

  /**
   * Children to render
   */
  children: React.ReactNode;

  /**
   * Custom className
   */
  className?: string;
}

/**
 * SlideIn component for directional entrance animations
 * Automatically respects prefers-reduced-motion
 *
 * @example
 * <SlideIn direction="right" spring>
 *   <div>Sidebar Content</div>
 * </SlideIn>
 */
export function SlideIn({
  direction = 'left',
  distance = 20,
  delay = 0,
  duration = ANIMATION_TIMINGS.standard,
  spring = true,
  fade = true,
  children,
  className,
  ...props
}: SlideInProps) {
  const prefersReducedMotion = useReducedMotion();

  const variants: Variants = useMemo(() => {
    // For reduced motion, only fade
    if (prefersReducedMotion) {
      return {
        hidden: { opacity: 0 },
        visible: { opacity: 1 },
      };
    }

    // Calculate movement based on direction
    const getMovement = () => {
      switch (direction) {
        case 'up':
          return { y: distance };
        case 'down':
          return { y: -distance };
        case 'left':
          return { x: distance };
        case 'right':
          return { x: -distance };
      }
    };

    const movement = getMovement();

    return {
      hidden: {
        ...(fade ? { opacity: 0 } : {}),
        ...movement,
      },
      visible: {
        ...(fade ? { opacity: 1 } : {}),
        y: 0,
        x: 0,
      },
    };
  }, [prefersReducedMotion, direction, distance, fade]);

  const transition = useMemo(() => {
    if (prefersReducedMotion) {
      return {
        duration: 0.01,
        delay,
      };
    }

    if (spring) {
      return {
        ...SPRING_CONFIGS.responsive,
        delay,
      };
    }

    return {
      duration,
      delay,
      ease: [0.4, 0, 0.2, 1], // easeInOut
    };
  }, [prefersReducedMotion, spring, duration, delay]);

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      exit="hidden"
      variants={variants}
      transition={transition}
      className={className}
      {...props}
    >
      {children}
    </motion.div>
  );
}
