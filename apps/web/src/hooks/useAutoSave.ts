/**
 * Auto-Save Hook
 * Handles periodic sync of annotations to backend with configurable interval
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { separateAnnotationsByType } from '../lib/annotation-converter'
import { jobsApi } from '../lib/api-client'
import type { Annotation } from '../types/annotations'

export interface AutoSaveConfig {
  enabled: boolean
  intervalMs: number // Default: 5000 (5 seconds)
  onSyncSuccess?: () => void | Promise<void> // Callback after successful sync
}

export type SyncStatus = 'idle' | 'syncing' | 'success' | 'error'

export interface PendingChange {
  annotation: Annotation
  operation: 'create' | 'update' | 'delete'
  imageWidth: number
  imageHeight: number
  backendId?: string // For updates and deletes
}

export interface DirtyImageInfo {
  count: number
  hasError: boolean
}

export interface SyncHistoryEntry {
  timestamp: Date
  imageIds: string[]
  operations: number
  success: boolean
  error?: string
}

export interface AutoSaveState {
  syncStatus: SyncStatus
  lastSyncTime: Date | null
  pendingCount: number
  isOnline: boolean
  dirtyImageInfo: Map<string, DirtyImageInfo>
  syncHistory: SyncHistoryEntry[]
}

export interface AutoSaveActions {
  markCreate: (annotation: Annotation, imageWidth: number, imageHeight: number) => void
  markUpdate: (annotation: Annotation, backendId: string, imageWidth: number, imageHeight: number) => void
  markDelete: (annotationId: string, backendId: string, imageId: string, annotationType: 'rectangle' | 'polygon' | 'point') => void
  syncNow: () => Promise<void>
  clearPending: () => void
  // Legacy compatibility - will be deprecated
  dirtyImageIds: Set<string>
}

const DEFAULT_CONFIG: AutoSaveConfig = {
  enabled: true,
  intervalMs: 5000,
}

/**
 * Hook to handle auto-save of annotations to backend
 *
 * @param jobId - The job ID (null disables auto-save)
 * @param config - Auto-save configuration
 * @returns Auto-save state and actions
 */
export function useAutoSave(
  jobId: string | null,
  config: AutoSaveConfig = DEFAULT_CONFIG
): AutoSaveState & AutoSaveActions {
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle')
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null)
  const [isOnline, setIsOnline] = useState(navigator.onLine)

  // Use ref for pending changes to avoid re-renders on every change
  const pendingChangesRef = useRef<Map<string, PendingChange>>(new Map())
  const [pendingCount, setPendingCount] = useState(0)

  // Enhanced dirty tracking with counts and error states
  const [dirtyImageInfo, setDirtyImageInfo] = useState<Map<string, DirtyImageInfo>>(new Map())
  // Legacy compatibility
  const [dirtyImageIds, setDirtyImageIds] = useState<Set<string>>(new Set())

  // Sync history (keep last 20 entries)
  const [syncHistory, setSyncHistory] = useState<SyncHistoryEntry[]>([])

  // Track errors per image
  const imageErrorsRef = useRef<Map<string, string>>(new Map())

  // Helper to update dirty images with detailed info
  const updateDirtyImages = () => {
    const info = new Map<string, DirtyImageInfo>()
    const ids = new Set<string>()

    // Count changes per image
    for (const change of pendingChangesRef.current.values()) {
      const imageId = change.annotation.imageId
      ids.add(imageId)

      const current = info.get(imageId) || { count: 0, hasError: false }
      info.set(imageId, {
        count: current.count + 1,
        hasError: imageErrorsRef.current.has(imageId),
      })
    }

    setDirtyImageInfo(info)
    setDirtyImageIds(ids) // Keep legacy support
    setPendingCount(pendingChangesRef.current.size)
  }

  // Track sync interval
  const syncIntervalRef = useRef<NodeJS.Timeout | null>(null)

  /**
   * Handle online/offline status
   */
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true)
      toast.success('Back online - syncing pending changes')
    }

    const handleOffline = () => {
      setIsOnline(false)
      toast('You are offline - changes will sync when back online', { icon: '📴' })
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  /**
   * Warn user before leaving page with unsaved changes
   */
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (pendingChangesRef.current.size > 0) {
        e.preventDefault()
        e.returnValue = 'You have unsaved changes. Are you sure you want to leave?'
        return e.returnValue
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [])

  /**
   * Mark an annotation for creation
   */
  const markCreate = useCallback(
    (annotation: Annotation, imageWidth: number, imageHeight: number) => {
      const existingPending = pendingChangesRef.current.get(annotation.id)
      console.log('[markCreate] Adding to pending:', {
        id: annotation.id,
        operation: 'create',
        existingPending: existingPending ? { operation: existingPending.operation, backendId: existingPending.backendId } : null
      })
      pendingChangesRef.current.set(annotation.id, {
        annotation,
        operation: 'create',
        imageWidth,
        imageHeight,
      })
      updateDirtyImages()
    },
    []
  )

  /**
   * Mark an annotation for update
   */
  const markUpdate = useCallback(
    (annotation: Annotation, backendId: string, imageWidth: number, imageHeight: number) => {
      const existingPending = pendingChangesRef.current.get(annotation.id)
      console.log('[markUpdate] Adding to pending:', {
        id: annotation.id,
        backendId,
        operation: 'update',
        existingPending: existingPending ? { operation: existingPending.operation, backendId: existingPending.backendId } : null
      })
      pendingChangesRef.current.set(annotation.id, {
        annotation,
        operation: 'update',
        backendId,
        imageWidth,
        imageHeight,
      })
      updateDirtyImages()
    },
    []
  )

  /**
   * Mark an annotation for deletion
   */
  const markDelete = useCallback(
    (annotationId: string, backendId: string, imageId: string, annotationType: 'rectangle' | 'polygon' | 'point') => {
      console.log('[markDelete] Adding to pending:', {
        id: annotationId,
        backendId,
        operation: 'delete',
        type: annotationType
      })
      pendingChangesRef.current.set(annotationId, {
        annotation: {
          id: annotationId,
          imageId,
          labelId: '',
          type: annotationType,
          createdAt: 0,
          updatedAt: 0,
          x: 0,
          y: 0,
          width: 0,
          height: 0,
        } as Annotation,
        operation: 'delete',
        backendId,
        imageWidth: 0,
        imageHeight: 0,
      })
      updateDirtyImages()
    },
    []
  )

  /**
   * Clear all pending changes
   */
  const clearPending = useCallback(() => {
    pendingChangesRef.current.clear()
    setPendingCount(0)
    updateDirtyImages()
  }, [])

  /**
   * Sync pending changes to backend
   */
  /**
   * Sync pending changes to backend
   */
  const syncToBackend = useCallback(async () => {
    if (!jobId || pendingChangesRef.current.size === 0) return
    if (!isOnline) {
      console.log('Offline - skipping sync')
      return
    }

    console.log('[syncToBackend] Starting sync with', pendingChangesRef.current.size, 'pending changes')
    console.log('[syncToBackend] Pending changes:', Array.from(pendingChangesRef.current.entries()).map(([id, change]) => ({
      id,
      operation: change.operation,
      backendId: change.backendId,
      type: change.annotation.type
    })))

    setSyncStatus('syncing')

    try {
      const changes = Array.from(pendingChangesRef.current.values())
      const syncedImageIds: string[] = []

      // Group changes by image
      const imagesPayload: Record<string, any> = {}

      for (const change of changes) {
        const imageId = change.annotation.imageId
        if (!imagesPayload[imageId]) {
          imagesPayload[imageId] = {
            tags: { created: [], updated: [], deleted: [] },
            detections: { created: [], updated: [], deleted: [] },
            segmentations: { created: [], updated: [], deleted: [] },
            keypoints: { created: [], updated: [], deleted: [] },
          }
        }

        const payload = imagesPayload[imageId]
        const ann = change.annotation

        // Determine category based on annotation type
        // rectangle -> detections (bounding boxes)
        // polygon -> segmentations
        // point -> keypoints
        let category: 'detections' | 'segmentations' | 'keypoints' = 'detections'
        if (ann.type === 'polygon') {
          category = 'segmentations'
        } else if (ann.type === 'point') {
          category = 'keypoints'
        }
        
        // Prepare data based on operation
        if (change.operation === 'create') {
          // For creation, convert frontend annotation to backend format
          const { detections, segmentations } = separateAnnotationsByType(
            [ann],
            change.imageWidth,
            change.imageHeight
          )

          if (category === 'detections' && detections.length > 0) {
            payload.detections.created.push(detections[0])
          } else if (category === 'segmentations' && segmentations.length > 0) {
            payload.segmentations.created.push(segmentations[0])
          } else if (category === 'keypoints' && ann.type === 'point') {
            // For keypoints, we need to convert point to keypoint format
            // This depends on the backend keypoint schema
            payload.keypoints.created.push({
              label_id: ann.labelId,
              x: ann.x / change.imageWidth,
              y: ann.y / change.imageHeight,
            })
          }
        } else if (change.operation === 'update') {
          if (change.backendId) {
            const { detections, segmentations } = separateAnnotationsByType(
              [ann],
              change.imageWidth,
              change.imageHeight
            )
            if (category === 'detections' && detections.length > 0) {
              payload.detections.updated.push({ id: change.backendId, ...detections[0] })
            } else if (category === 'segmentations' && segmentations.length > 0) {
              payload.segmentations.updated.push({ id: change.backendId, ...segmentations[0] })
            } else if (category === 'keypoints' && ann.type === 'point') {
              payload.keypoints.updated.push({
                id: change.backendId,
                label_id: ann.labelId,
                x: ann.x / change.imageWidth,
                y: ann.y / change.imageHeight,
              })
            }
          }
        } else if (change.operation === 'delete') {
          if (change.backendId) {
            if (category === 'detections') {
              payload.detections.deleted.push(change.backendId)
            } else if (category === 'segmentations') {
              payload.segmentations.deleted.push(change.backendId)
            } else if (category === 'keypoints') {
              payload.keypoints.deleted.push(change.backendId)
            }
          }
        }
      }

      // Clean up empty categories to reduce payload size (optional)
      for (const imgId in imagesPayload) {
          const imgData = imagesPayload[imgId]
          if (!imgData.tags.created.length && !imgData.tags.updated.length && !imgData.tags.deleted.length) delete imgData.tags
          if (!imgData.detections.created.length && !imgData.detections.updated.length && !imgData.detections.deleted.length) delete imgData.detections
          if (!imgData.segmentations.created.length && !imgData.segmentations.updated.length && !imgData.segmentations.deleted.length) delete imgData.segmentations
          if (!imgData.keypoints.created.length && !imgData.keypoints.updated.length && !imgData.keypoints.deleted.length) delete imgData.keypoints
          
          // If image has no changes at all (shouldn't happen with current logic), delete it
          const hasKeys = Object.keys(imgData).length > 0
          if (!hasKeys) delete imagesPayload[imgId]
      }

      // Call Bulk Sync API
      if (Object.keys(imagesPayload).length > 0) {
        console.log('[syncToBackend] Payload being sent:', JSON.stringify(imagesPayload, null, 2))
        syncedImageIds.push(...Object.keys(imagesPayload))
        const syncResponse = await jobsApi.syncAnnotations(jobId, { images: imagesPayload })
        console.log('[syncToBackend] Backend response:', syncResponse)
        console.log('[syncToBackend] Sync completed successfully for images:', syncedImageIds)

        // Warn if backend didn't process any operations (indicates image ID mismatch)
        if (syncResponse.total_operations === 0) {
          console.warn('[syncToBackend] WARNING: Backend processed 0 operations! Image IDs may be incorrect.')
        }
      }

      // Clear errors for successfully synced images
      for (const imageId of syncedImageIds) {
        imageErrorsRef.current.delete(imageId)
      }

      // Clear synced changes
      const operationCount = pendingChangesRef.current.size
      pendingChangesRef.current.clear()
      updateDirtyImages()

      const now = new Date()
      setLastSyncTime(now)
      setSyncStatus('success')

      // Add to sync history (keep last 20 entries)
      setSyncHistory((prev) => {
        const newEntry: SyncHistoryEntry = {
          timestamp: now,
          imageIds: syncedImageIds,
          operations: operationCount,
          success: true,
        }
        const updated = [newEntry, ...prev]
        return updated.slice(0, 20) // Keep only last 20
      })

      // Call success callback (e.g., to reload annotations and update syncedAnnotations map)
      if (config.onSyncSuccess) {
        console.log('[syncToBackend] Calling onSyncSuccess callback')
        await config.onSyncSuccess()
        console.log('[syncToBackend] onSyncSuccess callback completed')
      }

      // Reset to idle after a short delay
      setTimeout(() => {
        setSyncStatus('idle')
      }, 1000)
    } catch (err) {
      console.error('Auto-save failed:', err)
      const errorMessage = err instanceof Error ? err.message : 'Unknown error'

      // Mark all pending images as having errors
      for (const change of pendingChangesRef.current.values()) {
        imageErrorsRef.current.set(change.annotation.imageId, errorMessage)
      }
      updateDirtyImages()

      setSyncStatus('error')
      toast.error('Failed to save annotations')

      // Add failed sync to history
      setSyncHistory((prev) => {
        const affectedImageIds = Array.from(
          new Set(
            Array.from(pendingChangesRef.current.values()).map(
              (c) => c.annotation.imageId
            )
          )
        )
        const newEntry: SyncHistoryEntry = {
          timestamp: new Date(),
          imageIds: affectedImageIds,
          operations: pendingChangesRef.current.size,
          success: false,
          error: errorMessage,
        }
        const updated = [newEntry, ...prev]
        return updated.slice(0, 20)
      })

      // Reset to idle after a longer delay for errors
      setTimeout(() => {
        setSyncStatus('idle')
      }, 3000)
    }
  }, [jobId, isOnline])

  /**
   * Manual sync trigger
   */
  const syncNow = useCallback(async () => {
    await syncToBackend()
  }, [syncToBackend])

  /**
   * Set up auto-save interval
   */
  useEffect(() => {
    // Clear existing interval
    if (syncIntervalRef.current) {
      clearInterval(syncIntervalRef.current)
      syncIntervalRef.current = null
    }

    // Don't set up interval if disabled or no job
    if (!config.enabled || !jobId) return

    // Set up new interval
    syncIntervalRef.current = setInterval(() => {
      if (pendingChangesRef.current.size > 0 && isOnline) {
        syncToBackend()
      }
    }, config.intervalMs)

    return () => {
      if (syncIntervalRef.current) {
        clearInterval(syncIntervalRef.current)
        syncIntervalRef.current = null
      }
    }
  }, [config.enabled, config.intervalMs, jobId, isOnline, syncToBackend])

  /**
   * Sync when coming back online
   */
  useEffect(() => {
    if (isOnline && pendingChangesRef.current.size > 0) {
      syncToBackend()
    }
  }, [isOnline, syncToBackend])

  return {
    syncStatus,
    lastSyncTime,
    pendingCount,
    isOnline,
    dirtyImageInfo,
    syncHistory,
    markCreate,
    markUpdate,
    markDelete,
    syncNow,
    clearPending,
    dirtyImageIds, // Legacy compatibility
  }
}
