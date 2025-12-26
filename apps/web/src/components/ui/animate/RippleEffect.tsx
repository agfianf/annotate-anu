import { motion, AnimatePresence } from 'framer-motion';
import { useState, useCallback } from 'react';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { createRippleEffect } from '@/lib/animation-utils';

interface Ripple {
  id: number;
  x: number;
  y: number;
  size: number;
}

interface RippleEffectProps {
  /**
   * Color of the ripple effect
   * @default 'rgba(16, 185, 129, 0.5)' (emerald)
   */
  color?: string;

  /**
   * Duration of the ripple animation in seconds
   * @default 0.6
   */
  duration?: number;

  /**
   * Children to render (button content)
   */
  children: React.ReactNode;

  /**
   * Additional className for the wrapper
   */
  className?: string;

  /**
   * onClick handler
   */
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;

  /**
   * Button props to forward
   */
  [key: string]: any;
}

/**
 * RippleEffect component adds a Material Design-style ripple effect to buttons
 * Automatically respects prefers-reduced-motion
 *
 * @example
 * <RippleEffect color="rgba(16, 185, 129, 0.5)">
 *   <button>Click me</button>
 * </RippleEffect>
 */
export function RippleEffect({
  color = 'rgba(16, 185, 129, 0.5)',
  duration = 0.6,
  children,
  className = '',
  onClick,
  ...props
}: RippleEffectProps) {
  const [ripples, setRipples] = useState<Ripple[]>();
  const prefersReducedMotion = useReducedMotion();

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      // Skip ripple effect if reduced motion is preferred
      if (prefersReducedMotion) {
        onClick?.(e);
        return;
      }

      const button = e.currentTarget;
      const rippleData = createRippleEffect(e, button);

      const newRipple: Ripple = {
        id: Date.now(),
        x: rippleData.x,
        y: rippleData.y,
        size: rippleData.size,
      };

      setRipples((prev) => [...(prev || []), newRipple]);

      // Remove ripple after animation completes
      setTimeout(() => {
        setRipples((prev) => (prev || []).filter((r) => r.id !== newRipple.id));
      }, duration * 1000);

      onClick?.(e);
    },
    [onClick, duration, prefersReducedMotion]
  );

  return (
    <button
      className={`relative overflow-hidden ${className}`}
      onClick={handleClick}
      {...props}
    >
      {children}

      <AnimatePresence>
        {ripples?.map((ripple) => (
          <motion.span
            key={ripple.id}
            className="absolute rounded-full pointer-events-none"
            style={{
              left: ripple.x - ripple.size / 2,
              top: ripple.y - ripple.size / 2,
              width: ripple.size,
              height: ripple.size,
              backgroundColor: color,
            }}
            initial={{ scale: 0, opacity: 1 }}
            animate={{ scale: 1, opacity: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration, ease: 'easeOut' }}
          />
        ))}
      </AnimatePresence>
    </button>
  );
}
