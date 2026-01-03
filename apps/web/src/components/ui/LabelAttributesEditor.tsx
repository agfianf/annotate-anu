/**
 * LabelAttributesEditor Component
 * Simple attribute key configuration for labels
 * Attributes are always optional text fields
 */

import { ChevronDown, ChevronRight, GripVertical, Plus, Settings2, Trash2 } from 'lucide-react';
import { useState } from 'react';
import type { LabelAttributeDefinition } from '../../lib/api-client';

interface LabelAttributesEditorProps {
  attributes: LabelAttributeDefinition[];
  onChange: (attributes: LabelAttributeDefinition[]) => void;
  disabled?: boolean;
}

const generateId = () => `attr_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

export default function LabelAttributesEditor({
  attributes,
  onChange,
  disabled = false,
}: LabelAttributesEditorProps) {
  const [isExpanded, setIsExpanded] = useState(attributes.length > 0);
  const [newAttributeName, setNewAttributeName] = useState('');

  const handleAddAttribute = () => {
    const name = newAttributeName.trim();
    if (!name) return;

    // Check for duplicate names
    if (attributes.some(attr => attr.name.toLowerCase() === name.toLowerCase())) {
      return;
    }

    const newAttr: LabelAttributeDefinition = {
      id: generateId(),
      name,
      type: 'text', // Always text type for simplicity
      required: false, // Always optional
    };
    onChange([...attributes, newAttr]);
    setNewAttributeName('');
    setIsExpanded(true);
  };

  const handleUpdateAttributeName = (id: string, name: string) => {
    onChange(
      attributes.map((attr) =>
        attr.id === id ? { ...attr, name } : attr
      )
    );
  };

  const handleDeleteAttribute = (id: string) => {
    onChange(attributes.filter((attr) => attr.id !== id));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddAttribute();
    }
  };

  return (
    <div className="mt-2">
      {/* Header */}
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 transition-colors"
        disabled={disabled}
      >
        {isExpanded ? (
          <ChevronDown className="w-3.5 h-3.5" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5" />
        )}
        <Settings2 className="w-3.5 h-3.5" />
        <span>Attributes</span>
        {attributes.length > 0 && (
          <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-700 rounded text-[10px] font-medium">
            {attributes.length}
          </span>
        )}
      </button>

      {/* Attributes List */}
      {isExpanded && (
        <div className="mt-2 pl-4 border-l-2 border-gray-100 space-y-2">
          {attributes.length === 0 && !newAttributeName ? (
            <p className="text-xs text-gray-400 italic py-1">
              No attributes. Add attribute keys to standardize annotation metadata.
            </p>
          ) : (
            <div className="space-y-1.5">
              {attributes.map((attr) => (
                <div
                  key={attr.id}
                  className="flex items-center gap-2 bg-gray-50 rounded px-2 py-1.5"
                >
                  <GripVertical className="w-3 h-3 text-gray-300 flex-shrink-0" />

                  {/* Name Input */}
                  <input
                    type="text"
                    value={attr.name}
                    onChange={(e) => handleUpdateAttributeName(attr.id, e.target.value)}
                    className="flex-1 text-xs font-medium bg-transparent border-none focus:outline-none focus:ring-0 px-0"
                    placeholder="Attribute name"
                    disabled={disabled}
                  />

                  {/* Type indicator */}
                  <span className="text-[10px] text-gray-400 px-1.5 py-0.5 bg-gray-100 rounded">
                    text
                  </span>

                  {/* Delete */}
                  <button
                    type="button"
                    onClick={() => handleDeleteAttribute(attr.id)}
                    className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                    disabled={disabled}
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Add Attribute Input */}
          {!disabled && (
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={newAttributeName}
                onChange={(e) => setNewAttributeName(e.target.value)}
                onKeyDown={handleKeyDown}
                className="flex-1 text-xs px-2 py-1.5 bg-white border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-emerald-500"
                placeholder="New attribute name..."
              />
              <button
                type="button"
                onClick={handleAddAttribute}
                disabled={!newAttributeName.trim()}
                className="flex items-center gap-1 px-2 py-1.5 text-xs text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Plus className="w-3.5 h-3.5" />
                Add
              </button>
            </div>
          )}

          <p className="text-[10px] text-gray-400">
            Attributes are optional text fields for annotation metadata.
          </p>
        </div>
      )}
    </div>
  );
}
