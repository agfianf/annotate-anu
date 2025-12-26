import { motion, type HTMLMotionProps, type Variants } from 'framer-motion';
import { useMemo } from 'react';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { ANIMATION_TIMINGS, SPRING_CONFIGS } from '@/lib/motion-config';

export interface FadeInProps extends Omit<HTMLMotionProps<'div'>, 'variants'> {
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
   * Direction to slide from while fading
   * @default 'up'
   */
  direction?: 'up' | 'down' | 'left' | 'right' | 'none';

  /**
   * Distance to slide (in pixels)
   * @default 10
   */
  distance?: number;

  /**
   * Blur effect during animation
   * @default false
   */
  blur?: boolean;

  /**
   * Use spring physics instead of ease
   * @default false
   */
  spring?: boolean;

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
 * FadeIn component for smooth entrance animations
 * Automatically respects prefers-reduced-motion
 *
 * @example
 * <FadeIn direction="up" delay={0.1}>
 *   <div>Content</div>
 * </FadeIn>
 */
export function FadeIn({
  delay = 0,
  duration = ANIMATION_TIMINGS.standard,
  direction = 'up',
  distance = 10,
  blur = false,
  spring = false,
  children,
  className,
  ...props
}: FadeInProps) {
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
        case 'none':
        default:
          return {};
      }
    };

    const movement = getMovement();
    const blurValue = blur ? 'blur(4px)' : 'blur(0px)';

    return {
      hidden: {
        opacity: 0,
        filter: blur ? blurValue : undefined,
        ...movement,
      },
      visible: {
        opacity: 1,
        filter: blur ? 'blur(0px)' : undefined,
        y: 0,
        x: 0,
      },
    };
  }, [prefersReducedMotion, direction, distance, blur]);

  const transition = useMemo(() => {
    if (prefersReducedMotion) {
      return {
        duration: 0.01,
        delay,
      };
    }

    if (spring) {
      return {
        ...SPRING_CONFIGS.gentle,
        delay,
      };
    }

    return {
      duration,
      delay,
      ease: [0, 0, 0.2, 1], // easeOut
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
