/**
 * StatusBar - Always visible status bar showing active filters, display config, and image count
 * Bottom section of the toolbar
 */

import { Search, Ruler, Ratio, Eye, X, Sparkles, AlertTriangle, FolderOpen, Image as ImageIcon, Target } from 'lucide-react';
import type { AnnotationDisplayState } from '../../../hooks/useExploreVisibility';

// Filter pill component with consistent styling
interface FilterPillProps {
  icon?: React.ReactNode;
  label: string;
  value?: string;
  color: 'blue' | 'purple' | 'amber' | 'emerald' | 'red' | 'orange' | 'cyan' | 'teal' | 'violet' | 'indigo';
  onRemove?: () => void;
}

const colorClasses: Record<FilterPillProps['color'], string> = {
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

function FilterPill({ icon, label, value, color, onRemove }: FilterPillProps) {
  return (
    <div
      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border transition-colors hover:shadow-sm ${colorClasses[color]}`}
    >
      {icon && <span className="flex-shrink-0">{icon}</span>}
      <span className="font-medium">
        {label}
        {value && <span className="font-normal">: {value}</span>}
      </span>
      {onRemove && (
        <button
          onClick={onRemove}
          className="ml-0.5 opacity-60 hover:opacity-100 transition-opacity rounded-full hover:bg-black/5 p-0.5"
          aria-label={`Remove ${label} filter`}
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
      className="px-2 py-0.5 rounded-full text-xs font-medium flex items-center gap-1 border"
      style={{
        backgroundColor: `${color}20`,
        color: color,
        borderColor: `${color}40`,
      }}
    >
      <span>{isExclude ? '-' : '+'}{name}</span>
      {onRemove && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="opacity-60 hover:opacity-100 transition-opacity"
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
      onClick={onClick}
      className="flex items-center gap-1.5 px-2.5 py-1 text-xs text-emerald-600 bg-emerald-50/50 rounded-full border border-emerald-100 hover:bg-emerald-50 transition-colors"
      title="Configure display in sidebar"
    >
      <Eye className="w-3 h-3" />
      <span>{parts.slice(0, 2).join(' · ')}</span>
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

interface SidebarFilters {
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
}

interface StatusBarProps {
  // Filter state
  searchValue: string;
  selectedTaskIds: number[];
  isAnnotatedFilter: boolean | undefined;
  sidebarFilters: SidebarFilters;
  allTags: Tag[];

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
  onClearQualityFilters: () => void;
  onClearObjectCount: () => void;
  onClearBboxCount: () => void;
  onClearPolygonCount: () => void;
  onClearAll: () => void;

  // Display config
  annotationDisplay: AnnotationDisplayState;
  onDisplayConfigClick?: () => void;

  // Image count
  filteredCount: number;
  totalCount: number;
}

export function StatusBar({
  searchValue,
  selectedTaskIds,
  isAnnotatedFilter,
  sidebarFilters,
  allTags,
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
  annotationDisplay,
  onDisplayConfigClick,
  filteredCount,
  totalCount,
}: StatusBarProps) {
  // Calculate if any filters are active
  const includedTagIds = Object.entries(sidebarFilters.tagFilters)
    .filter(([, mode]) => mode === 'include')
    .map(([id]) => id);

  const excludedTagIds = Object.entries(sidebarFilters.tagFilters)
    .filter(([, mode]) => mode === 'exclude')
    .map(([id]) => id);

  const hasQualityFilters =
    sidebarFilters.quality_min !== undefined ||
    sidebarFilters.quality_max !== undefined ||
    sidebarFilters.sharpness_min !== undefined ||
    sidebarFilters.sharpness_max !== undefined ||
    sidebarFilters.brightness_min !== undefined ||
    sidebarFilters.brightness_max !== undefined ||
    sidebarFilters.contrast_min !== undefined ||
    sidebarFilters.contrast_max !== undefined ||
    sidebarFilters.uniqueness_min !== undefined ||
    sidebarFilters.uniqueness_max !== undefined ||
    (sidebarFilters.quality_issues && sidebarFilters.quality_issues.length > 0);

  const hasFilters =
    searchValue ||
    selectedTaskIds.length > 0 ||
    isAnnotatedFilter !== undefined ||
    includedTagIds.length > 0 ||
    excludedTagIds.length > 0 ||
    sidebarFilters.widthRange ||
    sidebarFilters.heightRange ||
    sidebarFilters.aspectRatioRange ||
    sidebarFilters.sizeRange ||
    sidebarFilters.filepathPattern ||
    (sidebarFilters.filepathPaths && sidebarFilters.filepathPaths.length > 0) ||
    (sidebarFilters.imageIds && sidebarFilters.imageIds.length > 0) ||
    hasQualityFilters ||
    sidebarFilters.object_count_min !== undefined ||
    sidebarFilters.object_count_max !== undefined ||
    sidebarFilters.bbox_count_min !== undefined ||
    sidebarFilters.bbox_count_max !== undefined ||
    sidebarFilters.polygon_count_min !== undefined ||
    sidebarFilters.polygon_count_max !== undefined;

  const isFiltered = filteredCount !== totalCount;

  return (
    <div className="flex items-center gap-3 px-3 py-1.5 bg-gray-50/60 border-t border-gray-200/30 rounded-b-xl min-h-[36px]">
      {/* Filters Section */}
      <div className="flex-1 flex items-center gap-1.5 flex-wrap min-w-0">
        {!hasFilters ? (
          <span className="text-xs text-gray-400">No filters</span>
        ) : (
          <>
            {/* Search */}
            {searchValue && (
              <FilterPill
                icon={<Search className="w-3 h-3" />}
                label={`"${searchValue.length > 15 ? searchValue.slice(0, 15) + '...' : searchValue}"`}
                color="blue"
                onRemove={onClearSearch}
              />
            )}

            {/* Tasks */}
            {selectedTaskIds.length > 0 && (
              <FilterPill
                label={`${selectedTaskIds.length} Task${selectedTaskIds.length > 1 ? 's' : ''}`}
                color="purple"
                onRemove={onClearTasks}
              />
            )}

            {/* Annotated status */}
            {isAnnotatedFilter !== undefined && (
              <FilterPill
                label={isAnnotatedFilter ? 'Annotated' : 'Not Annotated'}
                color="amber"
                onRemove={onClearAnnotatedFilter}
              />
            )}

            {/* Include tags */}
            {includedTagIds.length > 0 && (
              <div className="flex items-center gap-1 px-2 py-0.5 bg-emerald-50 rounded-full border border-emerald-200">
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
              </div>
            )}

            {/* Exclude tags */}
            {excludedTagIds.length > 0 && (
              <div className="flex items-center gap-1 px-2 py-0.5 bg-red-50 rounded-full border border-red-200">
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
              </div>
            )}

            {/* Dimension filters */}
            {sidebarFilters.widthRange && (
              <FilterPill
                icon={<Ruler className="w-3 h-3" />}
                label="Width"
                value={`${sidebarFilters.widthRange.min}-${sidebarFilters.widthRange.max}px`}
                color="purple"
                onRemove={onClearWidthRange}
              />
            )}

            {sidebarFilters.heightRange && (
              <FilterPill
                icon={<Ruler className="w-3 h-3" />}
                label="Height"
                value={`${sidebarFilters.heightRange.min}-${sidebarFilters.heightRange.max}px`}
                color="purple"
                onRemove={onClearHeightRange}
              />
            )}

            {sidebarFilters.aspectRatioRange && (
              <FilterPill
                icon={<Ratio className="w-3 h-3" />}
                label="Ratio"
                value={`${sidebarFilters.aspectRatioRange.min.toFixed(1)}-${sidebarFilters.aspectRatioRange.max.toFixed(1)}`}
                color="orange"
                onRemove={onClearAspectRatioRange}
              />
            )}

            {sidebarFilters.sizeRange && (
              <FilterPill
                label="Size"
                value={`${(sidebarFilters.sizeRange.min / (1024 * 1024)).toFixed(1)}-${(sidebarFilters.sizeRange.max / (1024 * 1024)).toFixed(1)}MB`}
                color="cyan"
                onRemove={onClearSizeRange}
              />
            )}

            {/* Filepath filters */}
            {sidebarFilters.filepathPattern && (
              <FilterPill
                icon={<FolderOpen className="w-3 h-3" />}
                label="Pattern"
                value={sidebarFilters.filepathPattern}
                color="teal"
                onRemove={onClearFilepathPattern}
              />
            )}

            {sidebarFilters.filepathPaths && sidebarFilters.filepathPaths.length > 0 && (
              <FilterPill
                icon={<FolderOpen className="w-3 h-3" />}
                label={`${sidebarFilters.filepathPaths.length} Dir${sidebarFilters.filepathPaths.length > 1 ? 's' : ''}`}
                color="teal"
                onRemove={onClearFilepathPaths}
              />
            )}

            {/* Image IDs */}
            {sidebarFilters.imageIds && sidebarFilters.imageIds.length > 0 && (
              <FilterPill
                icon={<ImageIcon className="w-3 h-3" />}
                label={`${sidebarFilters.imageIds.length} Image${sidebarFilters.imageIds.length > 1 ? 's' : ''}`}
                color="violet"
                onRemove={onClearImageIds}
              />
            )}

            {/* Detailed Quality filters */}
            {(sidebarFilters.quality_min !== undefined || sidebarFilters.quality_max !== undefined) && (
              <FilterPill
                icon={<Sparkles className="w-3 h-3" />}
                label="Quality"
                value={`${(sidebarFilters.quality_min ?? 0).toFixed(2)}-${(sidebarFilters.quality_max ?? 1).toFixed(2)}`}
                color="emerald"
                onRemove={onClearQualityFilters}
              />
            )}

            {(sidebarFilters.sharpness_min !== undefined || sidebarFilters.sharpness_max !== undefined) && (
              <FilterPill
                label="Sharpness"
                value={`${(sidebarFilters.sharpness_min ?? 0).toFixed(2)}-${(sidebarFilters.sharpness_max ?? 1).toFixed(2)}`}
                color="cyan"
                onRemove={onClearQualityFilters}
              />
            )}

            {(sidebarFilters.brightness_min !== undefined || sidebarFilters.brightness_max !== undefined) && (
              <FilterPill
                label="Brightness"
                value={`${(sidebarFilters.brightness_min ?? 0).toFixed(2)}-${(sidebarFilters.brightness_max ?? 1).toFixed(2)}`}
                color="amber"
                onRemove={onClearQualityFilters}
              />
            )}

            {(sidebarFilters.contrast_min !== undefined || sidebarFilters.contrast_max !== undefined) && (
              <FilterPill
                label="Contrast"
                value={`${(sidebarFilters.contrast_min ?? 0).toFixed(2)}-${(sidebarFilters.contrast_max ?? 1).toFixed(2)}`}
                color="blue"
                onRemove={onClearQualityFilters}
              />
            )}

            {(sidebarFilters.uniqueness_min !== undefined || sidebarFilters.uniqueness_max !== undefined) && (
              <FilterPill
                label="Uniqueness"
                value={`${(sidebarFilters.uniqueness_min ?? 0).toFixed(2)}-${(sidebarFilters.uniqueness_max ?? 1).toFixed(2)}`}
                color="purple"
                onRemove={onClearQualityFilters}
              />
            )}

            {/* Quality issues */}
            {sidebarFilters.quality_issues && sidebarFilters.quality_issues.length > 0 && (
              <FilterPill
                icon={<AlertTriangle className="w-3 h-3" />}
                label="Issues"
                value={sidebarFilters.quality_issues.map(i => i.replace(/_/g, ' ')).join(', ')}
                color="amber"
                onRemove={onClearQualityFilters}
              />
            )}

            {/* Object count filters */}
            {(sidebarFilters.object_count_min !== undefined || sidebarFilters.object_count_max !== undefined) && (
              <FilterPill
                label="Objects"
                value={`${sidebarFilters.object_count_min ?? 0}-${sidebarFilters.object_count_max ?? '∞'}`}
                color="indigo"
                onRemove={onClearObjectCount}
              />
            )}

            {(sidebarFilters.bbox_count_min !== undefined || sidebarFilters.bbox_count_max !== undefined) && (
              <FilterPill
                label="Bboxes"
                value={`${sidebarFilters.bbox_count_min ?? 0}-${sidebarFilters.bbox_count_max ?? '∞'}`}
                color="orange"
                onRemove={onClearBboxCount}
              />
            )}

            {(sidebarFilters.polygon_count_min !== undefined || sidebarFilters.polygon_count_max !== undefined) && (
              <FilterPill
                label="Polygons"
                value={`${sidebarFilters.polygon_count_min ?? 0}-${sidebarFilters.polygon_count_max ?? '∞'}`}
                color="purple"
                onRemove={onClearPolygonCount}
              />
            )}

          </>
        )}
      </div>

      {/* Divider */}
      <div className="w-px h-5 bg-gray-200/50 flex-shrink-0" />

      {/* Display Config */}
      <DisplayConfigIndicator
        annotationDisplay={annotationDisplay}
        onClick={onDisplayConfigClick}
      />

      {/* Divider */}
      <div className="w-px h-5 bg-gray-200/50 flex-shrink-0" />

      {/* Image Count */}
      <div className="text-xs text-gray-500 flex-shrink-0 whitespace-nowrap">
        {isFiltered ? (
          <>
            <span className="font-medium text-emerald-600">{filteredCount.toLocaleString()}</span>
            <span> of </span>
            <span>{totalCount.toLocaleString()}</span>
          </>
        ) : (
          <span>{totalCount.toLocaleString()} images</span>
        )}
      </div>

      {/* Clear All - Solid Glass Red Button (far right) */}
      {hasFilters && (
        <>
          <div className="w-px h-5 bg-gray-200/50 flex-shrink-0" />
          <button
            onClick={onClearAll}
            className="px-3 py-1 text-xs font-medium text-white rounded-full flex items-center gap-1 transition-all shadow-md hover:shadow-lg flex-shrink-0"
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
  );
}
