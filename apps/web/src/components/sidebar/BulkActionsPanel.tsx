/**
 * BulkActionsPanel Component
 * Panel for bulk operations on selected annotations
 */

import { useState } from 'react';
import { Eye, EyeOff, Trash2, X } from 'lucide-react';
import type { BulkActionsPanelProps } from './types';

export function BulkActionsPanel({
  selectedCount,
  labels,
  onBulkChangeLabel,
  onBulkDelete,
  onClearSelection,
  onBulkToggleVisibility,
}: BulkActionsPanelProps) {
  const [selectedLabelId, setSelectedLabelId] = useState<string>('');

  const handleApplyLabel = () => {
    if (selectedLabelId) {
      onBulkChangeLabel(selectedLabelId);
      setSelectedLabelId('');
    }
  };

  if (selectedCount === 0) {
    return null;
  }

  return (
    <div className="px-3 py-2 bg-emerald-50 border-b border-emerald-200 space-y-2">
      {/* Header with count and clear button */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-emerald-800">
          {selectedCount} selected
        </span>
        <button
          onClick={onClearSelection}
          className="p-1 hover:bg-emerald-100 rounded transition-colors text-emerald-600"
          title="Clear selection"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Change Label */}
      <div className="flex gap-1.5">
        <select
          value={selectedLabelId}
          onChange={(e) => setSelectedLabelId(e.target.value)}
          className="
            flex-1 px-2 py-1.5 text-xs
            bg-white text-gray-800 rounded border border-gray-300
            focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500
          "
          title="Select new label for selected annotations"
        >
          <option value="">Change label...</option>
          {labels.map((label) => (
            <option key={label.id} value={label.id}>
              {label.name}
            </option>
          ))}
        </select>
        <button
          onClick={handleApplyLabel}
          disabled={!selectedLabelId}
          className="
            px-3 py-1.5 text-xs font-medium rounded transition-colors
            bg-emerald-600 hover:bg-emerald-700 text-white
            disabled:bg-gray-300 disabled:cursor-not-allowed
          "
          title="Apply label change"
        >
          Apply
        </button>
      </div>

      {/* Action buttons */}
      <div className="flex gap-1.5">
        {/* Toggle Visibility */}
        <button
          onClick={onBulkToggleVisibility}
          className="
            flex-1 px-2 py-1.5 text-xs font-medium rounded transition-colors
            bg-white hover:bg-gray-100 text-gray-700 border border-gray-300
            flex items-center justify-center gap-1
          "
          title="Toggle visibility for selected"
        >
          <Eye className="w-3.5 h-3.5" />
          Toggle
        </button>

        {/* Delete */}
        <button
          onClick={onBulkDelete}
          className="
            flex-1 px-2 py-1.5 text-xs font-medium rounded transition-colors
            bg-red-500 hover:bg-red-600 text-white
            flex items-center justify-center gap-1
          "
          title="Delete selected annotations"
        >
          <Trash2 className="w-3.5 h-3.5" />
          Delete
        </button>
      </div>
    </div>
  );
}

export default BulkActionsPanel;
