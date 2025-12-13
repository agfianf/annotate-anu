/**
 * SyncStatusPanel Component
 *
 * Displays detailed sync status with expandable image breakdown
 * Shows pending changes, sync history, and per-image details
 */

import { useState } from 'react'
import { ChevronDown, ChevronUp, Clock, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react'
import type { DirtyImageInfo, SyncHistoryEntry } from '../hooks/useAutoSave'

export interface SyncStatusPanelProps {
  pendingCount: number
  dirtyImageInfo: Map<string, DirtyImageInfo>
  syncHistory: SyncHistoryEntry[]
  onSyncNow: () => void
  onViewDetails?: () => void
  // Optional: image metadata for display
  getImageName?: (imageId: string) => string
}

export function SyncStatusPanel({
  pendingCount,
  dirtyImageInfo,
  syncHistory,
  onSyncNow,
  onViewDetails,
  getImageName,
}: SyncStatusPanelProps) {
  const [isExpanded, setIsExpanded] = useState(false)

  if (pendingCount === 0 && syncHistory.length === 0) {
    return null // Don't show panel if no activity
  }

  const totalImages = dirtyImageInfo.size
  const hasErrors = Array.from(dirtyImageInfo.values()).some((info) => info.hasError)

  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg shadow-lg">
      {/* Header - Always visible */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-700/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          {/* Status Icon */}
          {hasErrors ? (
            <AlertCircle className="w-5 h-5 text-red-500" />
          ) : pendingCount > 0 ? (
            <Clock className="w-5 h-5 text-orange-500" />
          ) : (
            <CheckCircle2 className="w-5 h-5 text-emerald-500" />
          )}

          {/* Status Text */}
          <div className="text-left">
            <div className="text-sm font-medium text-white">
              {pendingCount > 0 ? (
                <>
                  {pendingCount} pending change{pendingCount !== 1 ? 's' : ''}
                  {totalImages > 0 && ` across ${totalImages} image${totalImages !== 1 ? 's' : ''}`}
                </>
              ) : (
                'All changes synced'
              )}
            </div>
            {syncHistory.length > 0 && (
              <div className="text-xs text-gray-400">
                Last sync: {formatTimestamp(syncHistory[0].timestamp)}
              </div>
            )}
          </div>
        </div>

        {/* Expand/Collapse Icon */}
        {isExpanded ? (
          <ChevronUp className="w-5 h-5 text-gray-400" />
        ) : (
          <ChevronDown className="w-5 h-5 text-gray-400" />
        )}
      </button>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="border-t border-gray-700">
          {/* Pending Images Breakdown */}
          {totalImages > 0 && (
            <div className="px-4 py-3 border-b border-gray-700">
              <div className="text-xs font-semibold text-gray-400 uppercase mb-2">
                Pending Changes by Image
              </div>
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {Array.from(dirtyImageInfo.entries()).map(([imageId, info]) => (
                  <div
                    key={imageId}
                    className="flex items-center justify-between py-2 px-3 bg-gray-700/50 rounded"
                  >
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      {info.hasError && (
                        <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                      )}
                      <span className="text-sm text-gray-300 truncate">
                        {getImageName ? getImageName(imageId) : `Image ${imageId.slice(0, 8)}...`}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-xs font-medium px-2 py-1 rounded ${
                          info.hasError
                            ? 'bg-red-500/20 text-red-400'
                            : 'bg-orange-500/20 text-orange-400'
                        }`}
                      >
                        {info.count} change{info.count !== 1 ? 's' : ''}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recent Sync History */}
          {syncHistory.length > 0 && (
            <div className="px-4 py-3">
              <div className="text-xs font-semibold text-gray-400 uppercase mb-2">
                Recent Sync History
              </div>
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {syncHistory.slice(0, 5).map((entry, idx) => (
                  <div
                    key={idx}
                    className={`flex items-center justify-between py-2 px-3 rounded ${
                      entry.success ? 'bg-emerald-500/10' : 'bg-red-500/10'
                    }`}
                  >
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      {entry.success ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                      ) : (
                        <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-gray-300">
                          {entry.operations} operation{entry.operations !== 1 ? 's' : ''} across{' '}
                          {entry.imageIds.length} image{entry.imageIds.length !== 1 ? 's' : ''}
                        </div>
                        {entry.error && (
                          <div className="text-xs text-red-400 truncate">{entry.error}</div>
                        )}
                      </div>
                    </div>
                    <div className="text-xs text-gray-400 whitespace-nowrap ml-2">
                      {formatTimestamp(entry.timestamp)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="px-4 py-3 bg-gray-700/30 border-t border-gray-700 flex items-center gap-2">
            {pendingCount > 0 && (
              <button
                onClick={onSyncNow}
                className="flex items-center gap-2 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-sm font-medium transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                Sync Now
              </button>
            )}
            {onViewDetails && (
              <button
                onClick={onViewDetails}
                className="px-3 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded text-sm font-medium transition-colors"
              >
                View Details
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * Format timestamp as relative time
 */
function formatTimestamp(timestamp: Date): string {
  const now = new Date()
  const diffMs = now.getTime() - timestamp.getTime()
  const diffSec = Math.floor(diffMs / 1000)
  const diffMin = Math.floor(diffSec / 60)
  const diffHour = Math.floor(diffMin / 60)
  const diffDay = Math.floor(diffHour / 24)

  if (diffSec < 60) {
    return 'Just now'
  } else if (diffMin < 60) {
    return `${diffMin}m ago`
  } else if (diffHour < 24) {
    return `${diffHour}h ago`
  } else if (diffDay === 1) {
    return 'Yesterday'
  } else if (diffDay < 7) {
    return `${diffDay}d ago`
  } else {
    // Format as date
    return timestamp.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }
}
