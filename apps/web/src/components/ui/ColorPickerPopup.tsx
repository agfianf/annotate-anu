import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { PRESET_COLORS } from '@/lib/colors'

interface ColorPickerPopupProps {
  selectedColor: string
  onColorChange: (color: string) => void
  isOpen: boolean
  onClose: () => void
  anchorEl: HTMLElement | null
}

export function ColorPickerPopup({
  selectedColor,
  onColorChange,
  isOpen,
  onClose,
  anchorEl
}: ColorPickerPopupProps) {
  const [position, setPosition] = useState({ top: 0, left: 0 })

  // Update position when anchor changes
  useEffect(() => {
    if (isOpen && anchorEl) {
      const rect = anchorEl.getBoundingClientRect()
      setPosition({
        top: rect.bottom + 8,
        left: rect.left,
      })
    }
  }, [isOpen, anchorEl])

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return

    const handleClickOutside = (e: MouseEvent) => {
      if (!anchorEl?.contains(e.target as Node)) {
        // Check if click is inside the portal picker
        const picker = document.getElementById('color-picker-portal')
        if (picker && !picker.contains(e.target as Node)) {
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

  if (!isOpen) return null

  return createPortal(
    <div
      id="color-picker-portal"
      className="fixed z-[9999] glass-strong rounded-lg shadow-2xl p-3 border border-gray-200"
      style={{ width: '220px', top: position.top, left: position.left }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-xs font-medium text-gray-700">Pick Color</h4>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600" aria-label="Close">
          <X className="w-3 h-3" />
        </button>
      </div>

      {/* Preset Colors Grid */}
      <div className="grid grid-cols-5 gap-1.5 mb-2">
        {PRESET_COLORS.map((color) => (
          <button
            key={color}
            type="button"
            onClick={() => {
              onColorChange(color)
              onClose()
            }}
            className={`w-8 h-8 rounded transition-all ${
              selectedColor === color
                ? 'ring-2 ring-emerald-500 ring-offset-1 scale-110'
                : 'hover:scale-105'
            }`}
            style={{ backgroundColor: color }}
            title={color}
          />
        ))}
      </div>

      {/* Custom Color Section */}
      <div className="pt-2 border-t border-gray-200">
        <div className="flex items-center gap-2">
          <div className="relative w-7 h-7 flex-shrink-0 aspect-square rounded border border-gray-300 overflow-hidden">
            <input
              type="color"
              value={selectedColor}
              onChange={(e) => onColorChange(e.target.value)}
              className="absolute inset-0 w-[200%] h-[200%] -top-2 -left-2 cursor-pointer border-none"
            />
          </div>
          <input
            type="text"
            value={selectedColor}
            onChange={(e) => {
              const value = e.target.value
              if (value.match(/^#[0-9A-Fa-f]{0,6}$/)) {
                onColorChange(value)
              }
            }}
            placeholder="#268BEB"
            className="flex-1 h-7 px-2 text-xs font-mono border border-gray-300 rounded focus:border-emerald-500 focus:outline-none"
          />
        </div>
      </div>

      {/* Current Color Display */}
      <div className="mt-2 pt-2 border-t border-gray-200 flex items-center justify-between">
        <span className="text-xs text-gray-500">Current:</span>
        <div className="flex items-center gap-2">
          <div
            className="w-4 h-4 rounded border border-gray-300"
            style={{ backgroundColor: selectedColor }}
          />
          <span className="text-xs font-mono text-gray-900">{selectedColor}</span>
        </div>
      </div>
    </div>,
    document.body
  )
}
