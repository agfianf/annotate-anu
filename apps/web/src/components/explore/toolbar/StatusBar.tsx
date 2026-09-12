/**
 * StatusBar - Always visible status bar showing active filters, display config, and image count
 * Bottom section of the toolbar
 */

import { Search, Ruler, Ratio, Eye, X, Sparkles, AlertTriangle, FolderOpen, Image as ImageIcon, Target, Briefcase, Palette, Clock, RefreshCw } from '@/components/ui/icons';
import type { AnnotationDisplayState } from '../../../hooks/useExploreVisibility';

/** Identifies one removable filter constraint. Removing a chip must clear only this key. */
export type ExploreFilterChipKey =
  | 'search' | 'tags' | 'excludedTags' | 'tasks' | 'job' | 'annotated'
  | 'width' | 'height' | 'fileSize' | 'aspectRatio'
  | 'objectCount' | 'bboxCount' | 'polygonCount'
  | 'quality' | 'sharpness' | 'brightness' | 'contrast' | 'uniqueness'
  | 'issues' | 'red' | 'green' | 'blue' | 'filepath' | 'imageUids';

/** Every removable constraint, in display order. Clear All must reset all of them. */
export const EXPLORE_FILTER_CHIP_KEYS: readonly ExploreFilterChipKey[] = [
  'search', 'tasks', 'job', 'annotated', 'tags', 'excludedTags',
  'width', 'height', 'aspectRatio', 'fileSize',
  'filepath', 'imageUids',
  'quality', 'sharpness', 'brightness', 'contrast', 'uniqueness', 'issues',
  'red', 'green', 'blue',
  'objectCount', 'bboxCount', 'polygonCount',
];

type PillColor = 'blue' | 'purple' | 'amber' | 'emerald' | 'red' | 'orange' | 'cyan' | 'teal' | 'violet' | 'indigo';

// Filter pill component with consistent styling
interface FilterPillProps {
  icon?: React.ReactNode;
  label: string;
  value?: string;
  color: PillColor;
  /** Full, untruncated text for the title attribute when `value` had to be shortened. */
  title?: string;
  onRemove?: () => void;
  removeLabel?: string;
}

const colorClasses: Record<PillColor, string> = {
  blue: 'bg-blue-50 text-blue-700 border-blue-200',
  purple: 'bg-purple-50 text-purple-700 border-purple-200',
  amber: 'bg-amber-50 text-amber-700 border-amber-200',
  emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  red: 'bg-red-50 text-red-700 border-red-200',
  orange: 'bg-orange-50 text-orange-700 border-orange-200',
  cyan: 'bg-cyan-50 text-cyan-700 border-cyan-200',
  teal: 'bg-teal-50 text-teal-700 border-teal-200',
  violet: 'bg-violet-50 text-violet-700 border-violet-200',
  indigo: 'bg-indigo-50 text-indigo-700 border-indigo-200',
};

/**
 * Dismiss control sizing. 24x24 CSS px is the WCAG 2.2 target-size-minimum (2.5.8)
 * threshold; the pill itself stays compact so labels are not oversized.
 */
const REMOVE_BUTTON_CLASS =
  'flex-shrink-0 inline-flex items-center justify-center w-6 h-6 -mr-1.5 rounded-full opacity-60 hover:opacity-100 hover:bg-black/5 transition-opacity';

function FilterPill({ icon, label, value, color, title, onRemove, removeLabel }: FilterPillProps) {
  return (
    <div
      className={`flex items-center gap-1.5 pl-2.5 pr-1.5 py-0.5 rounded-full text-xs border transition-colors hover:shadow-sm min-h-[28px] max-w-full ${colorClasses[color]}`}
      title={title}
    >
      {icon && <span className="flex-shrink-0">{icon}</span>}
      <span className="font-medium min-w-0 truncate">
        {label}
        {value && <span className="font-normal">: {value}</span>}
      </span>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className={REMOVE_BUTTON_CLASS}
          aria-label={removeLabel ?? `Remove ${label} filter`}
        >
          <X className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}

// Tag with custom color
interface TagPillProps {
  name: string;
  color: string;
  isExclude?: boolean;
  onRemove?: () => void;
}

function TagPill({ name, color, isExclude, onRemove }: TagPillProps) {
  return (
    <span
      className="pl-2 pr-0.5 py-0.5 rounded-full text-xs font-medium flex items-center gap-1 border min-h-[26px]"
      style={{
        backgroundColor: `${color}20`,
        color: color,
        borderColor: `${color}40`,
      }}
    >
      {/* Tag names are never truncated: the full name is what makes a tag identifiable. */}
      <span className="whitespace-nowrap">{isExclude ? '-' : '+'}{name}</span>
      {onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className={REMOVE_BUTTON_CLASS}
          aria-label={`Remove ${name} tag filter`}
        >
          <X className="w-3 h-3" />
        </button>
      )}
    </span>
  );
}

// Display config indicator
interface DisplayConfigProps {
  annotationDisplay: AnnotationDisplayState;
  onClick?: () => void;
}

function DisplayConfigIndicator({ annotationDisplay, onClick }: DisplayConfigProps) {
  const parts: string[] = [];

  // Annotation types
  if (annotationDisplay.showBboxes && annotationDisplay.showPolygons) {
    parts.push('Bboxes', 'Polygons');
  } else if (annotationDisplay.showBboxes) {
    parts.push('Bboxes only');
  } else if (annotationDisplay.showPolygons) {
    parts.push('Polygons only');
  } else {
    parts.push('No annotations');
  }

  // Labels
  if (annotationDisplay.showLabels) {
    parts.push('Labels');
  }

  // Non-default stroke/fill
  if (annotationDisplay.strokeWidth !== 'normal') {
    const strokeLabels: Record<string, string> = {
      thin: 'Thin',
      medium: 'Med',
      thick: 'Thick',
      'extra-thick': 'X-Thick',
    };
    parts.push(strokeLabels[annotationDisplay.strokeWidth] || annotationDisplay.strokeWidth);
  }

  if (annotationDisplay.fillOpacity !== 'none') {
    const fillLabels: Record<string, string> = {
      light: 'Light Fill',
      medium: 'Med Fill',
      strong: 'Strong Fill',
      solid: 'Solid Fill',
    };
    parts.push(fillLabels[annotationDisplay.fillOpacity] || annotationDisplay.fillOpacity);
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1.5 px-2.5 py-1 min-h-[24px] text-xs text-emerald-600 bg-emerald-50/50 rounded-full border border-emerald-100 hover:bg-emerald-50 transition-colors flex-shrink-0"
      title="Configure display in sidebar"
    >
      <Eye className="w-3 h-3" />
      <span className="whitespace-nowrap">{parts.slice(0, 2).join(' · ')}</span>
      {annotationDisplay.highlightMode && (
        <>
          <span className="text-emerald-400">·</span>
          <Target className="w-3 h-3 text-orange-500" />
          <span className="text-orange-600">Highlight</span>
        </>
      )}
    </button>
  );
}

// Types for filter data
interface Tag {
  id: string;
  name: string;
  color: string;
}

export interface SidebarFilters {
  tagFilters: Record<string, 'include' | 'exclude'>;
  includeMatchMode: 'AND' | 'OR';
  excludeMatchMode: 'AND' | 'OR';
  widthRange?: { min: number; max: number };
  heightRange?: { min: number; max: number };
  aspectRatioRange?: { min: number; max: number };
  sizeRange?: { min: number; max: number };
  filepathPattern?: string;
  filepathPaths?: string[];
  imageIds?: string[];
  quality_min?: number;
  quality_max?: number;
  sharpness_min?: number;
  sharpness_max?: number;
  brightness_min?: number;
  brightness_max?: number;
  contrast_min?: number;
  contrast_max?: number;
  uniqueness_min?: number;
  uniqueness_max?: number;
  quality_issues?: string[];
  object_count_min?: number;
  object_count_max?: number;
  bbox_count_min?: number;
  bbox_count_max?: number;
  polygon_count_min?: number;
  polygon_count_max?: number;
  /** RGB channel constraints. Previously invisible in the status bar, so they could not be removed. */
  red_min?: number;
  red_max?: number;
  green_min?: number;
  green_max?: number;
  blue_min?: number;
  blue_max?: number;
}

interface StatusBarProps {
  // Filter state
  searchValue: string;
  selectedTaskIds: number[];
  isAnnotatedFilter: boolean | undefined;
  sidebarFilters: SidebarFilters;
  allTags: Tag[];
  /** Job filter, stored outside `sidebarFilters` and therefore previously invisible here. */
  selectedJobId?: number | null;
  /** Human-readable job name for the job chip; falls back to the id. */
  selectedJobName?: string;

  // Filter removal handlers
  onClearSearch: () => void;
  onClearTasks: () => void;
  onClearAnnotatedFilter: () => void;
  onRemoveTag: (tagId: string) => void;
  onClearWidthRange: () => void;
  onClearHeightRange: () => void;
  onClearAspectRatioRange: () => void;
  onClearSizeRange: () => void;
  onClearFilepathPattern: () => void;
  onClearFilepathPaths: () => void;
  onClearImageIds: () => void;
  /** @deprecated Grouped reset. Used only when `onRemoveFilter` is absent; it clears the whole quality group. */
  onClearQualityFilters: () => void;
  onClearObjectCount: () => void;
  onClearBboxCount: () => void;
  onClearPolygonCount: () => void;
  onClearAll: () => void;
  /**
   * Removes exactly one constraint. When supplied it takes precedence over every grouped
   * handler above, so dismissing Brightness leaves Sharpness alone.
   */
  onRemoveFilter?: (key: ExploreFilterChipKey) => void;

  // Display config
  annotationDisplay: AnnotationDisplayState;
  onDisplayConfigClick?: () => void;

  // Image counts
  /** @deprecated Ambiguous. Prefer `loadedCount`; kept as its fallback. */
  filteredCount?: number;
  /** @deprecated Ambiguous. Prefer `matchingCount`; kept as its fallback. */
  totalCount?: number;
  /**
   * Every image in the project, ignoring filters. Omit it when no unfiltered count is available:
   * the readout then reports loaded and matching only, rather than calling a filtered total the
   * project's size.
   */
  projectTotal?: number;
  /** Server-reported total for the current filters. */
  matchingCount?: number;
  /** Images currently materialised in the client. */
  loadedCount?: number;

  /** A filter change has been committed but the matching set has not resolved yet. */
  isResultsPending?: boolean;
  /** The same filters are being re-fetched in the background; current counts still hold. */
  isBackgroundRefreshing?: boolean;
}

interface FilterChip {
  key: ExploreFilterChipKey;
  label: string;
  value?: string;
  title?: string;
  icon?: React.ReactNode;
  color: PillColor;
  /** Used only when `onRemoveFilter` is absent. */
  legacyRemove: () => void;
}

const hasAny = (...values: (number | undefined)[]) => values.some((v) => v !== undefined);
const ratio = (min?: number, max?: number) => `${(min ?? 0).toFixed(2)}-${(max ?? 1).toFixed(2)}`;
const count = (min?: number, max?: number) => `${min ?? 0}-${max ?? '∞'}`;

export function StatusBar({
  searchValue,
  selectedTaskIds,
  isAnnotatedFilter,
  sidebarFilters,
  allTags,
  selectedJobId,
  selectedJobName,
  onClearSearch,
  onClearTasks,
  onClearAnnotatedFilter,
  onRemoveTag,
  onClearWidthRange,
  onClearHeightRange,
  onClearAspectRatioRange,
  onClearSizeRange,
  onClearFilepathPattern,
  onClearFilepathPaths,
  onClearImageIds,
  onClearQualityFilters,
  onClearObjectCount,
  onClearBboxCount,
  onClearPolygonCount,
  onClearAll,
  onRemoveFilter,
  annotationDisplay,
  onDisplayConfigClick,
  filteredCount,
  totalCount,
  projectTotal,
  matchingCount,
  loadedCount,
  isResultsPending = false,
  isBackgroundRefreshing = false,
}: StatusBarProps) {
  const includedTagIds = Object.entries(sidebarFilters.tagFilters)
    .filter(([, mode]) => mode === 'include')
    .map(([id]) => id);

  const excludedTagIds = Object.entries(sidebarFilters.tagFilters)
    .filter(([, mode]) => mode === 'exclude')
    .map(([id]) => id);

  const noop = () => {};

  // One descriptor per constraint, derived from the filter state itself. A constraint that
  // exists in the state but has no descriptor here is invisible and unremovable, which is the
  // class of bug that let the job and RGB filters survive Clear All.
  const chips: FilterChip[] = [];

  if (searchValue) {
    chips.push({
      key: 'search',
      label: `"${searchValue.length > 15 ? searchValue.slice(0, 15) + '…' : searchValue}"`,
      title: `Search: ${searchValue}`,
      icon: <Search className="w-3 h-3" />,
      color: 'blue',
      legacyRemove: onClearSearch,
    });
  }

  if (selectedTaskIds.length > 0) {
    chips.push({
      key: 'tasks',
      label: `${selectedTaskIds.length} Task${selectedTaskIds.length > 1 ? 's' : ''}`,
      color: 'purple',
      legacyRemove: onClearTasks,
    });
  }

  if (selectedJobId !== undefined && selectedJobId !== null) {
    chips.push({
      key: 'job',
      label: 'Job',
      value: selectedJobName ?? `#${selectedJobId}`,
      icon: <Briefcase className="w-3 h-3" />,
      color: 'indigo',
      // No legacy handler exists for the job filter; without `onRemoveFilter` it stays read-only
      // rather than silently clearing something else.
      legacyRemove: noop,
    });
  }

  if (isAnnotatedFilter !== undefined) {
    chips.push({
      key: 'annotated',
      label: isAnnotatedFilter ? 'Annotated' : 'Not Annotated',
      color: 'amber',
      legacyRemove: onClearAnnotatedFilter,
    });
  }

  if (sidebarFilters.widthRange) {
    chips.push({
      key: 'width',
      label: 'Width',
      value: `${sidebarFilters.widthRange.min}-${sidebarFilters.widthRange.max}px`,
      icon: <Ruler className="w-3 h-3" />,
      color: 'purple',
      legacyRemove: onClearWidthRange,
    });
  }

  if (sidebarFilters.heightRange) {
    chips.push({
      key: 'height',
      label: 'Height',
      value: `${sidebarFilters.heightRange.min}-${sidebarFilters.heightRange.max}px`,
      icon: <Ruler className="w-3 h-3" />,
      color: 'purple',
      legacyRemove: onClearHeightRange,
    });
  }

  if (sidebarFilters.aspectRatioRange) {
    chips.push({
      key: 'aspectRatio',
      label: 'Ratio',
      value: `${sidebarFilters.aspectRatioRange.min.toFixed(1)}-${sidebarFilters.aspectRatioRange.max.toFixed(1)}`,
      icon: <Ratio className="w-3 h-3" />,
      color: 'orange',
      legacyRemove: onClearAspectRatioRange,
    });
  }

  if (sidebarFilters.sizeRange) {
    chips.push({
      key: 'fileSize',
      label: 'Size',
      value: `${(sidebarFilters.sizeRange.min / (1024 * 1024)).toFixed(1)}-${(sidebarFilters.sizeRange.max / (1024 * 1024)).toFixed(1)}MB`,
      color: 'cyan',
      legacyRemove: onClearSizeRange,
    });
  }

  if (sidebarFilters.filepathPattern) {
    chips.push({
      key: 'filepath',
      label: 'Pattern',
      value: sidebarFilters.filepathPattern,
      title: `Path pattern: ${sidebarFilters.filepathPattern}`,
      icon: <FolderOpen className="w-3 h-3" />,
      color: 'teal',
      legacyRemove: onClearFilepathPattern,
    });
  }

  if (sidebarFilters.filepathPaths && sidebarFilters.filepathPaths.length > 0) {
    chips.push({
      key: 'filepath',
      label: `${sidebarFilters.filepathPaths.length} Dir${sidebarFilters.filepathPaths.length > 1 ? 's' : ''}`,
      title: sidebarFilters.filepathPaths.join('\n'),
      icon: <FolderOpen className="w-3 h-3" />,
      color: 'teal',
      legacyRemove: onClearFilepathPaths,
    });
  }

  if (sidebarFilters.imageIds && sidebarFilters.imageIds.length > 0) {
    chips.push({
      key: 'imageUids',
      label: `${sidebarFilters.imageIds.length} Image${sidebarFilters.imageIds.length > 1 ? 's' : ''}`,
      icon: <ImageIcon className="w-3 h-3" />,
      color: 'violet',
      legacyRemove: onClearImageIds,
    });
  }

  if (hasAny(sidebarFilters.quality_min, sidebarFilters.quality_max)) {
    chips.push({
      key: 'quality',
      label: 'Quality',
      value: ratio(sidebarFilters.quality_min, sidebarFilters.quality_max),
      icon: <Sparkles className="w-3 h-3" />,
      color: 'emerald',
      legacyRemove: onClearQualityFilters,
    });
  }

  if (hasAny(sidebarFilters.sharpness_min, sidebarFilters.sharpness_max)) {
    chips.push({
      key: 'sharpness',
      label: 'Sharpness',
      value: ratio(sidebarFilters.sharpness_min, sidebarFilters.sharpness_max),
      color: 'cyan',
      legacyRemove: onClearQualityFilters,
    });
  }

  if (hasAny(sidebarFilters.brightness_min, sidebarFilters.brightness_max)) {
    chips.push({
      key: 'brightness',
      label: 'Brightness',
      value: ratio(sidebarFilters.brightness_min, sidebarFilters.brightness_max),
      color: 'amber',
      legacyRemove: onClearQualityFilters,
    });
  }

  if (hasAny(sidebarFilters.contrast_min, sidebarFilters.contrast_max)) {
    chips.push({
      key: 'contrast',
      label: 'Contrast',
      value: ratio(sidebarFilters.contrast_min, sidebarFilters.contrast_max),
      color: 'blue',
      legacyRemove: onClearQualityFilters,
    });
  }

  if (hasAny(sidebarFilters.uniqueness_min, sidebarFilters.uniqueness_max)) {
    chips.push({
      key: 'uniqueness',
      label: 'Uniqueness',
      value: ratio(sidebarFilters.uniqueness_min, sidebarFilters.uniqueness_max),
      color: 'purple',
      legacyRemove: onClearQualityFilters,
    });
  }

  if (sidebarFilters.quality_issues && sidebarFilters.quality_issues.length > 0) {
    const issues = sidebarFilters.quality_issues.map((i) => i.replace(/_/g, ' ')).join(', ');
    chips.push({
      key: 'issues',
      label: 'Issues',
      value: issues,
      title: `Quality issues: ${issues}`,
      icon: <AlertTriangle className="w-3 h-3" />,
      color: 'amber',
      legacyRemove: onClearQualityFilters,
    });
  }

  if (hasAny(sidebarFilters.red_min, sidebarFilters.red_max)) {
    chips.push({
      key: 'red',
      label: 'Red',
      value: ratio(sidebarFilters.red_min, sidebarFilters.red_max),
      icon: <Palette className="w-3 h-3" />,
      color: 'red',
      legacyRemove: noop,
    });
  }

  if (hasAny(sidebarFilters.green_min, sidebarFilters.green_max)) {
    chips.push({
      key: 'green',
      label: 'Green',
      value: ratio(sidebarFilters.green_min, sidebarFilters.green_max),
      icon: <Palette className="w-3 h-3" />,
      color: 'emerald',
      legacyRemove: noop,
    });
  }

  if (hasAny(sidebarFilters.blue_min, sidebarFilters.blue_max)) {
    chips.push({
      key: 'blue',
      label: 'Blue',
      value: ratio(sidebarFilters.blue_min, sidebarFilters.blue_max),
      icon: <Palette className="w-3 h-3" />,
      color: 'blue',
      legacyRemove: noop,
    });
  }

  if (hasAny(sidebarFilters.object_count_min, sidebarFilters.object_count_max)) {
    chips.push({
      key: 'objectCount',
      label: 'Objects',
      value: count(sidebarFilters.object_count_min, sidebarFilters.object_count_max),
      color: 'indigo',
      legacyRemove: onClearObjectCount,
    });
  }

  if (hasAny(sidebarFilters.bbox_count_min, sidebarFilters.bbox_count_max)) {
    chips.push({
      key: 'bboxCount',
      label: 'Bboxes',
      value: count(sidebarFilters.bbox_count_min, sidebarFilters.bbox_count_max),
      color: 'orange',
      legacyRemove: onClearBboxCount,
    });
  }

  if (hasAny(sidebarFilters.polygon_count_min, sidebarFilters.polygon_count_max)) {
    chips.push({
      key: 'polygonCount',
      label: 'Polygons',
      value: count(sidebarFilters.polygon_count_min, sidebarFilters.polygon_count_max),
      color: 'purple',
      legacyRemove: onClearPolygonCount,
    });
  }

  const removeChip = (chip: FilterChip) => () => {
    if (onRemoveFilter) {
      onRemoveFilter(chip.key);
    } else {
      chip.legacyRemove();
    }
  };

  const hasFilters = chips.length > 0 || includedTagIds.length > 0 || excludedTagIds.length > 0;

  // Clear All resets every key in the union when per-key removal is wired, so a constraint that
  // has no chip on screen (a job restored from analytics, say) still goes away.
  const handleClearAll = () => {
    if (onRemoveFilter) {
      EXPLORE_FILTER_CHIP_KEYS.forEach((key) => onRemoveFilter(key));
    }
    onClearAll();
  };

  const resolvedLoaded = loadedCount ?? filteredCount ?? 0;
  const resolvedMatching = matchingCount ?? totalCount ?? resolvedLoaded;
  // `projectTotal` is the *only* source of "in the project" (C4). It is never derived from a
  // filtered number: `matchingCount` and the deprecated `totalCount` both describe the current
  // filters, so substituting either would put the word "project" on a filtered total. When no
  // genuine project total is supplied the readout says what it actually knows, loaded and matching.
  const hasProjectTotal = projectTotal !== undefined;

  const hasUnloaded = resolvedLoaded < resolvedMatching;
  const isNarrowedByFilters = projectTotal !== undefined && resolvedMatching < projectTotal;

  const loadedLabel = resolvedLoaded.toLocaleString();
  const matchingLabel = resolvedMatching.toLocaleString();
  const projectLabel = projectTotal?.toLocaleString() ?? '';

  const countSummary = isNarrowedByFilters
    ? `${loadedLabel} images loaded, ${matchingLabel} matching the current filters, ${projectLabel} in the project.`
    : hasProjectTotal
      ? hasUnloaded
        ? `${loadedLabel} images loaded of ${projectLabel} in the project.`
        : `${projectLabel} images in the project.`
      : hasUnloaded
        ? `${loadedLabel} images loaded, ${matchingLabel} matching the current filters.`
        : hasFilters
          ? `${matchingLabel} images matching the current filters.`
          : `${matchingLabel} images.`;

  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-x-3 gap-y-1.5 px-3 py-1.5 bg-gray-50/60 border-t border-gray-200/30 rounded-b-xl min-h-[36px]">
      {/* Filters Section */}
      <div className="flex-1 flex items-center gap-1.5 flex-wrap min-w-0">
        {!hasFilters ? (
          <span className="text-xs text-gray-400">No filters</span>
        ) : (
          <>
            {/* Include tags — full names, never truncated, each removable on its own */}
            {includedTagIds.length > 0 && (
              <div className="flex items-center gap-1 flex-wrap pl-2 pr-0.5 py-0.5 bg-emerald-50 rounded-full border border-emerald-200">
                <span className="text-xs font-medium text-emerald-700">
                  +({sidebarFilters.includeMatchMode}):
                </span>
                {includedTagIds.map((tagId) => {
                  const tag = allTags.find((t) => t.id === tagId);
                  if (!tag) return null;
                  return (
                    <TagPill
                      key={tagId}
                      name={tag.name}
                      color={tag.color}
                      onRemove={() => onRemoveTag(tagId)}
                    />
                  );
                })}
                <button
                  type="button"
                  onClick={() => (onRemoveFilter ? onRemoveFilter('tags') : includedTagIds.forEach(onRemoveTag))}
                  className={`${REMOVE_BUTTON_CLASS} text-emerald-700`}
                  aria-label="Remove all included tag filters"
                  title="Remove all included tag filters"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            )}

            {/* Exclude tags */}
            {excludedTagIds.length > 0 && (
              <div className="flex items-center gap-1 flex-wrap pl-2 pr-0.5 py-0.5 bg-red-50 rounded-full border border-red-200">
                <span className="text-xs font-medium text-red-700">
                  -({sidebarFilters.excludeMatchMode}):
                </span>
                {excludedTagIds.map((tagId) => {
                  const tag = allTags.find((t) => t.id === tagId);
                  if (!tag) return null;
                  return (
                    <TagPill
                      key={tagId}
                      name={tag.name}
                      color={tag.color}
                      isExclude
                      onRemove={() => onRemoveTag(tagId)}
                    />
                  );
                })}
                <button
                  type="button"
                  onClick={() => (onRemoveFilter ? onRemoveFilter('excludedTags') : excludedTagIds.forEach(onRemoveTag))}
                  className={`${REMOVE_BUTTON_CLASS} text-red-700`}
                  aria-label="Remove all excluded tag filters"
                  title="Remove all excluded tag filters"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            )}

            {chips.map((chip) => (
              <FilterPill
                key={`${chip.key}:${chip.label}`}
                icon={chip.icon}
                label={chip.label}
                value={chip.value}
                title={chip.title}
                color={chip.color}
                onRemove={onRemoveFilter || chip.legacyRemove !== noop ? removeChip(chip) : undefined}
                removeLabel={`Remove ${chip.label} filter`}
              />
            ))}
          </>
        )}
      </div>

      {/* Right cluster: result state, display config, counts, Clear All */}
      <div className="flex items-center gap-2 sm:gap-3 flex-wrap min-w-0">
        {/*
          Pending and refreshing are different claims. Pending means the filters changed and the
          matching set is unknown, so counts below describe the *previous* scope and bulk actions
          must not be described against them. Refreshing means the same scope is being re-read.
        */}
        {isResultsPending ? (
          <span
            className="flex items-center gap-1.5 px-2.5 py-1 min-h-[24px] text-xs text-amber-700 bg-amber-50 rounded-full border border-amber-200 flex-shrink-0"
            role="status"
          >
            <Clock className="w-3 h-3" />
            <span className="whitespace-nowrap">Results pending</span>
          </span>
        ) : isBackgroundRefreshing ? (
          <span
            className="flex items-center gap-1.5 px-2.5 py-1 min-h-[24px] text-xs text-gray-500 bg-gray-100 rounded-full border border-gray-200 flex-shrink-0"
            role="status"
          >
            <RefreshCw className="w-3 h-3" />
            <span className="whitespace-nowrap">Refreshing</span>
          </span>
        ) : null}

        <div className="w-px h-5 bg-gray-200/50 flex-shrink-0 hidden sm:block" />

        <DisplayConfigIndicator
          annotationDisplay={annotationDisplay}
          onClick={onDisplayConfigClick}
        />

        <div className="w-px h-5 bg-gray-200/50 flex-shrink-0 hidden sm:block" />

        {/* Three counts, never conflated: loaded, matching, project total. "in project" appears
            only when a genuinely unfiltered `projectTotal` was supplied. */}
        <div
          className={`text-xs flex-shrink-0 whitespace-nowrap ${isResultsPending ? 'text-gray-400' : 'text-gray-500'}`}
          title={isResultsPending ? `${countSummary} These counts describe the previous filters.` : countSummary}
          aria-label={countSummary}
        >
          {isNarrowedByFilters ? (
            <>
              <span className="font-medium text-emerald-600">{loadedLabel}</span>
              <span> loaded · </span>
              <span className="font-medium">{matchingLabel}</span>
              <span> matching · </span>
              <span>{projectLabel} in project</span>
            </>
          ) : hasProjectTotal ? (
            hasUnloaded ? (
              <>
                <span className="font-medium text-emerald-600">{loadedLabel}</span>
                <span> loaded of </span>
                <span>{projectLabel} in project</span>
              </>
            ) : (
              <span>{projectLabel} in project</span>
            )
          ) : hasUnloaded ? (
            <>
              <span className="font-medium text-emerald-600">{loadedLabel}</span>
              <span> loaded · </span>
              <span className="font-medium">{matchingLabel}</span>
              <span> matching</span>
            </>
          ) : (
            <span>
              {matchingLabel} {hasFilters ? 'matching' : 'images'}
            </span>
          )}
        </div>

        {/* Clear All - Solid Glass Red Button (far right) */}
        {hasFilters && (
          <>
            <div className="w-px h-5 bg-gray-200/50 flex-shrink-0 hidden sm:block" />
            <button
              type="button"
              onClick={handleClearAll}
              className="px-3 py-1 min-h-[24px] text-xs font-medium text-white rounded-full flex items-center gap-1 transition-all shadow-md hover:shadow-lg flex-shrink-0"
              style={{
                background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.9) 0%, rgba(220, 38, 38, 0.95) 100%)',
                backdropFilter: 'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)',
                border: '1px solid rgba(239, 68, 68, 0.5)',
                boxShadow: '0 2px 8px rgba(239, 68, 68, 0.3), 0 0 0 1px rgba(255, 255, 255, 0.1) inset'
              }}
            >
              <X className="w-3 h-3" />
              Clear All
            </button>
          </>
        )}
      </div>
    </div>
  );
}
