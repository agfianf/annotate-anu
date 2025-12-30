/**
 * AnnotationsTable Component
 * TanStack Table implementation with grouping by label
 */

import { useMemo, useCallback, useEffect, useRef, useState } from 'react';
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type SortingState,
} from '@tanstack/react-table';
import {
  ArrowUp,
  ArrowDown,
  ChevronDown,
  ChevronRight,
  Circle,
  Eye,
  EyeOff,
  Shapes,
  Sparkles,
  Square as SquareIcon,
  Trash2,
  User,
} from 'lucide-react';
import { LabelDropdownCell } from './LabelDropdownCell';
import type { AnnotationsTableProps, AnnotationTableRow } from './types';
import type { Label } from '@/types/annotations';

const columnHelper = createColumnHelper<AnnotationTableRow>();

// Helper: Get icon for annotation type
function getAnnotationTypeIcon(type: string) {
  switch (type) {
    case 'rectangle':
      return <SquareIcon className="w-3.5 h-3.5" />;
    case 'polygon':
      return <Shapes className="w-3.5 h-3.5" />;
    case 'point':
      return <Circle className="w-3.5 h-3.5" />;
    default:
      return <Shapes className="w-3.5 h-3.5" />;
  }
}

// Helper: Get confidence color class
function getConfidenceColor(confidence: number): string {
  if (confidence >= 0.8) return 'text-green-500';
  if (confidence >= 0.6) return 'text-yellow-500';
  return 'text-red-500';
}

// Group header component
interface LabelGroupHeaderProps {
  label: Label;
  count: number;
  isExpanded: boolean;
  isAllSelected: boolean;
  isSomeSelected: boolean;
  isAllVisible: boolean;
  onToggleExpand: () => void;
  onToggleSelectAll: () => void;
  onToggleVisibility: () => void;
}

function LabelGroupHeader({
  label,
  count,
  isExpanded,
  isAllSelected,
  isSomeSelected,
  isAllVisible,
  onToggleExpand,
  onToggleSelectAll,
  onToggleVisibility,
}: LabelGroupHeaderProps) {
  return (
    <div className="flex items-center gap-2 px-2 py-1.5 bg-gray-100 border-b border-gray-200 sticky top-0 z-[5]">
      {/* Select all checkbox */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onToggleSelectAll();
        }}
        className="p-0.5 hover:bg-gray-200 rounded transition-colors"
        title={isAllSelected ? 'Deselect all' : 'Select all'}
      >
        <div
          className={`w-4 h-4 border-2 rounded flex items-center justify-center ${
            isAllSelected
              ? 'bg-emerald-500 border-emerald-500'
              : isSomeSelected
              ? 'bg-emerald-500/50 border-emerald-500'
              : 'border-gray-400'
          }`}
        >
          {(isAllSelected || isSomeSelected) && (
            <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
            </svg>
          )}
        </div>
      </button>

      {/* Expand/collapse */}
      <button
        onClick={onToggleExpand}
        className="p-0.5 hover:bg-gray-200 rounded transition-colors"
      >
        {isExpanded ? (
          <ChevronDown className="w-4 h-4 text-gray-600" />
        ) : (
          <ChevronRight className="w-4 h-4 text-gray-600" />
        )}
      </button>

      {/* Color swatch */}
      <div
        className="w-3 h-3 rounded flex-shrink-0"
        style={{ backgroundColor: label.color }}
      />

      {/* Label name */}
      <button
        onClick={onToggleExpand}
        className="flex-1 text-left text-xs font-medium text-gray-800 truncate"
      >
        {label.name}
      </button>

      {/* Count badge */}
      <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-700 text-[10px] font-medium rounded-full">
        {count}
      </span>

      {/* Visibility toggle */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onToggleVisibility();
        }}
        className="p-0.5 hover:bg-gray-200 rounded transition-colors"
        title={isAllVisible ? 'Hide all' : 'Show all'}
      >
        {isAllVisible ? (
          <Eye className="w-4 h-4 text-gray-600" />
        ) : (
          <EyeOff className="w-4 h-4 text-gray-400" />
        )}
      </button>
    </div>
  );
}

export function AnnotationsTable({
  data,
  labels,
  selectedIds,
  onRowClick,
  onSelectionChange,
  onLabelChange,
  onToggleVisibility,
  onDelete,
  onBulkToggleVisibility,
}: AnnotationsTableProps & { onBulkToggleVisibility?: (ids: string[]) => void }) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [expandedLabels, setExpandedLabels] = useState<Record<string, boolean>>(() => {
    // Default all labels to expanded
    const initial: Record<string, boolean> = {};
    labels.forEach((label) => {
      initial[label.id] = true;
    });
    return initial;
  });

  const tableContainerRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef<Map<string, HTMLTableRowElement>>(new Map());

  // Group data by label
  const groupedData = useMemo(() => {
    const groups: Record<string, AnnotationTableRow[]> = {};
    data.forEach((row) => {
      if (!groups[row.labelId]) {
        groups[row.labelId] = [];
      }
      groups[row.labelId].push(row);
    });
    return groups;
  }, [data]);

  // Auto-scroll to first selected item when selection changes from canvas
  useEffect(() => {
    if (selectedIds.size > 0 && tableContainerRef.current) {
      const firstSelectedId = Array.from(selectedIds)[0];
      const rowEl = rowRefs.current.get(firstSelectedId);

      if (rowEl) {
        // Make sure the label group is expanded
        const row = data.find((r) => r.id === firstSelectedId);
        if (row && !expandedLabels[row.labelId]) {
          setExpandedLabels((prev) => ({ ...prev, [row.labelId]: true }));
          // Scroll after state update
          setTimeout(() => {
            rowEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          }, 100);
        } else {
          rowEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      }
    }
  }, [selectedIds, data, expandedLabels]);

  // Create columns (simplified for grouped view)
  const columns = useMemo(
    () => [
      // Index Column
      columnHelper.accessor('index', {
        header: '#',
        size: 32,
        cell: (info) => (
          <span className="text-gray-500 font-mono text-[10px]">{info.getValue()}</span>
        ),
      }),

      // Type Column (Icon)
      columnHelper.accessor('type', {
        header: 'Type',
        size: 36,
        cell: (info) => (
          <div className="flex items-center justify-center text-gray-600" title={info.getValue()}>
            {getAnnotationTypeIcon(info.getValue())}
          </div>
        ),
      }),

      // AI/Manual Column (Icon)
      columnHelper.accessor('isAutoGenerated', {
        header: 'Src',
        size: 32,
        cell: (info) => {
          const isAuto = info.getValue();
          return (
            <div
              className="flex items-center justify-center"
              title={isAuto ? 'AI Generated' : 'Manual'}
            >
              {isAuto ? (
                <Sparkles className="w-3.5 h-3.5 text-emerald-500" />
              ) : (
                <User className="w-3.5 h-3.5 text-gray-400" />
              )}
            </div>
          );
        },
      }),

      // Confidence Column
      columnHelper.accessor('confidence', {
        header: 'Conf',
        size: 45,
        cell: (info) => {
          const conf = info.getValue();
          if (conf === undefined) {
            return <span className="text-gray-400 text-[10px]">-</span>;
          }
          return (
            <span className={`text-[10px] font-medium ${getConfidenceColor(conf)}`}>
              {Math.round(conf * 100)}%
            </span>
          );
        },
      }),

      // Dimensions Column
      columnHelper.accessor('dimensions', {
        header: 'Size',
        size: 60,
        cell: (info) => (
          <span className="text-gray-500 text-[10px] font-mono truncate" title={info.getValue()}>
            {info.getValue()}
          </span>
        ),
      }),

      // Visibility Toggle Column
      columnHelper.display({
        id: 'visibility',
        header: '',
        size: 28,
        cell: (info) => {
          const row = info.row.original;
          return (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggleVisibility(row.id);
              }}
              className="p-0.5 hover:bg-gray-100 rounded transition-colors"
              title={row.isVisible ? 'Hide' : 'Show'}
            >
              {row.isVisible ? (
                <Eye className="w-3.5 h-3.5 text-gray-500" />
              ) : (
                <EyeOff className="w-3.5 h-3.5 text-gray-400" />
              )}
            </button>
          );
        },
      }),

      // Delete Action Column
      columnHelper.display({
        id: 'delete',
        header: '',
        size: 28,
        cell: (info) => (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete(info.row.original.id);
            }}
            className="p-0.5 hover:bg-red-100 rounded transition-colors text-gray-400 hover:text-red-500"
            title="Delete"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        ),
      }),
    ],
    [onToggleVisibility, onDelete]
  );

  const table = useReactTable({
    data,
    columns,
    state: {
      sorting,
    },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  // Handle row click with multi-select support
  const handleRowClick = useCallback(
    (row: AnnotationTableRow, e: React.MouseEvent) => {
      onRowClick(row.id, e);
    },
    [onRowClick]
  );

  // Toggle expand for a label group
  const toggleLabelExpand = (labelId: string) => {
    setExpandedLabels((prev) => ({ ...prev, [labelId]: !prev[labelId] }));
  };

  // Toggle select all for a label group
  const toggleSelectAllForLabel = (labelId: string) => {
    const labelRows = groupedData[labelId] || [];
    const labelRowIds = labelRows.map((r) => r.id);
    const allSelected = labelRowIds.every((id) => selectedIds.has(id));

    if (allSelected) {
      // Deselect all in this group
      const newSelection = Array.from(selectedIds).filter((id) => !labelRowIds.includes(id));
      onSelectionChange(newSelection);
    } else {
      // Select all in this group
      const newSelection = [...new Set([...Array.from(selectedIds), ...labelRowIds])];
      onSelectionChange(newSelection);
    }
  };

  // Toggle visibility for all in a label group
  const toggleLabelVisibility = (labelId: string) => {
    const labelRows = groupedData[labelId] || [];
    const labelRowIds = labelRows.map((r) => r.id);
    if (onBulkToggleVisibility && labelRowIds.length > 0) {
      onBulkToggleVisibility(labelRowIds);
    }
  };

  if (data.length === 0) {
    return (
      <div className="p-4 text-center text-gray-500 text-xs">No annotations to display</div>
    );
  }

  // Get rows by label for the table
  const getRowsForLabel = (labelId: string) => {
    return table.getRowModel().rows.filter((row) => row.original.labelId === labelId);
  };

  return (
    <div ref={tableContainerRef} className="overflow-y-auto max-h-[350px]">
      {/* Table Header */}
      <table className="w-full text-xs">
        <thead className="sticky top-0 z-10 bg-white">
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id} className="border-b border-gray-200">
              {/* Checkbox column header */}
              <th className="w-6 px-1 py-1.5 text-left text-[10px] font-medium text-gray-500 uppercase bg-gray-50"></th>
              {headerGroup.headers.map((header) => {
                const canSort = header.column.getCanSort();
                const sortDirection = header.column.getIsSorted();

                return (
                  <th
                    key={header.id}
                    style={{ width: header.getSize() }}
                    className={`
                      px-1 py-1.5 text-left text-[10px] font-medium text-gray-500 uppercase
                      bg-gray-50
                      ${canSort ? 'cursor-pointer hover:bg-gray-100 select-none' : ''}
                    `}
                    onClick={canSort ? header.column.getToggleSortingHandler() : undefined}
                  >
                    <div className="flex items-center gap-0.5">
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      {canSort && sortDirection && (
                        sortDirection === 'asc' ? (
                          <ArrowUp className="w-2.5 h-2.5 text-emerald-600" />
                        ) : (
                          <ArrowDown className="w-2.5 h-2.5 text-emerald-600" />
                        )
                      )}
                    </div>
                  </th>
                );
              })}
            </tr>
          ))}
        </thead>
      </table>

      {/* Grouped content */}
      {labels.map((label) => {
        const labelRows = getRowsForLabel(label.id);
        if (labelRows.length === 0) return null;

        const isExpanded = expandedLabels[label.id] ?? true;
        const labelRowIds = labelRows.map((r) => r.original.id);
        const isAllSelected = labelRowIds.every((id) => selectedIds.has(id));
        const isSomeSelected = labelRowIds.some((id) => selectedIds.has(id)) && !isAllSelected;
        const isAllVisible = labelRows.every((r) => r.original.isVisible);

        return (
          <div key={label.id}>
            {/* Label group header */}
            <LabelGroupHeader
              label={label}
              count={labelRows.length}
              isExpanded={isExpanded}
              isAllSelected={isAllSelected}
              isSomeSelected={isSomeSelected}
              isAllVisible={isAllVisible}
              onToggleExpand={() => toggleLabelExpand(label.id)}
              onToggleSelectAll={() => toggleSelectAllForLabel(label.id)}
              onToggleVisibility={() => toggleLabelVisibility(label.id)}
            />

            {/* Rows for this label */}
            {isExpanded && (
              <table className="w-full text-xs">
                <tbody>
                  {labelRows.map((row) => {
                    const isSelected = selectedIds.has(row.original.id);

                    return (
                      <tr
                        key={row.id}
                        ref={(el) => {
                          if (el) {
                            rowRefs.current.set(row.original.id, el);
                          }
                        }}
                        onClick={(e) => handleRowClick(row.original, e)}
                        className={`
                          border-b border-gray-100 cursor-pointer transition-colors
                          ${
                            isSelected
                              ? 'bg-emerald-50 hover:bg-emerald-100 border-l-2 border-l-emerald-500'
                              : 'hover:bg-gray-50'
                          }
                        `}
                      >
                        {/* Selection checkbox */}
                        <td className="w-6 px-1 py-1">
                          <div
                            className={`w-3.5 h-3.5 border-2 rounded flex items-center justify-center ${
                              isSelected ? 'bg-emerald-500 border-emerald-500' : 'border-gray-400'
                            }`}
                          >
                            {isSelected && (
                              <svg
                                className="w-2.5 h-2.5 text-white"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={3}
                                  d="M5 13l4 4L19 7"
                                />
                              </svg>
                            )}
                          </div>
                        </td>
                        {row.getVisibleCells().map((cell) => (
                          <td key={cell.id} className="px-1 py-1">
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default AnnotationsTable;
