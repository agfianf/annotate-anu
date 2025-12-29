/**
 * TagInput Component
 * Input field that converts comma-separated values into tags with X button to remove
 */

import { useState, type KeyboardEvent } from 'react'
import { X } from 'lucide-react'

interface TagInputProps {
  value: string[]
  onChange: (tags: string[]) => void
  placeholder?: string
  className?: string
}

export function TagInput({ value, onChange, placeholder, className = '' }: TagInputProps) {
  const [inputValue, setInputValue] = useState('')

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    // Handle comma or Enter key to add tag
    if (e.key === ',' || e.key === 'Enter') {
      e.preventDefault()
      addTag()
    }
    // Handle backspace to remove last tag when input is empty
    else if (e.key === 'Backspace' && inputValue === '' && value.length > 0) {
      removeTag(value.length - 1)
    }
  }

  const addTag = () => {
    const trimmedValue = inputValue.trim()
    if (trimmedValue && !value.includes(trimmedValue)) {
      onChange([...value, trimmedValue])
      setInputValue('')
    } else if (trimmedValue) {
      // If duplicate, just clear input
      setInputValue('')
    }
  }

  const removeTag = (index: number) => {
    onChange(value.filter((_, i) => i !== index))
  }

  const handleBlur = () => {
    // Add tag on blur if there's input
    if (inputValue.trim()) {
      addTag()
    }
  }

  return (
    <div
      className={`flex flex-wrap items-center gap-2 w-full px-3 py-2 bg-white border border-gray-300 rounded-lg
                 focus-within:outline-none focus-within:ring-2 focus-within:ring-emerald-500 focus-within:border-transparent
                 ${className}`}
    >
      {/* Render existing tags */}
      {value.map((tag, index) => (
        <span
          key={index}
          className="inline-flex items-center gap-1 px-2 py-1 bg-emerald-100 text-emerald-800 text-sm rounded-md"
        >
          {tag}
          <button
            type="button"
            onClick={() => removeTag(index)}
            className="hover:bg-emerald-200 rounded-full p-0.5 transition-colors"
            aria-label={`Remove ${tag}`}
          >
            <X className="w-3 h-3" />
          </button>
        </span>
      ))}

      {/* Input field */}
      <input
        type="text"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        className="flex-1 min-w-[120px] outline-none text-gray-900 placeholder-gray-500"
        placeholder={value.length === 0 ? placeholder : ''}
      />
    </div>
  )
}
