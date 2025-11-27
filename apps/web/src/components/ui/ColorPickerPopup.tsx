import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { PRESET_COLORS, DEFAULT_LABEL_COLOR } from '@/lib/colors'

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
  const [showCustom, setShowCustom] = useState(false)
  const popupRef = useRef<HTMLDivElement>(null)

  // Position popup relative to anchor element
  useEffect(() => {
    if (!isOpen || !anchorEl || !popupRef.current) return

    const updatePosition = () => {
      const anchorRect = anchorEl.getBoundingClientRect()
      const popup = popupRef.current!

      // Position below anchor by default
      popup.style.top = `${anchorRect.bottom + 8}px`
      popup.style.left = `${anchorRect.left}px`

      // Check if popup goes off-screen, adjust if needed
      const popupRect = popup.getBoundingClientRect()
      if (popupRect.bottom > window.innerHeight) {
        // Show above instead
        popup.style.top = `${anchorRect.top - popupRect.height - 8}px`
      }
    }

    updatePosition()
    window.addEventListener('resize', updatePosition)
    return () => window.removeEventListener('resize', updatePosition)
  }, [isOpen, anchorEl])

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return

    const handleClickOutside = (e: MouseEvent) => {
      if (
        popupRef.current &&
        !popupRef.current.contains(e.target as Node) &&
        !anchorEl?.contains(e.target as Node)
      ) {
        onClose()
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

  // Check if current color is a preset or custom
  useEffect(() => {
    setShowCustom(!PRESET_COLORS.includes(selectedColor as any))
  }, [selectedColor])

  if (!isOpen) return null

  const popupContent = (
    <div
      ref={popupRef}
      className="fixed glass-strong rounded-lg shadow-2xl p-3 border border-gray-200"
      style={{ width: '220px', zIndex: 9999 }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-xs font-medium text-gray-700">Pick Color</h4>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600"
          aria-label="Close"
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
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
              setShowCustom(false)
            }}
            className={`w-8 h-8 rounded transition-all ${
              selectedColor === color && !showCustom
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
        {!showCustom ? (
          <button
            type="button"
            onClick={() => setShowCustom(true)}
            className="text-xs text-emerald-600 hover:text-emerald-700 flex items-center gap-1 w-full"
          >
            <span>+</span> Custom
          </button>
        ) : (
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5">
              <input
                type="color"
                value={selectedColor}
                onChange={(e) => onColorChange(e.target.value)}
                className="w-8 h-8 rounded cursor-pointer border border-gray-300"
              />
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
                className="flex-1 px-2 py-1 text-xs font-mono border border-gray-300 rounded focus:border-emerald-500 focus:outline-none"
              />
            </div>
            <button
              type="button"
              onClick={() => {
                setShowCustom(false)
                onColorChange(DEFAULT_LABEL_COLOR)
              }}
              className="text-xs text-gray-500 hover:text-gray-700"
            >
              ← Presets
            </button>
          </div>
        )}
      </div>

      {/* Current Color Display */}
      <div className="mt-2 pt-2 border-t border-gray-200 flex items-center justify-between">
        <span className="text-xs text-gray-500">Current:</span>
        <span className="text-xs font-mono text-gray-900">{selectedColor}</span>
      </div>
    </div>
  )

  return createPortal(popupContent, document.body)
}
