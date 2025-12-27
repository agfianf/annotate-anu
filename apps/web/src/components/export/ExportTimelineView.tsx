/**
 * ExportTimelineView - Vertical timeline visualization of export history.
 */

import { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { History, Clock } from 'lucide-react';
import type { Export, ExportMode } from '@/types/export';
import { TimelineNode } from './TimelineNode';
import { useReducedMotion } from '@/hooks/useReducedMotion';

interface ExportTimelineViewProps {
  exports: Export[];
  filterMode?: ExportMode | 'all';
  onDiffClick?: (exportA: Export, exportB: Export) => void;
  onExportClick?: (export_: Export) => void;
  onDownload?: (export_: Export) => void;
  isLoading?: boolean;
}

export function ExportTimelineView({
  exports,
  filterMode = 'all',
  onDiffClick,
  onExportClick,
  onDownload,
  isLoading = false,
}: ExportTimelineViewProps) {
  const prefersReducedMotion = useReducedMotion();

  // Filter exports by mode if specified
  const filteredExports = useMemo(() => {
    if (filterMode === 'all') return exports;
    return exports.filter((e) => e.export_mode === filterMode);
  }, [exports, filterMode]);

  // Sort by created_at descending (newest first)
  const sortedExports = useMemo(() => {
    return [...filteredExports].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  }, [filteredExports]);

  // Group exports by mode for the timeline
  // For now, we show them in chronological order with diff between consecutive
  // exports of the same mode
  const exportsWithPrevious = useMemo(() => {
    // Build a map of the previous export for each mode
    const previousByMode: Record<string, Export | undefined> = {};

    return sortedExports.map((exp) => {
      // Find the previous export of the same mode
      const previous = previousByMode[exp.export_mode];
      previousByMode[exp.export_mode] = exp;

      return {
        export: exp,
        previousExport: previous,
      };
    });
  }, [sortedExports]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-emerald-200 border-t-emerald-600 rounded-full animate-spin" />
          <span className="text-sm text-gray-500">Loading timeline...</span>
        </div>
      </div>
    );
  }

  if (sortedExports.length === 0) {
    return (
      <motion.div
        className="flex flex-col items-center justify-center py-12 text-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      >
        <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-4">
          <History className="w-8 h-8 text-gray-400" />
        </div>
        <h3 className="font-medium text-gray-900 mb-1">No exports yet</h3>
        <p className="text-sm text-gray-500 max-w-xs">
          {filterMode !== 'all'
            ? `No ${filterMode} exports found. Try selecting a different mode.`
            : 'Create your first export to see the timeline.'}
        </p>
      </motion.div>
    );
  }

  return (
    <div className="relative">
      {/* Timeline header */}
      <motion.div
        className="flex items-center gap-2 mb-6 text-sm text-gray-500"
        initial={{ opacity: 0, y: prefersReducedMotion ? 0 : -10 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <Clock className="w-4 h-4" />
        <span>
          {sortedExports.length} export{sortedExports.length !== 1 ? 's' : ''}
          {filterMode !== 'all' && ` (${filterMode})`}
        </span>
      </motion.div>

      {/* Timeline nodes */}
      <div className="space-y-6">
        <AnimatePresence mode="popLayout">
          {exportsWithPrevious.map(({ export: exp, previousExport }, index) => (
            <TimelineNode
              key={exp.id}
              export_={exp}
              previousExport={previousExport}
              isFirst={index === 0}
              isLast={index === exportsWithPrevious.length - 1}
              onDiffClick={onDiffClick}
              onExportClick={onExportClick}
              onDownload={onDownload}
              index={index}
            />
          ))}
        </AnimatePresence>
      </div>

      {/* End of timeline marker */}
      {sortedExports.length > 0 && (
        <motion.div
          className="flex items-center gap-2 mt-6 ml-[23px] text-xs text-gray-400"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: prefersReducedMotion ? 0 : 0.3 }}
        >
          <div className="w-2 h-2 rounded-full bg-gray-300" />
          <span>Beginning of history</span>
        </motion.div>
      )}
    </div>
  );
}
