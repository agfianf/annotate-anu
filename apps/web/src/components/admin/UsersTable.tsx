/**
 * UsersTable Component
 * TanStack Table implementation for admin user management
 */

import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
  type SortingState,
} from '@tanstack/react-table';
import { useState, useMemo } from 'react';
import {
  ArrowUp,
  ArrowDown,
  Shield,
  ShieldCheck,
  ShieldX,
  Search,
  Trash2,
  Loader2,
} from 'lucide-react';
import type { User } from '@/lib/api-client';
import Toggle from '@/components/Toggle';

const columnHelper = createColumnHelper<User>();

// Helper functions
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

  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

const getRoleConfig = (role: string) => {
  switch (role) {
    case 'admin':
      return {
        icon: <ShieldCheck className="w-4 h-4" />,
        className: 'bg-emerald-100 text-emerald-700',
      };
    case 'member':
      return {
        icon: <Shield className="w-4 h-4" />,
        className: 'bg-blue-100 text-blue-700',
      };
    default:
      return {
        icon: <ShieldX className="w-4 h-4" />,
        className: 'bg-gray-100 text-gray-600',
      };
  }
};

const roles = ['admin', 'member', 'annotator'] as const;

export interface UsersTableProps {
  users: User[];
  currentUserId: string;
  onUserClick: (user: User) => void;
  onRoleChange: (userId: string, newRole: string) => Promise<void>;
  onToggleActive: (userId: string, currentActive: boolean) => Promise<void>;
  onDelete: (userId: string, username: string) => Promise<void>;
  updatingUserId: string | null;
}

export default function UsersTable({
  users,
  currentUserId,
  onUserClick,
  onRoleChange,
  onToggleActive,
  onDelete,
  updatingUserId,
}: UsersTableProps) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState('');

  // Column definitions
  const columns = useMemo(
    () => [
      columnHelper.accessor('full_name', {
        header: 'User',
        size: 250,
        cell: (info) => {
          const user = info.row.original;
          const displayName = user.full_name || user.username;
          const initial = displayName.charAt(0).toUpperCase();

          return (
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 font-semibold shrink-0">
                {initial}
              </div>
              <div className="min-w-0">
                <p className="font-medium text-gray-900 truncate">{displayName}</p>
                <p className="text-xs text-gray-500 truncate">{user.email}</p>
              </div>
            </div>
          );
        },
        filterFn: (row, _, filterValue) => {
          const user = row.original;
          const searchLower = filterValue.toLowerCase();
          return (
            (user.full_name?.toLowerCase().includes(searchLower) ?? false) ||
            user.username.toLowerCase().includes(searchLower) ||
            user.email.toLowerCase().includes(searchLower)
          );
        },
      }),
      columnHelper.accessor('role', {
        header: 'Role',
        size: 160,
        cell: (info) => {
          const user = info.row.original;
          const config = getRoleConfig(user.role);
          const isUpdating = updatingUserId === user.id;

          return (
            <div
              className="flex items-center gap-2"
              onClick={(e) => e.stopPropagation()}
            >
              <span className={config.className}>{config.icon}</span>
              <select
                value={user.role}
                onChange={(e) => onRoleChange(user.id, e.target.value)}
                disabled={isUpdating}
                className="px-2 py-1 rounded-lg border border-gray-200 bg-white/50 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 capitalize disabled:opacity-50"
              >
                {roles.map((role) => (
                  <option key={role} value={role} className="capitalize">
                    {role}
                  </option>
                ))}
              </select>
            </div>
          );
        },
      }),
      columnHelper.accessor('is_active', {
        header: 'Status',
        size: 100,
        cell: (info) => {
          const user = info.row.original;
          const isUpdating = updatingUserId === user.id;
          const isSelf = user.id === currentUserId;

          return (
            <div onClick={(e) => e.stopPropagation()}>
              <Toggle
                checked={user.is_active}
                onChange={() => onToggleActive(user.id, user.is_active)}
                disabled={isUpdating || isSelf}
                size="sm"
              />
            </div>
          );
        },
      }),
      columnHelper.accessor('created_at', {
        header: 'Joined',
        size: 120,
        cell: (info) => (
          <span
            className="text-sm text-gray-600"
            title={new Date(info.getValue()).toLocaleString()}
          >
            {formatRelativeTime(info.getValue())}
          </span>
        ),
      }),
      columnHelper.display({
        id: 'actions',
        header: '',
        size: 60,
        cell: (info) => {
          const user = info.row.original;
          const isUpdating = updatingUserId === user.id;
          const isSelf = user.id === currentUserId;

          if (isSelf) return null;

          return (
            <div onClick={(e) => e.stopPropagation()}>
              <button
                onClick={() => onDelete(user.id, user.username)}
                disabled={isUpdating}
                className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all disabled:opacity-50"
                title="Delete user"
              >
                {isUpdating ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Trash2 className="w-4 h-4" />
                )}
              </button>
            </div>
          );
        },
      }),
    ],
    [currentUserId, updatingUserId, onRoleChange, onToggleActive, onDelete]
  );

  const table = useReactTable({
    data: users,
    columns,
    state: {
      sorting,
      globalFilter,
    },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    globalFilterFn: (row, _, filterValue) => {
      const user = row.original;
      const searchLower = filterValue.toLowerCase();
      return (
        (user.full_name?.toLowerCase().includes(searchLower) ?? false) ||
        user.username.toLowerCase().includes(searchLower) ||
        user.email.toLowerCase().includes(searchLower)
      );
    },
  });

  return (
    <div className="space-y-4">
      {/* Search Bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="search"
          placeholder="Search users by name or email..."
          value={globalFilter}
          onChange={(e) => setGlobalFilter(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 bg-white/50 backdrop-blur-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
        />
      </div>

      {/* Table */}
      <div className="glass-strong rounded-2xl shadow-lg shadow-emerald-500/5 overflow-hidden">
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
                        scope="col"
                        style={{ width: header.getSize() }}
                        className={`
                          px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider
                          bg-gradient-to-b from-emerald-50/50 to-white backdrop-blur-sm
                          ${canSort ? 'cursor-pointer hover:bg-emerald-50 select-none' : ''}
                        `}
                        onClick={
                          canSort ? header.column.getToggleSortingHandler() : undefined
                        }
                      >
                        <div className="flex items-center gap-1.5">
                          {flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
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
                  onClick={() => onUserClick(row.original)}
                  className={`
                    border-b border-gray-100 hover:bg-emerald-50/30 cursor-pointer transition-colors
                    ${!row.original.is_active ? 'opacity-60 bg-gray-50/50' : ''}
                  `}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-4 py-3 text-sm">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>

          {table.getRowModel().rows.length === 0 && (
            <div className="py-12 text-center text-gray-500">
              {globalFilter ? 'No users match your search' : 'No users found'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
