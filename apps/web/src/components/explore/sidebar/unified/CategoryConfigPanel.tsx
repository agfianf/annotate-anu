import { Check, ChevronDown, ChevronRight, X } from 'lucide-react';
import { useRef, useState, type KeyboardEvent } from 'react';
import type { TagCategory } from '@/lib/data-management-client';
import { ColorPickerPopup } from '@/components/ui/ColorPickerPopup';
import { BatchTagCreation } from './BatchTagCreation';

interface CategoryConfigPanelProps {
  /** Category ID */
  categoryId: string;
  /** Category data */
  category: TagCategory;
  /** Project ID */
  projectId: string;
  /** Callback when category is updated */
  onUpdate: (data: { name?: string; color?: string }) => void;
  /** Callback when panel is closed */
  onClose: () => void;
  /** Callback when tags are batch created */
  onCreateTags: (tags: Array<{ name: string; color: string }>) => Promise<void>;
}

export function CategoryConfigPanel({
  category,
  onUpdate,
  onClose,
  onCreateTags,
}: CategoryConfigPanelProps) {
  // Section visibility
  const [editSectionExpanded, setEditSectionExpanded] = useState(true);
  const [batchSectionExpanded, setBatchSectionExpanded] = useState(false);

  // Edit state
  const [isEditing, setIsEditing] = useState(false);
  const [editedName, setEditedName] = useState(category.name);
  const [editedColor, setEditedColor] = useState(category.color);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const colorButtonRef = useRef<HTMLButtonElement>(null);

  const handleSaveEdit = () => {
    const trimmedName = editedName.trim();
    if (!trimmedName) {
      return;
    }

    const updates: { name?: string; color?: string } = {};
    if (trimmedName !== category.name) {
      updates.name = trimmedName;
    }
    if (editedColor !== category.color) {
      updates.color = editedColor;
    }

    if (Object.keys(updates).length > 0) {
      onUpdate(updates);
    }
    setIsEditing(false);
  };

  const handleCancelEdit = () => {
    setEditedName(category.name);
    setEditedColor(category.color);
    setIsEditing(false);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSaveEdit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleCancelEdit();
    }
  };

  const handleBatchCreateTags = async (tags: Array<{ name: string; color: string }>) => {
    await onCreateTags(tags);
    setBatchSectionExpanded(false);
  };

  return (
    <div className="bg-orange-50/80 border-l-2 border-orange-400 animate-in slide-in-from-top-1 duration-200">
      {/* Header */}
      <div className="px-3 py-2 border-b border-orange-200/60 flex items-center justify-between">
        <h3 className="text-xs font-semibold text-orange-700 uppercase tracking-wide">
          Category Configuration
        </h3>
        <button
          onClick={onClose}
          className="p-0.5 hover:bg-orange-100 rounded transition-colors"
          title="Close configuration"
        >
          <X className="w-3.5 h-3.5 text-orange-600" />
        </button>
      </div>

      {/* Edit Details Section */}
      <div className="border-b border-orange-200/60">
        <button
          onClick={() => setEditSectionExpanded(!editSectionExpanded)}
          className="w-full px-3 py-2 flex items-center gap-2 hover:bg-orange-100/50 transition-colors"
        >
          {editSectionExpanded ? (
            <ChevronDown className="w-3.5 h-3.5 text-orange-600" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5 text-orange-600" />
          )}
          <span className="text-xs font-medium text-orange-700">Edit Details</span>
        </button>

        {editSectionExpanded && (
          <div className="px-3 pb-3 space-y-3 animate-in slide-in-from-top-1 duration-150">
            {!isEditing ? (
              // Display mode
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span
                    className="w-4 h-4 rounded-full flex-shrink-0"
                    style={{ backgroundColor: category.color }}
                  />
                  <span className="text-sm font-medium text-slate-700">{category.name}</span>
                </div>
                <button
                  onClick={() => setIsEditing(true)}
                  className="w-full px-3 py-1.5 text-xs font-medium text-orange-600 hover:bg-orange-100 border border-orange-200 rounded transition-colors"
                >
                  Edit Category
                </button>
              </div>
            ) : (
              // Edit mode
              <div className="space-y-2">
                {/* Name Input */}
                <div>
                  <label className="block text-xs text-slate-600 font-medium mb-1">
                    Category Name
                  </label>
                  <input
                    type="text"
                    value={editedName}
                    onChange={(e) => setEditedName(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Category name..."
                    className="w-full px-2 py-1.5 text-sm border border-orange-200 rounded focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-transparent"
                    autoFocus
                  />
                </div>

                {/* Color Picker */}
                <div>
                  <label className="block text-xs text-slate-600 font-medium mb-1">Color</label>
                  <button
                    ref={colorButtonRef}
                    type="button"
                    onClick={() => setShowColorPicker(!showColorPicker)}
                    className="flex items-center gap-2 px-2 py-1 border border-orange-200 rounded hover:border-orange-300 transition-all"
                  >
                    <div
                      className="w-5 h-5 rounded border border-gray-300"
                      style={{ backgroundColor: editedColor }}
                    />
                    <span className="text-xs font-mono text-gray-600">{editedColor}</span>
                  </button>
                  <ColorPickerPopup
                    selectedColor={editedColor}
                    onColorChange={setEditedColor}
                    isOpen={showColorPicker}
                    onClose={() => setShowColorPicker(false)}
                    anchorEl={colorButtonRef.current}
                  />
                </div>

                {/* Edit Actions */}
                <div className="flex items-center gap-2 justify-end pt-1">
                  <button
                    onClick={handleCancelEdit}
                    className="px-3 py-1 text-xs font-medium text-slate-600 hover:bg-white rounded transition-colors flex items-center gap-1"
                  >
                    <X className="w-3 h-3" />
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveEdit}
                    disabled={!editedName.trim()}
                    className="px-3 py-1 text-xs font-medium text-white bg-orange-500 hover:bg-orange-600 disabled:bg-orange-300 disabled:cursor-not-allowed rounded transition-colors flex items-center gap-1"
                  >
                    <Check className="w-3 h-3" />
                    Save Changes
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Batch Add Tags Section */}
      <div>
        <button
          onClick={() => setBatchSectionExpanded(!batchSectionExpanded)}
          className="w-full px-3 py-2 flex items-center gap-2 hover:bg-orange-100/50 transition-colors"
        >
          {batchSectionExpanded ? (
            <ChevronDown className="w-3.5 h-3.5 text-orange-600" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5 text-orange-600" />
          )}
          <span className="text-xs font-medium text-orange-700">Batch Add Tags</span>
        </button>

        {batchSectionExpanded && (
          <div className="px-3 pb-3 animate-in slide-in-from-top-1 duration-150">
            <BatchTagCreation
              categoryColor={category.color}
              onSubmit={handleBatchCreateTags}
              onCancel={() => setBatchSectionExpanded(false)}
            />
          </div>
        )}
      </div>
    </div>
  );
}
