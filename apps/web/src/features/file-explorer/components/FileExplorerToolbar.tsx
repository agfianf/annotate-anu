import { memo, useState } from 'react'
import { RefreshCw, Upload, FolderPlus, Check } from 'lucide-react'
import { useCreateDirectory } from '../hooks/useFileTree'
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
  const createDirectory = useCreateDirectory()

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return

    try {
      await createDirectory.mutateAsync({
        path: currentPath,
        name: newFolderName.trim(),
      })
      toast.success('Folder created successfully')
      setNewFolderName('')
      setShowNewFolder(false)
    } catch (error) {
      toast.error('Failed to create folder')
    }
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
            <input
              type="text"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="Folder name"
              className="px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700"
              onKeyDown={(e) => e.key === 'Enter' && handleCreateFolder()}
              autoFocus
            />
            <button
              onClick={handleCreateFolder}
              disabled={!newFolderName.trim() || createDirectory.isPending}
              className="px-2 py-1 text-sm bg-green-500 hover:bg-green-600 disabled:bg-gray-300 text-white rounded"
            >
              Create
            </button>
            <button
              onClick={() => {
                setShowNewFolder(false)
                setNewFolderName('')
              }}
              className="px-2 py-1 text-sm text-gray-600 hover:text-gray-800"
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
