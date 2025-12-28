/**
 * KanbanColumn Component
 * Individual column with drop zone and task list
 * Memoized to prevent unnecessary re-renders
 */

import { forwardRef, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus } from 'lucide-react';
import { FadeIn } from '@/components/ui/animate';
import { KanbanColumnHeader } from './KanbanColumnHeader';
import { KanbanTaskCard } from './KanbanTaskCard';
import type { KanbanColumnProps, Split, KanbanTaskWithStats, ColumnConfig } from './types';

interface KanbanColumnPropsExtended extends KanbanColumnProps {
  columnRefs: React.RefObject<Record<string, HTMLDivElement | null>>;
  draggingTaskId: number | null;
  onDragStart: (taskId: number, task: KanbanTaskWithStats, config: ColumnConfig, x: number, y: number) => void;
  onDragMove: (x: number, y: number) => void;
  onDragEnd: (taskId: number, targetSplit: Split | undefined) => void;
}

export const KanbanColumn = memo(forwardRef<HTMLDivElement, KanbanColumnPropsExtended>(
  function KanbanColumn(
    {
      config,
      tasks,
      stats,
      onTaskClick,
      isDragging,
      draggingTaskId,
      columnIndex,
      columnRefs,
      onDragStart,
      onDragMove,
      onDragEnd,
    },
    ref
  ) {
    const columnKey = config.key === null ? 'null' : config.key;

    return (
      <FadeIn direction="up" delay={columnIndex * 0.1}>
        <div
          ref={(el) => {
            if (columnRefs.current) {
              columnRefs.current[columnKey] = el;
            }
            if (typeof ref === 'function') {
              ref(el);
            } else if (ref) {
              ref.current = el;
            }
          }}
          className={`
            flex flex-col h-full min-h-[500px] rounded-2xl border-2 transition-all duration-200
            ${isDragging
              ? `${config.colors.border} border-dashed bg-opacity-50 ${config.colors.ring} ring-2`
              : 'border-transparent'
            }
          `}
        >
          {/* Column Header with Stats */}
          <div className="mb-4">
            <KanbanColumnHeader config={config} stats={stats} />
          </div>

          {/* Task List Area */}
          <div className="flex-1 space-y-3 overflow-y-auto pr-1 custom-scrollbar">
            <AnimatePresence mode="popLayout">
              {tasks.length === 0 ? (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className={`
                    flex flex-col items-center justify-center py-8 px-4
                    border-2 border-dashed rounded-xl
                    ${config.colors.border} ${config.colors.bg}
                  `}
                >
                  <div className={`p-3 rounded-full ${config.colors.accent} mb-3`}>
                    <Plus className={`w-5 h-5 ${config.colors.text}`} />
                  </div>
                  <p className={`text-sm font-medium ${config.colors.text}`}>
                    No tasks
                  </p>
                  <p className="text-xs text-gray-400 mt-1 text-center">
                    Drag tasks here to assign them to {config.title.toLowerCase()}
                  </p>
                </motion.div>
              ) : (
                tasks.map((task) => (
                  <KanbanTaskCard
                    key={task.id}
                    task={task}
                    config={config}
                    columnRefs={columnRefs}
                    isDragging={draggingTaskId === task.id}
                    onDragStart={(x, y) => onDragStart(task.id, task, config, x, y)}
                    onDragMove={onDragMove}
                    onDragEnd={(targetSplit) => onDragEnd(task.id, targetSplit)}
                    onClick={() => onTaskClick(task.id)}
                  />
                ))
              )}
            </AnimatePresence>
          </div>
        </div>
      </FadeIn>
    );
  }
));
