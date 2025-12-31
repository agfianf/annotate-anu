/**
 * Empty State for Analytics Panels
 * Shown when no panels are added
 */

import { memo } from 'react';
import { BarChart3, Plus, Sparkles } from 'lucide-react';
import { motion } from 'framer-motion';
import { useReducedMotion } from '@/hooks/useReducedMotion';

interface EmptyStateProps {
  onAddPanel?: () => void;
}

export const EmptyState = memo(function EmptyState({ onAddPanel }: EmptyStateProps) {
  const prefersReducedMotion = useReducedMotion();

  return (
    <motion.div
      initial={prefersReducedMotion ? {} : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: prefersReducedMotion ? 0.01 : 0.3 }}
      className="flex items-center justify-center h-full p-8"
    >
      <div className="max-w-sm text-center">
        {/* Icon */}
        <motion.div
          initial={prefersReducedMotion ? {} : { scale: 0.9 }}
          animate={{ scale: 1 }}
          transition={{
            duration: prefersReducedMotion ? 0.01 : 0.5,
            delay: 0.1,
          }}
          className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-emerald-50 to-emerald-100 mb-4"
        >
          <BarChart3 className="w-10 h-10 text-emerald-600" />
        </motion.div>

        {/* Title */}
        <h3 className="text-lg font-semibold text-gray-900 mb-2">
          No analytics panels yet
        </h3>

        {/* Description */}
        <p className="text-sm text-gray-600 mb-6">
          Add analytics panels to visualize dataset statistics, track annotation progress, and
          analyze your data. Click charts to filter the gallery.
        </p>

        {/* CTA Button */}
        {onAddPanel && (
          <button
            onClick={onAddPanel}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-medium transition-colors shadow-sm hover:shadow-md"
          >
            <Plus className="w-4 h-4" />
            Add Your First Panel
          </button>
        )}

        {/* Hint */}
        <div className="flex items-center justify-center gap-2 mt-6 text-xs text-gray-500">
          <Sparkles className="w-3.5 h-3.5 text-emerald-500" />
          <span>Interactive charts with click-to-filter</span>
        </div>
      </div>
    </motion.div>
  );
});
