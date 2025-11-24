import type { PromptMode } from '@/types/annotations'

interface PromptModeSelectorProps {
  value: PromptMode
  onChange: (mode: PromptMode) => void
  disabled?: boolean
}

export function PromptModeSelector({ value, onChange, disabled = false }: PromptModeSelectorProps) {
  const modes: Array<{ value: PromptMode; label: string }> = [
    { value: 'single', label: 'Single Image' },
    { value: 'auto-apply', label: 'Auto-Apply' },
    { value: 'batch', label: 'Apply to All' },
  ]

  return (
    <div className="space-y-2">
      <label htmlFor="prompt-mode-select" className="text-xs font-medium text-gray-300">
        Apply Mode
      </label>
      <select
        id="prompt-mode-select"
        value={value}
        onChange={(e) => onChange(e.target.value as PromptMode)}
        disabled={disabled}
        className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm text-white focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {modes.map((mode) => (
          <option key={mode.value} value={mode.value}>
            {mode.label}
          </option>
        ))}
      </select>
    </div>
  )
}
