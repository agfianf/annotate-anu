import { memo } from 'react'
import {
  File,
  X,
  CheckCircle,
  XCircle,
  Loader2,
  Clock,
} from 'lucide-react'
import type { UploadFile } from '../../types'

interface UploadQueueProps {
  queue: UploadFile[]
  onRemove: (id: string) => void
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export const UploadQueue = memo(function UploadQueue({
  queue,
  onRemove,
}: UploadQueueProps) {
  if (queue.length === 0) return null

  return (
    <div className="mt-4 border border-gray-200 rounded-lg overflow-hidden">
      <div className="px-3 py-2 bg-gray-50 border-b border-gray-200">
        <span className="text-sm font-medium text-gray-700">
          Upload Queue ({queue.length} files)
        </span>
      </div>

      <div className="max-h-60 overflow-y-auto">
        {queue.map((item) => (
          <div
            key={item.id}
            className="flex items-center gap-3 px-3 py-2 border-b border-gray-100 last:border-b-0"
          >
            <File className="w-4 h-4 text-gray-400 flex-shrink-0" />

            <div className="flex-1 min-w-0">
              <p className="text-sm truncate text-gray-700">
                {item.file.name}
              </p>
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <span>{formatFileSize(item.file.size)}</span>
                {item.error && (
                  <span className="text-red-500 truncate">{item.error}</span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 flex-shrink-0">
              {item.status === 'pending' && (
                <Clock className="w-4 h-4 text-gray-400" />
              )}
              {item.status === 'uploading' && (
                <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
              )}
              {item.status === 'success' && (
                <CheckCircle className="w-4 h-4 text-green-500" />
              )}
              {item.status === 'error' && (
                <XCircle className="w-4 h-4 text-red-500" />
              )}

              {(item.status === 'pending' || item.status === 'error') && (
                <button
                  onClick={() => onRemove(item.id)}
                  className="p-1 hover:bg-gray-100 rounded"
                >
                  <X className="w-4 h-4 text-gray-400" />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
})
