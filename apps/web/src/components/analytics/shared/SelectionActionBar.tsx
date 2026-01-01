/**
 * Selection Action Bar
 * Shows Apply Filter and Clear buttons when items are selected
 */

import { Check, X } from 'lucide-react';
import { motion } from 'framer-motion';

interface SelectionActionBarProps {
  selectionCount: number;
  onApply: () => void;
  onClear: () => void;
  prefersReducedMotion?: boolean;
}

export function SelectionActionBar({
  selectionCount,
  onApply,
  onClear,
  prefersReducedMotion = false,
}: SelectionActionBarProps) {
  if (selectionCount === 0) return null;

  return (
    <motion.div
      initial={prefersReducedMotion ? {} : { opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={prefersReducedMotion ? {} : { opacity: 0, y: -10 }}
      transition={{ duration: prefersReducedMotion ? 0.01 : 0.2 }}
      className="flex items-center gap-2 mt-2 p-2 bg-emerald-50/80 backdrop-blur-sm rounded-lg border border-emerald-200/50"
      role="toolbar"
      aria-label="Selection actions"
    >
      <span className="text-xs font-medium text-emerald-700 flex-1">
        {selectionCount} selected
      </span>
      <button
        onClick={onApply}
        className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-emerald-600 text-white rounded-md hover:bg-emerald-700 transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2"
        aria-label={`Apply filter with ${selectionCount} selected items`}
      >
        <Check className="w-3 h-3" />
        Apply Filter
      </button>
      <button
        onClick={onClear}
        className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-md hover:bg-gray-50 transition-colors focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
        aria-label="Clear selection"
      >
        <X className="w-3 h-3" />
        Clear
      </button>
    </motion.div>
  );
}
