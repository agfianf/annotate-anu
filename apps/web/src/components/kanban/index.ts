/**
 * Kanban Components
 * Task classification Kanban board with drag-and-drop
 */

export { KanbanBoard } from './KanbanBoard';
export { KanbanColumn } from './KanbanColumn';
export { KanbanColumnHeader } from './KanbanColumnHeader';
export { KanbanTaskCard } from './KanbanTaskCard';
export { DragOverlay } from './DragOverlay';
export { useKanbanStats } from './useKanbanStats';

export type {
  Split,
  KanbanTaskWithStats,
  ColumnStats,
  ColumnConfig,
  KanbanBoardProps,
  KanbanColumnProps,
  KanbanTaskCardProps,
  KanbanColumnHeaderProps,
} from './types';

export {
  SPLIT_ORDER,
  COLUMN_CONFIGS,
  getColumnConfig,
} from './types';
