import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { ANIMATION_TIMINGS, SPRING_CONFIGS } from '@/lib/motion-config';

interface ConfirmationModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    isDangerous?: boolean;
}

export default function ConfirmationModal({
    isOpen,
    onClose,
    onConfirm,
    title,
    message,
    confirmText = 'Confirm',
    cancelText = 'Cancel',
    isDangerous = false,
}: ConfirmationModalProps) {
    const [mounted, setMounted] = useState(false);
    const prefersReducedMotion = useReducedMotion();

    useEffect(() => {
        setMounted(true);
        return () => setMounted(false);
    }, []);

    // Prevent scrolling when modal is open
    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = 'unset';
        }
        return () => {
            document.body.style.overflow = 'unset';
        };
    }, [isOpen]);

    // Handle escape key
    useEffect(() => {
        if (!isOpen) return;

        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                onClose();
            }
        };

        document.addEventListener('keydown', handleEscape);
        return () => document.removeEventListener('keydown', handleEscape);
    }, [isOpen, onClose]);

    if (!mounted) return null;

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
              hidden: { opacity: 0, scale: 0.95, y: 10 },
              visible: { opacity: 1, scale: 1, y: 0 },
              exit: { opacity: 0, scale: 0.95, y: 10 },
          };

    // Content stagger variants
    const contentVariants = prefersReducedMotion
        ? {
              hidden: { opacity: 0 },
              visible: { opacity: 1 },
          }
        : {
              hidden: { opacity: 0, y: -5 },
              visible: { opacity: 1, y: 0 },
          };

    const backdropTransition = {
        duration: prefersReducedMotion ? 0.01 : ANIMATION_TIMINGS.quick,
    };

    const modalTransition = prefersReducedMotion
        ? { duration: 0.01 }
        : { ...SPRING_CONFIGS.gentle };

    return createPortal(
        <AnimatePresence mode="wait">
            {isOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    {/* Backdrop */}
                    <motion.div
                        variants={backdropVariants}
                        initial="hidden"
                        animate="visible"
                        exit="hidden"
                        transition={backdropTransition}
                        onClick={onClose}
                        className="absolute inset-0 bg-black/30 backdrop-blur-sm"
                    />

                    {/* Modal Content */}
                    <motion.div
                        variants={modalVariants}
                        initial="hidden"
                        animate="visible"
                        exit="exit"
                        transition={modalTransition}
                        className="relative w-full max-w-md bg-white/80 backdrop-blur-xl border border-white/20 rounded-2xl shadow-2xl overflow-hidden"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="p-6">
                            {/* Header */}
                            <motion.div
                                className="flex items-start justify-between mb-4"
                                variants={contentVariants}
                                transition={{
                                    delay: prefersReducedMotion ? 0 : 0.05,
                                    duration: prefersReducedMotion ? 0.01 : ANIMATION_TIMINGS.quick,
                                }}
                            >
                                <div className="flex items-center gap-3">
                                    <div
                                        className={`
                                        w-10 h-10 rounded-full flex items-center justify-center
                                        ${isDangerous ? 'bg-red-100 text-red-600' : 'bg-emerald-100 text-emerald-600'}
                                    `}
                                    >
                                        <AlertTriangle className="w-5 h-5" />
                                    </div>
                                    <h3 className="text-lg font-bold text-gray-900 mt-2">{title}</h3>
                                </div>
                                <button
                                    onClick={onClose}
                                    className="p-1 text-gray-400 hover:text-gray-600 hover:bg-black/5 rounded-lg transition-colors"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </motion.div>

                            {/* Message */}
                            <motion.p
                                className="text-gray-600 mb-8 ml-13 leading-relaxed"
                                variants={contentVariants}
                                transition={{
                                    delay: prefersReducedMotion ? 0 : 0.1,
                                    duration: prefersReducedMotion ? 0.01 : ANIMATION_TIMINGS.quick,
                                }}
                            >
                                {message}
                            </motion.p>

                            {/* Buttons */}
                            <motion.div
                                className="flex justify-end gap-3"
                                variants={contentVariants}
                                transition={{
                                    delay: prefersReducedMotion ? 0 : 0.15,
                                    duration: prefersReducedMotion ? 0.01 : ANIMATION_TIMINGS.quick,
                                }}
                            >
                                <button
                                    onClick={onClose}
                                    className="px-4 py-2.5 text-gray-700 font-medium hover:bg-black/5 rounded-xl transition-colors"
                                >
                                    {cancelText}
                                </button>
                                <motion.button
                                    onClick={() => {
                                        onConfirm();
                                        onClose();
                                    }}
                                    whileHover={prefersReducedMotion ? {} : { scale: 1.02 }}
                                    whileTap={prefersReducedMotion ? {} : { scale: 0.98 }}
                                    className={`
                                        px-6 py-2.5 text-white font-medium rounded-xl shadow-lg transition-colors
                                        ${
                                            isDangerous
                                                ? 'bg-red-600 hover:bg-red-700 shadow-red-500/25'
                                                : 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-500/25'
                                        }
                                    `}
                                >
                                    {confirmText}
                                </motion.button>
                            </motion.div>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>,
        document.body
    );
}
