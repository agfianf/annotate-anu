import type { PromptMode } from '@/types/annotations'

interface PromptModeSelectorProps {
  value: PromptMode
  onChange: (mode: PromptMode) => void
  disabled?: boolean
  disabledModes?: PromptMode[]
  disabledLabel?: string
}

export function PromptModeSelector({
  value,
  onChange,
  disabled = false,
  disabledModes = [],
  disabledLabel = '(coming soon)'
}: PromptModeSelectorProps) {
  const modes: Array<{ value: PromptMode; label: string; description: string }> = [
    { value: 'single', label: 'Single Image', description: 'Apply to current image only' },
    { value: 'auto-apply', label: 'Auto-Apply', description: 'Auto-run when navigating to new images' },
    { value: 'batch', label: 'Apply to All', description: 'Process multiple images at once' },
  ]

  return (
    <div className="space-y-2">
      <label className="text-xs font-medium text-gray-300">Apply Mode</label>
      <div className="space-y-1.5">
        {modes.map((mode) => {
          const isModeDisabled = disabled || disabledModes.includes(mode.value)
          return (
            <label
              key={mode.value}
              className={`flex items-start gap-2 p-2 rounded transition-colors ${
                value === mode.value
                  ? 'bg-orange-600/20 border border-orange-600/50'
                  : 'bg-gray-800 border border-gray-700 hover:bg-gray-700'
              } ${isModeDisabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
            >
              <input
                type="radio"
                name="prompt-mode"
                value={mode.value}
                checked={value === mode.value}
                onChange={(e) => onChange(e.target.value as PromptMode)}
                disabled={isModeDisabled}
                className="mt-0.5 text-orange-600 focus:ring-orange-500 focus:ring-offset-gray-900"
              />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-white flex items-center gap-2">
                  {mode.label}
                  {disabledModes.includes(mode.value) && (
                    <span className="text-xs text-gray-500">{disabledLabel}</span>
                  )}
                </div>
                <div className="text-xs text-gray-400">{mode.description}</div>
              </div>
            </label>
          )
        })}
      </div>
    </div>
  )
}
