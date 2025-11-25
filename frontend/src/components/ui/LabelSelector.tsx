import type { Label } from '../../types/annotations';

interface LabelSelectorProps {
  labels: Label[];
  selectedLabelId: string | null;
  onSelectLabel: (labelId: string) => void;
  onClose?: () => void;
}

export function LabelSelector({
  labels,
  selectedLabelId,
  onSelectLabel,
  onClose,
}: LabelSelectorProps) {
  const handleSelect = (labelId: string) => {
    onSelectLabel(labelId);
    // Don't auto-close - let user continue interacting or move mouse away
  };

  const selectedLabel = labels.find((l) => l.id === selectedLabelId);

  return (
    <div className="space-y-2">
      <label className="text-xs font-semibold text-gray-800 uppercase tracking-wide">
        Active Label
      </label>

      <select
        value={selectedLabelId || ''}
        onChange={(e) => handleSelect(e.target.value)}
        className="w-full px-2 py-1.5 text-sm bg-white/90 border border-gray-300/50 rounded focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-gray-900 cursor-pointer"
      >
        {labels.map((label) => (
          <option key={label.id} value={label.id}>
            {label.name}
          </option>
        ))}
      </select>

      {selectedLabel && (
        <div className="flex items-center gap-2 p-2 bg-white/60 rounded border border-gray-300/40">
          <div
            className="w-4 h-4 rounded border border-gray-400/50 flex-shrink-0"
            style={{ backgroundColor: selectedLabel.color }}
          />
          <span className="text-xs font-medium text-gray-900 truncate">
            {selectedLabel.name}
          </span>
        </div>
      )}
    </div>
  );
}
