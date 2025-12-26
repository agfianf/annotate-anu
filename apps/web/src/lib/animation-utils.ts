/**
 * Utility functions for animations
 * Shared helpers for consistent animations across the app
 */

import type { Variants } from 'framer-motion';
import { ANIMATION_TIMINGS, SPRING_CONFIGS } from './motion-config';

/**
 * Debounce function for animation triggers
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: ReturnType<typeof setTimeout> | null = null;

  return function executedFunction(...args: Parameters<T>) {
    const later = () => {
      timeout = null;
      func(...args);
    };

    if (timeout !== null) {
      clearTimeout(timeout);
    }
    timeout = setTimeout(later, wait);
  };
}

/**
 * Create staggered children variants
 */
export function createStaggerChildren(
  delay: number = 0.05,
  childVariant: 'slideUp' | 'slideLeft' | 'fade' = 'slideUp'
): {
  container: Variants;
  item: Variants;
} {
  const childVariants = {
    slideUp: {
      hidden: { opacity: 0, y: 10 },
      visible: { opacity: 1, y: 0 },
    },
    slideLeft: {
      hidden: { opacity: 0, x: -10 },
      visible: { opacity: 1, x: 0 },
    },
    fade: {
      hidden: { opacity: 0 },
      visible: { opacity: 1 },
    },
  };

  return {
    container: {
      hidden: { opacity: 0 },
      visible: {
        opacity: 1,
        transition: {
          staggerChildren: delay,
          delayChildren: delay,
        },
      },
    },
    item: childVariants[childVariant],
  };
}

/**
 * Create shake animation for errors
 */
export function createShakeAnimation(): Variants {
  return {
    error: {
      x: [-3, 3, -3, 3, 0],
      transition: {
        duration: 0.4,
        ease: 'easeInOut',
      },
    },
    initial: {
      x: 0,
    },
  };
}

/**
 * Create pulse animation for notifications/selections
 */
export function createPulseAnimation(color: string = '#10b981'): Variants {
  return {
    pulse: {
      boxShadow: [
        `0 0 0 0 ${color}70`,
        `0 0 0 10px ${color}00`,
        `0 0 0 0 ${color}70`,
      ],
      transition: {
        duration: 1.5,
        repeat: Infinity,
        ease: 'easeInOut',
      },
    },
    initial: {
      boxShadow: `0 0 0 0 ${color}00`,
    },
  };
}

/**
 * Create scale bounce animation
 */
export function createBouncyScale(
  from: number = 1,
  to: number = 1.1
): Variants {
  return {
    bounce: {
      scale: [from, to, from],
      transition: {
        duration: 0.3,
        times: [0, 0.5, 1],
        ...SPRING_CONFIGS.bouncy,
      },
    },
    initial: {
      scale: from,
    },
  };
}

/**
 * Calculate optimal animation duration based on element dimensions
 */
export function calculateOptimalDuration(
  width: number,
  height: number,
  baseSpeed: number = 500 // pixels per second
): number {
  const distance = Math.sqrt(width ** 2 + height ** 2);
  const duration = distance / baseSpeed;

  // Clamp between 0.15s and 0.5s
  return Math.max(ANIMATION_TIMINGS.micro, Math.min(duration, ANIMATION_TIMINGS.slow));
}

/**
 * Create ripple effect coordinates
 */
export function createRippleEffect(
  event: React.MouseEvent,
  element: HTMLElement
): { x: number; y: number; size: number } {
  const rect = element.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  const size = Math.max(rect.width, rect.height) * 2;

  return { x, y, size };
}

/**
 * Create magnetic button effect
 */
export function createMagneticEffect(
  event: React.MouseEvent,
  element: HTMLElement,
  strength: number = 0.3
): { x: number; y: number } {
  const rect = element.getBoundingClientRect();
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;

  const deltaX = (event.clientX - centerX) * strength;
  const deltaY = (event.clientY - centerY) * strength;

  return { x: deltaX, y: deltaY };
}

/**
 * Check if an element is in viewport
 * Useful for lazy loading animations
 */
export function isInViewport(element: HTMLElement, offset: number = 0): boolean {
  const rect = element.getBoundingClientRect();
  return (
    rect.top >= -offset &&
    rect.left >= -offset &&
    rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) + offset &&
    rect.right <= (window.innerWidth || document.documentElement.clientWidth) + offset
  );
}

/**
 * Create intersection observer for scroll-triggered animations
 */
export function createScrollObserver(
  callback: (entries: IntersectionObserverEntry[]) => void,
  options?: IntersectionObserverInit
): IntersectionObserver {
  const defaultOptions: IntersectionObserverInit = {
    root: null,
    rootMargin: '50px',
    threshold: 0.1,
    ...options,
  };

  return new IntersectionObserver(callback, defaultOptions);
}

/**
 * CSS class names for common animations
 * Use these for performance-critical animations instead of JS
 */
export const CSS_ANIMATIONS = {
  fadeIn: 'animate-fade-in',
  slideUp: 'animate-slide-up',
  slideDown: 'animate-slide-down',
  pulse: 'animate-pulse',
  bounce: 'animate-bounce',
  spin: 'animate-spin',
} as const;

/**
 * Will-change property helper
 * Apply only when needed for performance
 */
export function getWillChange(properties: string[]): string {
  return properties.join(', ');
}

/**
 * Force GPU acceleration
 */
export const GPU_ACCELERATION = {
  transform: 'translateZ(0)',
  backfaceVisibility: 'hidden' as const,
  perspective: 1000,
} as const;
