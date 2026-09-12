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
import type { ExploreFilterChipKey, SidebarFilters } from './StatusBar';
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
  /** Images currently materialised in the client. */
  loadedCount?: number;
  /** Server-reported total for the current filters. */
  matchingCount?: number;
  /** Every image in the project, ignoring filters. */
  projectTotal?: number;
  selectedCount?: number;
  onSelectLoaded?: () => void;
  onClearSelection?: () => void;
  onSelectAllMatching?: () => void;
  isAllMatchingSelected?: boolean;
  /** A filter change is committed but the matching set has not resolved yet. */
  isResultsPending?: boolean;
  /** The same filters are being re-fetched in the background. */
  isBackgroundRefreshing?: boolean;

  // Status Bar props
  sidebarFilters: SidebarFilters;
  allTags: Tag[];
  /** Job filter, stored outside `sidebarFilters`. */
  selectedJobId?: number | null;
  selectedJobName?: string;
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
  /** Removes exactly one constraint. Takes precedence over every grouped handler above. */
  onRemoveFilter?: (key: ExploreFilterChipKey) => void;

  // Display config
  annotationDisplay: AnnotationDisplayState;
  onDisplayConfigClick?: () => void;

  // Image counts
  /** @deprecated Ambiguous. Prefer `loadedCount`; kept as its fallback. */
  filteredCount?: number;
  /** @deprecated Ambiguous. Prefer `matchingCount`; kept as its fallback. */
  totalCount?: number;
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
  loadedCount,
  matchingCount,
  projectTotal,
  selectedCount,
  onSelectLoaded,
  onClearSelection,
  onSelectAllMatching,
  isAllMatchingSelected,
  isResultsPending,
  isBackgroundRefreshing,

  // Status Bar
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
}: ExploreToolbarProps) {
  return (
    <div className="glass-strong rounded-xl shadow-lg relative z-20">
      {/* Row 1: Control Bar */}
      <div className="flex flex-wrap items-center gap-2 sm:gap-3 p-2">
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

        {/* Divider — dropped once the zones wrap, where it would separate nothing */}
        <div className="w-px h-6 bg-gray-200/50 flex-shrink-0 hidden lg:block" />

        {/* View Zone (Middle) */}
        <ViewZone
          gridSize={gridSize}
          onGridSizeChange={onGridSizeChange}
          isFullView={isFullView}
          onToggleFullView={onToggleFullView}
        />

        {/* Divider */}
        <div className="w-px h-6 bg-gray-200/50 flex-shrink-0 hidden lg:block" />

        {/* Action Zone (Right) */}
        <ActionZone
          onExport={onExport}
          loadedCount={loadedCount ?? filteredCount}
          matchingCount={matchingCount ?? totalCount}
          selectedCount={selectedCount}
          onSelectLoaded={onSelectLoaded}
          onClearSelection={onClearSelection}
          onSelectAllMatching={onSelectAllMatching}
          isAllMatchingSelected={isAllMatchingSelected}
          isResultsPending={isResultsPending}
        />
      </div>

      {/* Row 2: Status Bar */}
      <StatusBar
        searchValue={searchValue}
        selectedTaskIds={selectedTaskIds}
        isAnnotatedFilter={isAnnotatedFilter}
        sidebarFilters={sidebarFilters}
        allTags={allTags}
        selectedJobId={selectedJobId}
        selectedJobName={selectedJobName}
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
        onRemoveFilter={onRemoveFilter}
        annotationDisplay={annotationDisplay}
        onDisplayConfigClick={onDisplayConfigClick}
        filteredCount={filteredCount}
        totalCount={totalCount}
        projectTotal={projectTotal}
        matchingCount={matchingCount}
        loadedCount={loadedCount}
        isResultsPending={isResultsPending}
        isBackgroundRefreshing={isBackgroundRefreshing}
      />
    </div>
  );
}

// Export all sub-components and types
export { FilterZone } from './FilterZone';
export { ViewZone } from './ViewZone';
export { ActionZone } from './ActionZone';
export { StatusBar, EXPLORE_FILTER_CHIP_KEYS } from './StatusBar';
export type { ExploreFilterChipKey, SidebarFilters } from './StatusBar';
export { GridSlider, GRID_SIZE_CONFIGS, useGridSize } from './GridSlider';
export type { GridSize } from './GridSlider';
