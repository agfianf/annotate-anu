/**
 * AttributesEditor Component
 * Portal-based popover for editing annotation attributes (key-value pairs)
 * Supports text, number, and boolean value types
 */

import { useEffect, useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Plus, Trash2, X, Check } from 'lucide-react'
import type { AttributeValue } from '@/types/annotations'

type AttributeType = 'text' | 'number' | 'boolean'

interface Attribute {
  key: string
  value: AttributeValue
  type: AttributeType
}

interface AttributesEditorProps {
  attributes: Record<string, AttributeValue>
  onSave: (attributes: Record<string, AttributeValue>) => void
  isOpen: boolean
  onClose: () => void
  anchorEl: HTMLElement | null
}

// Detect type of attribute value
function detectType(value: AttributeValue): AttributeType {
  if (typeof value === 'boolean') return 'boolean'
  if (typeof value === 'number') return 'number'
  return 'text'
}

// Convert attributes object to editable array
function objectToArray(attributes: Record<string, AttributeValue>): Attribute[] {
  return Object.entries(attributes).map(([key, value]) => ({
    key,
    value,
    type: detectType(value),
  }))
}

// Convert editable array back to object
function arrayToObject(attrs: Attribute[]): Record<string, AttributeValue> {
  const result: Record<string, AttributeValue> = {}
  attrs.forEach((attr) => {
    if (attr.key.trim()) {
      result[attr.key.trim()] = attr.value
    }
  })
  return result
}

export function AttributesEditor({
  attributes,
  onSave,
  isOpen,
  onClose,
  anchorEl,
}: AttributesEditorProps) {
  const [position, setPosition] = useState({ top: 0, left: 0 })
  const [editableAttrs, setEditableAttrs] = useState<Attribute[]>([])
  const popoverRef = useRef<HTMLDivElement>(null)

  // Initialize editable attributes when opening
  useEffect(() => {
    if (isOpen) {
      setEditableAttrs(objectToArray(attributes))
    }
  }, [isOpen, attributes])

  // Update position when anchor changes
  useEffect(() => {
    if (isOpen && anchorEl) {
      const rect = anchorEl.getBoundingClientRect()
      const viewportWidth = window.innerWidth
      const viewportHeight = window.innerHeight
      const popoverWidth = 280
      const popoverHeight = 300 // estimated

      let top = rect.bottom + 8
      let left = rect.left

      // Adjust if goes off-screen right
      if (left + popoverWidth > viewportWidth - 16) {
        left = viewportWidth - popoverWidth - 16
      }

      // Adjust if goes off-screen bottom
      if (top + popoverHeight > viewportHeight - 16) {
        top = rect.top - popoverHeight - 8
      }

      // Ensure minimum left
      if (left < 16) left = 16

      setPosition({ top, left })
    }
  }, [isOpen, anchorEl])

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node
      if (popoverRef.current && !popoverRef.current.contains(target)) {
        if (anchorEl && !anchorEl.contains(target)) {
          onClose()
        }
      }
    }

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEscape)

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [isOpen, onClose, anchorEl])

  const handleAddAttribute = () => {
    setEditableAttrs([
      ...editableAttrs,
      { key: '', value: '', type: 'text' },
    ])
  }

  const handleRemoveAttribute = (index: number) => {
    setEditableAttrs(editableAttrs.filter((_, i) => i !== index))
  }

  const handleKeyChange = (index: number, newKey: string) => {
    const updated = [...editableAttrs]
    updated[index] = { ...updated[index], key: newKey }
    setEditableAttrs(updated)
  }

  const handleValueChange = (index: number, newValue: string) => {
    const updated = [...editableAttrs]
    const attr = updated[index]

    // Convert based on type
    if (attr.type === 'number') {
      const num = parseFloat(newValue)
      updated[index] = { ...attr, value: isNaN(num) ? 0 : num }
    } else if (attr.type === 'boolean') {
      updated[index] = { ...attr, value: newValue === 'true' }
    } else {
      updated[index] = { ...attr, value: newValue }
    }

    setEditableAttrs(updated)
  }

  const handleTypeChange = (index: number, newType: AttributeType) => {
    const updated = [...editableAttrs]
    const attr = updated[index]

    // Convert value to new type
    let newValue: AttributeValue
    if (newType === 'boolean') {
      newValue = Boolean(attr.value)
    } else if (newType === 'number') {
      const num = parseFloat(String(attr.value))
      newValue = isNaN(num) ? 0 : num
    } else {
      newValue = String(attr.value)
    }

    updated[index] = { ...attr, type: newType, value: newValue }
    setEditableAttrs(updated)
  }

  const handleSave = () => {
    onSave(arrayToObject(editableAttrs))
    onClose()
  }

  if (!isOpen) return null

  return createPortal(
    <div
      ref={popoverRef}
      className="fixed z-[9999] glass-strong rounded-lg shadow-2xl border border-gray-200"
      style={{ width: '280px', top: position.top, left: position.left }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200">
        <h4 className="text-xs font-medium text-gray-700">Attributes</h4>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 transition-colors"
          aria-label="Close"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Content */}
      <div className="p-3 space-y-2 max-h-64 overflow-y-auto">
        {editableAttrs.length === 0 ? (
          <p className="text-xs text-gray-500 text-center py-2">
            No attributes. Click + to add one.
          </p>
        ) : (
          editableAttrs.map((attr, index) => (
            <div key={index} className="flex gap-1.5 items-start">
              {/* Key input */}
              <input
                type="text"
                placeholder="Key"
                value={attr.key}
                onChange={(e) => handleKeyChange(index, e.target.value)}
                className="
                  w-20 px-1.5 py-1 text-xs rounded border border-gray-300
                  focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500
                  bg-white text-gray-800
                "
              />

              {/* Type selector */}
              <select
                value={attr.type}
                onChange={(e) => handleTypeChange(index, e.target.value as AttributeType)}
                className="
                  w-16 px-1 py-1 text-[10px] rounded border border-gray-300
                  focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500
                  bg-white text-gray-600
                "
              >
                <option value="text">Text</option>
                <option value="number">Num</option>
                <option value="boolean">Bool</option>
              </select>

              {/* Value input - varies by type */}
              {attr.type === 'boolean' ? (
                <select
                  value={String(attr.value)}
                  onChange={(e) => handleValueChange(index, e.target.value)}
                  className="
                    flex-1 px-1.5 py-1 text-xs rounded border border-gray-300
                    focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500
                    bg-white text-gray-800
                  "
                >
                  <option value="true">True</option>
                  <option value="false">False</option>
                </select>
              ) : (
                <input
                  type={attr.type === 'number' ? 'number' : 'text'}
                  placeholder="Value"
                  value={String(attr.value)}
                  onChange={(e) => handleValueChange(index, e.target.value)}
                  className="
                    flex-1 px-1.5 py-1 text-xs rounded border border-gray-300
                    focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500
                    bg-white text-gray-800
                  "
                />
              )}

              {/* Delete button */}
              <button
                onClick={() => handleRemoveAttribute(index)}
                className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                title="Remove attribute"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))
        )}

        {/* Add button */}
        <button
          onClick={handleAddAttribute}
          className="
            w-full py-1.5 text-xs font-medium rounded transition-colors
            text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50
            flex items-center justify-center gap-1 border border-dashed border-emerald-300
          "
        >
          <Plus className="w-3.5 h-3.5" />
          Add Attribute
        </button>
      </div>

      {/* Footer */}
      <div className="flex gap-2 px-3 py-2 border-t border-gray-200">
        <button
          onClick={onClose}
          className="
            flex-1 py-1.5 text-xs font-medium rounded transition-colors
            text-gray-600 hover:text-gray-800 hover:bg-gray-100
          "
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          className="
            flex-1 py-1.5 text-xs font-medium rounded transition-colors
            bg-emerald-500 hover:bg-emerald-600 text-white
            flex items-center justify-center gap-1
          "
        >
          <Check className="w-3.5 h-3.5" />
          Save
        </button>
      </div>
    </div>,
    document.body
  )
}

export default AttributesEditor
