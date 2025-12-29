/**
 * Model selector dropdown component for the header
 * Uses portal for dropdown to avoid overflow issues
 */

import { ChevronDown, Sparkles, Settings, RefreshCw } from 'lucide-react'
import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import type { AvailableModel } from '../types/byom'

interface ModelSelectorProps {
  selectedModel: AvailableModel | null
  allModels: AvailableModel[]
  onSelectModel: (id: string) => void
  onOpenSettings?: () => void
  onRefresh?: () => void
  isNotConfigured?: boolean // True when job mode has no models configured
}

export function ModelSelector({
  selectedModel,
  allModels,
  onSelectModel,
  onOpenSettings,
  onRefresh,
  isNotConfigured = false,
}: ModelSelectorProps) {
  const [isOpen, setIsOpen] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({})

  // Calculate dropdown position relative to button
  useEffect(() => {
    if (isOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect()
      const dropdownHeight = 320 // max-h-80 = 320px
      const viewportHeight = window.innerHeight
      const spaceBelow = viewportHeight - rect.bottom
      const spaceAbove = rect.top

      // Open upward if not enough space below
      const openUpward = spaceBelow < dropdownHeight && spaceAbove > spaceBelow

      setDropdownStyle({
        position: 'fixed',
        right: window.innerWidth - rect.right,
        ...(openUpward
          ? { bottom: viewportHeight - rect.top + 4 }
          : { top: rect.bottom + 4 }),
        width: 288, // w-72
        zIndex: 9999,
      })
    }
  }, [isOpen])

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node
      if (
        dropdownRef.current && !dropdownRef.current.contains(target) &&
        buttonRef.current && !buttonRef.current.contains(target)
      ) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  const handleSelectModel = (id: string) => {
    onSelectModel(id)
    setIsOpen(false)
  }

  // Show message when models aren't configured for this project
  if (isNotConfigured) {
    return (
      <div className="glass flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm shadow-sm">
        <Sparkles className="w-4 h-4 text-gray-400" />
        <span className="text-gray-500">No model configured</span>
      </div>
    )
  }

  return (
    <div className="relative">
      {/* Trigger Button */}
      <button
        ref={buttonRef}
        onClick={() => setIsOpen(!isOpen)}
        className="glass flex items-center gap-2 px-3 py-1.5 hover:bg-white/80
                   rounded-lg transition-all text-sm shadow-sm"
        title="Select Model"
      >
        <Sparkles className="w-4 h-4 text-emerald-600" />
        <span className="text-gray-900 font-medium">{selectedModel?.name || 'Select Model'}</span>
        {selectedModel && !selectedModel.is_healthy && (
          <span className="w-2 h-2 bg-red-500 rounded-full" title="Model Unhealthy" />
        )}
        <ChevronDown className={`w-4 h-4 text-gray-600 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown Menu - rendered via portal */}
      {isOpen && createPortal(
        <div
          ref={dropdownRef}
          style={dropdownStyle}
          className="glass-strong rounded-lg shadow-xl overflow-hidden"
        >
          {/* Header */}
          <div className="px-3 py-2 bg-white/40 border-b border-gray-200 flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-600 uppercase">Select Model</span>
            <div className="flex items-center gap-1">
              {onRefresh && (
                <button
                  onClick={() => {
                    onRefresh()
                    setIsOpen(false)
                  }}
                  className="p-1 hover:bg-white/60 rounded transition-colors"
                  title="Refresh Models"
                >
                  <RefreshCw className="w-3.5 h-3.5 text-gray-600" />
                </button>
              )}
              {onOpenSettings && (
                <button
                  onClick={() => {
                    onOpenSettings()
                    setIsOpen(false)
                  }}
                  className="p-1 hover:bg-white/60 rounded transition-colors"
                  title="Model Settings"
                >
                  <Settings className="w-3.5 h-3.5 text-gray-600" />
                </button>
              )}
            </div>
          </div>

          {/* Model List */}
          <div className="max-h-80 overflow-y-auto">
            {allModels.map((model) => {
              const isSelected = model.id === selectedModel?.id
              const isBuiltin = model.type === 'builtin'

              return (
                <button
                  key={model.id}
                  onClick={() => handleSelectModel(model.id)}
                  className={`w-full px-3 py-2.5 text-left hover:bg-white/60
                             transition-colors border-b border-gray-200/50 last:border-b-0
                             ${isSelected ? 'bg-emerald-50/80' : ''}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`font-medium ${isSelected ? 'text-emerald-700' : 'text-gray-900'}`}>
                          {model.name}
                        </span>
                        {isBuiltin && (
                          <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-700 text-xs rounded">
                            Built-in
                          </span>
                        )}
                      </div>

                      {model.description && (
                        <p className="text-xs text-gray-600 mt-0.5 line-clamp-1">{model.description}</p>
                      )}

                      {/* Capabilities */}
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {model.capabilities.supports_text_prompt && (
                          <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 text-xs rounded">
                            Text
                          </span>
                        )}
                        {model.capabilities.supports_bbox_prompt && (
                          <span className="px-1.5 py-0.5 bg-purple-100 text-purple-700 text-xs rounded">
                            BBox
                          </span>
                        )}
                        {model.capabilities.supports_auto_detect && (
                          <span className="px-1.5 py-0.5 bg-orange-100 text-orange-700 text-xs rounded">
                            Auto
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Health Indicator */}
                    <div className="flex items-center gap-1">
                      {model.is_healthy ? (
                        <div className="w-2 h-2 bg-emerald-500 rounded-full" title="Healthy" />
                      ) : (
                        <div className="w-2 h-2 bg-red-500 rounded-full" title="Unhealthy" />
                      )}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>

          {/* Footer - Add New Model */}
          {onOpenSettings && (
            <div className="px-3 py-2 bg-white/40 border-t border-gray-200">
              <button
                onClick={() => {
                  onOpenSettings()
                  setIsOpen(false)
                }}
                className="w-full px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100
                           text-emerald-700 rounded text-sm font-medium transition-colors
                           flex items-center justify-center gap-2"
              >
                <Settings className="w-4 h-4" />
                Manage Models
              </button>
            </div>
          )}
        </div>,
        document.body
      )}
    </div>
  )
}
