import { Modal } from './Modal'
import { Check, X, Loader2 } from 'lucide-react'

export interface BatchProgressItem {
  imageName: string
  status: 'pending' | 'processing' | 'success' | 'error'
  count?: number // number of annotations created
  error?: string
}

interface BatchProgressModalProps {
  isOpen: boolean
  onCancel: () => void
  progress: BatchProgressItem[]
  currentIndex: number
  total: number
}

export function BatchProgressModal({
  isOpen,
  onCancel,
  progress,
  currentIndex,
  total,
}: BatchProgressModalProps) {
  const completed = progress.filter((p) => p.status === 'success' || p.status === 'error').length
  const successCount = progress.filter((p) => p.status === 'success').length
  const errorCount = progress.filter((p) => p.status === 'error').length
  const percentage = total > 0 ? (completed / total) * 100 : 0

  return (
    <Modal isOpen={isOpen} onClose={() => {}} title="Batch Processing" blocking maxWidth="lg">
      <div className="space-y-4">
        {/* Progress bar */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-300">
              Processing {Math.min(currentIndex + 1, total)} of {total}
            </span>
            <span className="text-gray-400">{Math.round(percentage)}%</span>
          </div>
          <div className="w-full bg-gray-700 rounded-full h-2 overflow-hidden">
            <div
              className="bg-orange-600 h-full transition-all duration-300"
              style={{ width: `${percentage}%` }}
            />
          </div>
        </div>

        {/* Statistics */}
        <div className="flex gap-4 text-sm">
          <div className="flex items-center gap-2">
            <Check className="w-4 h-4 text-green-500" />
            <span className="text-gray-300">
              <span className="font-semibold text-green-400">{successCount}</span> succeeded
            </span>
          </div>
          <div className="flex items-center gap-2">
            <X className="w-4 h-4 text-red-500" />
            <span className="text-gray-300">
              <span className="font-semibold text-red-400">{errorCount}</span> failed
            </span>
          </div>
        </div>

        {/* Progress details list */}
        <div className="border border-gray-700 rounded max-h-64 overflow-y-auto">
          <div className="divide-y divide-gray-700">
            {progress.map((item, index) => (
              <div
                key={index}
                className={`px-4 py-2.5 flex items-start gap-3 ${
                  item.status === 'processing' ? 'bg-orange-600/10' : ''
                }`}
              >
                {/* Status icon */}
                <div className="flex-shrink-0 mt-0.5">
                  {item.status === 'pending' && (
                    <div className="w-4 h-4 rounded-full border-2 border-gray-600" />
                  )}
                  {item.status === 'processing' && (
                    <Loader2 className="w-4 h-4 text-orange-500 animate-spin" />
                  )}
                  {item.status === 'success' && (
                    <div className="w-4 h-4 rounded-full bg-green-500 flex items-center justify-center">
                      <Check className="w-3 h-3 text-white" />
                    </div>
                  )}
                  {item.status === 'error' && (
                    <div className="w-4 h-4 rounded-full bg-red-500 flex items-center justify-center">
                      <X className="w-3 h-3 text-white" />
                    </div>
                  )}
                </div>

                {/* Details */}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-white truncate">{item.imageName}</div>
                  {item.status === 'success' && item.count !== undefined && (
                    <div className="text-xs text-green-400">
                      {item.count} annotation{item.count !== 1 ? 's' : ''} created
                    </div>
                  )}
                  {item.status === 'error' && item.error && (
                    <div className="text-xs text-red-400">{item.error}</div>
                  )}
                  {item.status === 'processing' && (
                    <div className="text-xs text-orange-400">Processing...</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Cancel button */}
        <div className="flex justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded transition-colors"
          >
            {completed === total ? 'Close' : 'Cancel'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
