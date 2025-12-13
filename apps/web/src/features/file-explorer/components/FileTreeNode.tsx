import { memo, useCallback, useRef, useEffect } from 'react'
import {
  ChevronRight,
  ChevronDown,
  Folder,
  FolderOpen,
  File,
  Image,
} from 'lucide-react'
import { useDirectoryContents } from '../hooks/useFileTree'
import { useFileSelectionStore } from '../stores/fileSelectionStore'
import { SelectionCheckbox } from './SelectionCheckbox'
import type { FileItem, SelectionState } from '../types'

interface FileTreeNodeProps {
  item: FileItem
  depth: number
  selectionMode: 'single' | 'multiple'
  isExpanded: boolean
  onToggleExpand: (path: string) => void
  onNavigate: (path: string) => void
  onMouseEnterFolder?: (path: string) => () => void
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export const FileTreeNode = memo(function FileTreeNode({
  item,
  depth,
  selectionMode,
  isExpanded,
  onToggleExpand,
  onNavigate,
  onMouseEnterFolder,
}: FileTreeNodeProps) {
  const { isSelected, isIndeterminate, toggleSelect } = useFileSelectionStore()
  const hoverCleanup = useRef<(() => void) | null>(null)

  // Fetch children when expanded (lazy loading)
  const { data: children, isLoading } = useDirectoryContents(item.path, {
    enabled: item.type === 'directory' && isExpanded,
  })

  // Cleanup hover prefetch on unmount
  useEffect(() => {
    return () => {
      hoverCleanup.current?.()
    }
  }, [])

  const handleClick = useCallback(() => {
    if (item.type === 'directory') {
      onToggleExpand(item.path)
    }
  }, [item, onToggleExpand])

  const handleDoubleClick = useCallback(() => {
    if (item.type === 'directory') {
      onNavigate(item.path)
    }
  }, [item, onNavigate])

  const handleCheckboxChange = useCallback(() => {
    toggleSelect(item.path, item.type === 'directory')
  }, [item, toggleSelect])

  const handleMouseEnter = useCallback(() => {
    if (item.type === 'directory' && onMouseEnterFolder) {
      hoverCleanup.current = onMouseEnterFolder(item.path)
    }
  }, [item, onMouseEnterFolder])

  const handleMouseLeave = useCallback(() => {
    hoverCleanup.current?.()
    hoverCleanup.current = null
  }, [])

  // Determine selection state
  let selectionState: SelectionState = 'none'
  if (isSelected(item.path)) {
    selectionState = 'full'
  } else if (isIndeterminate(item.path)) {
    selectionState = 'partial'
  }

  // Determine icon
  const Icon =
    item.type === 'directory'
      ? isExpanded
        ? FolderOpen
        : Folder
      : item.mimeType?.startsWith('image/')
        ? Image
        : File

  const paddingLeft = depth * 20 + 8

  return (
    <>
      <div
        className="flex items-center py-1.5 px-2 hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer group"
        style={{ paddingLeft }}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        {/* Expand/collapse button */}
        <div className="w-5 h-5 flex items-center justify-center mr-1">
          {item.type === 'directory' &&
            (isLoading ? (
              <div className="w-3 h-3 border border-gray-400 border-t-transparent rounded-full animate-spin" />
            ) : isExpanded ? (
              <ChevronDown className="w-4 h-4 text-gray-500" />
            ) : (
              <ChevronRight className="w-4 h-4 text-gray-500" />
            ))}
        </div>

        {/* Selection checkbox */}
        {selectionMode === 'multiple' && (
          <SelectionCheckbox
            state={selectionState}
            onChange={handleCheckboxChange}
            className="mr-2"
          />
        )}

        {/* Icon */}
        <Icon className="w-4 h-4 mr-2 text-gray-600 dark:text-gray-400" />

        {/* Name */}
        <span className="flex-1 truncate text-sm">{item.name}</span>

        {/* Metadata */}
        {item.type === 'directory' && item.childrenCount !== undefined && (
          <span className="text-xs text-gray-400 mr-2">
            {item.childrenCount} items
          </span>
        )}
        {item.type === 'file' && item.size !== undefined && (
          <span className="text-xs text-gray-400 mr-2">
            {formatFileSize(item.size)}
          </span>
        )}
      </div>

      {/* Render children if expanded */}
      {item.type === 'directory' && isExpanded && children?.items && (
        <div>
          {children.items.map((child) => (
            <FileTreeNode
              key={child.path}
              item={child}
              depth={depth + 1}
              selectionMode={selectionMode}
              isExpanded={useFileSelectionStore.getState().isExpanded(child.path)}
              onToggleExpand={onToggleExpand}
              onNavigate={onNavigate}
              onMouseEnterFolder={onMouseEnterFolder}
            />
          ))}
        </div>
      )}
    </>
  )
})
