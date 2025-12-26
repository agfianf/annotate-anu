import { motion } from 'framer-motion';
import { useEffect, useState, type ReactNode } from 'react';
import { useReducedMotion } from '@/hooks/useReducedMotion';

interface ShakeErrorProps {
  /**
   * Trigger the shake animation when this changes to true
   */
  trigger?: boolean;

  /**
   * Children to animate
   */
  children: ReactNode;

  /**
   * Additional className
   */
  className?: string;
}

/**
 * ShakeError component that shakes on error
 * Automatically respects prefers-reduced-motion
 *
 * @example
 * <ShakeError trigger={hasError}>
 *   <Input error={hasError} />
 * </ShakeError>
 */
export function ShakeError({ trigger = false, children, className = '' }: ShakeErrorProps) {
  const [isShaking, setIsShaking] = useState(false);
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    if (trigger && !prefersReducedMotion) {
      setIsShaking(true);
      const timeout = setTimeout(() => setIsShaking(false), 400);
      return () => clearTimeout(timeout);
    }
  }, [trigger, prefersReducedMotion]);

  const shakeVariants = {
    shake: {
      x: [-4, 4, -4, 4, 0],
      transition: {
        duration: 0.4,
        ease: 'easeInOut',
      },
    },
    static: {
      x: 0,
    },
  };

  if (prefersReducedMotion) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      className={className}
      animate={isShaking ? 'shake' : 'static'}
      variants={shakeVariants}
    >
      {children}
    </motion.div>
  );
}
