import { motion, AnimatePresence } from 'framer-motion';
import { useLocation } from 'react-router-dom';
import { type ReactNode } from 'react';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { ANIMATION_TIMINGS } from '@/lib/motion-config';

interface PageTransitionProps {
  /**
   * Children to animate
   */
  children: ReactNode;

  /**
   * Transition mode
   * @default 'fade'
   */
  mode?: 'fade' | 'slide' | 'scale' | 'slide-fade';

  /**
   * Additional className
   */
  className?: string;
}

/**
 * PageTransition component for smooth route transitions
 * Wrap your page content with this component
 * Automatically respects prefers-reduced-motion
 *
 * @example
 * <PageTransition mode="slide-fade">
 *   <YourPage />
 * </PageTransition>
 */
export function PageTransition({ children, mode = 'fade', className = '' }: PageTransitionProps) {
  const location = useLocation();
  const prefersReducedMotion = useReducedMotion();

  const variants = {
    fade: {
      initial: { opacity: 0 },
      animate: { opacity: 1 },
      exit: { opacity: 0 },
    },
    slide: {
      initial: { opacity: 0, x: 20 },
      animate: { opacity: 1, x: 0 },
      exit: { opacity: 0, x: -20 },
    },
    scale: {
      initial: { opacity: 0, scale: 0.95 },
      animate: { opacity: 1, scale: 1 },
      exit: { opacity: 0, scale: 0.95 },
    },
    'slide-fade': {
      initial: { opacity: 0, y: 10 },
      animate: { opacity: 1, y: 0 },
      exit: { opacity: 0, y: -10 },
    },
  };

  const selectedVariants = prefersReducedMotion
    ? {
        initial: { opacity: 0 },
        animate: { opacity: 1 },
        exit: { opacity: 0 },
      }
    : variants[mode];

  const transition = {
    duration: prefersReducedMotion ? 0.01 : ANIMATION_TIMINGS.standard,
    ease: 'easeInOut',
  };

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={location.pathname}
        variants={selectedVariants}
        initial="initial"
        animate="animate"
        exit="exit"
        transition={transition}
        className={className}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
