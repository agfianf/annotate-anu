import { motion, useMotionValue, useSpring } from 'framer-motion';
import { useRef, type ReactNode } from 'react';
import { useReducedMotion } from '@/hooks/useReducedMotion';

interface MagneticButtonProps {
  /**
   * Strength of the magnetic effect (0-1)
   * @default 0.3
   */
  strength?: number;

  /**
   * Children to render
   */
  children: ReactNode;

  /**
   * Additional className
   */
  className?: string;

  /**
   * Button props to forward
   */
  [key: string]: any;
}

/**
 * MagneticButton component that subtly follows the cursor
 * Creates a premium, interactive feel for CTA buttons
 * Automatically respects prefers-reduced-motion
 *
 * @example
 * <MagneticButton strength={0.3} className="btn-primary">
 *   Click me
 * </MagneticButton>
 */
export function MagneticButton({
  strength = 0.3,
  children,
  className = '',
  ...props
}: MagneticButtonProps) {
  const ref = useRef<HTMLButtonElement>(null);
  const prefersReducedMotion = useReducedMotion();

  // Motion values for x and y position
  const x = useMotionValue(0);
  const y = useMotionValue(0);

  // Spring physics for smooth, natural movement
  const springConfig = { damping: 20, stiffness: 300 };
  const xSpring = useSpring(x, springConfig);
  const ySpring = useSpring(y, springConfig);

  const handleMouseMove = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (prefersReducedMotion || !ref.current) return;

    const rect = ref.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    const deltaX = (e.clientX - centerX) * strength;
    const deltaY = (e.clientY - centerY) * strength;

    x.set(deltaX);
    y.set(deltaY);
  };

  const handleMouseLeave = () => {
    if (prefersReducedMotion) return;

    x.set(0);
    y.set(0);
  };

  return (
    <motion.button
      ref={ref}
      className={className}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={
        prefersReducedMotion
          ? {}
          : {
              x: xSpring,
              y: ySpring,
            }
      }
      whileHover={prefersReducedMotion ? {} : { scale: 1.02 }}
      whileTap={prefersReducedMotion ? {} : { scale: 0.98 }}
      transition={{ type: 'spring', stiffness: 400, damping: 20 }}
      {...props}
    >
      {children}
    </motion.button>
  );
}
