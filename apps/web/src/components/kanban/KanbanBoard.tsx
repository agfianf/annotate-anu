/**
 * KanbanBoard Component
 * Main 4-column Kanban board for task classification
 * Optimized to avoid re-renders during drag
 */

import { useRef, useState, useCallback, memo, useEffect } from 'react';
import toast from 'react-hot-toast';
import { useKanbanStats, type SortField, type SortOrder } from './useKanbanStats';
import { KanbanColumn } from './KanbanColumn';
import { DragOverlay, type DragOverlayHandle } from './DragOverlay';
import { KanbanSortControls } from './KanbanSortControls';
import { SPLIT_ORDER, getColumnConfig, type Split, type KanbanBoardProps, type KanbanTaskWithStats, type ColumnConfig } from './types';

export function KanbanBoard({
  projectId,
  tasks,
  userRole,
  onSplitChange,
  onTaskClick,
  onCreateTask,
}: KanbanBoardProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [draggingTaskId, setDraggingTaskId] = useState<number | null>(null);

  // Sorting state with localStorage persistence
  const [sortField, setSortField] = useState<SortField>(() => {
    try {
      const stored = localStorage.getItem('kanban-sort-field');
      return (stored === 'updated_at' ? 'updated_at' : 'created_at') as SortField;
    } catch {
      return 'created_at';
    }
  });

  const [sortOrder, setSortOrder] = useState<SortOrder>(() => {
    try {
      const stored = localStorage.getItem('kanban-sort-order');
      return (stored === 'asc' ? 'asc' : 'desc') as SortOrder;
    } catch {
      return 'desc';
    }
  });

  // Persist sorting preferences to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('kanban-sort-field', sortField);
    } catch {
      // Ignore localStorage errors
    }
  }, [sortField]);

  useEffect(() => {
    try {
      localStorage.setItem('kanban-sort-order', sortOrder);
    } catch {
      // Ignore localStorage errors
    }
  }, [sortOrder]);

  const dragOverlayRef = useRef<DragOverlayHandle>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const columnRefs = useRef<Record<string, HTMLDivElement | null>>({
    null: null,
    train: null,
    val: null,
    test: null,
  });

  const { tasksWithStats, tasksBySplit, columnStats, isLoading } = useKanbanStats(tasks, sortField, sortOrder);

  // Determine if user can create tasks
  const canCreate = userRole === 'owner' || userRole === 'maintainer';

  // Use ref to avoid re-creating callback on every render
  const handleDragStart = useCallback((taskId: number, task: KanbanTaskWithStats, config: ColumnConfig, x: number, y: number) => {
    setIsDragging(true);
    setDraggingTaskId(taskId);
    dragOverlayRef.current?.show(task, config, x, y);
  }, []);

  // This is called frequently - uses ref, no state updates
  const handleDragMove = useCallback((x: number, y: number) => {
    dragOverlayRef.current?.updatePosition(x, y);
  }, []);

  const handleDragEnd = useCallback(
    async (taskId: number, targetSplit: Split | undefined) => {
      setIsDragging(false);
      setDraggingTaskId(null);
      dragOverlayRef.current?.hide();

      if (targetSplit === undefined) {
        return;
      }

      const task = tasks.find((t) => t.id === taskId);
      if (!task) return;

      if (task.split === targetSplit) {
        return;
      }

      try {
        await onSplitChange(taskId, targetSplit);
      } catch (err) {
        console.error('Failed to update task split:', err);
        toast.error('Failed to move task');
      }
    },
    [tasks, onSplitChange]
  );

  if (isLoading && tasks.length > 0) {
    return (
      <div className="grid grid-cols-4 gap-4">
        {SPLIT_ORDER.map((split) => {
          const config = getColumnConfig(split);
          return (
            <div
              key={config.key === null ? 'null' : config.key}
              className="space-y-4"
            >
              <div className={`p-4 rounded-xl ${config.colors.accent} animate-pulse`}>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-8 h-8 bg-white/50 rounded-lg" />
                  <div className="h-5 w-24 bg-white/50 rounded" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="h-4 bg-white/50 rounded" />
                  <div className="h-4 bg-white/50 rounded" />
                </div>
              </div>
              {[1, 2].map((i) => (
                <div
                  key={i}
                  className="h-28 bg-white rounded-xl border border-gray-100 animate-pulse"
                />
              ))}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <>
      {/* Sort Controls */}
      <div className="flex justify-end mb-3">
        <KanbanSortControls
          sortField={sortField}
          sortOrder={sortOrder}
          onSortFieldChange={setSortField}
          onSortOrderChange={setSortOrder}
        />
      </div>

      {/* Kanban Board */}
      <div ref={boardRef} className="grid grid-cols-4 gap-4 min-h-[500px]">
        {SPLIT_ORDER.map((split, index) => {
          const config = getColumnConfig(split);
          const key = split === null ? 'null' : split;

          return (
            <KanbanColumn
              key={key}
              config={config}
              tasks={tasksBySplit[key]}
              stats={columnStats[key]}
              onTaskClick={onTaskClick}
              isDragging={isDragging}
              draggingTaskId={draggingTaskId}
              columnIndex={index}
              columnRefs={columnRefs}
              onDragStart={handleDragStart}
              onDragMove={handleDragMove}
              onDragEnd={handleDragEnd}
              onCreateTask={onCreateTask}
              canCreate={canCreate}
            />
          );
        })}
      </div>
      <DragOverlay ref={dragOverlayRef} />
    </>
  );
}
