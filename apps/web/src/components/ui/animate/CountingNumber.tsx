import { motion, useSpring, useTransform, type SpringOptions } from 'framer-motion';
import { useEffect } from 'react';
import { useReducedMotion } from '@/hooks/useReducedMotion';

interface CountingNumberProps {
  /**
   * The target number to count to
   */
  value: number;

  /**
   * Starting value
   * @default 0
   */
  from?: number;

  /**
   * Duration of the animation in seconds
   * @default 1.5
   */
  duration?: number;

  /**
   * Number of decimal places
   * @default 0
   */
  decimals?: number;

  /**
   * Prefix (e.g., "$", "#")
   */
  prefix?: string;

  /**
   * Suffix (e.g., "%", "K", "M")
   */
  suffix?: string;

  /**
   * Enable number formatting with commas
   * @default true
   */
  formatNumber?: boolean;

  /**
   * Additional className
   */
  className?: string;

  /**
   * Custom spring configuration
   */
  springConfig?: SpringOptions;
}

/**
 * CountingNumber component with smooth counting animation
 * Perfect for dashboard stats and metrics
 * Automatically respects prefers-reduced-motion
 *
 * @example
 * <CountingNumber value={1234} prefix="$" suffix="K" decimals={1} />
 * // Result: $1.2K (animated from 0 to 1234)
 */
export function CountingNumber({
  value,
  from = 0,
  duration = 1.5,
  decimals = 0,
  prefix = '',
  suffix = '',
  formatNumber = true,
  className = '',
  springConfig,
}: CountingNumberProps) {
  const prefersReducedMotion = useReducedMotion();

  // Spring animation for smooth counting
  const spring = useSpring(from, {
    stiffness: 100,
    damping: 30,
    duration: prefersReducedMotion ? 0 : duration * 1000,
    ...springConfig,
  });

  // Transform the spring value to a formatted string
  const display = useTransform(spring, (latest) => {
    const num = latest.toFixed(decimals);
    const formatted = formatNumber
      ? parseFloat(num).toLocaleString('en-US', {
          minimumFractionDigits: decimals,
          maximumFractionDigits: decimals,
        })
      : num;
    return `${prefix}${formatted}${suffix}`;
  });

  useEffect(() => {
    spring.set(value);
  }, [spring, value]);

  return <motion.span className={className}>{display}</motion.span>;
}
