import { memo } from 'react'
import { FileTreeNode } from './FileTreeNode'
import { useFileSelectionStore } from '../stores/fileSelectionStore'
import type { FileItem } from '../types'

interface FileTreeProps {
  items: FileItem[]
  currentPath: string
  selectionMode: 'single' | 'multiple'
  onToggleExpand: (path: string) => void
  onNavigate: (path: string) => void
  onMouseEnterFolder?: (path: string) => () => void
}

export const FileTree = memo(function FileTree({
  items,
  selectionMode,
  onToggleExpand,
  onNavigate,
  onMouseEnterFolder,
}: FileTreeProps) {
  const isExpanded = useFileSelectionStore((state) => state.isExpanded)

  if (items.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-gray-500 dark:text-gray-400">
        <p>This folder is empty</p>
      </div>
    )
  }

  return (
    <div className="py-1">
      {items.map((item) => (
        <FileTreeNode
          key={item.path}
          item={item}
          depth={0}
          selectionMode={selectionMode}
          isExpanded={isExpanded(item.path)}
          onToggleExpand={onToggleExpand}
          onNavigate={onNavigate}
          onMouseEnterFolder={onMouseEnterFolder}
        />
      ))}
    </div>
  )
})
