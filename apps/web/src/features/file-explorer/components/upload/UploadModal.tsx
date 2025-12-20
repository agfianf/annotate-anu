import { Upload, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import toast from 'react-hot-toast'
import { useFileUpload } from '../../hooks/useFileUpload'
import { PathAutocomplete } from '../PathAutocomplete'
import { DropZone } from './DropZone'
import { UploadQueue } from './UploadQueue'

interface UploadModalProps {
  isOpen: boolean
  onClose: () => void
  initialDestination: string
}

export function UploadModal({
  isOpen,
  onClose,
  initialDestination,
}: UploadModalProps) {
  const [destination, setDestination] = useState(initialDestination)

  const {
    uploadQueue,
    overallProgress,
    isUploading,
    addFiles,
    removeFile,
    clearQueue,
    startUpload,
  } = useFileUpload({
    onSuccess: (response) => {
      if (response.totalUploaded > 0) {
        toast.success(`Uploaded ${response.totalUploaded} file(s)`)
      }
      if (response.totalFailed > 0) {
        toast.error(`${response.totalFailed} file(s) failed to upload`)
      }
    },
    onError: (error) => {
      toast.error(`Upload failed: ${error.message}`)
    },
  })

  useEffect(() => {
    setDestination(initialDestination)
  }, [initialDestination])

  const handleClose = () => {
    if (isUploading) {
      toast.error('Please wait for upload to complete')
      return
    }
    clearQueue()
    onClose()
  }

  const handleUpload = () => {
    if (uploadQueue.filter((f) => f.status === 'pending').length === 0) {
      toast.error('No files to upload')
      return
    }
    startUpload(destination)
  }

  const pendingCount = uploadQueue.filter((f) => f.status === 'pending').length

  if (!isOpen) return null

  return createPortal(
    <div className="fixed inset-0 z-[10000] flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={handleClose}
      />

      {/* Modal */}
      <div className="relative z-10 bg-white dark:bg-gray-900 rounded-lg shadow-xl w-full max-w-lg mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Upload Files
          </h2>
          <button
            onClick={handleClose}
            disabled={isUploading}
            className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded disabled:opacity-50"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4">
          {/* Destination folder */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
              Destination Folder
            </label>
            <PathAutocomplete
              value={destination}
              onChange={setDestination}
              placeholder="/ (root)"
              disabled={isUploading}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Type "/" to see folder suggestions. Leave empty for root folder.
            </p>
          </div>

          {/* Drop zone */}
          <DropZone onFilesAdded={addFiles} />

          {/* Upload queue */}
          <UploadQueue queue={uploadQueue} onRemove={removeFile} />

          {/* Progress bar */}
          {isUploading && (
            <div className="mt-4">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm text-gray-600 dark:text-gray-300">
                  Uploading...
                </span>
                <span className="text-sm text-gray-600 dark:text-gray-300">
                  {overallProgress}%
                </span>
              </div>
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                <div
                  className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${overallProgress}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-4 py-3 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={handleClose}
            disabled={isUploading}
            className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleUpload}
            disabled={isUploading || pendingCount === 0}
            className="flex items-center gap-2 px-4 py-2 text-sm bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 text-white rounded-lg"
          >
            <Upload className="w-4 h-4" />
            {isUploading ? 'Uploading...' : `Upload ${pendingCount} file(s)`}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
