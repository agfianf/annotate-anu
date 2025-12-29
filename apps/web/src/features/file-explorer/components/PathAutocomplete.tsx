import { useState, useMemo, useRef, useEffect } from 'react'
import { Folder } from 'lucide-react'
import { useDirectoryContents } from '../hooks/useFileTree'
import type { FileItem } from '../types'

interface PathAutocompleteProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  disabled?: boolean
  className?: string
  _mode?: 'select' | 'create' // 'select' for UploadModal, 'create' for folder creation
}

export function PathAutocomplete({
  value,
  onChange,
  placeholder = '/ (root)',
  disabled = false,
  className = '',
  _mode = 'select',
}: PathAutocompleteProps) {
  const [showDropdown, setShowDropdown] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Parse current path to get search directory
  const currentDir = useMemo(() => {
    // For empty value, search in root ('')
    if (!value) return ''

    // Extract directory from path like "folder1/folder2/" -> "folder1/folder2"
    const lastSlash = value.lastIndexOf('/')
    return lastSlash >= 0 ? value.substring(0, lastSlash) : ''
  }, [value])

  // Determine if we should show suggestions
  const shouldFetchSuggestions = useMemo(() => {
    // Show suggestions when:
    // 1. Empty value (show root folders)
    // 2. Value includes "/" (show nested folders)
    return value === '' || value.includes('/')
  }, [value])

  // Fetch folders in current directory
  const { data: folders, isLoading } = useDirectoryContents(currentDir, {
    enabled: shouldFetchSuggestions && showDropdown,
  })

  // Filter to only show directories
  const folderItems = useMemo(() => {
    return folders?.items.filter((item) => item.type === 'directory') || []
  }, [folders])

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        !inputRef.current?.contains(event.target as Node)
      ) {
        setShowDropdown(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value
    onChange(newValue)

    // Show dropdown when empty (root suggestions) or when "/" is typed
    if (newValue === '' || newValue.includes('/')) {
      setShowDropdown(true)
      setSelectedIndex(0)
    } else {
      setShowDropdown(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showDropdown || folderItems.length === 0) return

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setSelectedIndex((i) => Math.min(i + 1, folderItems.length - 1))
        break
      case 'ArrowUp':
        e.preventDefault()
        setSelectedIndex((i) => Math.max(i - 1, 0))
        break
      case 'Enter':
        e.preventDefault()
        if (folderItems[selectedIndex]) {
          selectFolder(folderItems[selectedIndex])
        }
        break
      case 'Escape':
        e.preventDefault()
        setShowDropdown(false)
        break
    }
  }

  const selectFolder = (folder: FileItem) => {
    const currentPath = currentDir ? currentDir + '/' : ''
    const newPath = currentPath + folder.name + '/'
    onChange(newPath)
    setShowDropdown(false)
    inputRef.current?.focus()
  }

  const handleFocus = () => {
    // Show dropdown if empty (root folders) or contains "/" (nested folders)
    if (value === '' || value.includes('/')) {
      setShowDropdown(true)
    }
  }

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        onFocus={handleFocus}
        placeholder={placeholder}
        disabled={disabled}
        className={className}
        autoComplete="off"
      />

      {showDropdown && shouldFetchSuggestions && (
        <div
          ref={dropdownRef}
          className="absolute z-10 mt-1 w-full bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-auto"
        >
          {isLoading ? (
            <div className="px-3 py-2 text-sm text-gray-500">
              Loading folders...
            </div>
          ) : folderItems.length === 0 ? (
            <div className="px-3 py-2 text-sm text-gray-500">
              No folders found
            </div>
          ) : (
            folderItems.map((folder, index) => (
              <button
                key={folder.path}
                type="button"
                onClick={() => selectFolder(folder)}
                className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2 hover:bg-gray-100 transition-colors ${
                  index === selectedIndex
                    ? 'bg-blue-50 text-blue-600'
                    : 'text-gray-900'
                }`}
              >
                <Folder className="w-4 h-4 flex-shrink-0" />
                <span className="truncate">{folder.name}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
