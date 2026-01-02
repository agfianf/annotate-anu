/**
 * FilterZone - Search, Task selector, and Status filter controls
 * Left section of the toolbar for data filtering
 */

import { Search, ChevronDown } from 'lucide-react';
import { MultiTaskSelect } from '../MultiTaskSelect';

interface Task {
  id: number;
  name: string;
}

interface FilterZoneProps {
  // Search
  searchValue: string;
  onSearchChange: (value: string) => void;

  // Task filter
  tasks: Task[];
  selectedTaskIds: number[];
  onTasksChange: (taskIds: number[]) => void;

  // Annotation status filter
  isAnnotatedFilter: boolean | undefined;
  onAnnotatedFilterChange: (value: boolean | undefined) => void;
}

export function FilterZone({
  searchValue,
  onSearchChange,
  tasks,
  selectedTaskIds,
  onTasksChange,
  isAnnotatedFilter,
  onAnnotatedFilterChange,
}: FilterZoneProps) {
  return (
    <div className="flex items-center gap-2 flex-1 min-w-0">
      {/* Search Input */}
      <div className="relative flex-1 min-w-[180px] max-w-xs">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          value={searchValue}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search by filename..."
          className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-200 bg-white/50 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm transition-all hover:border-gray-300"
        />
        {searchValue && (
          <button
            onClick={() => onSearchChange('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
            aria-label="Clear search"
          >
            <span className="text-lg leading-none">&times;</span>
          </button>
        )}
      </div>

      {/* Multi-Task Filter */}
      <MultiTaskSelect
        tasks={tasks}
        selectedTaskIds={selectedTaskIds}
        onChange={onTasksChange}
        placeholder="All Tasks"
      />

      {/* Annotated Status Filter */}
      <div className="relative">
        <select
          value={isAnnotatedFilter === undefined ? '' : isAnnotatedFilter.toString()}
          onChange={(e) => {
            const val = e.target.value;
            onAnnotatedFilterChange(val === '' ? undefined : val === 'true');
          }}
          className={`appearance-none pl-3 pr-8 py-2 rounded-lg border bg-white/50 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm transition-all cursor-pointer ${
            isAnnotatedFilter !== undefined
              ? 'border-amber-300 text-amber-700 bg-amber-50/50'
              : 'border-gray-200 text-gray-700 hover:border-gray-300'
          }`}
        >
          <option value="">All Status</option>
          <option value="true">Annotated</option>
          <option value="false">Not Annotated</option>
        </select>
        <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
      </div>
    </div>
  );
}
