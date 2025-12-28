/**
 * TaskTable Component
 * TanStack Table implementation for task list
 */

import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type SortingState,
} from '@tanstack/react-table';
import { useState } from 'react';
import { Briefcase, Image, ArrowUp, ArrowDown } from 'lucide-react';
import type { KanbanTaskWithStats, TaskTableProps } from './types';
import SplitDropdown from './SplitDropdown';
import AssigneeDropdownCell from './AssigneeDropdownCell';

const columnHelper = createColumnHelper<KanbanTaskWithStats>();

// Helper functions
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

const formatRelativeTime = (dateString: string): string => {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  // For older dates, show formatted date
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

export default function TaskTable({
  tasks,
  config,
  onTaskClick,
  onSplitChange,
  onAssigneeChange,
  projectId,
  userRole,
}: TaskTableProps) {
  const [sorting, setSorting] = useState<SortingState>([]);

  // Column definitions
  const columns = [
    columnHelper.accessor('id', {
      header: 'ID',
      size: 80,
      cell: (info) => (
        <span className="text-gray-400 font-mono text-sm">#{info.getValue()}</span>
      ),
    }),
    columnHelper.accessor('name', {
      header: 'Name',
      cell: (info) => {
        const task = info.row.original;
        return (
          <div className="min-w-0">
            <div className="font-medium text-gray-900 truncate">{task.name}</div>
            {task.description && (
              <div className="text-xs text-gray-500 truncate mt-0.5">{task.description}</div>
            )}
          </div>
        );
      },
    }),
    columnHelper.accessor('status', {
      header: 'Status',
      size: 120,
      cell: (info) => (
        <span
          className={`px-2 py-1 rounded-full text-xs font-medium capitalize ${getStatusColor(
            info.getValue()
          )}`}
        >
          {info.getValue().replace('_', ' ')}
        </span>
      ),
    }),
    columnHelper.accessor('assignee', {
      header: 'Assignee',
      size: 180,
      cell: (info) => {
        const task = info.row.original;
        const isDisabled = userRole === 'viewer' || userRole === 'annotator';
        return (
          <div onClick={(e) => e.stopPropagation()}>
            <AssigneeDropdownCell
              projectId={projectId}
              taskId={task.id}
              assigneeId={task.assignee_id}
              assignee={task.assignee}
              onChange={(assigneeId) => onAssigneeChange(task.id, assigneeId)}
              disabled={isDisabled}
            />
          </div>
        );
      },
    }),
    columnHelper.accessor('job_count', {
      header: 'Jobs',
      size: 100,
      cell: (info) => (
        <div className="flex items-center gap-1.5 text-sm">
          <Briefcase className="w-4 h-4 text-gray-400" />
          <span>{info.getValue()}</span>
        </div>
      ),
    }),
    columnHelper.accessor('total_images', {
      header: 'Images',
      size: 120,
      cell: (info) => (
        <div className="flex items-center gap-1.5 text-sm">
          <Image className="w-4 h-4 text-gray-400" />
          <span>{info.getValue().toLocaleString()}</span>
        </div>
      ),
    }),
    columnHelper.accessor('completion_percentage', {
      header: 'Progress',
      size: 150,
      cell: (info) => {
        const percentage = info.getValue();
        return (
          <div className="flex items-center gap-2">
            <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-500 rounded-full transition-all"
                style={{ width: `${percentage}%` }}
              />
            </div>
            <span className="text-sm font-medium text-gray-700 w-10 text-right">
              {percentage}%
            </span>
          </div>
        );
      },
    }),
    columnHelper.accessor('created_at', {
      header: 'Created',
      size: 120,
      cell: (info) => (
        <span className="text-sm text-gray-600" title={new Date(info.getValue()).toLocaleString()}>
          {formatRelativeTime(info.getValue())}
        </span>
      ),
    }),
    columnHelper.accessor('updated_at', {
      header: 'Updated',
      size: 120,
      cell: (info) => (
        <span className="text-sm text-gray-600" title={new Date(info.getValue()).toLocaleString()}>
          {formatRelativeTime(info.getValue())}
        </span>
      ),
    }),
    columnHelper.display({
      id: 'split_action',
      header: 'Split',
      size: 140,
      cell: (info) => {
        const task = info.row.original;
        return (
          <div onClick={(e) => e.stopPropagation()}>
            <SplitDropdown
              value={task.split}
              onChange={(newSplit) => onSplitChange(task.id, newSplit)}
            />
          </div>
        );
      },
    }),
  ];

  const table = useReactTable({
    data: tasks,
    columns,
    state: {
      sorting,
    },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead className="sticky top-0 z-10">
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id} className="border-b border-gray-200">
              {headerGroup.headers.map((header) => {
                const canSort = header.column.getCanSort();
                const sortDirection = header.column.getIsSorted();

                return (
                  <th
                    key={header.id}
                    style={{ width: header.getSize() }}
                    className={`
                      px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider
                      bg-gradient-to-b from-gray-50 to-white backdrop-blur-sm
                      ${canSort ? 'cursor-pointer hover:bg-gray-100 select-none' : ''}
                    `}
                    onClick={canSort ? header.column.getToggleSortingHandler() : undefined}
                  >
                    <div className="flex items-center gap-1.5">
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      {canSort && (
                        <div className="flex flex-col">
                          {sortDirection === 'asc' ? (
                            <ArrowUp className="w-3 h-3 text-emerald-600" />
                          ) : sortDirection === 'desc' ? (
                            <ArrowDown className="w-3 h-3 text-emerald-600" />
                          ) : (
                            <div className="w-3 h-3" />
                          )}
                        </div>
                      )}
                    </div>
                  </th>
                );
              })}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => (
            <tr
              key={row.id}
              onClick={() => onTaskClick(row.original.id)}
              className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer transition-colors"
            >
              {row.getVisibleCells().map((cell) => (
                <td
                  key={cell.id}
                  className="px-4 py-3 text-sm"
                >
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
