/**
 * ExportDiffSummary - Compact inline diff display for timeline.
 * Shows changes like: "+2 tags, -1 label, +500 images"
 */

import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Plus, Minus, ArrowRight } from 'lucide-react';
import type { Export } from '@/types/export';
import { computeExportDiff, formatDelta } from '@/lib/export-diff';
import { SPRING_CONFIGS } from '@/lib/motion-config';

interface ExportDiffSummaryProps {
  exportA: Export;
  exportB: Export;
  onClick?: () => void;
  className?: string;
}

interface DiffChip {
  label: string;
  delta: number;
  type: 'added' | 'removed' | 'neutral';
}

export function ExportDiffSummary({
  exportA,
  exportB,
  onClick,
  className = '',
}: ExportDiffSummaryProps) {
  const diff = useMemo(
    () => computeExportDiff(exportA, exportB),
    [exportA, exportB]
  );

  const chips = useMemo(() => {
    const result: DiffChip[] = [];

    // Tags
    if (diff.tags.added.length > 0) {
      result.push({
        label: `${diff.tags.added.length} tag${diff.tags.added.length > 1 ? 's' : ''}`,
        delta: diff.tags.added.length,
        type: 'added',
      });
    }
    if (diff.tags.removed.length > 0) {
      result.push({
        label: `${diff.tags.removed.length} tag${diff.tags.removed.length > 1 ? 's' : ''}`,
        delta: -diff.tags.removed.length,
        type: 'removed',
      });
    }

    // Labels
    if (diff.labels.added.length > 0) {
      result.push({
        label: `${diff.labels.added.length} label${diff.labels.added.length > 1 ? 's' : ''}`,
        delta: diff.labels.added.length,
        type: 'added',
      });
    }
    if (diff.labels.removed.length > 0) {
      result.push({
        label: `${diff.labels.removed.length} label${diff.labels.removed.length > 1 ? 's' : ''}`,
        delta: -diff.labels.removed.length,
        type: 'removed',
      });
    }

    // Images
    if (diff.summary.imageCount.delta !== 0) {
      result.push({
        label: `${Math.abs(diff.summary.imageCount.delta).toLocaleString()} images`,
        delta: diff.summary.imageCount.delta,
        type: diff.summary.imageCount.delta > 0 ? 'added' : 'removed',
      });
    }

    // Annotations
    if (diff.summary.annotationCount.delta !== 0) {
      result.push({
        label: `${Math.abs(diff.summary.annotationCount.delta).toLocaleString()} annotations`,
        delta: diff.summary.annotationCount.delta,
        type: diff.summary.annotationCount.delta > 0 ? 'added' : 'removed',
      });
    }

    return result;
  }, [diff]);

  if (!diff.hasChanges) {
    return (
      <div className={`text-xs text-gray-400 italic ${className}`}>
        No changes
      </div>
    );
  }

  const isClickable = !!onClick;

  return (
    <motion.button
      type="button"
      onClick={onClick}
      disabled={!isClickable}
      className={`
        flex flex-wrap items-center gap-1.5 text-xs
        ${isClickable ? 'cursor-pointer hover:opacity-80' : 'cursor-default'}
        ${className}
      `}
      whileHover={isClickable ? { scale: 1.02 } : undefined}
      whileTap={isClickable ? { scale: 0.98 } : undefined}
      transition={SPRING_CONFIGS.responsive}
    >
      {chips.map((chip) => (
        <span
          key={`${chip.type}-${chip.label}`}
          className={`
            inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full font-medium
            ${chip.type === 'added' ? 'bg-green-100 text-green-700' : ''}
            ${chip.type === 'removed' ? 'bg-red-100 text-red-700' : ''}
          `}
        >
          {chip.type === 'added' ? (
            <Plus className="w-3 h-3" />
          ) : (
            <Minus className="w-3 h-3" />
          )}
          {chip.label}
        </span>
      ))}
      {isClickable && (
        <ArrowRight className="w-3 h-3 text-gray-400 ml-1" />
      )}
    </motion.button>
  );
}

/**
 * Minimal version for tight spaces - just shows counts.
 */
export function ExportDiffSummaryMinimal({
  exportA,
  exportB,
  onClick,
  className = '',
}: ExportDiffSummaryProps) {
  const diff = useMemo(
    () => computeExportDiff(exportA, exportB),
    [exportA, exportB]
  );

  if (!diff.hasChanges) {
    return <span className={`text-xs text-gray-400 ${className}`}>-</span>;
  }

  const addedCount =
    diff.tags.added.length +
    diff.excludedTags.added.length +
    diff.labels.added.length;
  const removedCount =
    diff.tags.removed.length +
    diff.excludedTags.removed.length +
    diff.labels.removed.length;
  const imageDelta = diff.summary.imageCount.delta;

  return (
    <button
      type="button"
      onClick={onClick}
      className={`
        inline-flex items-center gap-2 text-xs
        ${onClick ? 'cursor-pointer hover:opacity-80' : 'cursor-default'}
        ${className}
      `}
    >
      {addedCount > 0 && (
        <span className="text-green-600 font-medium">+{addedCount}</span>
      )}
      {removedCount > 0 && (
        <span className="text-red-600 font-medium">-{removedCount}</span>
      )}
      {imageDelta !== 0 && (
        <span className={imageDelta > 0 ? 'text-green-600' : 'text-red-600'}>
          {formatDelta(imageDelta)} img
        </span>
      )}
    </button>
  );
}
