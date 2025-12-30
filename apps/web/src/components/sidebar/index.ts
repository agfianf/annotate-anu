/**
 * Annotations Sidebar Components
 * Barrel export file
 */

export { AnnotationsSidebar } from './AnnotationsSidebar';
export { AnnotationsTable } from './AnnotationsTable';
export { FilterTabs } from './FilterTabs';
export { LabelDropdownCell } from './LabelDropdownCell';
export { BulkActionsPanel } from './BulkActionsPanel';
export { AppearanceSection } from './AppearanceSection';

// Re-export types
export type {
  AnnotationsSidebarProps,
  AnnotationsTableProps,
  AnnotationTableRow,
  FilterMode,
  SortMode,
  AppearanceSettings,
  FilterTabsProps,
  LabelDropdownCellProps,
  BulkActionsPanelProps,
  AppearanceSectionProps,
} from './types';

export {
  FALLBACK_APPEARANCE_DEFAULTS,
  MIN_SIDEBAR_WIDTH,
  MAX_SIDEBAR_WIDTH,
  DEFAULT_SIDEBAR_WIDTH,
  COLLAPSED_SIDEBAR_WIDTH,
  SIDEBAR_WIDTH_KEY,
  SIDEBAR_SECTIONS_KEY,
} from './types';
