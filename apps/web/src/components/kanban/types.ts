/**
 * Kanban Types
 * Type definitions for the task classification Kanban board
 */

import type { Task } from '@/lib/api-client';
import { Inbox, GraduationCap, FlaskConical, TestTube2 } from 'lucide-react';

// Split type matching the backend
export type Split = 'train' | 'val' | 'test' | null;

// Order of columns in the Kanban board
export const SPLIT_ORDER: Split[] = [null, 'train', 'val', 'test'];

// Extended task with stats for Kanban display
export interface KanbanTaskWithStats extends Task {
  job_count: number;
  total_images: number;
  annotated_images: number;
  completion_percentage: number;
}

// Aggregated stats for a column
export interface ColumnStats {
  taskCount: number;
  jobCount: number;
  imageCount: number;
  annotatedCount: number;
  completionPercentage: number;
}

// Column configuration
export interface ColumnConfig {
  key: Split;
  title: string;
  icon: typeof Inbox;
  colors: {
    bg: string;
    bgHover: string;
    text: string;
    border: string;
    accent: string;
    ring: string;
  };
}

// Column configurations with colors matching existing design
export const COLUMN_CONFIGS: Record<string, ColumnConfig> = {
  null: {
    key: null,
    title: 'Unassigned',
    icon: Inbox,
    colors: {
      bg: 'bg-gray-50',
      bgHover: 'hover:bg-gray-100',
      text: 'text-gray-600',
      border: 'border-gray-200',
      accent: 'bg-gray-100',
      ring: 'ring-gray-500/20',
    },
  },
  train: {
    key: 'train',
    title: 'Train',
    icon: GraduationCap,
    colors: {
      bg: 'bg-blue-50',
      bgHover: 'hover:bg-blue-100',
      text: 'text-blue-700',
      border: 'border-blue-200',
      accent: 'bg-blue-100',
      ring: 'ring-blue-500/20',
    },
  },
  val: {
    key: 'val',
    title: 'Validation',
    icon: FlaskConical,
    colors: {
      bg: 'bg-amber-50',
      bgHover: 'hover:bg-amber-100',
      text: 'text-amber-700',
      border: 'border-amber-200',
      accent: 'bg-amber-100',
      ring: 'ring-amber-500/20',
    },
  },
  test: {
    key: 'test',
    title: 'Test',
    icon: TestTube2,
    colors: {
      bg: 'bg-purple-50',
      bgHover: 'hover:bg-purple-100',
      text: 'text-purple-700',
      border: 'border-purple-200',
      accent: 'bg-purple-100',
      ring: 'ring-purple-500/20',
    },
  },
};

// Helper to get column config by split
export function getColumnConfig(split: Split): ColumnConfig {
  return COLUMN_CONFIGS[split === null ? 'null' : split];
}

// Props for Kanban components
export interface KanbanBoardProps {
  projectId: string;
  tasks: Task[];
  userRole?: 'owner' | 'maintainer' | 'annotator' | 'viewer';
  onSplitChange: (taskId: number, split: Split) => Promise<void>;
  onTaskClick: (taskId: number) => void;
  onCreateTask?: (split: Split) => void;
}

export interface KanbanColumnProps {
  config: ColumnConfig;
  tasks: KanbanTaskWithStats[];
  stats: ColumnStats;
  onTaskClick: (taskId: number) => void;
  isDragging: boolean;
  columnIndex: number;
  onCreateTask?: (split: Split) => void;
  canCreate?: boolean;
}

export interface KanbanTaskCardProps {
  task: KanbanTaskWithStats;
  config: ColumnConfig;
  onDragStart: () => void;
  onDragEnd: (targetSplit: Split | undefined) => void;
  onClick: () => void;
}

export interface KanbanColumnHeaderProps {
  config: ColumnConfig;
  stats: ColumnStats;
}
