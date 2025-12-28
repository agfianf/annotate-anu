/**
 * DragOverlay Component
 * Renders dragged card in a portal - uses refs for smooth updates
 */

import { useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import { createPortal } from 'react-dom';
import { Briefcase, Image, GripVertical } from 'lucide-react';
import type { KanbanTaskWithStats, ColumnConfig } from './types';

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

export interface DragOverlayHandle {
  updatePosition: (x: number, y: number) => void;
  show: (task: KanbanTaskWithStats, config: ColumnConfig, x: number, y: number) => void;
  hide: () => void;
}

export const DragOverlay = forwardRef<DragOverlayHandle, {}>(function DragOverlay(_, ref) {
  const containerRef = useRef<HTMLDivElement>(null);
  const taskRef = useRef<KanbanTaskWithStats | null>(null);
  const configRef = useRef<ColumnConfig | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  useImperativeHandle(ref, () => ({
    updatePosition: (x: number, y: number) => {
      if (containerRef.current) {
        containerRef.current.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
      }
    },
    show: (task: KanbanTaskWithStats, config: ColumnConfig, x: number, y: number) => {
      taskRef.current = task;
      configRef.current = config;
      if (containerRef.current) {
        containerRef.current.style.display = 'block';
        containerRef.current.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
      }
      // Update content
      if (contentRef.current) {
        updateContent(contentRef.current, task, config);
      }
    },
    hide: () => {
      taskRef.current = null;
      configRef.current = null;
      if (containerRef.current) {
        containerRef.current.style.display = 'none';
      }
    },
  }));

  return createPortal(
    <div
      ref={containerRef}
      className="fixed top-0 left-0 pointer-events-none"
      style={{
        display: 'none',
        zIndex: 9999,
        width: 280,
        willChange: 'transform',
      }}
    >
      <div
        ref={contentRef}
        className="bg-white rounded-xl border-2 border-emerald-400 p-3 select-none shadow-2xl"
        style={{ transform: 'rotate(2deg) scale(1.02)' }}
      >
        {/* Content will be updated via DOM */}
        <div className="flex items-start gap-2 mb-2">
          <div className="flex items-center gap-1.5">
            <GripVertical className="w-4 h-4 text-gray-300 flex-shrink-0" />
            <div className="p-1.5 rounded-lg bg-gray-100 flex-shrink-0" data-icon-container>
              <Briefcase className="w-4 h-4 text-gray-600" />
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="font-medium text-gray-900 text-sm leading-tight truncate flex items-center gap-1">
              <span className="text-gray-400 font-normal" data-task-id></span>
              <span className="truncate" data-task-name></span>
            </h4>
            <p className="text-xs text-gray-500 mt-0.5 line-clamp-1" data-task-description></p>
          </div>
        </div>
        <div className="flex items-center gap-3 text-xs text-gray-500">
          <div className="flex items-center gap-1">
            <Briefcase className="w-3 h-3" />
            <span data-job-count></span>
          </div>
          <div className="flex items-center gap-1">
            <Image className="w-3 h-3" />
            <span data-image-count></span>
          </div>
        </div>
        <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-100">
          <span className="px-2 py-0.5 rounded-full text-xs font-medium capitalize" data-status></span>
        </div>
      </div>
    </div>,
    document.body
  );
});

function updateContent(container: HTMLDivElement, task: KanbanTaskWithStats, config: ColumnConfig) {
  const taskId = container.querySelector('[data-task-id]');
  const taskName = container.querySelector('[data-task-name]');
  const taskDesc = container.querySelector('[data-task-description]');
  const jobCount = container.querySelector('[data-job-count]');
  const imageCount = container.querySelector('[data-image-count]');
  const status = container.querySelector('[data-status]');
  const iconContainer = container.querySelector('[data-icon-container]');

  if (taskId) taskId.textContent = `#${task.id}`;
  if (taskName) taskName.textContent = task.name;
  if (taskDesc) {
    taskDesc.textContent = task.description || '';
    (taskDesc as HTMLElement).style.display = task.description ? 'block' : 'none';
  }
  if (jobCount) jobCount.textContent = `${task.job_count} jobs`;
  if (imageCount) imageCount.textContent = task.total_images.toLocaleString();
  if (status) {
    status.textContent = task.status.replace('_', ' ');
    status.className = `px-2 py-0.5 rounded-full text-xs font-medium capitalize ${getStatusColor(task.status)}`;
  }
  if (iconContainer) {
    iconContainer.className = `p-1.5 rounded-lg ${config.colors.bg} flex-shrink-0`;
  }
}
