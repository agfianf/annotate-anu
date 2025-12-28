/**
 * JobTable Component
 * TanStack Table implementation for job list
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
import { Image, ArrowUp, ArrowDown, Archive, Trash2 } from 'lucide-react';
import type { Job } from '@/lib/api-client';
import AssigneeDropdownCell from './AssigneeDropdownCell';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Play,
  User,
} from 'lucide-react';

const columnHelper = createColumnHelper<Job>();

// Helper functions
const getStatusColor = (status: string) => {
  switch (status) {
    case 'approved':
      return 'bg-emerald-100 text-emerald-700';
    case 'completed':
    case 'review':
      return 'bg-blue-100 text-blue-700';
    case 'in_progress':
      return 'bg-yellow-100 text-yellow-700';
    case 'rejected':
      return 'bg-red-100 text-red-700';
    case 'assigned':
      return 'bg-purple-100 text-purple-700';
    default:
      return 'bg-gray-100 text-gray-600';
  }
};

const getStatusIcon = (status: string) => {
  const iconClass = 'w-3.5 h-3.5';
  switch (status) {
    case 'approved':
      return <CheckCircle2 className={`${iconClass} text-emerald-600`} />;
    case 'completed':
    case 'review':
      return <CheckCircle2 className={`${iconClass} text-blue-600`} />;
    case 'in_progress':
      return <Play className={`${iconClass} text-yellow-600`} />;
    case 'rejected':
      return <AlertCircle className={`${iconClass} text-red-600`} />;
    case 'assigned':
      return <User className={`${iconClass} text-purple-600`} />;
    default:
      return <Clock className={`${iconClass} text-gray-400`} />;
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

export interface JobTableProps {
  jobs: Job[];
  onJobClick: (jobId: string) => void;
  onAssigneeChange: (jobId: string, assigneeId: string | null) => Promise<void>;
  onArchive?: (jobId: string) => void;
  onDelete?: (jobId: string) => void;
  projectId: string;
  taskId: string;
  userRole?: string;
}

export default function JobTable({
  jobs,
  onJobClick,
  onAssigneeChange,
  onArchive,
  onDelete,
  projectId,
  taskId,
  userRole,
}: JobTableProps) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const isAdmin = userRole === 'admin';

  // Column definitions
  const columns = [
    columnHelper.accessor('id', {
      header: 'ID',
      size: 80,
      cell: (info) => (
        <span className="text-gray-400 font-mono text-sm">#{info.getValue()}</span>
      ),
    }),
    columnHelper.accessor('status', {
      header: 'Status',
      size: 120,
      cell: (info) => (
        <div className="flex items-center gap-1.5">
          {getStatusIcon(info.getValue())}
          <span
            className={`px-2 py-1 rounded-full text-xs font-medium capitalize ${getStatusColor(
              info.getValue()
            )}`}
          >
            {info.getValue().replace('_', ' ')}
          </span>
        </div>
      ),
    }),
    columnHelper.accessor('assignee', {
      header: 'Assignee',
      size: 180,
      cell: (info) => {
        const job = info.row.original;
        return (
          <div onClick={(e) => e.stopPropagation()}>
            <AssigneeDropdownCell
              projectId={projectId}
              taskId={taskId}
              assigneeId={job.assignee_id}
              assignee={job.assignee}
              onChange={(assigneeId) => onAssigneeChange(job.id, assigneeId)}
              disabled={false}
            />
          </div>
        );
      },
    }),
    columnHelper.display({
      id: 'progress',
      header: 'Progress',
      size: 150,
      cell: (info) => {
        const job = info.row.original;
        const percentage = ((job.annotated_images / Math.max(job.total_images, 1)) * 100).toFixed(0);
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
    columnHelper.accessor('total_images', {
      header: 'Images',
      size: 100,
      cell: (info) => (
        <div className="flex items-center gap-1.5 text-sm">
          <Image className="w-4 h-4 text-gray-400" />
          <span>{info.getValue().toLocaleString()}</span>
        </div>
      ),
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
  ];

  // Add Actions column only if admin
  if (isAdmin) {
    columns.push(
      columnHelper.display({
        id: 'actions',
        header: 'Actions',
        size: 100,
        cell: (info) => {
          const job = info.row.original;
          return (
            <div onClick={(e) => e.stopPropagation()} className="flex items-center gap-2">
              {onArchive && (
                <button
                  onClick={() => onArchive(job.id)}
                  className="p-1.5 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                  title={job.is_archived ? 'Unarchive' : 'Archive'}
                >
                  <Archive className="w-4 h-4" />
                </button>
              )}
              {onDelete && job.is_archived && (
                <button
                  onClick={() => onDelete(job.id)}
                  className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  title="Delete"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          );
        },
      })
    );
  }

  const table = useReactTable({
    data: jobs,
    columns,
    state: {
      sorting,
    },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  if (jobs.length === 0) {
    return (
      <div className="glass-strong rounded-2xl p-12 text-center shadow-lg shadow-emerald-500/5">
        <div className="text-gray-400 mb-4">No jobs found</div>
        <p className="text-gray-500 text-sm">
          Try adjusting your filters or create a new job
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto glass rounded-xl shadow-lg shadow-emerald-500/5">
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
              onClick={() => onJobClick(row.original.id)}
              className={`border-b border-gray-100 hover:bg-gray-50 cursor-pointer transition-colors ${
                row.original.is_archived ? 'opacity-60 bg-gray-50/50' : ''
              }`}
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
