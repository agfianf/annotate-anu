import { Trash2 } from 'lucide-react'
import type { Annotation, Label } from '../types/annotations'

interface SidebarProps {
  annotations: Annotation[]
  labels: Label[]
  selectedAnnotation: string | null
  selectedLabelId: string | null
  onSelectAnnotation: (id: string) => void
  onSelectLabel: (id: string) => void
  onDeleteAnnotation: (id: string) => void
}

export default function Sidebar({
  annotations,
  labels,
  selectedAnnotation,
  selectedLabelId,
  onSelectAnnotation,
  onSelectLabel,
  onDeleteAnnotation,
}: SidebarProps) {
  const getLabel = (labelId: string) => {
    return labels.find(l => l.id === labelId)
  }

  const selectedLabel = labels.find(l => l.id === selectedLabelId)

  return (
    <div className="w-80 bg-gray-800 border-l border-gray-700 flex flex-col">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-700">
        <h2 className="text-lg font-semibold text-white">Annotations</h2>
        <p className="text-sm text-gray-400">{annotations.length} total</p>
      </div>

      {/* Label Selector */}
      <div className="px-4 py-3 border-b border-gray-700 bg-gray-750">
        <label className="block text-sm font-medium text-gray-300 mb-2">
          Selected Label
        </label>
        <select
          value={selectedLabelId || ''}
          onChange={(e) => onSelectLabel(e.target.value)}
          className="w-full px-3 py-2 bg-gray-700 text-white rounded border border-gray-600 focus:border-orange-500 focus:outline-none text-sm"
        >
          {labels.length === 0 ? (
            <option value="">No labels available</option>
          ) : (
            labels.map(label => (
              <option key={label.id} value={label.id}>
                {label.name}
              </option>
            ))
          )}
        </select>
        {selectedLabel && (
          <div className="mt-2 flex items-center gap-2 text-sm text-gray-400">
            <div
              className="w-4 h-4 rounded"
              style={{ backgroundColor: selectedLabel.color }}
            />
            <span>New annotations will use this label</span>
          </div>
        )}
      </div>

      {/* Annotations List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {annotations.length === 0 ? (
          <p className="text-gray-400 text-sm text-center mt-8">
            No annotations yet. Start drawing on the canvas.
          </p>
        ) : (
          annotations.map((annotation, index) => {
            const label = getLabel(annotation.labelId)
            const labelName = label?.name || 'Unknown'
            const labelColor = label?.color || '#6b7280'

            return (
              <div
                key={annotation.id}
                onClick={() => onSelectAnnotation(annotation.id)}
                className={`
                  p-3 rounded-lg border cursor-pointer transition-colors
                  ${selectedAnnotation === annotation.id
                    ? 'bg-orange-900/30 border-orange-600'
                    : 'bg-gray-700 border-gray-600 hover:bg-gray-650'
                  }
                `}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-3 h-3 rounded"
                        style={{ backgroundColor: labelColor }}
                      />
                      <span className="text-white font-medium text-sm">
                        {labelName} #{index + 1}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400 mt-1 capitalize">
                      Type: {annotation.type}
                    </p>
                  </div>

                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onDeleteAnnotation(annotation.id)
                    }}
                    className="p-1 rounded hover:bg-red-600 transition-colors text-gray-400 hover:text-white"
                    title="Delete annotation"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Footer Info */}
      <div className="px-4 py-3 border-t border-gray-700 bg-gray-850">
        <p className="text-xs text-gray-400">
          Click annotations to select • Drag to move • Use handles to resize
        </p>
      </div>
    </div>
  )
}
