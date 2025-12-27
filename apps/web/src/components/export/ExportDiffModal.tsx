/**
 * ExportDiffModal - Side-by-side comparison of two export versions.
 */

import { useMemo } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  ArrowRight,
  Tag as TagIcon,
  Palette,
  Image,
  FileText,
  PieChart,
  Filter,
  Plus,
  Minus,
  Equal,
} from 'lucide-react';
import type { Export, TagDiff, LabelDiff, NumericDiff } from '@/types/export';
import { DIFF_COLORS } from '@/types/export-diff';
import { computeExportDiff, formatDelta } from '@/lib/export-diff';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { ANIMATION_TIMINGS, SPRING_CONFIGS } from '@/lib/motion-config';
import { getExportModeLabel, getOutputFormatLabel } from '@/lib/export-client';

interface ExportDiffModalProps {
  isOpen: boolean;
  onClose: () => void;
  exportA: Export | null; // Older version (left)
  exportB: Export | null; // Newer version (right)
}

export function ExportDiffModal({
  isOpen,
  onClose,
  exportA,
  exportB,
}: ExportDiffModalProps) {
  const prefersReducedMotion = useReducedMotion();

  const diff = useMemo(() => {
    if (!exportA || !exportB) return null;
    return computeExportDiff(exportA, exportB);
  }, [exportA, exportB]);

  if (!diff || !exportA || !exportB) {
    return null;
  }

  const backdropVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1 },
  };

  const modalVariants = prefersReducedMotion
    ? { hidden: { opacity: 0 }, visible: { opacity: 1 }, exit: { opacity: 0 } }
    : {
        hidden: { opacity: 0, scale: 0.92, y: 20 },
        visible: { opacity: 1, scale: 1, y: 0 },
        exit: { opacity: 0, scale: 0.95, y: 10 },
      };

  const sectionVariants = prefersReducedMotion
    ? { hidden: { opacity: 0 }, visible: { opacity: 1 } }
    : { hidden: { opacity: 0, y: 10 }, visible: { opacity: 1, y: 0 } };

  // Use portal to render at document.body level (escapes parent overflow constraints)
  return createPortal(
    <AnimatePresence mode="wait">
      {isOpen && (
        <motion.div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999]"
          onClick={(e) => e.target === e.currentTarget && onClose()}
          variants={backdropVariants}
          initial="hidden"
          animate="visible"
          exit="hidden"
          transition={{ duration: prefersReducedMotion ? 0.01 : ANIMATION_TIMINGS.quick }}
        >
          <motion.div
            className="glass-strong rounded-lg shadow-2xl max-w-5xl w-full mx-4 max-h-[85vh] overflow-hidden flex flex-col"
            variants={modalVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            transition={prefersReducedMotion ? { duration: 0.01 } : SPRING_CONFIGS.gentle}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-200/50 flex items-center justify-between bg-gradient-to-r from-emerald-50/50 to-transparent">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-emerald-100 rounded-lg">
                  <ArrowRight className="w-5 h-5 text-emerald-600" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold text-gray-900">Compare Exports</h2>
                  <p className="text-sm text-gray-500">
                    {exportA.name || `v${exportA.version_number}`} vs{' '}
                    {exportB.name || `v${exportB.version_number}`}
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="text-gray-600 hover:text-gray-900 transition-colors p-2 hover:bg-gray-100 rounded-lg"
                aria-label="Close modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div className="p-6 overflow-y-auto flex-1 space-y-6">
              {/* Version Headers */}
              <motion.div
                className="grid grid-cols-2 gap-4"
                variants={sectionVariants}
                initial="hidden"
                animate="visible"
                transition={{ delay: 0.05 }}
              >
                <ExportHeader export_={exportA} label="Before" />
                <ExportHeader export_={exportB} label="After" />
              </motion.div>

              {/* Tags Section */}
              {(diff.tags.added.length > 0 ||
                diff.tags.removed.length > 0 ||
                diff.tags.unchanged.length > 0) && (
                <DiffSection
                  title="Tags"
                  icon={<TagIcon className="w-4 h-4" />}
                  delay={0.1}
                >
                  <TagDiffDisplay diff={diff.tags} />
                </DiffSection>
              )}

              {/* Excluded Tags Section */}
              {(diff.excludedTags.added.length > 0 ||
                diff.excludedTags.removed.length > 0 ||
                diff.excludedTags.unchanged.length > 0) && (
                <DiffSection
                  title="Excluded Tags"
                  icon={<TagIcon className="w-4 h-4" />}
                  delay={0.15}
                >
                  <TagDiffDisplay diff={diff.excludedTags} isExcluded />
                </DiffSection>
              )}

              {/* Labels Section */}
              {(diff.labels.added.length > 0 ||
                diff.labels.removed.length > 0 ||
                diff.labels.unchanged.length > 0) && (
                <DiffSection
                  title="Annotation Labels"
                  icon={<Palette className="w-4 h-4" />}
                  delay={0.2}
                >
                  <LabelDiffDisplay diff={diff.labels} />
                </DiffSection>
              )}

              {/* Summary Stats Section */}
              <DiffSection
                title="Summary"
                icon={<PieChart className="w-4 h-4" />}
                delay={0.25}
              >
                <div className="space-y-3">
                  <NumericDiffRow
                    label="Images"
                    diff={diff.summary.imageCount}
                    icon={<Image className="w-4 h-4 text-gray-400" />}
                  />
                  <NumericDiffRow
                    label="Annotations"
                    diff={diff.summary.annotationCount}
                    icon={<FileText className="w-4 h-4 text-gray-400" />}
                  />
                </div>
              </DiffSection>

              {/* Splits Section */}
              {Object.keys(diff.summary.splitCounts).length > 0 && (
                <DiffSection
                  title="Split Distribution"
                  icon={<PieChart className="w-4 h-4" />}
                  delay={0.3}
                >
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {Object.entries(diff.summary.splitCounts).map(([split, numDiff]) => (
                      <SplitDiffCard key={split} split={split} diff={numDiff} />
                    ))}
                  </div>
                </DiffSection>
              )}

              {/* Filter Mode Section */}
              {(diff.filter.includeMatchMode.changed ||
                diff.filter.excludeMatchMode.changed) && (
                <DiffSection
                  title="Filter Configuration"
                  icon={<Filter className="w-4 h-4" />}
                  delay={0.35}
                >
                  <div className="space-y-2 text-sm">
                    {diff.filter.includeMatchMode.changed && (
                      <div className="flex items-center gap-2">
                        <span className="text-gray-600">Include match:</span>
                        <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded">
                          {diff.filter.includeMatchMode.before}
                        </span>
                        <ArrowRight className="w-4 h-4 text-gray-400" />
                        <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded">
                          {diff.filter.includeMatchMode.after}
                        </span>
                      </div>
                    )}
                    {diff.filter.excludeMatchMode.changed && (
                      <div className="flex items-center gap-2">
                        <span className="text-gray-600">Exclude match:</span>
                        <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded">
                          {diff.filter.excludeMatchMode.before}
                        </span>
                        <ArrowRight className="w-4 h-4 text-gray-400" />
                        <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded">
                          {diff.filter.excludeMatchMode.after}
                        </span>
                      </div>
                    )}
                  </div>
                </DiffSection>
              )}

              {/* No Changes Notice */}
              {!diff.hasChanges && (
                <motion.div
                  className="text-center py-8 text-gray-500"
                  variants={sectionVariants}
                  initial="hidden"
                  animate="visible"
                >
                  <Equal className="w-8 h-8 mx-auto mb-2 text-gray-400" />
                  <p>No significant changes between these exports</p>
                </motion.div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}

// ============================================================================
// Sub-components
// ============================================================================

function ExportHeader({ export_, label }: { export_: Export; label: string }) {
  const date = new Date(export_.created_at).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <div className="p-4 rounded-lg bg-gray-50 border border-gray-200">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
          {label}
        </span>
        {export_.version_number && (
          <span className="px-1.5 py-0.5 text-xs font-medium bg-emerald-100 text-emerald-700 rounded">
            v{export_.version_number}
          </span>
        )}
      </div>
      <h3 className="font-semibold text-gray-900 truncate">
        {export_.name || `${getExportModeLabel(export_.export_mode)} Export`}
      </h3>
      <p className="text-sm text-gray-500 mt-1">
        {getExportModeLabel(export_.export_mode)} &middot;{' '}
        {getOutputFormatLabel(export_.output_format)}
      </p>
      <p className="text-xs text-gray-400 mt-1">{date}</p>
    </div>
  );
}

function DiffSection({
  title,
  icon,
  delay,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  delay: number;
  children: React.ReactNode;
}) {
  const prefersReducedMotion = useReducedMotion();

  return (
    <motion.div
      className="border border-gray-200 rounded-lg overflow-hidden"
      initial={{ opacity: 0, y: prefersReducedMotion ? 0 : 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: prefersReducedMotion ? 0 : delay }}
    >
      <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center gap-2">
        <span className="text-gray-500">{icon}</span>
        <h3 className="font-medium text-gray-900">{title}</h3>
      </div>
      <div className="p-4">{children}</div>
    </motion.div>
  );
}

interface CategoryGroup {
  category_id: string;
  category_name: string;
  category_color: string;
  tags: Array<{ tag: TagDiff['added'][0]; status: 'added' | 'removed' | 'unchanged' }>;
}

function TagDiffDisplay({ diff, isExcluded = false }: { diff: TagDiff; isExcluded?: boolean }) {
  // Group all tags by category
  const categoryGroups = useMemo(() => {
    const groups = new Map<string, CategoryGroup>();

    const addToGroup = (
      tag: TagDiff['added'][0],
      status: 'added' | 'removed' | 'unchanged'
    ) => {
      const categoryId = tag.category_id || 'uncategorized';
      const categoryName = tag.category_name || 'Uncategorized';
      const categoryColor = tag.category_color || '#6B7280';

      if (!groups.has(categoryId)) {
        groups.set(categoryId, {
          category_id: categoryId,
          category_name: categoryName,
          category_color: categoryColor,
          tags: [],
        });
      }
      groups.get(categoryId)!.tags.push({ tag, status });
    };

    diff.added.forEach((tag) => addToGroup(tag, 'added'));
    diff.removed.forEach((tag) => addToGroup(tag, 'removed'));
    diff.unchanged.forEach((tag) => addToGroup(tag, 'unchanged'));

    // Sort groups by category name
    return Array.from(groups.values()).sort((a, b) =>
      a.category_name.localeCompare(b.category_name)
    );
  }, [diff]);

  // Check if any tags have category info
  const hasCategories = categoryGroups.some(
    (g) => g.category_id !== 'uncategorized' || categoryGroups.length > 1
  );

  // If no category info, show flat list (backwards compatible)
  if (!hasCategories && categoryGroups.length === 1) {
    return (
      <div className="space-y-3">
        {/* Added */}
        {diff.added.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 text-xs font-medium text-green-700 mb-2">
              <Plus className="w-3.5 h-3.5" />
              Added ({diff.added.length})
            </div>
            <div className="flex flex-wrap gap-1.5">
              {diff.added.map((tag) => (
                <TagChip key={tag.id} tag={tag} status="added" isExcluded={isExcluded} />
              ))}
            </div>
          </div>
        )}

        {/* Removed */}
        {diff.removed.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 text-xs font-medium text-red-700 mb-2">
              <Minus className="w-3.5 h-3.5" />
              Removed ({diff.removed.length})
            </div>
            <div className="flex flex-wrap gap-1.5">
              {diff.removed.map((tag) => (
                <TagChip key={tag.id} tag={tag} status="removed" isExcluded={isExcluded} />
              ))}
            </div>
          </div>
        )}

        {/* Unchanged */}
        {diff.unchanged.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 text-xs font-medium text-gray-500 mb-2">
              <Equal className="w-3.5 h-3.5" />
              Unchanged ({diff.unchanged.length})
            </div>
            <div className="flex flex-wrap gap-1.5">
              {diff.unchanged.map((tag) => (
                <TagChip key={tag.id} tag={tag} status="unchanged" isExcluded={isExcluded} />
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // Group by category
  return (
    <div className="space-y-4">
      {categoryGroups.map((group) => {
        const addedTags = group.tags.filter((t) => t.status === 'added');
        const removedTags = group.tags.filter((t) => t.status === 'removed');
        const unchangedTags = group.tags.filter((t) => t.status === 'unchanged');

        return (
          <div key={group.category_id} className="border border-gray-100 rounded-lg p-3">
            {/* Category Header */}
            <div className="flex items-center gap-2 mb-2 pb-2 border-b border-gray-100">
              <span
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: group.category_color }}
              />
              <span className="text-sm font-medium text-gray-700">
                {group.category_name}
              </span>
              <span className="text-xs text-gray-400">
                ({group.tags.length} tag{group.tags.length !== 1 ? 's' : ''})
              </span>
            </div>

            <div className="space-y-2">
              {/* Added in this category */}
              {addedTags.length > 0 && (
                <div className="flex items-start gap-2">
                  <Plus className="w-3.5 h-3.5 text-green-600 mt-0.5 flex-shrink-0" />
                  <div className="flex flex-wrap gap-1.5">
                    {addedTags.map(({ tag }) => (
                      <TagChip key={tag.id} tag={tag} status="added" isExcluded={isExcluded} />
                    ))}
                  </div>
                </div>
              )}

              {/* Removed in this category */}
              {removedTags.length > 0 && (
                <div className="flex items-start gap-2">
                  <Minus className="w-3.5 h-3.5 text-red-600 mt-0.5 flex-shrink-0" />
                  <div className="flex flex-wrap gap-1.5">
                    {removedTags.map(({ tag }) => (
                      <TagChip key={tag.id} tag={tag} status="removed" isExcluded={isExcluded} />
                    ))}
                  </div>
                </div>
              )}

              {/* Unchanged in this category */}
              {unchangedTags.length > 0 && (
                <div className="flex items-start gap-2">
                  <Equal className="w-3.5 h-3.5 text-gray-400 mt-0.5 flex-shrink-0" />
                  <div className="flex flex-wrap gap-1.5">
                    {unchangedTags.map(({ tag }) => (
                      <TagChip key={tag.id} tag={tag} status="unchanged" isExcluded={isExcluded} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function LabelDiffDisplay({ diff }: { diff: LabelDiff }) {
  return (
    <div className="space-y-3">
      {/* Added */}
      {diff.added.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 text-xs font-medium text-green-700 mb-2">
            <Plus className="w-3.5 h-3.5" />
            Added ({diff.added.length})
          </div>
          <div className="flex flex-wrap gap-1.5">
            {diff.added.map((label) => (
              <LabelChip key={label.id} label={label} status="added" />
            ))}
          </div>
        </div>
      )}

      {/* Removed */}
      {diff.removed.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 text-xs font-medium text-red-700 mb-2">
            <Minus className="w-3.5 h-3.5" />
            Removed ({diff.removed.length})
          </div>
          <div className="flex flex-wrap gap-1.5">
            {diff.removed.map((label) => (
              <LabelChip key={label.id} label={label} status="removed" />
            ))}
          </div>
        </div>
      )}

      {/* Unchanged */}
      {diff.unchanged.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 text-xs font-medium text-gray-500 mb-2">
            <Equal className="w-3.5 h-3.5" />
            Unchanged ({diff.unchanged.length})
          </div>
          <div className="flex flex-wrap gap-1.5">
            {diff.unchanged.map((label) => (
              <LabelChip key={label.id} label={label} status="unchanged" />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function TagChip({
  tag,
  status,
  isExcluded = false,
}: {
  tag: { id: string; name: string; color: string; category_name?: string };
  status: 'added' | 'removed' | 'unchanged';
  isExcluded?: boolean;
}) {
  const colors = DIFF_COLORS[status];
  const displayName = tag.category_name ? `${tag.category_name}:${tag.name}` : tag.name;

  return (
    <span
      className={`
        inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium
        ${colors.bg} ${colors.border} border ${colors.text}
        ${isExcluded ? 'line-through opacity-70' : ''}
      `}
    >
      <span
        className="w-2 h-2 rounded-full"
        style={{ backgroundColor: tag.color }}
      />
      {displayName}
    </span>
  );
}

function LabelChip({
  label,
  status,
}: {
  label: { id: string; name: string; color: string };
  status: 'added' | 'removed' | 'unchanged';
}) {
  const colors = DIFF_COLORS[status];

  return (
    <span
      className={`
        inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium
        ${colors.bg} ${colors.border} border ${colors.text}
      `}
    >
      <span
        className="w-2 h-2 rounded"
        style={{ backgroundColor: label.color }}
      />
      {label.name}
    </span>
  );
}

function NumericDiffRow({
  label,
  diff,
  icon,
}: {
  label: string;
  diff: NumericDiff;
  icon: React.ReactNode;
}) {
  const isPositive = diff.delta > 0;
  const isNeutral = diff.delta === 0;

  return (
    <div className="flex items-center justify-between py-2 px-3 rounded-lg bg-gray-50">
      <div className="flex items-center gap-2">
        {icon}
        <span className="font-medium text-gray-700">{label}</span>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-gray-500">{diff.before.toLocaleString()}</span>
        <ArrowRight className="w-4 h-4 text-gray-400" />
        <span className="font-medium text-gray-900">{diff.after.toLocaleString()}</span>
        <span
          className={`
            px-2 py-0.5 rounded text-xs font-medium
            ${isPositive ? 'bg-green-100 text-green-700' : ''}
            ${!isPositive && !isNeutral ? 'bg-red-100 text-red-700' : ''}
            ${isNeutral ? 'bg-gray-100 text-gray-500' : ''}
          `}
        >
          {formatDelta(diff.delta)}
          {diff.percentChange !== null && !isNeutral && (
            <span className="ml-1 opacity-75">
              ({diff.percentChange >= 0 ? '+' : ''}{diff.percentChange.toFixed(0)}%)
            </span>
          )}
        </span>
      </div>
    </div>
  );
}

function SplitDiffCard({ split, diff }: { split: string; diff: NumericDiff }) {
  const isPositive = diff.delta > 0;

  const splitColors: Record<string, string> = {
    train: 'border-blue-200 bg-blue-50',
    val: 'border-amber-200 bg-amber-50',
    test: 'border-purple-200 bg-purple-50',
    none: 'border-gray-200 bg-gray-50',
  };

  const splitTextColors: Record<string, string> = {
    train: 'text-blue-700',
    val: 'text-amber-700',
    test: 'text-purple-700',
    none: 'text-gray-700',
  };

  return (
    <div
      className={`
        p-3 rounded-lg border
        ${splitColors[split] || splitColors.none}
      `}
    >
      <div className={`text-xs font-medium uppercase tracking-wide ${splitTextColors[split] || splitTextColors.none}`}>
        {split}
      </div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="text-lg font-semibold text-gray-900">
          {diff.after.toLocaleString()}
        </span>
        {diff.delta !== 0 && (
          <span
            className={`text-xs font-medium ${isPositive ? 'text-green-600' : 'text-red-600'}`}
          >
            {formatDelta(diff.delta)}
          </span>
        )}
      </div>
    </div>
  );
}
