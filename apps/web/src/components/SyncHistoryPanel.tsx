/**
 * SyncHistoryPanel Component
 *
 * Collapsible sidebar panel showing recent sync history
 * Displays last 20 sync operations with timestamps and details
 */

import { useState } from 'react'
import { ChevronLeft, ChevronRight, CheckCircle2, AlertCircle, Clock } from 'lucide-react'
import type { SyncHistoryEntry } from '../hooks/useAutoSave'

export interface SyncHistoryPanelProps {
  syncHistory: SyncHistoryEntry[]
  isOpen?: boolean
  onToggle?: () => void
  // Optional: image metadata for display
  getImageName?: (imageId: string) => string
}

export function SyncHistoryPanel({
  syncHistory,
  isOpen = false,
  onToggle,
  getImageName,
}: SyncHistoryPanelProps) {
  const [internalIsOpen, setInternalIsOpen] = useState(isOpen)

  // Use controlled or uncontrolled state
  const isExpanded = onToggle !== undefined ? isOpen : internalIsOpen
  const handleToggle = () => {
    if (onToggle) {
      onToggle()
    } else {
      setInternalIsOpen(!internalIsOpen)
    }
  }

  if (syncHistory.length === 0) {
    return null // Don't show if no history
  }

  return (
    <div
      className={`fixed right-0 top-0 h-full bg-gray-800 border-l border-gray-700 shadow-2xl transition-all duration-300 z-40 ${
        isExpanded ? 'w-80' : 'w-12'
      }`}
    >
      {/* Toggle Button */}
      <button
        onClick={handleToggle}
        className="absolute top-4 -left-10 w-10 h-10 bg-gray-800 border border-gray-700 rounded-l-lg hover:bg-gray-700 transition-colors flex items-center justify-center"
        title={isExpanded ? 'Hide sync history' : 'Show sync history'}
      >
        {isExpanded ? (
          <ChevronRight className="w-5 h-5 text-gray-400" />
        ) : (
          <ChevronLeft className="w-5 h-5 text-gray-400" />
        )}
      </button>

      {/* Panel Content */}
      {isExpanded && (
        <div className="h-full flex flex-col">
          {/* Header */}
          <div className="px-4 py-4 border-b border-gray-700">
            <div className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-gray-400" />
              <h3 className="text-sm font-semibold text-white uppercase tracking-wide">
                Sync History
              </h3>
            </div>
            <p className="text-xs text-gray-400 mt-1">
              Last {Math.min(syncHistory.length, 20)} operations
            </p>
          </div>

          {/* History List */}
          <div className="flex-1 overflow-y-auto">
            <div className="px-4 py-2 space-y-2">
              {syncHistory.map((entry, index) => (
                <SyncHistoryItem
                  key={index}
                  entry={entry}
                  getImageName={getImageName}
                  isLatest={index === 0}
                />
              ))}
            </div>
          </div>

          {/* Footer */}
          <div className="px-4 py-3 border-t border-gray-700 bg-gray-700/30">
            <p className="text-xs text-gray-400 text-center">
              History automatically cleared after 20 entries
            </p>
          </div>
        </div>
      )}

      {/* Collapsed State Indicator */}
      {!isExpanded && (
        <div className="flex flex-col items-center justify-center h-full gap-4">
          <div className="writing-mode-vertical text-xs font-semibold text-gray-400 uppercase tracking-wider">
            History
          </div>
          <div className="text-xs text-gray-500">{syncHistory.length}</div>
        </div>
      )}
    </div>
  )
}

/**
 * Individual sync history item
 */
function SyncHistoryItem({
  entry,
  getImageName,
  isLatest,
}: {
  entry: SyncHistoryEntry
  getImageName?: (imageId: string) => string
  isLatest: boolean
}) {
  const [isExpanded, setIsExpanded] = useState(false)

  return (
    <div
      className={`rounded-lg border ${
        entry.success
          ? 'bg-emerald-500/10 border-emerald-500/30'
          : 'bg-red-500/10 border-red-500/30'
      } ${isLatest ? 'ring-2 ring-gray-500/50' : ''}`}
    >
      {/* Main Info */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-3 py-2 flex items-start gap-2 hover:bg-white/5 transition-colors text-left"
      >
        {/* Status Icon */}
        <div className="flex-shrink-0 mt-0.5">
          {entry.success ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          ) : (
            <AlertCircle className="w-4 h-4 text-red-500" />
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span
              className={`text-xs font-medium ${
                entry.success ? 'text-emerald-400' : 'text-red-400'
              }`}
            >
              {entry.success ? 'Success' : 'Failed'}
            </span>
            <span className="text-xs text-gray-500">
              {formatTimestamp(entry.timestamp)}
            </span>
          </div>

          <div className="text-xs text-gray-300 mt-1">
            {entry.operations} operation{entry.operations !== 1 ? 's' : ''} • {entry.imageIds.length}{' '}
            image{entry.imageIds.length !== 1 ? 's' : ''}
          </div>

          {entry.error && (
            <div className="text-xs text-red-400 mt-1 truncate">{entry.error}</div>
          )}
        </div>

        {/* Expand Icon */}
        <div className="flex-shrink-0 mt-0.5">
          <ChevronRight
            className={`w-4 h-4 text-gray-500 transition-transform ${
              isExpanded ? 'rotate-90' : ''
            }`}
          />
        </div>
      </button>

      {/* Expanded Details */}
      {isExpanded && (
        <div className="px-3 pb-2 border-t border-gray-700/50">
          <div className="mt-2 space-y-1">
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
              Affected Images:
            </div>
            {entry.imageIds.slice(0, 5).map((imageId) => (
              <div key={imageId} className="text-xs text-gray-300 truncate pl-2">
                • {getImageName ? getImageName(imageId) : `Image ${imageId.slice(0, 8)}...`}
              </div>
            ))}
            {entry.imageIds.length > 5 && (
              <div className="text-xs text-gray-500 pl-2">
                ...and {entry.imageIds.length - 5} more
              </div>
            )}
          </div>

          {entry.error && (
            <div className="mt-2">
              <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">
                Error Details:
              </div>
              <div className="text-xs text-red-400 bg-red-500/10 px-2 py-1 rounded">
                {entry.error}
              </div>
            </div>
          )}

          <div className="mt-2 text-xs text-gray-500">
            {entry.timestamp.toLocaleString()}
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

  if (diffSec < 10) {
    return 'Just now'
  } else if (diffSec < 60) {
    return `${diffSec}s ago`
  } else if (diffMin < 60) {
    return `${diffMin}m ago`
  } else if (diffHour < 24) {
    return `${diffHour}h ago`
  } else {
    // Format as time only
    return timestamp.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    })
  }
}
