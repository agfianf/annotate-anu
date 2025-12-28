/**
 * KanbanTaskCard Component
 * Draggable task card - uses pointer events for smooth dragging
 * Memoized to prevent unnecessary re-renders
 */

import { useRef, useEffect, memo } from 'react';
import { motion } from 'framer-motion';
import { Briefcase, Image, GripVertical, ExternalLink } from 'lucide-react';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import type { KanbanTaskCardProps, Split } from './types';
import { SPLIT_ORDER } from './types';

const getStatusColor = (status: string) => {
  switch (status) {
    case 'pending':
      return 'bg-gray-100 text-gray-600';
    case 'in_progress':
      return 'bg-blue-100 text-blue-700';
    case 'completed':
      return 'bg-emerald-100 text-emerald-700';
    case 'review':
      return 'bg-amber-100 text-amber-700';
    case 'approved':
      return 'bg-green-100 text-green-700';
    default:
      return 'bg-gray-100 text-gray-600';
  }
};

interface KanbanTaskCardPropsExtended extends Omit<KanbanTaskCardProps, 'onDragStart' | 'onDragEnd'> {
  columnRefs: React.RefObject<Record<string, HTMLDivElement | null>>;
  isDragging: boolean;
  onDragStart: (x: number, y: number) => void;
  onDragMove: (x: number, y: number) => void;
  onDragEnd: (targetSplit: Split | undefined) => void;
}

export const KanbanTaskCard = memo(function KanbanTaskCard({
  task,
  config,
  onDragStart,
  onDragMove,
  onDragEnd,
  onClick,
  columnRefs,
  isDragging,
}: KanbanTaskCardPropsExtended) {
  const cardRef = useRef<HTMLDivElement>(null);
  const prefersReducedMotion = useReducedMotion();
  const isDraggingRef = useRef(false);

  useEffect(() => {
    const handlePointerMove = (e: PointerEvent) => {
      if (isDraggingRef.current) {
        onDragMove(e.clientX, e.clientY);
      }
    };

    const handlePointerUp = (e: PointerEvent) => {
      if (isDraggingRef.current) {
        isDraggingRef.current = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';

        // Find which column the pointer is over
        let targetSplit: Split | undefined = undefined;

        if (columnRefs.current) {
          for (const split of SPLIT_ORDER) {
            const key = split === null ? 'null' : split;
            const columnRef = columnRefs.current[key];
            if (!columnRef) continue;

            const colRect = columnRef.getBoundingClientRect();
            if (
              e.clientX >= colRect.left &&
              e.clientX <= colRect.right &&
              e.clientY >= colRect.top &&
              e.clientY <= colRect.bottom
            ) {
              targetSplit = split;
              break;
            }
          }
        }

        onDragEnd(targetSplit);
      }
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [columnRefs, onDragMove, onDragEnd]);

  const handlePointerDown = (e: React.PointerEvent) => {
    // Only handle left mouse button or touch
    if (e.button !== 0) return;

    // Don't start drag if clicking on interactive elements
    const target = e.target as HTMLElement;
    if (target.closest('button') || target.closest('a')) {
      return;
    }

    e.preventDefault();
    isDraggingRef.current = true;
    document.body.style.cursor = 'grabbing';
    document.body.style.userSelect = 'none';

    onDragStart(e.clientX, e.clientY);
  };

  return (
    <motion.div
      ref={cardRef}
      layout
      layoutId={`task-${task.id}`}
      initial={{ opacity: 0, y: 10 }}
      animate={{
        opacity: isDragging ? 0.4 : 1,
        y: 0,
        scale: isDragging ? 0.98 : 1,
      }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{
        layout: { type: 'spring', stiffness: 350, damping: 30 },
        default: { type: 'spring', stiffness: 400, damping: 30 },
      }}
      whileHover={
        prefersReducedMotion || isDragging
          ? undefined
          : {
              y: -2,
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08)',
            }
      }
      onPointerDown={handlePointerDown}
      className={`
        group relative bg-white rounded-xl border-2 p-3 select-none
        ${isDragging ? 'border-emerald-400 border-dashed' : config.colors.border}
        ${isDragging ? '' : 'cursor-grab active:cursor-grabbing hover:shadow-md'}
        transition-colors
      `}
    >
      {/* Open Task Button - Top Right */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
        onPointerDown={(e) => e.stopPropagation()}
        className="absolute top-2 right-2 p-1.5 rounded-lg text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 transition-all opacity-0 group-hover:opacity-100 z-10"
        title="Open task details"
      >
        <ExternalLink className="w-4 h-4" />
      </button>

      {/* Drag Handle + Task Header */}
      <div className="flex items-start gap-2 mb-2">
        <div className="flex items-center gap-1.5 touch-none">
          <GripVertical className="w-4 h-4 text-gray-300 flex-shrink-0" />
          <div className={`p-1.5 rounded-lg ${config.colors.bg} flex-shrink-0`}>
            <Briefcase className={`w-4 h-4 ${config.colors.text}`} />
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="font-medium text-gray-900 text-sm leading-tight truncate flex items-center gap-1">
            <span className="text-gray-400 font-normal">#{task.id}</span>
            <span className="truncate">{task.name}</span>
          </h4>
          {task.description && (
            <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">
              {task.description}
            </p>
          )}
        </div>
      </div>

      {/* Task Stats Row */}
      <div className="flex items-center gap-3 text-xs text-gray-500">
        <div className="flex items-center gap-1">
          <Briefcase className="w-3 h-3" />
          <span>{task.job_count} jobs</span>
        </div>
        <div className="flex items-center gap-1">
          <Image className="w-3 h-3" />
          <span>{task.total_images.toLocaleString()}</span>
        </div>
        {task.completion_percentage > 0 && (
          <div className="flex items-center gap-1 ml-auto">
            <div className="w-12 h-1 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-500 rounded-full"
                style={{ width: `${task.completion_percentage}%` }}
              />
            </div>
            <span className="text-emerald-600 font-medium">
              {task.completion_percentage}%
            </span>
          </div>
        )}
      </div>

      {/* Status Badge */}
      <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-100">
        <span
          className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${getStatusColor(task.status)}`}
        >
          {task.status.replace('_', ' ')}
        </span>
        {task.assignee && (
          <div className="flex items-center gap-1.5">
            <div className="w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center text-xs font-medium text-emerald-700">
              {task.assignee.full_name?.charAt(0) || task.assignee.email.charAt(0).toUpperCase()}
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
});
