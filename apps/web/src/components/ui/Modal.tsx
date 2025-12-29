import { X } from 'lucide-react';
import { type ReactNode, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { ANIMATION_TIMINGS, SPRING_CONFIGS, EASINGS } from '@/lib/motion-config';

interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title: string
  children: ReactNode
  showCloseButton?: boolean
  blocking?: boolean
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl' | '5xl'
}

export function Modal({
  isOpen,
  onClose,
  title,
  children,
  showCloseButton = true,
  blocking = false,
  maxWidth = '2xl',
}: ModalProps) {
  const prefersReducedMotion = useReducedMotion();

  const maxWidthClasses = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
    '2xl': 'max-w-2xl',
    '3xl': 'max-w-3xl',
    '4xl': 'max-w-4xl',
    '5xl': 'max-w-5xl',
  };

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!blocking && e.target === e.currentTarget) {
      onClose();
    }
  };

  // Handle escape key
  useEffect(() => {
    if (!isOpen || blocking) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, blocking, onClose]);

  // Backdrop variants
  const backdropVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1 },
  };

  // Modal variants with reduced motion support
  const modalVariants = prefersReducedMotion
    ? {
        hidden: { opacity: 0 },
        visible: { opacity: 1 },
        exit: { opacity: 0 },
      }
    : {
        hidden: {
          opacity: 0,
          scale: 0.92,
          y: 20,
        },
        visible: {
          opacity: 1,
          scale: 1,
          y: 0,
        },
        exit: {
          opacity: 0,
          scale: 0.95,
          y: 10,
        },
      };

  // Content stagger variants
  const contentVariants = prefersReducedMotion
    ? {
        hidden: { opacity: 0 },
        visible: { opacity: 1 },
      }
    : {
        hidden: { opacity: 0, y: -10 },
        visible: { opacity: 1, y: 0 },
      };

  const backdropTransition = {
    duration: prefersReducedMotion ? 0.01 : ANIMATION_TIMINGS.quick,
    ease: EASINGS.easeOut,
  };

  const modalTransition = prefersReducedMotion
    ? { duration: 0.01 }
    : {
        ...SPRING_CONFIGS.gentle,
        duration: ANIMATION_TIMINGS.standard,
      };

  return (
    <AnimatePresence mode="wait">
      {isOpen && (
        <motion.div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
          onClick={handleBackdropClick}
          variants={backdropVariants}
          initial="hidden"
          animate="visible"
          exit="hidden"
          transition={backdropTransition}
        >
          <motion.div
            className={`glass-strong rounded-lg shadow-2xl ${maxWidthClasses[maxWidth]} w-full mx-4 max-h-[80vh] overflow-hidden flex flex-col`}
            variants={modalVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            transition={modalTransition}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <motion.div
              className="px-6 py-4 border-b border-gray-200/50 flex items-center justify-between"
              variants={contentVariants}
              transition={{
                delay: prefersReducedMotion ? 0 : 0.05,
                duration: prefersReducedMotion ? 0.01 : ANIMATION_TIMINGS.quick,
              }}
            >
              <h2 className="text-xl font-semibold text-gray-900">{title}</h2>
              {showCloseButton && !blocking && (
                <button
                  onClick={onClose}
                  className="text-gray-600 hover:text-gray-900 transition-colors"
                  aria-label="Close modal"
                >
                  <X className="w-5 h-5" />
                </button>
              )}
            </motion.div>

            {/* Content */}
            <motion.div
              className="p-6 overflow-y-auto flex-1"
              variants={contentVariants}
              transition={{
                delay: prefersReducedMotion ? 0 : 0.1,
                duration: prefersReducedMotion ? 0.01 : ANIMATION_TIMINGS.quick,
              }}
            >
              {children}
            </motion.div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
