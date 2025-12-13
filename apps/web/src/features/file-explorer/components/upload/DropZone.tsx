import { useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import { Upload, FolderUp } from 'lucide-react'

interface DropZoneProps {
  onFilesAdded: (files: File[]) => void
  acceptedExtensions?: string[]
}

export function DropZone({
  onFilesAdded,
  acceptedExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp'],
}: DropZoneProps) {
  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      onFilesAdded(acceptedFiles)
    },
    [onFilesAdded]
  )

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/*': acceptedExtensions,
    },
    multiple: true,
  })

  return (
    <div
      {...getRootProps()}
      className={`
        border-2 border-dashed rounded-lg p-8 text-center cursor-pointer
        transition-colors duration-200
        ${
          isDragActive
            ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
            : 'border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500'
        }
      `}
    >
      <input {...getInputProps()} />

      <div className="flex flex-col items-center gap-3">
        {isDragActive ? (
          <>
            <FolderUp className="w-12 h-12 text-blue-500" />
            <p className="text-lg font-medium text-blue-500">Drop files here</p>
          </>
        ) : (
          <>
            <Upload className="w-12 h-12 text-gray-400" />
            <div>
              <p className="text-lg font-medium text-gray-700 dark:text-gray-200">
                Drag and drop files here
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                or click to select files
              </p>
            </div>
            <p className="text-xs text-gray-400 mt-2">
              Supported: {acceptedExtensions.join(', ')}
            </p>
          </>
        )}
      </div>
    </div>
  )
}
