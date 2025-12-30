import { AnimatePresence, motion } from 'framer-motion';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { Scan } from 'lucide-react';

interface LoadingScreenProps {
  /**
   * Controls visibility of the loading screen
   */
  isVisible: boolean;

  /**
   * Main loading message (e.g., "Loading annotations for image 5 of 150...")
   */
  message: string;

  /**
   * Current progress count
   */
  current: number;

  /**
   * Total items count
   */
  total: number;

  /**
   * Progress percentage (0-100)
   */
  percentage: number;

  /**
   * Optional nested progress for sub-operations
   */
  subProgress?: {
    message: string;
    current: number;
    total: number;
  };
}

/**
 * LoadingScreen Component
 *
 * Full-screen loading overlay with AI vision scanning grid animation.
 * Features:
 * - Scanning grid effect with emerald theme
 * - Pulsing corner dots with emerald glow
 * - Glass morphism design
 * - Detailed progress display with percentage
 * - Respects prefers-reduced-motion for accessibility
 *
 * @example
 * <LoadingScreen
 *   isVisible={isLoading}
 *   message="Loading annotations for image 5 of 150..."
 *   current={5}
 *   total={150}
 *   percentage={3}
 * />
 */
export function LoadingScreen({
  isVisible,
  message,
  current,
  total,
  percentage,
  subProgress,
}: LoadingScreenProps) {
  const prefersReducedMotion = useReducedMotion();

  // Animation variants
  const backdropVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { duration: prefersReducedMotion ? 0.01 : 0.3 }
    },
    exit: {
      opacity: 0,
      transition: { duration: prefersReducedMotion ? 0.01 : 0.3 }
    }
  };

  const containerVariants = {
    hidden: { opacity: 0, scale: 0.95 },
    visible: {
      opacity: 1,
      scale: 1,
      transition: {
        duration: prefersReducedMotion ? 0.01 : 0.4,
        ease: 'easeOut'
      }
    },
    exit: {
      opacity: 0,
      scale: 0.95,
      transition: { duration: prefersReducedMotion ? 0.01 : 0.2 }
    }
  };

  // Scanning line animation
  const scanLineVariants = prefersReducedMotion
    ? {}
    : {
        initial: { y: '0%', opacity: 0 },
        animate: {
          y: ['0%', '100%'],
          opacity: [0, 1, 1, 0],
          transition: {
            duration: 2.5,
            repeat: Infinity,
            ease: 'easeInOut'
          }
        }
      };

  // Corner pulse animation
  const cornerPulseVariants = (delay: number) =>
    prefersReducedMotion
      ? {}
      : {
          animate: {
            boxShadow: [
              '0 0 0px rgba(16, 185, 129, 0)',
              '0 0 20px rgba(16, 185, 129, 0.6)',
              '0 0 0px rgba(16, 185, 129, 0)'
            ],
            transition: {
              duration: 2,
              repeat: Infinity,
              ease: 'easeInOut',
              delay
            }
          }
        };

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          variants={backdropVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
          className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/95 backdrop-blur-md"
          role="status"
          aria-live="polite"
          aria-label={message}
        >
          <motion.div
            variants={containerVariants}
            className="relative w-full max-w-2xl px-8"
          >
            {/* Scanning Grid Container */}
            <div className="relative overflow-hidden rounded-2xl border border-emerald-500/30 bg-gray-800/50 p-12 shadow-2xl backdrop-blur-sm">
              {/* Grid Lines (Dashed) */}
              <div className="absolute inset-0 pointer-events-none">
                {/* Horizontal lines */}
                <div
                  className="absolute left-0 right-0"
                  style={{
                    top: '25%',
                    height: '1px',
                    background: 'repeating-linear-gradient(to right, rgba(16, 185, 129, 0.3) 0px, rgba(16, 185, 129, 0.3) 10px, transparent 10px, transparent 20px)'
                  }}
                />
                <div
                  className="absolute left-0 right-0"
                  style={{
                    top: '50%',
                    height: '1px',
                    background: 'repeating-linear-gradient(to right, rgba(16, 185, 129, 0.3) 0px, rgba(16, 185, 129, 0.3) 10px, transparent 10px, transparent 20px)'
                  }}
                />
                <div
                  className="absolute left-0 right-0"
                  style={{
                    top: '75%',
                    height: '1px',
                    background: 'repeating-linear-gradient(to right, rgba(16, 185, 129, 0.3) 0px, rgba(16, 185, 129, 0.3) 10px, transparent 10px, transparent 20px)'
                  }}
                />

                {/* Vertical lines */}
                <div
                  className="absolute top-0 bottom-0"
                  style={{
                    left: '25%',
                    width: '1px',
                    background: 'repeating-linear-gradient(to bottom, rgba(16, 185, 129, 0.3) 0px, rgba(16, 185, 129, 0.3) 10px, transparent 10px, transparent 20px)'
                  }}
                />
                <div
                  className="absolute top-0 bottom-0"
                  style={{
                    left: '50%',
                    width: '1px',
                    background: 'repeating-linear-gradient(to bottom, rgba(16, 185, 129, 0.3) 0px, rgba(16, 185, 129, 0.3) 10px, transparent 10px, transparent 20px)'
                  }}
                />
                <div
                  className="absolute top-0 bottom-0"
                  style={{
                    left: '75%',
                    width: '1px',
                    background: 'repeating-linear-gradient(to bottom, rgba(16, 185, 129, 0.3) 0px, rgba(16, 185, 129, 0.3) 10px, transparent 10px, transparent 20px)'
                  }}
                />
              </div>

              {/* Corner Dots (Pulsing) */}
              {!prefersReducedMotion && (
                <>
                  {/* Top-left */}
                  <motion.div
                    variants={cornerPulseVariants(0)}
                    animate="animate"
                    className="absolute left-4 top-4 h-2 w-2 rounded-full bg-emerald-500"
                  />
                  {/* Top-right */}
                  <motion.div
                    variants={cornerPulseVariants(0.2)}
                    animate="animate"
                    className="absolute right-4 top-4 h-2 w-2 rounded-full bg-emerald-500"
                  />
                  {/* Bottom-right */}
                  <motion.div
                    variants={cornerPulseVariants(0.4)}
                    animate="animate"
                    className="absolute bottom-4 right-4 h-2 w-2 rounded-full bg-emerald-500"
                  />
                  {/* Bottom-left */}
                  <motion.div
                    variants={cornerPulseVariants(0.6)}
                    animate="animate"
                    className="absolute bottom-4 left-4 h-2 w-2 rounded-full bg-emerald-500"
                  />
                </>
              )}

              {/* Scanning Line (Animated) */}
              {!prefersReducedMotion && (
                <motion.div
                  variants={scanLineVariants}
                  initial="initial"
                  animate="animate"
                  className="absolute left-0 right-0 h-0.5 pointer-events-none"
                  style={{
                    background: 'linear-gradient(to right, transparent, rgba(16, 185, 129, 0.8), transparent)'
                  }}
                />
              )}

              {/* Content */}
              <div className="relative z-10 flex flex-col items-center space-y-8">
                {/* Icon */}
                <motion.div
                  animate={
                    prefersReducedMotion
                      ? {}
                      : {
                          scale: [1, 1.1, 1],
                          transition: {
                            duration: 2,
                            repeat: Infinity,
                            ease: 'easeInOut'
                          }
                        }
                  }
                  className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/20 ring-2 ring-emerald-500/50"
                >
                  <Scan className="h-8 w-8 text-emerald-500" />
                </motion.div>

                {/* Message */}
                <div className="text-center">
                  <p className="text-lg font-medium text-white">{message}</p>
                  {total > 0 && (
                    <p className="mt-2 text-sm text-gray-400">
                      {current} of {total}
                    </p>
                  )}
                </div>

                {/* Progress Bar */}
                <div className="w-full space-y-2">
                  <div className="h-2 w-full overflow-hidden rounded-full bg-gray-700">
                    <motion.div
                      className="h-full bg-emerald-500"
                      initial={{ width: 0 }}
                      animate={{ width: `${percentage}%` }}
                      transition={{
                        duration: prefersReducedMotion ? 0.01 : 0.5,
                        ease: 'easeOut'
                      }}
                    />
                  </div>
                  <div className="flex justify-between text-xs text-gray-400">
                    <span>{percentage}%</span>
                    {total > 0 && <span>{total} total</span>}
                  </div>
                </div>

                {/* Sub-progress (if provided) */}
                {subProgress && (
                  <div className="w-full space-y-2 border-t border-gray-700 pt-4">
                    <p className="text-sm text-gray-300">{subProgress.message}</p>
                    <div className="flex justify-between text-xs text-gray-400">
                      <span>
                        {subProgress.current} of {subProgress.total}
                      </span>
                      <span>
                        {Math.round((subProgress.current / subProgress.total) * 100)}%
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
