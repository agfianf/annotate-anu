import { useState, useCallback, useEffect } from 'react'
import {
  useDirectoryContents,
  usePrefetchDirectory,
  useResolveSelection,
} from '../hooks/useFileTree'
import { useFileSelectionStore } from '../stores/fileSelectionStore'
import { FileTree } from './FileTree'
import { BreadcrumbNav } from './BreadcrumbNav'
import { FileExplorerToolbar } from './FileExplorerToolbar'
import { UploadModal } from './upload/UploadModal'
import type { FileExplorerProps } from '../types'

export function FileExplorer({
  onSelect,
  selectionMode = 'multiple',
  showUpload = true,
  initialPath = '',
  className,
}: FileExplorerProps) {
  const [isUploadModalOpen, setUploadModalOpen] = useState(false)
  const {
    currentPath,
    setCurrentPath,
    getSelectedPaths,
    toggleExpand,
  } = useFileSelectionStore()

  // Initialize path
  useEffect(() => {
    if (initialPath) setCurrentPath(initialPath)
  }, [initialPath, setCurrentPath])

  // Fetch current directory
  const { data, isLoading, error, refetch } = useDirectoryContents(currentPath)
  const prefetch = usePrefetchDirectory()
  const resolveSelectionMutation = useResolveSelection()

  // Handle folder navigation
  const handleNavigate = useCallback(
    (path: string) => {
      setCurrentPath(path)
    },
    [setCurrentPath]
  )

  // Handle folder expand (for tree view)
  const handleToggleExpand = useCallback(
    (path: string) => {
      toggleExpand(path)
    },
    [toggleExpand]
  )

  // Handle selection confirm
  const handleConfirmSelection = useCallback(async () => {
    const selectedPaths = getSelectedPaths()

    try {
      // Expand folders to files server-side
      const resolvedFiles = await resolveSelectionMutation.mutateAsync({
        paths: selectedPaths,
        recursive: true,
      })

      // Call parent callback with resolved file paths
      onSelect?.(resolvedFiles)
    } catch (error) {
      console.error('Failed to resolve selection:', error)
      // TODO: Show error toast to user
    }
  }, [getSelectedPaths, onSelect, resolveSelectionMutation])

  // Handle prefetch on hover
  const handleMouseEnterFolder = useCallback(
    (path: string) => {
      return prefetch(path)
    },
    [prefetch]
  )

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-red-500">
        <p>Error loading directory: {(error as Error).message}</p>
        <button
          onClick={() => refetch()}
          className="mt-2 px-4 py-2 text-sm bg-red-100 hover:bg-red-200 text-red-700 rounded"
        >
          Retry
        </button>
      </div>
    )
  }

  return (
    <div
      className={`flex flex-col h-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden ${className ?? ''}`}
    >
      {/* Toolbar */}
      <FileExplorerToolbar
        currentPath={currentPath}
        onRefresh={() => refetch()}
        onUpload={() => setUploadModalOpen(true)}
        onConfirmSelection={handleConfirmSelection}
        showUpload={showUpload}
        selectedCount={getSelectedPaths().length}
      />

      {/* Breadcrumb navigation */}
      <BreadcrumbNav currentPath={currentPath} onNavigate={handleNavigate} />

      {/* File tree */}
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-32">
            <div className="animate-spin h-6 w-6 border-2 border-blue-500 border-t-transparent rounded-full" />
          </div>
        ) : (
          <FileTree
            items={data?.items ?? []}
            currentPath={currentPath}
            selectionMode={selectionMode}
            onToggleExpand={handleToggleExpand}
            onNavigate={handleNavigate}
            onMouseEnterFolder={handleMouseEnterFolder}
          />
        )}
      </div>

      {/* Upload modal */}
      {showUpload && (
        <UploadModal
          isOpen={isUploadModalOpen}
          onClose={() => setUploadModalOpen(false)}
          initialDestination={currentPath}
        />
      )}
    </div>
  )
}
