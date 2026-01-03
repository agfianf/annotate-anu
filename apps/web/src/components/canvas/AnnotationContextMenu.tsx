/**
 * AnnotationContextMenu Component
 * Right-click context menu for editing annotation attributes on canvas
 */

import { Check, Edit3, Trash2, X } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import toast from 'react-hot-toast';
import type { Annotation, Label } from '@/types/annotations';
import type { LabelAttributeDefinition } from '@/lib/api-client';

interface AnnotationContextMenuProps {
  annotation: Annotation;
  label: Label | undefined;
  position: { x: number; y: number };
  onClose: () => void;
  onDelete?: (id: string) => void;
  onLabelChange?: (annotationId: string, newLabelId: string) => void;
  onAttributeChange?: (annotationId: string, attributes: Record<string, string | number | boolean>) => void;
  labels: Label[];
  attributeDefinitions?: LabelAttributeDefinition[];
}

interface AttributeEditorProps {
  definitions: LabelAttributeDefinition[];
  values: Record<string, string | number | boolean>;
  onChange: (values: Record<string, string | number | boolean>) => void;
  onSave: () => void;
  onCancel: () => void;
}

function AttributeEditor({ definitions, values, onChange, onSave, onCancel }: AttributeEditorProps) {
  // Use attribute name as key (not id) for consistency with how attributes are stored
  const [localValues, setLocalValues] = useState<Record<string, string | number | boolean>>(values);

  const handleChange = (name: string, value: string | number | boolean) => {
    const newValues = { ...localValues, [name]: value };
    setLocalValues(newValues);
  };

  const handleSave = () => {
    // Filter out empty values
    const filteredValues: Record<string, string | number | boolean> = {};
    for (const [key, value] of Object.entries(localValues)) {
      if (value !== '' && value !== undefined && value !== null) {
        filteredValues[key] = value;
      }
    }
    onChange(filteredValues);
    onSave();
  };

  return (
    <div className="p-2 space-y-2">
      <div className="flex items-center justify-between pb-1 border-b border-gray-200">
        <span className="text-xs font-semibold text-gray-700">Edit Attributes</span>
        <button type="button" onClick={onCancel} className="p-0.5 text-gray-400 hover:text-gray-600">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {definitions.length === 0 ? (
        <p className="text-xs text-gray-400 italic py-2">
          No attributes configured for this label.
        </p>
      ) : (
        <div className="space-y-2 max-h-48 overflow-y-auto">
          {definitions.map((def) => (
            <div key={def.id} className="space-y-0.5">
              <label className="text-[10px] text-gray-600 font-medium">
                {def.name}
              </label>
              <input
                type="text"
                value={(localValues[def.name] as string) || ''}
                onChange={(e) => handleChange(def.name, e.target.value)}
                placeholder={`Enter ${def.name}...`}
                className="w-full px-2 py-1 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>
          ))}
        </div>
      )}

      <div className="flex justify-end gap-1.5 pt-1.5 border-t border-gray-200">
        <button
          type="button"
          onClick={onCancel}
          className="px-2 py-1 text-xs text-gray-600 hover:text-gray-800"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSave}
          className="px-2 py-1 text-xs bg-emerald-500 text-white rounded hover:bg-emerald-600"
        >
          Save
        </button>
      </div>
    </div>
  );
}

export function AnnotationContextMenu({
  annotation,
  label,
  position,
  onClose,
  onDelete,
  onLabelChange,
  onAttributeChange,
  labels,
  attributeDefinitions = [],
}: AnnotationContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuPosition, setMenuPosition] = useState(position);
  const [showAttributeEditor, setShowAttributeEditor] = useState(false);

  // Position menu to stay within viewport
  useLayoutEffect(() => {
    if (!menuRef.current) return;

    const rect = menuRef.current.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let x = position.x;
    let y = position.y;

    // Adjust horizontal position
    if (x + rect.width > viewportWidth - 10) {
      x = viewportWidth - rect.width - 10;
    }

    // Adjust vertical position
    if (y + rect.height > viewportHeight - 10) {
      y = viewportHeight - rect.height - 10;
    }

    setMenuPosition({ x: Math.max(10, x), y: Math.max(10, y) });
  }, [position]);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (menuRef.current && !menuRef.current.contains(target)) {
        onClose();
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showAttributeEditor) {
          setShowAttributeEditor(false);
        } else {
          onClose();
        }
      }
    };

    // Use setTimeout to prevent immediate close when menu opens
    const timeoutId = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 100);
    document.addEventListener('keydown', handleEscape);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose, showAttributeEditor]);

  const handleDelete = () => {
    onDelete?.(annotation.id);
    onClose();
  };

  const handleLabelChange = (newLabelId: string) => {
    const newLabel = labels.find(l => l.id === newLabelId);
    onLabelChange?.(annotation.id, newLabelId);
    toast.success(`Label changed to "${newLabel?.name || 'Unknown'}"`);
    onClose();
  };

  const handleAttributeSave = () => {
    setShowAttributeEditor(false);
    onClose();
  };

  const handleAttributeChange = (values: Record<string, string | number | boolean>) => {
    onAttributeChange?.(annotation.id, values);
  };

  return createPortal(
    <div
      ref={menuRef}
      className="fixed z-[9999] min-w-[180px] rounded-lg shadow-xl border border-gray-200 overflow-hidden"
      style={{
        left: menuPosition.x,
        top: menuPosition.y,
        background: 'rgba(255, 255, 255, 0.95)',
        backdropFilter: 'blur(12px)',
      }}
    >
      {showAttributeEditor ? (
        <AttributeEditor
          definitions={attributeDefinitions}
          values={annotation.attributes || {}}
          onChange={handleAttributeChange}
          onSave={handleAttributeSave}
          onCancel={() => setShowAttributeEditor(false)}
        />
      ) : (
        <div className="py-1">
          {/* Header */}
          <div className="px-3 py-1.5 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <div
                className="w-3 h-3 rounded-sm"
                style={{ backgroundColor: label?.color || '#888' }}
              />
              <span className="text-xs font-medium text-gray-800 truncate">
                {label?.name || 'Unknown'}
              </span>
            </div>
          </div>

          {/* Edit Attributes */}
          {attributeDefinitions.length > 0 && (
            <button
              onClick={() => setShowAttributeEditor(true)}
              className="w-full px-3 py-1.5 flex items-center gap-2 text-xs text-gray-700 hover:bg-gray-100 transition-colors"
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>Edit Attributes</span>
              {Object.keys(annotation.attributes || {}).length > 0 && (
                <span className="ml-auto px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded text-[10px]">
                  {Object.keys(annotation.attributes || {}).length}
                </span>
              )}
            </button>
          )}

          {/* Change Label - Inline Submenu */}
          <div className="border-t border-gray-100 mt-1 pt-1">
            <div className="px-3 py-1 text-[10px] text-gray-500 font-medium uppercase tracking-wide">
              Change Label
            </div>
            <div className="max-h-32 overflow-y-auto">
              {labels.map((l) => (
                <button
                  key={l.id}
                  type="button"
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    handleLabelChange(l.id)
                  }}
                  className={`w-full px-3 py-1.5 flex items-center gap-2 text-xs transition-colors cursor-pointer ${
                    l.id === annotation.labelId
                      ? 'bg-emerald-50 text-emerald-700'
                      : 'text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  <div
                    className="w-3 h-3 rounded-sm flex-shrink-0 border border-gray-300"
                    style={{ backgroundColor: l.color }}
                  />
                  <span className="truncate">{l.name}</span>
                  {l.id === annotation.labelId && (
                    <Check className="w-3.5 h-3.5 ml-auto text-emerald-500 flex-shrink-0" />
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Divider */}
          <div className="my-1 border-t border-gray-100" />

          {/* Delete */}
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              handleDelete()
            }}
            className="w-full px-3 py-1.5 flex items-center gap-2 text-xs text-red-600 hover:bg-red-50 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Delete</span>
          </button>
        </div>
      )}
    </div>,
    document.body
  );
}
