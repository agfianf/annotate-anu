import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, X, Save, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { ANIMATION_TIMINGS, SPRING_CONFIGS } from '@/lib/motion-config';

interface UnsavedChangesDialogProps {
  isOpen: boolean;
  pendingCount: number;
  isSyncing?: boolean;
  onSave: () => Promise<void>;
  onDiscard: () => void;
  onCancel: () => void;
}

export function UnsavedChangesDialog({
  isOpen,
  pendingCount,
  isSyncing = false,
  onSave,
  onDiscard,
  onCancel,
}: UnsavedChangesDialogProps) {
  const [mounted, setMounted] = useState(false);
  const [saving, setSaving] = useState(false);
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
        onCancel();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onCancel]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave();
    } finally {
      setSaving(false);
    }
  };

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

  const isLoading = saving || isSyncing;

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
            onClick={onCancel}
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
                  <div className="w-10 h-10 rounded-full flex items-center justify-center bg-amber-100 text-amber-600">
                    <AlertTriangle className="w-5 h-5" />
                  </div>
                  <h3 className="text-lg font-bold text-gray-900 mt-2">Unsaved Changes</h3>
                </div>
                <button
                  onClick={onCancel}
                  disabled={isLoading}
                  className="p-1 text-gray-400 hover:text-gray-600 hover:bg-black/5 rounded-lg transition-colors disabled:opacity-50"
                >
                  <X className="w-5 h-5" />
                </button>
              </motion.div>

              {/* Message */}
              <motion.p
                className="text-gray-600 mb-6 ml-13 leading-relaxed"
                variants={contentVariants}
                transition={{
                  delay: prefersReducedMotion ? 0 : 0.1,
                  duration: prefersReducedMotion ? 0.01 : ANIMATION_TIMINGS.quick,
                }}
              >
                You have{' '}
                <span className="font-semibold text-amber-600">
                  {pendingCount} unsaved {pendingCount === 1 ? 'change' : 'changes'}
                </span>
                . Would you like to save before leaving?
              </motion.p>

              {/* Buttons */}
              <motion.div
                className="flex flex-col gap-2"
                variants={contentVariants}
                transition={{
                  delay: prefersReducedMotion ? 0 : 0.15,
                  duration: prefersReducedMotion ? 0.01 : ANIMATION_TIMINGS.quick,
                }}
              >
                {/* Save & Leave button */}
                <motion.button
                  onClick={handleSave}
                  disabled={isLoading}
                  whileHover={prefersReducedMotion ? {} : { scale: 1.01 }}
                  whileTap={prefersReducedMotion ? {} : { scale: 0.99 }}
                  className="w-full px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-xl shadow-lg shadow-emerald-500/25 transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLoading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" />
                      Save & Leave
                    </>
                  )}
                </motion.button>

                {/* Discard button */}
                <motion.button
                  onClick={onDiscard}
                  disabled={isLoading}
                  whileHover={prefersReducedMotion ? {} : { scale: 1.01 }}
                  whileTap={prefersReducedMotion ? {} : { scale: 0.99 }}
                  className="w-full px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white font-medium rounded-xl shadow-lg shadow-red-500/25 transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Trash2 className="w-4 h-4" />
                  Discard Changes
                </motion.button>

                {/* Stay button */}
                <button
                  onClick={onCancel}
                  disabled={isLoading}
                  className="w-full px-4 py-2.5 text-gray-700 font-medium hover:bg-black/5 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Stay on Page
                </button>
              </motion.div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
}
