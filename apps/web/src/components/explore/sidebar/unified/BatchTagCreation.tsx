import { Check, Plus, X, Trash2 } from 'lucide-react';
import { useState, type KeyboardEvent } from 'react';

interface TagInput {
  id: string;
  name: string;
  color: string;
}

interface BatchTagCreationProps {
  /** Default color to use for new tags */
  categoryColor: string;
  /** Callback when tags are submitted */
  onSubmit: (tags: Array<{ name: string; color: string }>) => Promise<void>;
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

// Generate unique ID for tag inputs
let nextId = 0;
function generateId() {
  return `tag-${Date.now()}-${nextId++}`;
}

export function BatchTagCreation({
  categoryColor,
  onSubmit,
  onCancel,
}: BatchTagCreationProps) {
  const [tagInputs, setTagInputs] = useState<TagInput[]>([
    { id: generateId(), name: '', color: categoryColor },
    { id: generateId(), name: '', color: categoryColor },
    { id: generateId(), name: '', color: categoryColor },
  ]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [openColorPicker, setOpenColorPicker] = useState<string | null>(null);

  const handleNameChange = (id: string, name: string) => {
    setTagInputs((prev) =>
      prev.map((input) => (input.id === id ? { ...input, name } : input))
    );
  };

  const handleColorChange = (id: string, color: string) => {
    setTagInputs((prev) =>
      prev.map((input) => (input.id === id ? { ...input, color } : input))
    );
  };

  const handleAddRow = () => {
    setTagInputs((prev) => [
      ...prev,
      { id: generateId(), name: '', color: categoryColor },
    ]);
  };

  const handleRemoveRow = (id: string) => {
    if (tagInputs.length > 1) {
      setTagInputs((prev) => prev.filter((input) => input.id !== id));
    }
  };

  const handleSubmit = async () => {
    // Filter out empty names
    const validTags = tagInputs
      .filter((input) => input.name.trim())
      .map((input) => ({
        name: input.name.trim(),
        color: input.color,
      }));

    if (validTags.length === 0) {
      return;
    }

    setIsSubmitting(true);
    try {
      await onSubmit(validTags);
    } catch (error) {
      console.error('Failed to create tags:', error);
      setIsSubmitting(false);
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

  const validTagCount = tagInputs.filter((input) => input.name.trim()).length;

  return (
    <div className="space-y-3">
      {/* Tag Input Rows */}
      <div className="space-y-2">
        {tagInputs.map((input, index) => (
          <div key={input.id} className="flex items-center gap-2">
            {/* Tag Name Input */}
            <input
              type="text"
              value={input.name}
              onChange={(e) => handleNameChange(input.id, e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={`Tag ${index + 1} name...`}
              className="flex-1 px-2 py-1.5 text-sm border border-orange-200 rounded focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-transparent"
              autoFocus={index === 0}
              disabled={isSubmitting}
            />

            {/* Color Picker - Dropdown */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setOpenColorPicker(openColorPicker === input.id ? null : input.id)}
                className="w-6 h-6 rounded border-2 border-orange-200 hover:border-orange-400 transition-colors"
                style={{ backgroundColor: input.color }}
                title="Choose color"
                disabled={isSubmitting}
              />

              {/* Color Dropdown */}
              {openColorPicker === input.id && (
                <>
                  {/* Click-outside overlay */}
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setOpenColorPicker(null)}
                  />
                  <div className="absolute right-0 top-full mt-1 bg-white border border-orange-100 rounded-lg shadow-lg z-50 p-2">
                    <div className="flex gap-1.5">
                      {PRESET_COLORS.map((color) => (
                        <button
                          key={color}
                          type="button"
                          onClick={() => {
                            handleColorChange(input.id, color);
                            setOpenColorPicker(null);
                          }}
                          className={`w-5 h-5 rounded-full transition-all ${
                            input.color === color
                              ? 'ring-2 ring-orange-400 ring-offset-1 scale-110'
                              : 'hover:scale-105'
                          }`}
                          style={{ backgroundColor: color }}
                          title={color}
                          disabled={isSubmitting}
                        />
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Remove Row Button */}
            <button
              type="button"
              onClick={() => handleRemoveRow(input.id)}
              disabled={tagInputs.length <= 1 || isSubmitting}
              className={`p-1 rounded transition-colors ${
                tagInputs.length <= 1
                  ? 'text-gray-300 cursor-not-allowed'
                  : 'text-red-400 hover:bg-red-50 hover:text-red-600'
              }`}
              title="Remove row"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>

      {/* Add Row Button */}
      <button
        type="button"
        onClick={handleAddRow}
        disabled={isSubmitting}
        className="w-full px-3 py-1.5 text-xs font-medium text-orange-600 hover:bg-orange-50 border border-orange-200 border-dashed rounded transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <Plus className="w-3.5 h-3.5" />
        Add another tag
      </button>

      {/* Actions */}
      <div className="flex items-center justify-between pt-2">
        <span className="text-xs text-slate-500">
          {validTagCount} valid tag{validTagCount !== 1 ? 's' : ''}
        </span>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
            className="px-3 py-1 text-xs font-medium text-slate-600 hover:bg-white rounded transition-colors flex items-center gap-1 disabled:opacity-50"
          >
            <X className="w-3 h-3" />
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={validTagCount === 0 || isSubmitting}
            className="px-3 py-1 text-xs font-medium text-white bg-orange-500 hover:bg-orange-600 disabled:bg-orange-300 disabled:cursor-not-allowed rounded transition-colors flex items-center gap-1"
          >
            <Check className="w-3 h-3" />
            {isSubmitting ? 'Creating...' : `Create ${validTagCount} Tag${validTagCount !== 1 ? 's' : ''}`}
          </button>
        </div>
      </div>
    </div>
  );
}
