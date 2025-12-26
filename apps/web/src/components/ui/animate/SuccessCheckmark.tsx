import { motion, AnimatePresence } from 'framer-motion';
import { Check } from 'lucide-react';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { SPRING_CONFIGS } from '@/lib/motion-config';

interface SuccessCheckmarkProps {
  /**
   * Show the checkmark
   */
  show: boolean;

  /**
   * Size of the checkmark
   * @default 'md'
   */
  size?: 'sm' | 'md' | 'lg';

  /**
   * Color variant
   * @default 'emerald'
   */
  variant?: 'emerald' | 'green' | 'blue';

  /**
   * Additional className
   */
  className?: string;
}

/**
 * SuccessCheckmark component with bouncy entrance animation
 * Automatically respects prefers-reduced-motion
 *
 * @example
 * <SuccessCheckmark show={isValid} size="md" />
 */
export function SuccessCheckmark({
  show,
  size = 'md',
  variant = 'emerald',
  className = '',
}: SuccessCheckmarkProps) {
  const prefersReducedMotion = useReducedMotion();

  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-5 h-5',
    lg: 'w-6 h-6',
  };

  const colorClasses = {
    emerald: 'text-emerald-600',
    green: 'text-green-600',
    blue: 'text-blue-600',
  };

  const checkmarkVariants = prefersReducedMotion
    ? {
        hidden: { opacity: 0 },
        visible: { opacity: 1 },
        exit: { opacity: 0 },
      }
    : {
        hidden: { scale: 0, rotate: -180, opacity: 0 },
        visible: { scale: 1, rotate: 0, opacity: 1 },
        exit: { scale: 0, rotate: 180, opacity: 0 },
      };

  const transition = prefersReducedMotion ? { duration: 0.01 } : SPRING_CONFIGS.bouncy;

  return (
    <AnimatePresence mode="wait">
      {show && (
        <motion.div
          variants={checkmarkVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
          transition={transition}
          className={className}
        >
          <Check className={`${sizeClasses[size]} ${colorClasses[variant]}`} />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
