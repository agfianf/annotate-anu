import { File, FolderUp, Upload } from 'lucide-react'
import { useCallback, useRef } from 'react'
import { useDropzone } from 'react-dropzone'

interface DropZoneProps {
  onFilesAdded: (files: File[]) => void
  acceptedExtensions?: string[]
}

export function DropZone({
  onFilesAdded,
  acceptedExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp'],
}: DropZoneProps) {
  const folderInputRef = useRef<HTMLInputElement>(null)

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      onFilesAdded(acceptedFiles)
    },
    [onFilesAdded]
  )

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop,
    accept: {
      'image/*': acceptedExtensions,
    },
    multiple: true,
    noClick: true, // Disable click to allow custom buttons
    noKeyboard: true,
  })

  const handleFolderSelect = useCallback(() => {
    folderInputRef.current?.click()
  }, [])

  const handleFolderChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files
      if (files && files.length > 0) {
        // Filter to accepted extensions
        const validFiles = Array.from(files).filter((file) => {
          const ext = '.' + file.name.split('.').pop()?.toLowerCase()
          return acceptedExtensions.includes(ext)
        })
        onFilesAdded(validFiles)
      }
      // Reset input to allow re-selecting the same folder
      e.target.value = ''
    },
    [acceptedExtensions, onFilesAdded]
  )

  return (
    <div
      {...getRootProps()}
      className={`
        border-2 border-dashed rounded-lg p-6 text-center
        transition-colors duration-200
        ${
          isDragActive
            ? 'border-blue-500 bg-blue-50'
            : 'border-gray-300'
        }
      `}
    >
      <input {...getInputProps()} />
      {/* Hidden folder input with webkitdirectory */}
      <input
        ref={folderInputRef}
        type="file"
        className="hidden"
        onChange={handleFolderChange}
        // @ts-expect-error - webkitdirectory is a non-standard attribute
        webkitdirectory=""
        directory=""
        multiple
      />

      <div className="flex flex-col items-center gap-4">
        {isDragActive ? (
          <>
            <FolderUp className="w-12 h-12 text-blue-500" />
            <p className="text-lg font-medium text-blue-500">Drop files here</p>
          </>
        ) : (
          <>
            <Upload className="w-10 h-10 text-gray-400" />
            <div>
              <p className="text-base font-medium text-gray-700">
                Drag and drop files or folders here
              </p>
              <p className="text-sm text-gray-500 mt-1">
                or use the buttons below
              </p>
            </div>

            {/* Action buttons */}
            <div className="flex gap-3 mt-2">
              <button
                type="button"
                onClick={open}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <File className="w-4 h-4" />
                Select Files
              </button>
              <button
                type="button"
                onClick={handleFolderSelect}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-500 hover:bg-blue-600 rounded-lg transition-colors"
              >
                <FolderUp className="w-4 h-4" />
                Select Folder
              </button>
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

