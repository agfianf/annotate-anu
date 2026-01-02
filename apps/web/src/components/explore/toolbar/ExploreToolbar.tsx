/**
 * ExploreToolbar - Main toolbar container with three zones and status bar
 *
 * Layout:
 * Row 1: [FilterZone] | [ViewZone] | [ActionZone]
 * Row 2: [StatusBar - filters, display config, count]
 */

import { FilterZone } from './FilterZone';
import { ViewZone } from './ViewZone';
import { ActionZone } from './ActionZone';
import { StatusBar } from './StatusBar';
import type { GridSize } from './GridSlider';
import type { AnnotationDisplayState } from '../../../hooks/useExploreVisibility';

interface Task {
  id: number;
  name: string;
}

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

interface ExploreToolbarProps {
  // Filter Zone props
  searchValue: string;
  onSearchChange: (value: string) => void;
  tasks: Task[];
  selectedTaskIds: number[];
  onTasksChange: (taskIds: number[]) => void;
  isAnnotatedFilter: boolean | undefined;
  onAnnotatedFilterChange: (value: boolean | undefined) => void;

  // View Zone props
  gridSize: GridSize;
  onGridSizeChange: (size: GridSize) => void;
  isFullView: boolean;
  onToggleFullView: () => void;

  // Action Zone props
  onExport: () => void;

  // Status Bar props
  sidebarFilters: SidebarFilters;
  allTags: Tag[];
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

  // Image counts
  filteredCount: number;
  totalCount: number;
}

export function ExploreToolbar({
  // Filter Zone
  searchValue,
  onSearchChange,
  tasks,
  selectedTaskIds,
  onTasksChange,
  isAnnotatedFilter,
  onAnnotatedFilterChange,

  // View Zone
  gridSize,
  onGridSizeChange,
  isFullView,
  onToggleFullView,

  // Action Zone
  onExport,

  // Status Bar
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
}: ExploreToolbarProps) {
  return (
    <div className="glass-strong rounded-xl shadow-lg relative z-20">
      {/* Row 1: Control Bar */}
      <div className="flex items-center gap-3 p-2">
        {/* Filter Zone (Left) */}
        <FilterZone
          searchValue={searchValue}
          onSearchChange={onSearchChange}
          tasks={tasks}
          selectedTaskIds={selectedTaskIds}
          onTasksChange={onTasksChange}
          isAnnotatedFilter={isAnnotatedFilter}
          onAnnotatedFilterChange={onAnnotatedFilterChange}
        />

        {/* Divider */}
        <div className="w-px h-6 bg-gray-200/50 flex-shrink-0" />

        {/* View Zone (Middle) */}
        <ViewZone
          gridSize={gridSize}
          onGridSizeChange={onGridSizeChange}
          isFullView={isFullView}
          onToggleFullView={onToggleFullView}
        />

        {/* Divider */}
        <div className="w-px h-6 bg-gray-200/50 flex-shrink-0" />

        {/* Action Zone (Right) */}
        <ActionZone onExport={onExport} />
      </div>

      {/* Row 2: Status Bar */}
      <StatusBar
        searchValue={searchValue}
        selectedTaskIds={selectedTaskIds}
        isAnnotatedFilter={isAnnotatedFilter}
        sidebarFilters={sidebarFilters}
        allTags={allTags}
        onClearSearch={onClearSearch}
        onClearTasks={onClearTasks}
        onClearAnnotatedFilter={onClearAnnotatedFilter}
        onRemoveTag={onRemoveTag}
        onClearWidthRange={onClearWidthRange}
        onClearHeightRange={onClearHeightRange}
        onClearAspectRatioRange={onClearAspectRatioRange}
        onClearSizeRange={onClearSizeRange}
        onClearFilepathPattern={onClearFilepathPattern}
        onClearFilepathPaths={onClearFilepathPaths}
        onClearImageIds={onClearImageIds}
        onClearQualityFilters={onClearQualityFilters}
        onClearObjectCount={onClearObjectCount}
        onClearBboxCount={onClearBboxCount}
        onClearPolygonCount={onClearPolygonCount}
        onClearAll={onClearAll}
        annotationDisplay={annotationDisplay}
        onDisplayConfigClick={onDisplayConfigClick}
        filteredCount={filteredCount}
        totalCount={totalCount}
      />
    </div>
  );
}

// Export all sub-components and types
export { FilterZone } from './FilterZone';
export { ViewZone } from './ViewZone';
export { ActionZone } from './ActionZone';
export { StatusBar } from './StatusBar';
export { GridSlider, GRID_SIZE_CONFIGS, useGridSize } from './GridSlider';
export type { GridSize } from './GridSlider';
