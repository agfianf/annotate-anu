import { Check, X } from 'lucide-react';
import { useState, type KeyboardEvent } from 'react';

interface CategoryCreationInlineProps {
  /** Callback when category is created */
  onCreate: (name: string, displayName: string, color: string) => void;
  /** Callback when cancelled */
  onCancel: () => void;
}

const PRESET_COLORS = [
  '#F97316', // Orange
  '#EF4444', // Red
  '#10B981', // Emerald
  '#3B82F6', // Blue
  '#8B5CF6', // Purple
  '#F59E0B', // Amber
  '#EC4899', // Pink
  '#6B7280', // Gray
];

export function CategoryCreationInline({ onCreate, onCancel }: CategoryCreationInlineProps) {
  const [name, setName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [selectedColor, setSelectedColor] = useState('#F97316');

  const handleSubmit = () => {
    const trimmedName = name.trim();
    const trimmedDisplayName = displayName.trim();

    if (trimmedName) {
      onCreate(trimmedName, trimmedDisplayName || trimmedName, selectedColor);
      setName('');
      setDisplayName('');
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    }
  };

  return (
    <div className="bg-orange-50/60 border-l-2 border-orange-300 p-3 space-y-2 animate-in slide-in-from-top-1 duration-200">
      {/* Name Input */}
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Category name (e.g., 'maturity')..."
        className="w-full px-2 py-1.5 text-sm border border-orange-200 rounded focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-transparent"
        autoFocus
      />

      {/* Display Name Input (Optional) */}
      <input
        type="text"
        value={displayName}
        onChange={(e) => setDisplayName(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Display name (optional, e.g., 'Maturity Level')..."
        className="w-full px-2 py-1.5 text-sm border border-orange-200 rounded focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-transparent"
      />

      {/* Color Picker */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-slate-600 font-medium">Color:</span>
        <div className="flex gap-1.5">
          {PRESET_COLORS.map((color) => (
            <button
              key={color}
              onClick={() => setSelectedColor(color)}
              className={`w-5 h-5 rounded-full transition-all ${
                selectedColor === color
                  ? 'ring-2 ring-orange-400 ring-offset-1 scale-110'
                  : 'hover:scale-105'
              }`}
              style={{ backgroundColor: color }}
              title={color}
            />
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 justify-end">
        <button
          onClick={onCancel}
          className="px-3 py-1 text-xs font-medium text-slate-600 hover:bg-white rounded transition-colors flex items-center gap-1"
        >
          <X className="w-3 h-3" />
          Cancel
        </button>
        <button
          onClick={handleSubmit}
          disabled={!name.trim()}
          className="px-3 py-1 text-xs font-medium text-white bg-orange-500 hover:bg-orange-600 disabled:bg-orange-300 disabled:cursor-not-allowed rounded transition-colors flex items-center gap-1"
        >
          <Check className="w-3 h-3" />
          Create Category
        </button>
      </div>
    </div>
  );
}
