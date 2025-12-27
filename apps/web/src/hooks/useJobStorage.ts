/**
 * Job Storage Hook
 * Wraps useStorage with job-aware functionality for team mode
 * Loads images from API and syncs annotations to backend
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
    convertBackendAnnotations,
} from '../lib/annotation-converter'
import { annotationsApi, imagesApi, type Label as BackendLabel, type ImageResponse } from '../lib/api-client'
import { annotationStorage } from '../lib/storage'
import type { Annotation, ImageData, Label } from '../types/annotations'
import { useAutoSave, type AutoSaveConfig, type DirtyImageInfo, type SyncHistoryEntry } from './useAutoSave'
import { useJobContext } from './useJobContext'
import { useStorage } from './useStorage'

export interface JobStorageConfig {
  autoSaveConfig: AutoSaveConfig
}

export interface JobStorageState {
  // Core state (same as useStorage)
  images: ImageData[]
  annotations: Annotation[]
  labels: Label[]
  currentImageId: string | null
  currentImage: ImageData | undefined
  currentAnnotations: Annotation[]
  loading: boolean

  // Job-specific state
  isJobMode: boolean
  jobId: string | null
  jobStatus: string | null

  // BYOM - allowed models for project (null = all models)
  allowedModelIds: string[] | null

  // Auto-save state
  autoSaveConfig: AutoSaveConfig
  setAutoSaveConfig: (config: AutoSaveConfig) => void
  syncStatus: 'idle' | 'syncing' | 'success' | 'error'
  lastSyncTime: Date | null
  pendingCount: number
  isOnline: boolean
  syncNow: () => Promise<void>
  dirtyImageIds: Set<string> // Legacy
  dirtyImageInfo: Map<string, DirtyImageInfo> // Enhanced
  syncHistory: SyncHistoryEntry[] // Sync history
}

export interface JobStorageActions {
  setCurrentImageId: (id: string | null) => void
  addImage: (imageData: ImageData) => Promise<void>
  removeImage: (id: string) => Promise<void>
  addAnnotation: (annotation: Annotation) => Promise<void>
  addManyAnnotations: (annotations: Annotation[]) => Promise<void>
  updateAnnotation: (annotation: Annotation) => Promise<void>
  updateManyAnnotations: (annotations: Annotation[]) => Promise<void>
  removeAnnotation: (id: string) => Promise<void>
  removeManyAnnotations: (ids: string[]) => Promise<void>
  bulkToggleAnnotationVisibility: (ids: string[]) => Promise<void>
  addLabel: (label: Label) => Promise<void>
  updateLabel: (label: Label) => Promise<void>
  removeLabel: (id: string) => Promise<void>
  reload: () => Promise<void>
  resetAll: (options?: {
    clearAnnotations?: boolean
    clearLabels?: boolean
    clearImages?: boolean
    clearToolConfig?: boolean
  }) => Promise<void>
}

const DEFAULT_AUTO_SAVE_CONFIG: AutoSaveConfig = {
  enabled: true,
  intervalMs: 5000,
}

/**
 * Convert backend Label to frontend Label format
 */
function backendLabelToLabel(backendLabel: BackendLabel): Label {
  return {
    id: backendLabel.id, // UUID from backend
    name: backendLabel.name,
    color: backendLabel.color,
    createdAt: new Date(backendLabel.created_at || Date.now()).getTime(),
  }
}

/**
 * Convert API ImageResponse to frontend ImageData format
 * Uses shared_image_id as the primary ID to match with SharedImage from explore tab
 */
function apiImageToImageData(apiImage: ImageResponse, jobId: string): ImageData {
  // Use shared_image_id as the primary ID if available, fallback to job image id
  const primaryId = apiImage.shared_image_id || apiImage.id
  return {
    id: primaryId,
    name: apiImage.filename,
    displayName: apiImage.filename,
    width: apiImage.width,
    height: apiImage.height,
    // For job images, we don't have a blob - we use the API URL
    blob: new Blob(), // Empty blob placeholder
    createdAt: new Date(apiImage.created_at).getTime(),
    // Extended properties for job mode
    relativePath: undefined,
    s3Key: apiImage.s3_key,  // Store S3 key for URL construction
    jobImageId: apiImage.id,  // Backend job image ID for sync
    jobId: apiImage.job_id,  // Job ID for URL construction
  }
}

/**
 * Hook that provides storage functionality with job mode support
 * When jobId is provided, loads images from API and syncs to backend
 * When no jobId, falls back to IndexedDB-only mode (useStorage)
 *
 * @param jobId - Job ID from URL query params (null for solo mode)
 * @returns Combined state and actions for storage operations
 */
export function useJobStorage(jobId: string | null): JobStorageState & JobStorageActions {
  // Get local storage for fallback and IndexedDB operations
  const localStorage = useStorage()

  // Get job context (will be null/empty if no jobId)
  const jobContext = useJobContext(jobId)

  // Auto-save configuration
  const [autoSaveConfig, setAutoSaveConfig] = useState<AutoSaveConfig>(() => {
    // Try to load saved config from localStorage
    const saved = window.localStorage.getItem('autoSaveConfig')
    if (saved) {
      try {
        return JSON.parse(saved)
      } catch {
        return DEFAULT_AUTO_SAVE_CONFIG
      }
    }
    return DEFAULT_AUTO_SAVE_CONFIG
  })

  // Persist auto-save config
  useEffect(() => {
    window.localStorage.setItem('autoSaveConfig', JSON.stringify(autoSaveConfig))
  }, [autoSaveConfig])

  // Job mode state
  const [jobImages, setJobImages] = useState<ImageData[]>([])
  const [jobAnnotations, setJobAnnotations] = useState<Annotation[]>([])
  const [currentImageId, setCurrentImageId] = useState<string | null>(null)
  const [jobLoading, setJobLoading] = useState(false)

  // Track which annotations have been synced (frontendId -> backendId)
  const [syncedAnnotations, setSyncedAnnotations] = useState<Map<string, string>>(new Map())

  // Use ref for synchronous access to avoid stale closure issues
  const syncedAnnotationsRef = useRef(syncedAnnotations)
  useEffect(() => {
    syncedAnnotationsRef.current = syncedAnnotations
  }, [syncedAnnotations])

  /**
   * Load annotations for all job images from backend
   */
  const loadJobAnnotations = useCallback(async () => {
    if (!jobContext.images.length) return

    console.log('[loadJobAnnotations] Starting load for', jobContext.images.length, 'images')
    const newSyncedMap = new Map<string, string>()

    // Create mapping from job image ID to shared image ID (or fallback to job image ID)
    const imageIdMapping = new Map<string, string>()
    for (const img of jobContext.images) {
      const primaryId = img.shared_image_id || img.id
      imageIdMapping.set(img.id, primaryId)
    }

    // Collect all raw responses first, then deduplicate
    type RawAnnotation = {
      type: 'detection' | 'segmentation'
      data: any
      imageWidth: number
      imageHeight: number
    }
    const allRawAnnotations: RawAnnotation[] = []

    for (const img of jobContext.images) {
      try {
        const response = await annotationsApi.getForImage(img.id)

        // Log fetched annotations
        console.log('[loadJobAnnotations] Image', img.id, 'detections:', response.detections.map(d => ({
          backendId: d.id,
          frontendId: d.attributes?.frontendId,
          updatedAt: d.updated_at
        })))
        console.log('[loadJobAnnotations] Image', img.id, 'segmentations:', response.segmentations.map(s => ({
          backendId: s.id,
          frontendId: s.attributes?.frontendId,
          updatedAt: s.updated_at
        })))

        // Add all to raw collection
        for (const det of response.detections) {
          allRawAnnotations.push({ type: 'detection', data: det, imageWidth: img.width, imageHeight: img.height })
        }
        for (const seg of response.segmentations) {
          allRawAnnotations.push({ type: 'segmentation', data: seg, imageWidth: img.width, imageHeight: img.height })
        }
      } catch (err) {
        console.error(`Failed to load annotations for image ${img.id}:`, err)
      }
    }

    // Deduplicate: keep the latest annotation for each frontendId
    const dedupedByFrontendId = new Map<string, RawAnnotation>()
    const annotationsWithoutFrontendId: RawAnnotation[] = []

    for (const rawAnn of allRawAnnotations) {
      const frontendId = rawAnn.data.attributes?.frontendId as string | undefined

      if (!frontendId) {
        // No frontendId, keep it (assign a generated key to prevent duplicates)
        annotationsWithoutFrontendId.push(rawAnn)
        continue
      }

      const existing = dedupedByFrontendId.get(frontendId)
      if (existing) {
        // Duplicate found - compare updated_at and keep the latest
        const existingTime = new Date(existing.data.updated_at).getTime()
        const newTime = new Date(rawAnn.data.updated_at).getTime()

        if (newTime > existingTime) {
          console.warn('[loadJobAnnotations] DUPLICATE - keeping newer:', {
            frontendId,
            droppingBackendId: existing.data.id,
            keepingBackendId: rawAnn.data.id,
            existingUpdatedAt: existing.data.updated_at,
            newUpdatedAt: rawAnn.data.updated_at
          })
          dedupedByFrontendId.set(frontendId, rawAnn)
        } else {
          console.warn('[loadJobAnnotations] DUPLICATE - dropping older:', {
            frontendId,
            keepingBackendId: existing.data.id,
            droppingBackendId: rawAnn.data.id,
            existingUpdatedAt: existing.data.updated_at,
            newUpdatedAt: rawAnn.data.updated_at
          })
          // Keep existing (newer or same), skip this one
        }
      } else {
        dedupedByFrontendId.set(frontendId, rawAnn)
      }
    }

    // Convert deduped annotations to frontend format
    const allAnnotations: Annotation[] = []

    // Process annotations with frontendId
    for (const [frontendId, rawAnn] of dedupedByFrontendId) {
      if (rawAnn.type === 'detection') {
        const converted = convertBackendAnnotations([rawAnn.data], [], rawAnn.imageWidth, rawAnn.imageHeight)
        allAnnotations.push(...converted)
        newSyncedMap.set(frontendId, rawAnn.data.id)
      } else {
        const converted = convertBackendAnnotations([], [rawAnn.data], rawAnn.imageWidth, rawAnn.imageHeight)
        allAnnotations.push(...converted)
        newSyncedMap.set(frontendId, rawAnn.data.id)
      }
    }

    // Process annotations without frontendId
    for (const rawAnn of annotationsWithoutFrontendId) {
      if (rawAnn.type === 'detection') {
        const converted = convertBackendAnnotations([rawAnn.data], [], rawAnn.imageWidth, rawAnn.imageHeight)
        allAnnotations.push(...converted)
      } else {
        const converted = convertBackendAnnotations([], [rawAnn.data], rawAnn.imageWidth, rawAnn.imageHeight)
        allAnnotations.push(...converted)
      }
    }

    // Remap annotation imageIds from job image ID to shared image ID
    const remappedAnnotations = allAnnotations.map(ann => {
      const mappedImageId = imageIdMapping.get(ann.imageId)
      if (mappedImageId && mappedImageId !== ann.imageId) {
        return { ...ann, imageId: mappedImageId }
      }
      return ann
    })

    console.log('[loadJobAnnotations] syncedAnnotations Map:', Array.from(newSyncedMap.entries()))
    console.log('[loadJobAnnotations] Final annotations (after dedup and remap):', remappedAnnotations.map(a => ({
      id: a.id,
      backendId: a.backendId,
      type: a.type,
      imageId: a.imageId
    })))
    console.log('[loadJobAnnotations] Dropped', allRawAnnotations.length - remappedAnnotations.length, 'duplicates')

    // Single state update for both
    setSyncedAnnotations(newSyncedMap)
    setJobAnnotations(remappedAnnotations)
  }, [jobContext.images])

  // Auto-save hook with callback to reload annotations after sync
  const autoSaveConfigWithCallback = useMemo(() => ({
    ...autoSaveConfig,
    onSyncSuccess: async () => {
      // Reload annotations to update syncedAnnotations map with backend IDs
      await loadJobAnnotations()
    }
  }), [autoSaveConfig, loadJobAnnotations])

  const autoSave = useAutoSave(jobId, autoSaveConfigWithCallback)

  /**
   * Initialize job mode when job context is ready
   */
  useEffect(() => {
    if (!jobId || jobContext.loading) return

    const initJobMode = async () => {
      setJobLoading(true)

      try {
        // Convert API images to frontend format
        const imageData = jobContext.images.map(img => apiImageToImageData(img, jobId))
        setJobImages(imageData)

        // Set first image as current
        if (imageData.length > 0 && !currentImageId) {
          setCurrentImageId(imageData[0].id)
        }

        // Load annotations from backend
        await loadJobAnnotations()
      } finally {
        setJobLoading(false)
      }
    }

    initJobMode()
  }, [jobId, jobContext.loading, jobContext.images, loadJobAnnotations])

  // ============================================================================
  // Job Mode Operations (with auto-save integration)
  // ============================================================================

  const jobAddAnnotation = useCallback(
    async (annotation: Annotation) => {
      // Add to local state
      setJobAnnotations((prev) => [...prev, annotation])

      // Also persist to IndexedDB for offline support
      await annotationStorage.add(annotation)

      // Get current image for dimensions (lookup by shared_image_id or job image id)
      const image = jobContext.images.find((img) =>
        (img.shared_image_id || img.id) === annotation.imageId
      )
      if (image) {
        // Swap imageId back to job image ID for backend sync
        const annotationForSync = { ...annotation, imageId: image.id }
        autoSave.markCreate(annotationForSync, image.width, image.height)
      }
    },
    [jobContext.images, autoSave]
  )

  const jobAddManyAnnotations = useCallback(
    async (annotations: Annotation[]) => {
      // Add to local state
      setJobAnnotations((prev) => [...prev, ...annotations])

      // Persist to IndexedDB
      await annotationStorage.addMany(annotations)

      // Mark all for sync
      for (const annotation of annotations) {
        const image = jobContext.images.find((img) =>
          (img.shared_image_id || img.id) === annotation.imageId
        )
        if (image) {
          // Swap imageId back to job image ID for backend sync
          const annotationForSync = { ...annotation, imageId: image.id }
          autoSave.markCreate(annotationForSync, image.width, image.height)
        }
      }
    },
    [jobContext.images, autoSave]
  )

  const jobUpdateAnnotation = useCallback(
    async (annotation: Annotation) => {
      console.log('[jobUpdateAnnotation] Called with:', {
        id: annotation.id,
        backendId: annotation.backendId,
        type: annotation.type,
        imageId: annotation.imageId
      })
      console.log('[jobUpdateAnnotation] syncedAnnotationsRef.current.get(id):', syncedAnnotationsRef.current.get(annotation.id))
      console.log('[jobUpdateAnnotation] syncedAnnotationsRef.current size:', syncedAnnotationsRef.current.size)

      // Update local state
      setJobAnnotations((prev) =>
        prev.map((ann) => (ann.id === annotation.id ? annotation : ann))
      )

      // Persist to IndexedDB
      await annotationStorage.update(annotation)

      // Get current image for dimensions (lookup by shared_image_id or job image id)
      const image = jobContext.images.find((img) =>
        (img.shared_image_id || img.id) === annotation.imageId
      )
      if (!image) return

      // Mark for sync
      // Use backendId field first (after reload), fall back to syncedAnnotations Map (via ref for latest value)
      const backendId = annotation.backendId || syncedAnnotationsRef.current.get(annotation.id)
      console.log('[jobUpdateAnnotation] Resolved backendId:', backendId)
      console.log('[jobUpdateAnnotation] Operation:', backendId ? 'UPDATE' : 'CREATE (POTENTIAL BUG!)')

      // Swap imageId back to job image ID for backend sync
      const annotationForSync = { ...annotation, imageId: image.id }

      if (backendId) {
        // Already synced - mark for update
        autoSave.markUpdate(annotationForSync, backendId, image.width, image.height)
      } else {
        // Not synced yet - update the pending create operation
        // This handles drag/resize of newly created annotations
        console.warn('[jobUpdateAnnotation] WARNING: No backendId found, falling back to CREATE')
        autoSave.markCreate(annotationForSync, image.width, image.height)
      }
    },
    [jobContext.images, autoSave]
  )

  const jobUpdateManyAnnotations = useCallback(
    async (annotations: Annotation[]) => {
      if (annotations.length === 0) return

      console.log('[jobUpdateManyAnnotations] Called with', annotations.length, 'annotations')

      // Update local state
      setJobAnnotations((prev) => {
        const updateMap = new Map(annotations.map((a) => [a.id, a]))
        return prev.map((ann) => (updateMap.has(ann.id) ? updateMap.get(ann.id)! : ann))
      })

      // Persist to IndexedDB
      await annotationStorage.updateMany(annotations)

      // Mark for sync
      for (const annotation of annotations) {
        const image = jobContext.images.find((img) =>
          (img.shared_image_id || img.id) === annotation.imageId
        )
        if (!image) continue

        // Use backendId field first (after reload), fall back to syncedAnnotations Map (via ref for latest value)
        const backendId = annotation.backendId || syncedAnnotationsRef.current.get(annotation.id)
        console.log('[jobUpdateManyAnnotations] Annotation', annotation.id, '→ backendId:', backendId, ', operation:', backendId ? 'UPDATE' : 'CREATE')

        // Swap imageId back to job image ID for backend sync
        const annotationForSync = { ...annotation, imageId: image.id }

        if (backendId) {
          // Already synced - mark for update
          autoSave.markUpdate(annotationForSync, backendId, image.width, image.height)
        } else {
          // Not synced yet - update the pending create operation
          console.warn('[jobUpdateManyAnnotations] WARNING: No backendId for', annotation.id)
          autoSave.markCreate(annotationForSync, image.width, image.height)
        }
      }
    },
    [jobContext.images, autoSave]
  )

  const jobRemoveAnnotation = useCallback(
    async (id: string) => {
      const annotation = jobAnnotations.find((a) => a.id === id)
      console.log('[jobRemoveAnnotation] Called for id:', id)
      console.log('[jobRemoveAnnotation] Found annotation:', annotation ? { id: annotation.id, backendId: annotation.backendId } : 'NOT FOUND')

      // Remove from local state
      setJobAnnotations((prev) => prev.filter((ann) => ann.id !== id))

      // Remove from IndexedDB
      await annotationStorage.remove(id)

      // Mark for deletion if synced
      // Use backendId field first (after reload), fall back to syncedAnnotations Map (via ref for latest value)
      const backendId = annotation?.backendId || syncedAnnotationsRef.current.get(id)
      console.log('[jobRemoveAnnotation] Resolved backendId:', backendId)
      if (backendId && annotation) {
        // Find the job image ID for the annotation (map back from shared_image_id)
        const image = jobContext.images.find((img) =>
          (img.shared_image_id || img.id) === annotation.imageId
        )
        const jobImageId = image?.id || annotation.imageId
        console.log('[jobRemoveAnnotation] Marking for DELETE')
        autoSave.markDelete(id, backendId, jobImageId)
      } else {
        console.warn('[jobRemoveAnnotation] WARNING: No backendId, deletion will NOT be synced!')
      }
    },
    [jobAnnotations, jobContext.images, autoSave]
  )

  const jobRemoveManyAnnotations = useCallback(
    async (ids: string[]) => {
      // Get annotations before removing
      const toRemove = jobAnnotations.filter((a) => ids.includes(a.id))

      // Remove from local state
      setJobAnnotations((prev) => prev.filter((ann) => !ids.includes(ann.id)))

      // Remove from IndexedDB
      await annotationStorage.removeMany(ids)

      // Mark for deletion
      for (const annotation of toRemove) {
        // Use backendId field first (after reload), fall back to syncedAnnotations Map (via ref for latest value)
        const backendId = annotation.backendId || syncedAnnotationsRef.current.get(annotation.id)
        if (backendId) {
          // Find the job image ID for the annotation (map back from shared_image_id)
          const image = jobContext.images.find((img) =>
            (img.shared_image_id || img.id) === annotation.imageId
          )
          const jobImageId = image?.id || annotation.imageId
          autoSave.markDelete(annotation.id, backendId, jobImageId)
        }
      }
    },
    [jobAnnotations, jobContext.images, autoSave]
  )

  const jobBulkToggleVisibility = useCallback(
    async (ids: string[]) => {
      // Toggle in local state
      setJobAnnotations((prev) =>
        prev.map((ann) =>
          ids.includes(ann.id)
            ? { ...ann, isVisible: !(ann.isVisible ?? true), updatedAt: Date.now() }
            : ann
        )
      )

      // Persist to IndexedDB
      await annotationStorage.bulkToggleVisibility(ids)
    },
    []
  )

  // ============================================================================
  // Computed Values
  // ============================================================================

  const isJobMode = jobId !== null

  // Use job data if in job mode, otherwise fall back to local storage
  const images = isJobMode ? jobImages : localStorage.images
  const annotations = isJobMode ? jobAnnotations : localStorage.annotations
  
  // In job mode, use project labels from backend (with UUIDs)
  // In solo mode, use local storage labels
  const projectLabels = useMemo(() => {
    if (!isJobMode || !jobContext.job?.labels) return []
    return jobContext.job.labels.map(backendLabelToLabel)
  }, [isJobMode, jobContext.job?.labels])
  
  const labels = isJobMode ? projectLabels : localStorage.labels
  const loading = isJobMode ? jobLoading || jobContext.loading : localStorage.loading

  // Get current image and annotations
  const currentImage = useMemo(
    () => images.find((img) => img.id === currentImageId),
    [images, currentImageId]
  )

  const currentAnnotations = useMemo(
    () => annotations.filter((ann) => ann.imageId === currentImageId),
    [annotations, currentImageId]
  )

  // ============================================================================
  // Return Combined Interface
  // ============================================================================

  // For solo mode, just return useStorage directly
  if (!isJobMode) {
    return {
      ...localStorage,
      isJobMode: false,
      jobId: null,
      jobStatus: null,
      allowedModelIds: null, // No filtering in solo mode
      autoSaveConfig,
      setAutoSaveConfig,
      syncStatus: 'idle' as const,
      lastSyncTime: null,
      pendingCount: 0,
      isOnline: true,
      syncNow: async () => {},
      dirtyImageIds: new Set(),
      dirtyImageInfo: new Map(),
      syncHistory: [],
    }
  }

  // Job mode - return job-specific operations
  return {
    // State
    images,
    annotations,
    labels,
    currentImageId,
    currentImage,
    currentAnnotations,
    loading,

    // Job-specific state
    isJobMode: true,
    jobId,
    jobStatus: jobContext.job?.status ?? null,
    allowedModelIds: jobContext.job?.allowed_model_ids ?? null,

    // Auto-save state
    autoSaveConfig,
    setAutoSaveConfig,
    syncStatus: autoSave.syncStatus,
    lastSyncTime: autoSave.lastSyncTime,
    pendingCount: autoSave.pendingCount,
    isOnline: autoSave.isOnline,
    syncNow: autoSave.syncNow,
    dirtyImageIds: autoSave.dirtyImageIds, // Legacy
    dirtyImageInfo: autoSave.dirtyImageInfo, // Enhanced
    syncHistory: autoSave.syncHistory, // Sync history

    // Actions - use job-specific operations
    setCurrentImageId,
    addImage: localStorage.addImage, // Images are managed by the job
    removeImage: localStorage.removeImage,
    addAnnotation: jobAddAnnotation,
    addManyAnnotations: jobAddManyAnnotations,
    updateAnnotation: jobUpdateAnnotation,
    updateManyAnnotations: jobUpdateManyAnnotations,
    removeAnnotation: jobRemoveAnnotation,
    removeManyAnnotations: jobRemoveManyAnnotations,
    bulkToggleAnnotationVisibility: jobBulkToggleVisibility,
    addLabel: localStorage.addLabel,
    updateLabel: localStorage.updateLabel,
    removeLabel: localStorage.removeLabel,
    reload: async () => {
      await loadJobAnnotations()
    },
    resetAll: localStorage.resetAll,
  }
}

/**
 * Get the image URL for a job image
 * Uses the API to construct the URL
 */
export function getJobImageUrl(s3Key: string): string {
  return imagesApi.getImageUrl(s3Key)
}
