import { memo } from 'react'
import { Check, Minus } from 'lucide-react'
import type { SelectionState } from '../types'

interface SelectionCheckboxProps {
  state: SelectionState
  onChange: (checked: boolean) => void
  className?: string
}

export const SelectionCheckbox = memo(function SelectionCheckbox({
  state,
  onChange,
  className = '',
}: SelectionCheckboxProps) {
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    onChange(state !== 'full')
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`
        w-4 h-4 rounded border flex items-center justify-center
        transition-colors duration-150
        ${
          state === 'full'
            ? 'bg-blue-500 border-blue-500 text-white'
            : state === 'partial'
              ? 'bg-blue-100 border-blue-500 text-blue-500'
              : 'bg-white border-gray-300 hover:border-gray-400'
        }
        ${className}
      `}
    >
      {state === 'full' && <Check className="w-3 h-3" />}
      {state === 'partial' && <Minus className="w-3 h-3" />}
    </button>
  )
})
