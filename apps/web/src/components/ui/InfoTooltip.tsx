/**
 * InfoTooltip component - displays helpful information on hover with frosted glass effect
 * Features:
 * - Show on hover
 * - Click to pin/unpin tooltip
 * - Click outside to close
 * - Auto-position (left/right) based on available space
 * - Enhanced frosted glass transparency
 */

import { Info } from 'lucide-react'
import { useState, useRef, useEffect } from 'react'

interface InfoTooltipProps {
  content: string
  example?: string
  note?: string
  className?: string
}

export function InfoTooltip({ content, example, note, className = '' }: InfoTooltipProps) {
  const [isVisible, setIsVisible] = useState(false)
  const [isPinned, setIsPinned] = useState(false)
  const [showOnLeft, setShowOnLeft] = useState(false)
  const [timeoutId, setTimeoutId] = useState<NodeJS.Timeout | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)

  // Check if tooltip should appear on left or right
  const checkPosition = () => {
    if (!containerRef.current || !tooltipRef.current) return

    const triggerRect = containerRef.current.getBoundingClientRect()
    const tooltipWidth = 384 // w-96 = 24rem = 384px
    const margin = 12 // ml-3 = 12px
    const rightSpace = window.innerWidth - triggerRect.right - margin

    // If not enough space on the right, show on left
    setShowOnLeft(rightSpace < tooltipWidth)
  }

  const handleMouseEnter = () => {
    if (isPinned) return // Don't show on hover if pinned

    // Clear any existing timeout
    if (timeoutId) {
      clearTimeout(timeoutId)
    }
    // Show tooltip after short delay
    const id = setTimeout(() => {
      setIsVisible(true)
      checkPosition()
    }, 200)
    setTimeoutId(id)
  }

  const handleMouseLeave = () => {
    if (isPinned) return // Don't hide on leave if pinned

    // Clear timeout and hide tooltip
    if (timeoutId) {
      clearTimeout(timeoutId)
    }
    setIsVisible(false)
  }

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()

    if (isPinned) {
      // Unpin and hide
      setIsPinned(false)
      setIsVisible(false)
    } else {
      // Pin and show
      setIsPinned(true)
      setIsVisible(true)
      checkPosition()
    }
  }

  // Handle clicks outside to close pinned tooltip
  useEffect(() => {
    if (!isPinned) return

    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node) &&
        tooltipRef.current &&
        !tooltipRef.current.contains(event.target as Node)
      ) {
        setIsPinned(false)
        setIsVisible(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isPinned])

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId)
      }
    }
  }, [timeoutId])

  return (
    <div ref={containerRef} className="relative inline-block group">
      <button
        type="button"
        onClick={handleClick}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onFocus={() => {
          setIsVisible(true)
          checkPosition()
        }}
        onBlur={() => !isPinned && setIsVisible(false)}
        className={`text-gray-400 hover:text-emerald-600 transition-colors ${
          isPinned ? 'text-emerald-600' : ''
        } ${className}`}
        aria-label="More information"
      >
        <Info className="w-4 h-4" />
      </button>

      {isVisible && (
        <div
          ref={tooltipRef}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          className={`absolute z-[100] w-96 top-1/2 -translate-y-1/2
                        backdrop-blur-xl bg-white/70 dark:bg-gray-900/70
                        border border-gray-200/40 dark:border-gray-700/30
                        shadow-2xl rounded-xl px-5 py-4
                        animate-in fade-in duration-200
                        ${
                          showOnLeft
                            ? 'right-full mr-3 slide-in-from-right-2 before:content-[\'\'] before:absolute before:left-full before:top-1/2 before:-translate-y-1/2 before:border-[10px] before:border-transparent before:border-l-white/70 dark:before:border-l-gray-900/70'
                            : 'left-full ml-3 slide-in-from-left-2 before:content-[\'\'] before:absolute before:right-full before:top-1/2 before:-translate-y-1/2 before:border-[10px] before:border-transparent before:border-r-white/70 dark:before:border-r-gray-900/70'
                        }`}
        >
          {/* Main content */}
          <div className="space-y-3">
            <p className="text-sm text-gray-700 dark:text-gray-200 leading-relaxed">
              {content}
            </p>

            {/* Example section */}
            {example && (
              <div className="pt-2 border-t border-gray-200/50 dark:border-gray-700/50">
                <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 mb-1.5">
                  Example:
                </p>
                <code className="block text-xs bg-gray-100/60 dark:bg-gray-800/60
                               text-gray-800 dark:text-gray-200 px-3 py-2 rounded
                               font-mono border border-gray-200/40 dark:border-gray-700/30
                               whitespace-pre-wrap break-all">
                  {example}
                </code>
              </div>
            )}

            {/* Note section */}
            {note && (
              <div className="pt-2 border-t border-gray-200/50 dark:border-gray-700/50">
                <p className="text-xs text-gray-600 dark:text-gray-400 italic leading-relaxed">
                  💡 {note}
                </p>
              </div>
            )}
          </div>

          {/* Pin indicator */}
          {isPinned && (
            <div className="absolute top-2 right-2">
              <div className="w-2 h-2 bg-emerald-600 rounded-full animate-pulse" />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
