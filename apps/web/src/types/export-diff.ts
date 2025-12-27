/**
 * Export Diff Types - Types for comparing export versions.
 */

import type {
  Export,
  ResolvedTagInfo,
  ResolvedLabelInfo,
} from './export';

// ============================================================================
// Diff Item Types
// ============================================================================

export type DiffStatus = 'added' | 'removed' | 'unchanged';

export interface TagDiff {
  added: ResolvedTagInfo[];
  removed: ResolvedTagInfo[];
  unchanged: ResolvedTagInfo[];
}

export interface LabelDiff {
  added: ResolvedLabelInfo[];
  removed: ResolvedLabelInfo[];
  unchanged: ResolvedLabelInfo[];
}

// ============================================================================
// Numeric Diff Types
// ============================================================================

export interface NumericDiff {
  before: number;
  after: number;
  delta: number;
  percentChange: number | null; // null if before is 0
}

export interface SummaryDiff {
  imageCount: NumericDiff;
  annotationCount: NumericDiff;
  classCounts: Record<string, NumericDiff>;
  splitCounts: Record<string, NumericDiff>;
}

// ============================================================================
// Filter Diff Types
// ============================================================================

export interface FilterModeDiff {
  before: 'AND' | 'OR';
  after: 'AND' | 'OR';
  changed: boolean;
}

export interface FilterDiff {
  includeMatchMode: FilterModeDiff;
  excludeMatchMode: FilterModeDiff;
}

// ============================================================================
// Main Diff Result
// ============================================================================

export interface ExportVersionDiff {
  exportA: Export; // Older version (left side)
  exportB: Export; // Newer version (right side)
  tags: TagDiff;
  excludedTags: TagDiff;
  labels: LabelDiff;
  summary: SummaryDiff;
  filter: FilterDiff;
  hasChanges: boolean;
}

// ============================================================================
// Diff Colors
// ============================================================================

export const DIFF_COLORS = {
  added: {
    bg: 'bg-green-50',
    border: 'border-green-200',
    text: 'text-green-700',
    badge: 'bg-green-100 text-green-800',
  },
  removed: {
    bg: 'bg-red-50',
    border: 'border-red-200',
    text: 'text-red-700',
    badge: 'bg-red-100 text-red-800',
  },
  unchanged: {
    bg: 'bg-gray-50',
    border: 'border-gray-200',
    text: 'text-gray-600',
    badge: 'bg-gray-100 text-gray-700',
  },
} as const;

export type DiffColorKey = keyof typeof DIFF_COLORS;
