import { useState, useCallback, useRef, useEffect } from 'react'
import type { Annotation } from '../types/annotations'

interface HistoryState {
  past: Annotation[][]
  future: Annotation[][]
}

interface UseHistoryOptions {
  maxHistorySize?: number
  /** Number of per-image history stacks kept in memory (least recently touched are dropped). */
  maxImages?: number
}

interface UseHistoryReturn {
  recordChange: (annotations: Annotation[]) => void
  undo: () => Annotation[] | null
  redo: () => Annotation[] | null
  canUndo: boolean
  canRedo: boolean
  clearHistory: () => void
}

/**
 * Hook to manage per-image undo/redo history for annotations
 * Maintains separate history stacks for each image
 */
export function useHistory(
  currentImageId: string | null,
  options: UseHistoryOptions = {}
): UseHistoryReturn {
  const { maxHistorySize = 50, maxImages = 20 } = options

  // Store history per image ID in a Map. Insertion order doubles as recency: `touchHistory` re-inserts
  // the key on every write so the oldest entries can be evicted once the cap is exceeded.
  const historyMapRef = useRef<Map<string, HistoryState>>(new Map())

  const touchHistory = useCallback((imageId: string, history: HistoryState) => {
    const map = historyMapRef.current
    map.delete(imageId)
    map.set(imageId, history)
    while (map.size > maxImages) {
      const oldest = map.keys().next().value
      if (oldest === undefined) break
      map.delete(oldest)
    }
  }, [maxImages])

  // Track the current image's history state
  const [currentHistory, setCurrentHistory] = useState<HistoryState>({
    past: [],
    future: [],
  })

  // Update current history when image changes
  useEffect(() => {
    if (currentImageId) {
      const existingHistory = historyMapRef.current.get(currentImageId)
      if (existingHistory) {
        touchHistory(currentImageId, existingHistory)
        setCurrentHistory(existingHistory)
      } else {
        // Initialize new history for this image
        const newHistory: HistoryState = { past: [], future: [] }
        touchHistory(currentImageId, newHistory)
        setCurrentHistory(newHistory)
      }
    }
  }, [currentImageId, touchHistory])

  // Record a new change in history
  const recordChange = useCallback(
    (annotations: Annotation[]) => {
      if (!currentImageId) return

      setCurrentHistory(prev => {
        // Annotations are replaced immutably by every caller, so a shallow copy of the array is enough
        // to freeze this snapshot; the individual annotation objects are never mutated in place.
        const annotationsCopy = [...annotations]

        // Add current state to past, clear future
        const newPast = [...prev.past, annotationsCopy]

        // Limit history size
        const trimmedPast = newPast.length > maxHistorySize
          ? newPast.slice(newPast.length - maxHistorySize)
          : newPast

        const newHistory: HistoryState = {
          past: trimmedPast,
          future: [], // Clear future when new change is made
        }

        // Update the map
        touchHistory(currentImageId, newHistory)

        return newHistory
      })
    },
    [currentImageId, maxHistorySize, touchHistory]
  )

  // Undo the last change
  const undo = useCallback((): Annotation[] | null => {
    if (!currentImageId || currentHistory.past.length === 0) {
      return null
    }

    const newPast = [...currentHistory.past]
    const previousState = newPast.pop()!

    setCurrentHistory(prev => {
      const newHistory: HistoryState = {
        past: newPast,
        future: [previousState, ...prev.future],
      }
      touchHistory(currentImageId, newHistory)
      return newHistory
    })

    // Return the state to restore (one before the popped state)
    return newPast.length > 0 ? newPast[newPast.length - 1] : []
  }, [currentImageId, currentHistory.past, touchHistory])

  // Redo the last undone change
  const redo = useCallback((): Annotation[] | null => {
    if (!currentImageId || currentHistory.future.length === 0) {
      return null
    }

    const newFuture = [...currentHistory.future]
    const nextState = newFuture.shift()!

    setCurrentHistory(prev => {
      const newHistory: HistoryState = {
        past: [...prev.past, nextState],
        future: newFuture,
      }
      touchHistory(currentImageId, newHistory)
      return newHistory
    })

    return nextState
  }, [currentImageId, currentHistory.future, touchHistory])

  // Clear history for current image
  const clearHistory = useCallback(() => {
    if (!currentImageId) return

    const newHistory: HistoryState = { past: [], future: [] }
    touchHistory(currentImageId, newHistory)
    setCurrentHistory(newHistory)
  }, [currentImageId, touchHistory])

  return {
    recordChange,
    undo,
    redo,
    canUndo: currentHistory.past.length > 0,
    canRedo: currentHistory.future.length > 0,
    clearHistory,
  }
}
