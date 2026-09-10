import { RotateCcw } from '@/components/ui/icons'
import type { Label, DetectionLabelMappingConfig } from '@/types/annotations'

interface LabelMappingSectionProps {
  modelClasses: string[]
  projectLabels: Label[]
  mapping: DetectionLabelMappingConfig
  onMappingChange: (mapping: DetectionLabelMappingConfig) => void
  onReset: () => void
}

export function LabelMappingSection({
  modelClasses,
  projectLabels,
  mapping,
  onMappingChange,
  onReset,
}: LabelMappingSectionProps) {
  const handleChange = (cls: string, value: string) => {
    const updated = { ...mapping }
    if (value === '__skip__') {
      updated[cls] = { action: 'skip' }
    } else {
      updated[cls] = { action: 'map', projectLabelId: value }
    }
    onMappingChange(updated)
  }

  const mappedCount = modelClasses.filter(
    (cls) => mapping[cls]?.action === 'map'
  ).length

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="block text-sm font-medium text-gray-700">
          Label Mapping
        </label>
        <button
          onClick={onReset}
          className="flex items-center gap-1 text-xs text-orange-600 hover:text-orange-700"
          title="Reset to auto-matched defaults"
        >
          <RotateCcw className="w-3 h-3" />
          Reset
        </button>
      </div>
      <p className="text-xs text-gray-500 mb-2">
        Map model classes to your project labels.{' '}
        <span className="font-medium">{mappedCount}/{modelClasses.length}</span> mapped.
      </p>
      <div className="max-h-48 overflow-y-auto space-y-1.5 border border-gray-200 rounded-lg p-2">
        {modelClasses.map((cls) => {
          const current = mapping[cls]
          const selectedValue =
            current?.action === 'map' && current.projectLabelId
              ? current.projectLabelId
              : '__skip__'

          return (
            <div key={cls} className="flex items-center gap-2">
              <span className="text-xs font-mono bg-gray-100 text-gray-700 px-2 py-1 rounded flex-shrink-0 min-w-0 truncate max-w-[120px]" title={cls}>
                {cls}
              </span>
              <span className="text-gray-400 text-xs">&rarr;</span>
              <select
                value={selectedValue}
                onChange={(e) => handleChange(cls, e.target.value)}
                className="flex-1 text-xs border border-gray-300 rounded px-2 py-1 bg-white focus:ring-1 focus:ring-orange-500 focus:border-orange-500"
              >
                <option value="__skip__">Skip (ignore)</option>
                {projectLabels.map((label) => (
                  <option key={label.id} value={label.id}>
                    {label.name}
                  </option>
                ))}
              </select>
              {selectedValue !== '__skip__' && (
                <div
                  className="w-3 h-3 rounded-sm flex-shrink-0 border border-gray-300"
                  style={{
                    backgroundColor:
                      projectLabels.find((l) => l.id === selectedValue)?.color || '#ccc',
                  }}
                />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
