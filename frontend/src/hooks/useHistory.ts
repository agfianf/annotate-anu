import { useState, useCallback, useRef, useEffect } from 'react'
import type { Annotation } from '../types/annotations'

interface HistoryState {
  past: Annotation[][]
  future: Annotation[][]
}

interface UseHistoryOptions {
  maxHistorySize?: number
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
  const { maxHistorySize = 50 } = options

  // Store history per image ID in a Map
  const historyMapRef = useRef<Map<string, HistoryState>>(new Map())

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
        setCurrentHistory(existingHistory)
      } else {
        // Initialize new history for this image
        const newHistory: HistoryState = { past: [], future: [] }
        historyMapRef.current.set(currentImageId, newHistory)
        setCurrentHistory(newHistory)
      }
    }
  }, [currentImageId])

  // Record a new change in history
  const recordChange = useCallback(
    (annotations: Annotation[]) => {
      if (!currentImageId) return

      setCurrentHistory(prev => {
        // Create a deep copy of annotations to avoid reference issues
        const annotationsCopy = JSON.parse(JSON.stringify(annotations))

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
        historyMapRef.current.set(currentImageId, newHistory)

        return newHistory
      })
    },
    [currentImageId, maxHistorySize]
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
      historyMapRef.current.set(currentImageId, newHistory)
      return newHistory
    })

    // Return the state to restore (one before the popped state)
    return newPast.length > 0 ? newPast[newPast.length - 1] : []
  }, [currentImageId, currentHistory.past])

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
      historyMapRef.current.set(currentImageId, newHistory)
      return newHistory
    })

    return nextState
  }, [currentImageId, currentHistory.future])

  // Clear history for current image
  const clearHistory = useCallback(() => {
    if (!currentImageId) return

    const newHistory: HistoryState = { past: [], future: [] }
    historyMapRef.current.set(currentImageId, newHistory)
    setCurrentHistory(newHistory)
  }, [currentImageId])

  return {
    recordChange,
    undo,
    redo,
    canUndo: currentHistory.past.length > 0,
    canRedo: currentHistory.future.length > 0,
    clearHistory,
  }
}
