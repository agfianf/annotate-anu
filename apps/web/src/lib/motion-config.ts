/**
 * Motion configuration for animation system
 * Centralized animation settings with emerald theme colors
 */

import type { Transition, Variants } from 'framer-motion';

/**
 * Theme colors for animations (Emerald theme)
 */
export const ANIMATION_COLORS = {
  primary: '#10b981', // Emerald green
  secondary: '#9ABA12', // Chartreuse
  accent: '#37520B', // Forest green
  error: '#EF4444', // Soft red
  success: 'rgba(16, 185, 129, 0.3)', // Emerald with opacity
} as const;

/**
 * Standard animation timing configurations
 */
export const ANIMATION_TIMINGS = {
  micro: 0.15, // 150ms - button clicks, hovers
  quick: 0.2, // 200ms - quick transitions
  standard: 0.25, // 250ms - modals, dropdowns
  moderate: 0.35, // 350ms - component transitions
  slow: 0.5, // 500ms - page transitions
  celebration: 1.2, // 1200ms - success states, particles
} as const;

/**
 * Spring physics presets for natural motion
 */
export const SPRING_CONFIGS = {
  // Gentle spring for smooth entries
  gentle: {
    type: 'spring' as const,
    stiffness: 300,
    damping: 25,
  },

  // Responsive spring for interactive elements
  responsive: {
    type: 'spring' as const,
    stiffness: 400,
    damping: 20,
  },

  // Bouncy spring for playful effects
  bouncy: {
    type: 'spring' as const,
    stiffness: 500,
    damping: 15,
  },

  // Stiff spring for quick snappy animations
  snappy: {
    type: 'spring' as const,
    stiffness: 500,
    damping: 30,
  },
} as const;

/**
 * Easing function presets
 * These are cubic bezier curves for smooth animations
 */
export const EASINGS = {
  easeIn: [0.4, 0, 1, 1] as [number, number, number, number],
  easeOut: [0, 0, 0.2, 1] as [number, number, number, number],
  easeInOut: [0.4, 0, 0.2, 1] as [number, number, number, number],
  smooth: [0.25, 0.1, 0.25, 1] as [number, number, number, number],
} as const;

/**
 * Common animation variants
 */
export const COMMON_VARIANTS = {
  // Fade animations
  fade: {
    hidden: { opacity: 0 },
    visible: { opacity: 1 },
    exit: { opacity: 0 },
  },

  // Fade with scale
  fadeScale: {
    hidden: { opacity: 0, scale: 0.95 },
    visible: { opacity: 1, scale: 1 },
    exit: { opacity: 0, scale: 0.95 },
  },

  // Slide from bottom
  slideUp: {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: 10 },
  },

  // Slide from top
  slideDown: {
    hidden: { opacity: 0, y: -20 },
    visible: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -10 },
  },

  // Slide from right
  slideLeft: {
    hidden: { opacity: 0, x: 20 },
    visible: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: -20 },
  },

  // Slide from left
  slideRight: {
    hidden: { opacity: 0, x: -20 },
    visible: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: 20 },
  },

  // Scale with blur (for modals)
  modalEntry: {
    hidden: { opacity: 0, scale: 0.92 },
    visible: { opacity: 1, scale: 1 },
    exit: { opacity: 0, scale: 0.95 },
  },
} as const;

/**
 * Stagger configuration for list animations
 */
export const STAGGER_CONFIGS = {
  // Subtle stagger for lists
  subtle: {
    staggerChildren: 0.03,
    delayChildren: 0.02,
  },

  // Standard stagger for cards
  standard: {
    staggerChildren: 0.05,
    delayChildren: 0.05,
  },

  // Noticeable stagger for dashboards
  noticeable: {
    staggerChildren: 0.1,
    delayChildren: 0.1,
  },
} as const;

/**
 * Create a transition with reduced motion support
 */
export function createTransition(
  transition: Transition,
  prefersReducedMotion: boolean
): Transition {
  if (prefersReducedMotion) {
    // For reduced motion, use instant or very quick fade
    return {
      duration: 0.01,
      ease: 'linear',
    };
  }
  return transition;
}

/**
 * Create variants with reduced motion support
 */
export function createVariants(
  variants: Variants,
  prefersReducedMotion: boolean
): Variants {
  if (prefersReducedMotion) {
    // For reduced motion, only animate opacity
    return {
      hidden: { opacity: 0 },
      visible: { opacity: 1 },
      exit: { opacity: 0 },
    };
  }
  return variants;
}

/**
 * Get appropriate animation duration based on distance
 * Farther elements take slightly longer to animate
 */
export function getDistanceBasedDuration(
  distance: number,
  baseDistance: number = 100,
  baseDuration: number = ANIMATION_TIMINGS.standard
): number {
  const ratio = Math.min(distance / baseDistance, 2);
  return baseDuration * (0.7 + ratio * 0.3);
}
