/**
 * TableView Component
 * Main container for task table view with collapsible sections
 */

import { Loader2 } from 'lucide-react';
import { useKanbanStats, type SortField, type SortOrder } from '../kanban/useKanbanStats';
import { SPLIT_ORDER, COLUMN_CONFIGS } from '../kanban/types';
import type { TableViewProps } from './types';
import TableSection from './TableSection';

export default function TableView({
  projectId,
  tasks,
  userRole,
  onSplitChange,
  onAssigneeChange,
  onTaskClick,
  onCreateTask,
}: TableViewProps) {
  // Permission checks
  const canCreate = userRole === 'owner' || userRole === 'maintainer';

  // Get sort preferences from localStorage (same keys as Kanban for consistency)
  const sortField = (localStorage.getItem('kanban-sort-field') || 'created_at') as SortField;
  const sortOrder = (localStorage.getItem('kanban-sort-order') || 'desc') as SortOrder;

  // Use the same data hook as Kanban
  const { tasksBySplit, columnStats, isLoading } = useKanbanStats(tasks, sortField, sortOrder);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 text-emerald-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Render sections for each split */}
      {SPLIT_ORDER.map((split) => {
        const key = split === null ? 'null' : split;
        const config = COLUMN_CONFIGS[key];
        const sectionTasks = tasksBySplit[key] || [];
        const stats = columnStats[key];

        return (
          <TableSection
            key={key}
            config={config}
            tasks={sectionTasks}
            stats={stats}
            onTaskClick={onTaskClick}
            onSplitChange={onSplitChange}
            onAssigneeChange={onAssigneeChange}
            onCreateTask={onCreateTask}
            canCreate={canCreate}
            projectId={projectId}
            userRole={userRole}
          />
        );
      })}
    </div>
  );
}
