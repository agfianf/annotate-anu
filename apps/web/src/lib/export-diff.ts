/**
 * Export Diff Utilities - Functions for computing differences between export versions.
 */

import type {
  Export,
  ResolvedTagInfo,
  ResolvedLabelInfo,
  ExportSummary,
  TagDiff,
  LabelDiff,
  NumericDiff,
  SummaryDiff,
  FilterDiff,
  ExportVersionDiff,
} from '@/types/export';

// ============================================================================
// Tag/Label Diff Computation
// ============================================================================

/**
 * Compare two arrays of tags by ID and classify as added/removed/unchanged.
 */
export function computeTagDiff(
  tagsA: ResolvedTagInfo[] = [],
  tagsB: ResolvedTagInfo[] = []
): TagDiff {
  const idsA = new Set(tagsA.map((t) => t.id));
  const idsB = new Set(tagsB.map((t) => t.id));
  const tagMapB = new Map(tagsB.map((t) => [t.id, t]));

  return {
    added: tagsB.filter((t) => !idsA.has(t.id)),
    removed: tagsA.filter((t) => !idsB.has(t.id)),
    unchanged: tagsA
      .filter((t) => idsB.has(t.id))
      .map((t) => tagMapB.get(t.id) ?? t), // Use newer version for unchanged
  };
}

/**
 * Compare two arrays of labels by ID and classify as added/removed/unchanged.
 */
export function computeLabelDiff(
  labelsA: ResolvedLabelInfo[] = [],
  labelsB: ResolvedLabelInfo[] = []
): LabelDiff {
  const idsA = new Set(labelsA.map((l) => l.id));
  const idsB = new Set(labelsB.map((l) => l.id));
  const labelMapB = new Map(labelsB.map((l) => [l.id, l]));

  return {
    added: labelsB.filter((l) => !idsA.has(l.id)),
    removed: labelsA.filter((l) => !idsB.has(l.id)),
    unchanged: labelsA
      .filter((l) => idsB.has(l.id))
      .map((l) => labelMapB.get(l.id) ?? l),
  };
}

// ============================================================================
// Numeric Diff Computation
// ============================================================================

/**
 * Compute numeric diff with delta and percent change.
 */
export function computeNumericDiff(before: number, after: number): NumericDiff {
  const delta = after - before;
  const percentChange = before !== 0 ? (delta / before) * 100 : null;

  return {
    before,
    after,
    delta,
    percentChange,
  };
}

/**
 * Compute summary diffs for all counts.
 */
export function computeSummaryDiff(
  summaryA: ExportSummary | undefined,
  summaryB: ExportSummary | undefined
): SummaryDiff {
  const defaultSummary: ExportSummary = {
    image_count: 0,
    annotation_count: 0,
    class_counts: {},
    split_counts: {},
  };

  const a = summaryA ?? defaultSummary;
  const b = summaryB ?? defaultSummary;

  // Merge all class keys
  const allClasses = new Set([
    ...Object.keys(a.class_counts),
    ...Object.keys(b.class_counts),
  ]);
  const classCounts: Record<string, NumericDiff> = {};
  for (const className of allClasses) {
    classCounts[className] = computeNumericDiff(
      a.class_counts[className] ?? 0,
      b.class_counts[className] ?? 0
    );
  }

  // Merge all split keys
  const allSplits = new Set([
    ...Object.keys(a.split_counts),
    ...Object.keys(b.split_counts),
  ]);
  const splitCounts: Record<string, NumericDiff> = {};
  for (const splitName of allSplits) {
    splitCounts[splitName] = computeNumericDiff(
      a.split_counts[splitName] ?? 0,
      b.split_counts[splitName] ?? 0
    );
  }

  return {
    imageCount: computeNumericDiff(a.image_count, b.image_count),
    annotationCount: computeNumericDiff(a.annotation_count, b.annotation_count),
    classCounts,
    splitCounts,
  };
}

// ============================================================================
// Filter Mode Diff
// ============================================================================

/**
 * Compute filter mode diff.
 */
export function computeFilterDiff(
  filterSummaryA: { include_match_mode?: 'AND' | 'OR'; exclude_match_mode?: 'AND' | 'OR' } | undefined,
  filterSummaryB: { include_match_mode?: 'AND' | 'OR'; exclude_match_mode?: 'AND' | 'OR' } | undefined
): FilterDiff {
  const includeA = filterSummaryA?.include_match_mode ?? 'OR';
  const includeB = filterSummaryB?.include_match_mode ?? 'OR';
  const excludeA = filterSummaryA?.exclude_match_mode ?? 'OR';
  const excludeB = filterSummaryB?.exclude_match_mode ?? 'OR';

  return {
    includeMatchMode: {
      before: includeA,
      after: includeB,
      changed: includeA !== includeB,
    },
    excludeMatchMode: {
      before: excludeA,
      after: excludeB,
      changed: excludeA !== excludeB,
    },
  };
}

// ============================================================================
// Main Diff Function
// ============================================================================

/**
 * Compute full diff between two exports.
 *
 * @param exportA - The older/left export
 * @param exportB - The newer/right export
 * @returns Complete diff result
 */
export function computeExportDiff(
  exportA: Export,
  exportB: Export
): ExportVersionDiff {
  const metaA = exportA.resolved_metadata;
  const metaB = exportB.resolved_metadata;

  const tags = computeTagDiff(metaA?.tags, metaB?.tags);
  const excludedTags = computeTagDiff(metaA?.excluded_tags, metaB?.excluded_tags);
  const labels = computeLabelDiff(metaA?.labels, metaB?.labels);
  const summary = computeSummaryDiff(exportA.summary, exportB.summary);
  const filter = computeFilterDiff(metaA?.filter_summary, metaB?.filter_summary);

  // Determine if there are any meaningful changes
  const hasChanges =
    tags.added.length > 0 ||
    tags.removed.length > 0 ||
    excludedTags.added.length > 0 ||
    excludedTags.removed.length > 0 ||
    labels.added.length > 0 ||
    labels.removed.length > 0 ||
    summary.imageCount.delta !== 0 ||
    summary.annotationCount.delta !== 0 ||
    filter.includeMatchMode.changed ||
    filter.excludeMatchMode.changed;

  return {
    exportA,
    exportB,
    tags,
    excludedTags,
    labels,
    summary,
    filter,
    hasChanges,
  };
}

// ============================================================================
// Formatting Utilities
// ============================================================================

/**
 * Format a numeric diff as a string with sign and optional percentage.
 */
export function formatNumericDiff(diff: NumericDiff): string {
  const sign = diff.delta >= 0 ? '+' : '';
  const percent =
    diff.percentChange !== null
      ? ` (${sign}${diff.percentChange.toFixed(0)}%)`
      : '';
  return `${diff.before.toLocaleString()} → ${diff.after.toLocaleString()} (${sign}${diff.delta.toLocaleString()}${percent})`;
}

/**
 * Format a delta value with sign.
 */
export function formatDelta(delta: number): string {
  const sign = delta >= 0 ? '+' : '';
  return `${sign}${delta.toLocaleString()}`;
}

/**
 * Generate a compact diff summary string.
 * Example: "+2 tags, -1 label, +500 images"
 */
export function formatDiffSummary(diff: ExportVersionDiff): string {
  const parts: string[] = [];

  // Tags
  if (diff.tags.added.length > 0) {
    parts.push(`+${diff.tags.added.length} tag${diff.tags.added.length > 1 ? 's' : ''}`);
  }
  if (diff.tags.removed.length > 0) {
    parts.push(`-${diff.tags.removed.length} tag${diff.tags.removed.length > 1 ? 's' : ''}`);
  }

  // Excluded tags
  if (diff.excludedTags.added.length > 0) {
    parts.push(`+${diff.excludedTags.added.length} excluded`);
  }
  if (diff.excludedTags.removed.length > 0) {
    parts.push(`-${diff.excludedTags.removed.length} excluded`);
  }

  // Labels
  if (diff.labels.added.length > 0) {
    parts.push(`+${diff.labels.added.length} label${diff.labels.added.length > 1 ? 's' : ''}`);
  }
  if (diff.labels.removed.length > 0) {
    parts.push(`-${diff.labels.removed.length} label${diff.labels.removed.length > 1 ? 's' : ''}`);
  }

  // Images
  if (diff.summary.imageCount.delta !== 0) {
    parts.push(`${formatDelta(diff.summary.imageCount.delta)} images`);
  }

  // Annotations
  if (diff.summary.annotationCount.delta !== 0) {
    parts.push(`${formatDelta(diff.summary.annotationCount.delta)} annotations`);
  }

  if (parts.length === 0) {
    return 'No changes';
  }

  return parts.join(', ');
}

/**
 * Check if a tag/label diff has any changes.
 */
export function hasDiffChanges(diff: TagDiff | LabelDiff): boolean {
  return diff.added.length > 0 || diff.removed.length > 0;
}
