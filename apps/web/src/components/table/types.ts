/**
 * Table Types
 * Type definitions for task table view
 */

import type { Task } from '@/lib/api-client';

// Re-export types from Kanban
export type {
  Split,
  KanbanTaskWithStats,
  ColumnStats,
  ColumnConfig,
} from '../kanban/types';

// Props for Table components

export interface TableViewProps {
  projectId: string;
  tasks: Task[];
  userRole?: 'owner' | 'maintainer' | 'annotator' | 'viewer';
  onSplitChange: (taskId: number, split: import('../kanban/types').Split) => Promise<void>;
  onAssigneeChange: (taskId: number, assigneeId: string | null) => Promise<void>;
  onTaskClick: (taskId: number) => void;
  onCreateTask?: (split: import('../kanban/types').Split) => void;
}

export interface TableSectionProps {
  config: import('../kanban/types').ColumnConfig;
  tasks: import('../kanban/types').KanbanTaskWithStats[];
  stats: import('../kanban/types').ColumnStats;
  onTaskClick: (taskId: number) => void;
  onSplitChange: (taskId: number, split: import('../kanban/types').Split) => Promise<void>;
  onAssigneeChange: (taskId: number, assigneeId: string | null) => Promise<void>;
  onCreateTask?: (split: import('../kanban/types').Split) => void;
  canCreate?: boolean;
  projectId: string;
  userRole?: 'owner' | 'maintainer' | 'annotator' | 'viewer';
}

export interface TaskTableProps {
  tasks: import('../kanban/types').KanbanTaskWithStats[];
  config: import('../kanban/types').ColumnConfig;
  onTaskClick: (taskId: number) => void;
  onSplitChange: (taskId: number, split: import('../kanban/types').Split) => Promise<void>;
  onAssigneeChange: (taskId: number, assigneeId: string | null) => Promise<void>;
  projectId: string;
  userRole?: 'owner' | 'maintainer' | 'annotator' | 'viewer';
}

export interface SplitDropdownProps {
  value: import('../kanban/types').Split;
  onChange: (split: import('../kanban/types').Split) => Promise<void>;
  disabled?: boolean;
}
