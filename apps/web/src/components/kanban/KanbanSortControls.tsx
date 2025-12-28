/**
 * KanbanSortControls Component
 * Sorting controls for Kanban task board
 */

import { ArrowUpDown, Calendar, Clock } from 'lucide-react';
import type { SortField, SortOrder } from './useKanbanStats';

interface KanbanSortControlsProps {
  sortField: SortField;
  sortOrder: SortOrder;
  onSortFieldChange: (field: SortField) => void;
  onSortOrderChange: (order: SortOrder) => void;
}

export function KanbanSortControls({
  sortField,
  sortOrder,
  onSortFieldChange,
  onSortOrderChange,
}: KanbanSortControlsProps) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-gray-500">Sort:</span>

      {/* Sort Field Toggle */}
      <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
        <button
          onClick={() => onSortFieldChange('created_at')}
          className={`
            px-2 py-1 rounded-md text-xs font-medium transition-all
            flex items-center gap-1
            ${sortField === 'created_at'
              ? 'bg-white text-emerald-700 shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
            }
          `}
        >
          <Calendar className="w-3 h-3" />
          Created
        </button>
        <button
          onClick={() => onSortFieldChange('updated_at')}
          className={`
            px-2 py-1 rounded-md text-xs font-medium transition-all
            flex items-center gap-1
            ${sortField === 'updated_at'
              ? 'bg-white text-emerald-700 shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
            }
          `}
        >
          <Clock className="w-3 h-3" />
          Updated
        </button>
      </div>

      {/* Sort Order Toggle */}
      <button
        onClick={() => onSortOrderChange(sortOrder === 'desc' ? 'asc' : 'desc')}
        className="p-1.5 rounded-lg hover:bg-gray-100 transition-all text-gray-600 hover:text-gray-900"
        title={sortOrder === 'desc' ? 'Newest first' : 'Oldest first'}
      >
        <ArrowUpDown className={`w-4 h-4 ${sortOrder === 'asc' ? 'rotate-180' : ''} transition-transform`} />
      </button>
    </div>
  );
}
