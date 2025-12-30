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
import type { Annotation, ImageData, Label, LoadingProgress } from '../types/annotations'
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

  // BYOM - allowed models for project
  // undefined = solo mode (all models), null = job mode not configured, string[] = specific models
  allowedModelIds: string[] | null | undefined

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

  // Lazy loading state
  loadingProgress: LoadingProgress
  annotationsLoadedFor: Set<string> // Image IDs with annotations loaded
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
function apiImageToImageData(apiImage: ImageResponse, _jobId: string): ImageData {
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

  // Lazy loading state
  const [annotationsLoadedFor, setAnnotationsLoadedFor] = useState<Set<string>>(new Set())
  const [loadingProgress, setLoadingProgress] = useState<LoadingProgress>({
    phase: 'initial',
    current: 0,
    total: 0,
    percentage: 0,
    currentStep: ''
  })

  // Use ref for synchronous access to avoid stale closure issues
  const syncedAnnotationsRef = useRef(syncedAnnotations)
  useEffect(() => {
    syncedAnnotationsRef.current = syncedAnnotations
  }, [syncedAnnotations])

  // Ref for annotationsLoadedFor to avoid dependency cycle
  const annotationsLoadedForRef = useRef(annotationsLoadedFor)
  useEffect(() => {
    annotationsLoadedForRef.current = annotationsLoadedFor
  }, [annotationsLoadedFor])

  /**
   * Helper to get image ID mapping (job image ID -> shared/primary ID)
   */
  const getImageIdMapping = useCallback((): Map<string, string> => {
    const mapping = new Map<string, string>()
    for (const img of jobContext.images) {
      const primaryId = img.shared_image_id || img.id
      mapping.set(img.id, primaryId)
    }
    return mapping
  }, [jobContext.images])

  /**
   * Load annotations for a specific image (priority load)
   * @param imageId - Job image ID to load annotations for
   */
  const loadAnnotationsForImage = useCallback(async (imageId: string) => {
    if (annotationsLoadedForRef.current.has(imageId)) {
      console.log('[loadAnnotationsForImage] Already loaded:', imageId)
      return
    }

    try {
      const img = jobContext.images.find(i => i.id === imageId)
      if (!img) {
        console.warn('[loadAnnotationsForImage] Image not found:', imageId)
        return
      }

      const response = await annotationsApi.getForImage(imageId)

      console.log('[loadAnnotationsForImage] Image', img.id, 'detections:', response.detections.length, 'segmentations:', response.segmentations.length)

      // Prepare raw annotations
      type RawAnnotation = {
        type: 'detection' | 'segmentation'
        data: any
        imageWidth: number
        imageHeight: number
      }
      const rawAnnotations: RawAnnotation[] = []

      for (const det of response.detections) {
        rawAnnotations.push({ type: 'detection', data: det, imageWidth: img.width, imageHeight: img.height })
      }
      for (const seg of response.segmentations) {
        rawAnnotations.push({ type: 'segmentation', data: seg, imageWidth: img.width, imageHeight: img.height })
      }

      // Convert to frontend format
      const converted: Annotation[] = []
      const newSyncMap = new Map<string, string>()

      for (const rawAnn of rawAnnotations) {
        if (rawAnn.type === 'detection') {
          const annots = convertBackendAnnotations([rawAnn.data], [], rawAnn.imageWidth, rawAnn.imageHeight)
          converted.push(...annots)
        } else {
          const annots = convertBackendAnnotations([], [rawAnn.data], rawAnn.imageWidth, rawAnn.imageHeight)
          converted.push(...annots)
        }

        // Track synced annotations
        const frontendId = rawAnn.data.attributes?.frontendId
        if (frontendId) {
          newSyncMap.set(frontendId, rawAnn.data.id)
        }
      }

      // Remap imageIds to shared image ID
      const imageIdMapping = getImageIdMapping()
      const remapped = converted.map(ann => {
        const mappedImageId = imageIdMapping.get(ann.imageId)
        if (mappedImageId && mappedImageId !== ann.imageId) {
          return { ...ann, imageId: mappedImageId }
        }
        return ann
      })

      // Update state atomically
      setJobAnnotations(prev => {
        // Remove any existing annotations for this image to prevent duplicates
        const filtered = prev.filter(a => a.imageId !== (img.shared_image_id || img.id))
        return [...filtered, ...remapped]
      })

      setSyncedAnnotations(prev => {
        const updated = new Map(prev)
        newSyncMap.forEach((backendId, frontendId) => {
          updated.set(frontendId, backendId)
        })
        return updated
      })

      setAnnotationsLoadedFor(prev => new Set([...prev, imageId]))

      console.log('[loadAnnotationsForImage] Loaded', remapped.length, 'annotations for image', imageId)
    } catch (err) {
      console.error(`[loadAnnotationsForImage] Failed to load annotations for image ${imageId}:`, err)
    }
  }, [jobContext.images, getImageIdMapping])

  /**
   * Background load remaining annotations in chunks
   * Throttled to avoid overwhelming the API
   */
  const loadRemainingAnnotations = useCallback(async (
    targetImageId: string,
    onProgress?: (current: number, total: number) => void
  ) => {
    const allImageIds = jobContext.images.map(img => img.id)
    const remainingIds = allImageIds.filter(id =>
      id !== targetImageId && !annotationsLoadedForRef.current.has(id)
    )

    console.log('[loadRemainingAnnotations] Loading', remainingIds.length, 'remaining images')

    // Load in chunks of 5 with 200ms delay between chunks
    const CHUNK_SIZE = 5
    const CHUNK_DELAY_MS = 200

    for (let i = 0; i < remainingIds.length; i += CHUNK_SIZE) {
      const chunk = remainingIds.slice(i, i + CHUNK_SIZE)

      // Load chunk in parallel
      await Promise.all(chunk.map(id => loadAnnotationsForImage(id)))

      // Report progress
      if (onProgress) {
        onProgress(i + chunk.length, remainingIds.length)
      }

      // Throttle to avoid API overload
      if (i + CHUNK_SIZE < remainingIds.length) {
        await new Promise(resolve => setTimeout(resolve, CHUNK_DELAY_MS))
      }
    }

    console.log('[loadRemainingAnnotations] Complete')
  }, [jobContext.images, loadAnnotationsForImage])

  /**
   * Legacy function for backward compatibility with auto-save reload
   * Loads all annotations (used by onSyncSuccess callback)
   */
  const loadJobAnnotations = useCallback(async () => {
    if (!jobContext.images.length) return

    console.log('[loadJobAnnotations] (Legacy) Loading all annotations for', jobContext.images.length, 'images')

    // Load all images sequentially
    for (const img of jobContext.images) {
      await loadAnnotationsForImage(img.id)
    }
  }, [jobContext.images, loadAnnotationsForImage])

  // Auto-save hook with callback to reload annotations after sync
  const autoSaveConfigWithCallback = useMemo(() => ({
    ...autoSaveConfig,
    onSyncSuccess: async () => {
      // Reload annotations to update syncedAnnotations map with backend IDs
      await loadJobAnnotations()
    }
  }), [autoSaveConfig, loadJobAnnotations])

  const autoSave = useAutoSave(jobId, autoSaveConfigWithCallback)

  // Track initialization to prevent duplicate runs
  const initializationRef = useRef<{ jobId: string | null; imagesCount: number }>({ jobId: null, imagesCount: 0 })

  /**
   * Initialize job mode when job context is ready (with lazy loading)
   */
  useEffect(() => {
    if (!jobId || jobContext.loading) return

    // Prevent duplicate initialization for the same job with same images
    if (initializationRef.current.jobId === jobId &&
        initializationRef.current.imagesCount === jobContext.images.length &&
        jobContext.images.length > 0) {
      return
    }

    const initJobMode = async () => {
      initializationRef.current = { jobId, imagesCount: jobContext.images.length }
      setJobLoading(true)
      setLoadingProgress({
        phase: 'loading-critical',
        current: 0,
        total: jobContext.images.length,
        percentage: 0,
        currentStep: 'Initializing job...'
      })

      try {
        // Step 1: Convert images
        setLoadingProgress(prev => ({ ...prev, currentStep: 'Loading images...', percentage: 5 }))
        const imageData = jobContext.images.map(img => apiImageToImageData(img, jobId))
        setJobImages(imageData)

        // Step 2: Find targeted image from URL parameter
        const urlParams = new URLSearchParams(window.location.search)
        const targetImageIdParam = urlParams.get('imageId')

        const targetImage = targetImageIdParam
          ? imageData.find(img => img.id === targetImageIdParam || img.jobImageId === targetImageIdParam)
          : imageData[0]

        if (targetImage) {
          setCurrentImageId(targetImage.id)

          // Step 3: Load ONLY targeted image annotations (blocking)
          setLoadingProgress(prev => ({
            ...prev,
            currentStep: 'Loading annotations for current image...',
            current: 1,
            percentage: 10
          }))

          // Use job image ID for API call
          const jobImageId = targetImage.jobImageId || targetImage.id
          await loadAnnotationsForImage(jobImageId)

          // Step 4: Mark as ready - hide loading screen
          setLoadingProgress({
            phase: 'ready',
            current: 1,
            total: imageData.length,
            percentage: Math.round((1 / imageData.length) * 100),
            currentStep: 'Ready'
          })

          setJobLoading(false)

          // Step 5: Background load remaining annotations (non-blocking)
          setTimeout(() => {
            loadRemainingAnnotations(jobImageId, (current, total) => {
              setLoadingProgress({
                phase: 'background-loading',
                current: current + 1, // +1 for targeted image already loaded
                total: imageData.length,
                percentage: Math.round(((current + 1) / imageData.length) * 100),
                currentStep: `Loading annotations (${current + 1}/${imageData.length})...`
              })
            }).then(() => {
              setLoadingProgress({
                phase: 'complete',
                current: imageData.length,
                total: imageData.length,
                percentage: 100,
                currentStep: 'Complete'
              })
            }).catch(err => {
              console.error('[initJobMode] Background loading error:', err)
            })
          }, 100) // Small delay to ensure UI is ready
        } else {
          // No images, just mark as ready
          setJobLoading(false)
          setLoadingProgress({
            phase: 'ready',
            current: 0,
            total: 0,
            percentage: 100,
            currentStep: 'No images'
          })
        }
      } catch (err) {
        console.error('[initJobMode] Error:', err)
        setJobLoading(false)
        setLoadingProgress({
          phase: 'ready',
          current: 0,
          total: 0,
          percentage: 0,
          currentStep: 'Error loading'
        })
      }
    }

    initJobMode()
  }, [jobId, jobContext.loading, jobContext.images, loadAnnotationsForImage, loadRemainingAnnotations])

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
      allowedModelIds: undefined, // undefined = solo mode, show all models
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
      // Lazy loading state (not used in solo mode)
      loadingProgress: {
        phase: 'complete' as const,
        current: 0,
        total: 0,
        percentage: 100,
        currentStep: ''
      },
      annotationsLoadedFor: new Set<string>(),
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
    // null = not configured (show message), string[] = specific models allowed
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

    // Lazy loading state
    loadingProgress,
    annotationsLoadedFor,

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
