import { memo, useState } from 'react'
import { RefreshCw, Upload, FolderPlus, Check } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { useCreateDirectory, fileTreeKeys } from '../hooks/useFileTree'
import { validateFolderPath } from '../utils/validation'
import { PathAutocomplete } from './PathAutocomplete'
import { shareApi } from '../api/share'
import toast from 'react-hot-toast'

interface FileExplorerToolbarProps {
  currentPath: string
  onRefresh: () => void
  onUpload: () => void
  onConfirmSelection: () => void
  showUpload?: boolean
  selectedCount: number
}

export const FileExplorerToolbar = memo(function FileExplorerToolbar({
  currentPath,
  onRefresh,
  onUpload,
  onConfirmSelection,
  showUpload = true,
  selectedCount,
}: FileExplorerToolbarProps) {
  const [showNewFolder, setShowNewFolder] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [validationError, setValidationError] = useState('')
  const createDirectory = useCreateDirectory()
  const queryClient = useQueryClient()

  const handleCreateFolder = async () => {
    // Validate before creating
    const validation = validateFolderPath(newFolderName)
    if (!validation.valid) {
      setValidationError(validation.error || 'Invalid folder path')
      return
    }

    try {
      // Use batch API for nested folders
      const result = await shareApi.createNestedDirectories(
        currentPath,
        newFolderName.trim()
      )

      // Show success message with paths
      if (result.created.length > 0) {
        const pathsList = result.created.join('\n')
        toast.success(
          `Created folder(s):\n${pathsList}${
            result.skipped.length > 0
              ? `\n\nSkipped ${result.skipped.length} existing folder(s)`
              : ''
          }`,
          { duration: 5000 }
        )
      } else if (result.skipped.length > 0) {
        toast.error('Folder already exists', { duration: 5000 })
      }

      // Invalidate query cache for all potentially affected directories
      // 1. Invalidate current path to show newly created folders
      queryClient.invalidateQueries({
        queryKey: fileTreeKeys.directory(currentPath),
      })

      // 2. Invalidate each created folder path (for when they're expanded)
      for (const createdPath of result.created) {
        queryClient.invalidateQueries({
          queryKey: fileTreeKeys.directory(createdPath),
        })
      }

      // 3. Trigger manual refresh to ensure UI updates
      onRefresh()

      setNewFolderName('')
      setValidationError('')
      setShowNewFolder(false)
    } catch (error: any) {
      // Extract error message from API response
      const errorMessage =
        error?.response?.data?.detail ||
        error?.message ||
        'Failed to create folder'

      toast.error(`Failed to create folder: ${errorMessage}`)
    }
  }

  const handleCancelNewFolder = () => {
    setShowNewFolder(false)
    setNewFolderName('')
    setValidationError('')
  }

  return (
    <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200 dark:border-gray-700">
      <div className="flex items-center gap-2">
        <button
          onClick={onRefresh}
          className="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-300"
          title="Refresh"
        >
          <RefreshCw className="w-4 h-4" />
        </button>

        {showUpload && (
          <button
            onClick={onUpload}
            className="flex items-center gap-1 px-3 py-1.5 rounded bg-blue-500 hover:bg-blue-600 text-white text-sm"
          >
            <Upload className="w-4 h-4" />
            <span>Upload</span>
          </button>
        )}

        <button
          onClick={() => setShowNewFolder(!showNewFolder)}
          className="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-300"
          title="New Folder"
        >
          <FolderPlus className="w-4 h-4" />
        </button>

        {showNewFolder && (
          <div className="flex items-center gap-2">
            <div className="flex flex-col">
              <PathAutocomplete
                value={newFolderName}
                onChange={(value) => {
                  setNewFolderName(value)
                  // Validate in real-time
                  const validation = validateFolderPath(value)
                  setValidationError(validation.valid ? '' : validation.error || '')
                }}
                placeholder="folder-name or path/to/folder"
                mode="create"
                disabled={createDirectory.isPending}
                className={`px-2 py-1 text-sm border rounded bg-white dark:bg-gray-700 ${
                  validationError
                    ? 'border-red-500 dark:border-red-500'
                    : 'border-gray-300 dark:border-gray-600'
                }`}
              />
              {validationError && (
                <span className="text-xs text-red-500 mt-0.5">
                  {validationError}
                </span>
              )}
            </div>
            <button
              onClick={handleCreateFolder}
              disabled={
                !newFolderName.trim() ||
                !!validationError ||
                createDirectory.isPending
              }
              className="px-2 py-1 text-sm bg-green-500 hover:bg-green-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-white rounded"
            >
              Create
            </button>
            <button
              onClick={handleCancelNewFolder}
              className="px-2 py-1 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
            >
              Cancel
            </button>
          </div>
        )}
      </div>

      <div className="flex items-center gap-3">
        {selectedCount > 0 && (
          <>
            <span className="text-sm text-gray-600 dark:text-gray-300">
              {selectedCount} selected
            </span>
            <button
              onClick={onConfirmSelection}
              className="flex items-center gap-1 px-3 py-1.5 rounded bg-green-500 hover:bg-green-600 text-white text-sm"
            >
              <Check className="w-4 h-4" />
              <span>Confirm</span>
            </button>
          </>
        )}
      </div>
    </div>
  )
})
