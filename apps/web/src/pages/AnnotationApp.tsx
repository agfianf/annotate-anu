import { ArrowLeft, Check, ChevronLeft, ChevronRight, Cloud, CloudOff, Copy, Download, Link as LinkIcon, Loader2, RotateCcw, Trash2, Upload } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import toast, { Toaster } from 'react-hot-toast'
import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import '../App.css'
import Canvas from '../components/Canvas'
import { ExportModal } from '../components/ExportModal'
import { LeftSidebar } from '../components/LeftSidebar'
import { ModelSelector } from '../components/ModelSelector'
import { AnnotationsSidebar } from '../components/sidebar'
import { AIModeIndicator } from '../components/ui/AIModeIndicator'
import { ColorPickerPopup } from '../components/ui/ColorPickerPopup'
import { LoadingScreen } from '../components/ui/LoadingScreen'
import { Modal } from '../components/ui/Modal'
import ShortcutsHelpModal from '../components/ui/ShortcutsHelpModal'
import { UnsavedChangesDialog } from '../components/ui/UnsavedChangesDialog'
import ConfirmationModal from '../components/ConfirmationModal'
import { useHistory } from '../hooks/useHistory'
import { useImagePreloader } from '../hooks/useImagePreloader'
import { useJobStorage } from '../hooks/useJobStorage'
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts'
import { useModelRegistry } from '../hooks/useModelRegistry'
import { imagesApi } from '../lib/api-client'
import { DEFAULT_LABEL_COLOR } from '../lib/colors'
import { ALLOWED_IMAGE_EXTENSIONS, getDisplayName, getRelativePath, isAllowedImageFile, isFolderUploadSupported } from '../lib/file-utils'
import { annotationStorage } from '../lib/storage'
import { generateUUID } from '../lib/utils'
import type { Annotation, ImageData, Label, PolygonAnnotation, PromptMode, RectangleAnnotation, Tool } from '../types/annotations'
import type { DirtyImageInfo } from '../hooks/useAutoSave'

const DEFAULT_APPEARANCE_SETTINGS = {
  fillOpacity: 0,        // 0-100% default 0% (no fill when unselected)
  selectedOpacity: 30,   // 0-100% default 30% (fill shown when selected)
  strokeWidth: 2,        // Stroke/border width in pixels
  showLabels: false,     // default: hide labels
  showPolygons: true,
  showRectangles: true,
  showHoverTooltips: true,
  highlightMode: false,  // dim non-annotated areas
  dimLevel: 'medium' as const,  // light, subtle, medium, strong, very-strong
  tinyThreshold: 2,      // annotations < this % of image area are flagged as tiny
}

// Thumbnail component to prevent re-creating blob URLs on every render
interface ImageThumbnailProps {
  image: ImageData
  isActive: boolean
  annotationCount: number
  onClick: () => void
  onDelete: (e: React.MouseEvent) => void
  isJobMode?: boolean
  s3Key?: string
  dirtyInfo?: DirtyImageInfo // Enhanced dirty state with count and error info
  isDirty?: boolean // Legacy compatibility
  thumbnailRef?: (el: HTMLDivElement | null) => void
}

const ImageThumbnail = ({
  image,
  isActive,
  onClick,
  onDelete,
  annotationCount,
  isJobMode = false,
  s3Key,
  dirtyInfo,
  isDirty = false,
  thumbnailRef,
}: ImageThumbnailProps) => {
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null)

  useEffect(() => {
    // For job mode, use the public job image endpoint
    if (isJobMode && s3Key && image.jobId && image.jobImageId) {
      setThumbnailUrl(imagesApi.getImageUrl(s3Key, image.jobId.toString(), image.jobImageId))
      return
    }

    // For local mode, create blob URL
    if (image.blob && image.blob.size > 0) {
      const url = URL.createObjectURL(image.blob)
      setThumbnailUrl(url)

      // Cleanup: revoke URL when component unmounts or image changes
      return () => URL.revokeObjectURL(url)
    }
  }, [image.blob, isJobMode, s3Key, image.jobId, image.jobImageId])

  // Show loading placeholder while URL is being created
  if (!thumbnailUrl) {
    return (
      <div className="h-20 w-20 bg-gray-800 animate-pulse rounded border-2 border-gray-600" />
    )
  }

  return (
    <div
      ref={thumbnailRef}
      onClick={onClick}
      title={image.displayName}
      className={`group relative flex-shrink-0 cursor-pointer rounded overflow-hidden border-3 transition-all ${
        isActive
          ? 'border-emerald-400 ring-2 ring-emerald-500/60 shadow-md shadow-emerald-500/30 scale-110'
          : 'border-gray-600 hover:border-gray-500'
      }`}
    >
      <img
        src={thumbnailUrl}
        alt={image.displayName}
        className="h-20 w-20 object-cover bg-gray-900"
      />
      {annotationCount > 0 && (
        <div className="absolute top-1 right-1 bg-emerald-600 text-white text-xs px-1.5 py-0.5 rounded">
          {annotationCount}
        </div>
      )}
      {/* Enhanced dirty indicator with count and error state */}
      {(dirtyInfo || isDirty) && (
        <>
          {dirtyInfo ? (
            // Enhanced badge system
            <>
              {dirtyInfo.hasError ? (
                // Error state: Red exclamation badge
                <div
                  className="absolute top-1 right-8 w-5 h-5 bg-red-500 rounded-full border border-gray-900 flex items-center justify-center"
                  title={`Sync error - ${dirtyInfo.count} unsaved change${dirtyInfo.count !== 1 ? 's' : ''}`}
                >
                  <span className="text-white text-xs font-bold">!</span>
                </div>
              ) : dirtyInfo.count > 5 ? (
                // 6+ changes: Badge with number
                <div
                  className="absolute top-1 right-8 bg-orange-500 text-white text-xs px-1.5 py-0.5 rounded-full border border-gray-900 font-medium"
                  title={`${dirtyInfo.count} unsaved changes`}
                >
                  {dirtyInfo.count}
                </div>
              ) : (
                // 1-5 changes: Orange dot
                <div
                  className="absolute top-1 right-8 w-2.5 h-2.5 bg-orange-500 rounded-full border border-gray-900"
                  title={`${dirtyInfo.count} unsaved change${dirtyInfo.count !== 1 ? 's' : ''}`}
                />
              )}
            </>
          ) : (
            // Legacy fallback: Simple orange dot
            <div className="absolute top-1 right-8 w-2.5 h-2.5 bg-orange-500 rounded-full border border-gray-900" title="Unsaved changes" />
          )}
        </>
      )}
      <button
        onClick={onDelete}
        className="absolute top-1 left-1 p-1 bg-red-500 hover:bg-red-600 text-white rounded opacity-0 group-hover:opacity-100 transition-opacity"
        title="Delete image"
      >
        <Trash2 className="w-3 h-3" />
      </button>
    </div>
  )
}

function AnnotationApp() {
  const navigate = useNavigate()
  const search = useSearch({ strict: false }) as { jobId?: string; imageId?: string }
  const jobId = search.jobId || null
  const imageIdParam = search.imageId || null

  const [selectedTool, setSelectedTool] = useState<Tool>('select')
  const [selectedAnnotations, setSelectedAnnotations] = useState<string[]>([])
  const [selectedLabelId, setSelectedLabelId] = useState<string | null>(null)
  const [showLabelManager, setShowLabelManager] = useState(false)
  const [showExportModal, setShowExportModal] = useState(false)
  const [showResetModal, setShowResetModal] = useState(false)
  const [showShortcutsModal, setShowShortcutsModal] = useState(false)
  const [resetOptions, setResetOptions] = useState({
    annotations: true,
    labels: false,
    toolConfig: true,
    images: false,
  })

  // BYOM model registry - initialized after storage to get allowedModelIds
  // (actual call moved after useJobStorage)
  const [isRightSidebarCollapsed, setIsRightSidebarCollapsed] = useState(false)
  const [isGalleryCollapsed, setIsGalleryCollapsed] = useState(false) // Open by default
  const [promptBboxes, setPromptBboxes] = useState<Array<{ x: number; y: number; width: number; height: number; id: string; labelId: string }>>([])
  const [isBboxPromptMode, setIsBboxPromptMode] = useState(false)
  const [isAIPanelActive, setIsAIPanelActive] = useState(false)
  const [currentTextPrompt, setCurrentTextPrompt] = useState('')
  const [promptMode, setPromptMode] = useState<PromptMode>(() => {
    const saved = localStorage.getItem('promptMode')
    return (saved as PromptMode) || 'single'
  })
  const [isAutoApplyLoading, setIsAutoApplyLoading] = useState(false)
  const [selectedColor, setSelectedColor] = useState<string>(DEFAULT_LABEL_COLOR)
  const [folderUploadSupported] = useState(isFolderUploadSupported())
  const [editingLabelId, setEditingLabelId] = useState<string | null>(null)
  const [showColorPicker, setShowColorPicker] = useState(false)
  const colorButtonRef = useRef<HTMLButtonElement>(null)
  const thumbnailRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const thumbnailsContainerRef = useRef<HTMLDivElement>(null)

  // Orphan recovery modal state
  const [showOrphanRecoveryModal, setShowOrphanRecoveryModal] = useState(false)
  const [orphanedAnnotations, setOrphanedAnnotations] = useState<Annotation[]>([])
  const [orphanRecoveryTarget, setOrphanRecoveryTarget] = useState<string | null>(null)

  // Label deletion confirmation modal state
  const [showLabelDeleteModal, setShowLabelDeleteModal] = useState(false)
  const [labelToDelete, setLabelToDelete] = useState<{ id: string; name: string; count: number } | null>(null)
  const [deleteReassignTarget, setDeleteReassignTarget] = useState<string | null>(null)

  // Unsaved changes dialog state (for navigation guard)
  const [showUnsavedChangesDialog, setShowUnsavedChangesDialog] = useState(false)
  const pendingNavigationRef = useRef<(() => void) | null>(null)

  // Keyboard delete confirmation state
  const [showKeyboardDeleteConfirm, setShowKeyboardDeleteConfirm] = useState(false)

  // Zoom and pan state
  const [zoomLevel, setZoomLevel] = useState(1)
  const [stagePosition, setStagePosition] = useState({ x: 0, y: 0 })

  // Appearance settings for annotations (persisted to localStorage)
  const [appearanceSettings, setAppearanceSettings] = useState(() => {
    const saved = localStorage.getItem('annotationAppearanceSettings')
    if (saved) {
      try {
        const parsed = JSON.parse(saved)
        return { ...DEFAULT_APPEARANCE_SETTINGS, ...parsed }
      } catch {
        // Invalid JSON, use defaults
      }
    }
    return DEFAULT_APPEARANCE_SETTINGS
  })

  // Use job-aware storage (falls back to local storage if no jobId)
  const storage = useJobStorage(jobId)
  const {
    images,
    labels,
    annotations,
    currentImage,
    currentImageId,
    currentAnnotations,
    loading,
    setCurrentImageId,
    addImage,
    removeImage,
    addAnnotation,
    addManyAnnotations,
    updateAnnotation,
    updateManyAnnotations,
    removeAnnotation,
    removeManyAnnotations,
    bulkToggleAnnotationVisibility,
    addLabel,
    updateLabel,
    removeLabel,
    resetAll,
    // Job mode specific
    isJobMode,
    autoSaveConfig,
    setAutoSaveConfig,
    syncStatus,
    pendingCount,
    isOnline,
    syncNow,
    dirtyImageIds, // Legacy
    dirtyImageInfo, // Enhanced
    // syncHistory, // Sync history
    allowedModelIds, // BYOM - project allowed models
    // Lazy loading state
    loadingProgress,
    annotationsLoadedFor,
  } = storage

  // BYOM model registry - filter by project's allowed models in job mode
  const { allModels, selectedModel, selectModel, refreshModels, isNotConfigured } = useModelRegistry(allowedModelIds)

  // Image preloader for smooth navigation
  const { preloadWindow, getCachedImage } = useImagePreloader(images, {
    windowSize: 2,
    priorityLoad: true
  })

  // History for undo/redo
  const { recordChange, undo, redo, canUndo, canRedo } = useHistory(currentImageId)

  // Track if we're in undo/redo operation to prevent re-recording
  const isUndoingRef = useRef(false)

  // Set default selected label when labels are loaded
  useEffect(() => {
    if (labels.length > 0 && !selectedLabelId) {
      setSelectedLabelId(labels[0].id)
    }
  }, [labels, selectedLabelId])

  // Track if images have been loaded and initialized
  const imagesInitializedRef = useRef(false)

  // Navigate to specific image when imageId URL parameter is present (on initial load)
  useEffect(() => {
    if (images.length > 0 && isJobMode && !loading && !imagesInitializedRef.current) {
      imagesInitializedRef.current = true
      // If imageId param exists and image is found, navigate to it
      if (imageIdParam) {
        const targetImage = images.find(img => img.id === imageIdParam)
        if (targetImage) {
          setCurrentImageId(imageIdParam)
        }
      }
    }
  }, [imageIdParam, images, isJobMode, loading, setCurrentImageId])

  // Preload images when current image changes (for smooth navigation)
  useEffect(() => {
    if (currentImageId && images.length > 0) {
      const currentIndex = images.findIndex(img => img.id === currentImageId)
      if (currentIndex !== -1) {
        // Preload window around current image (non-blocking)
        preloadWindow(currentIndex, images).catch(err => {
          console.error('[AnnotationApp] Preload failed:', err)
        })
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentImageId, images])

  // Sync URL when current image changes (for navigation)
  useEffect(() => {
    if (isJobMode && currentImageId && jobId && imagesInitializedRef.current) {
      if (search.imageId !== currentImageId) {
        navigate({
          search: (prev: any) => ({
            ...prev,
            imageId: currentImageId,
          }),
          replace: true,
        } as any)
      }
    }
  }, [isJobMode, currentImageId, jobId, search.imageId, navigate])

  // Persist prompt mode to localStorage
  useEffect(() => {
    localStorage.setItem('promptMode', promptMode)
  }, [promptMode])

  // Persist appearance settings to localStorage
  useEffect(() => {
    localStorage.setItem('annotationAppearanceSettings', JSON.stringify(appearanceSettings))
  }, [appearanceSettings])

  // Detect orphaned annotations on load
  useEffect(() => {
    if (!loading) {
      const orphans = annotations.filter(ann => !labels.some(l => l.id === ann.labelId))
      if (orphans.length > 0 && labels.length > 0 && !showOrphanRecoveryModal) {
        setOrphanedAnnotations(orphans)
        setShowOrphanRecoveryModal(true)
        setOrphanRecoveryTarget(labels[0].id) // Default to first label
      }
    }
  }, [annotations, labels, loading, showOrphanRecoveryModal])

  /**
   * Handle back navigation with unsaved changes check
   */
  const handleBackNavigation = () => {
    if (pendingCount > 0) {
      // Store the navigation action to execute after user confirms
      pendingNavigationRef.current = () => window.history.back()
      setShowUnsavedChangesDialog(true)
    } else {
      window.history.back()
    }
  }

  /**
   * Handle save and leave action from unsaved changes dialog
   */
  const handleSaveAndLeave = async () => {
    if (syncNow) {
      await syncNow()
    }
    setShowUnsavedChangesDialog(false)
    if (pendingNavigationRef.current) {
      pendingNavigationRef.current()
      pendingNavigationRef.current = null
    }
  }

  /**
   * Handle discard changes action from unsaved changes dialog
   */
  const handleDiscardAndLeave = () => {
    setShowUnsavedChangesDialog(false)
    if (pendingNavigationRef.current) {
      pendingNavigationRef.current()
      pendingNavigationRef.current = null
    }
  }

  /**
   * Handle cancel action from unsaved changes dialog
   */
  const handleCancelNavigation = () => {
    setShowUnsavedChangesDialog(false)
    pendingNavigationRef.current = null
  }

  const handleImageUpload = async (files: FileList) => {
    const filesArray = Array.from(files)
    let uploadedCount = 0
    let skippedCount = 0
    const skippedFiles: string[] = []

    // Filter files by allowed extensions
    const validFiles = filesArray.filter(file => {
      const isValid = isAllowedImageFile(file.name)
      if (!isValid) {
        skippedCount++
        skippedFiles.push(file.name)
      }
      return isValid
    })

    // Show warning if files were skipped
    if (skippedCount > 0) {
      const extensionsList = ALLOWED_IMAGE_EXTENSIONS.join(', ')
      toast.error(
        `Skipped ${skippedCount} file(s) with unsupported extensions. Supported: ${extensionsList}`,
        { duration: 5000 }
      )
      console.warn('Skipped files:', skippedFiles)
    }

    if (validFiles.length === 0) {
      toast.error('No valid image files found')
      return
    }

    // Process valid files
    for (let i = 0; i < validFiles.length; i++) {
      const file = validFiles[i]
      const relativePath = getRelativePath(file)
      const displayName = getDisplayName(file)

      // Check for duplicates - skip if already exists
      const isDuplicate = images.some(img => img.displayName === displayName)
      if (isDuplicate) {
        skippedCount++
        skippedFiles.push(displayName)
        continue
      }

      // Create image element to get dimensions
      const img = new Image()
      const objectUrl = URL.createObjectURL(file)

      await new Promise<void>((resolve) => {
        img.onload = async () => {
          const imageData: ImageData = {
            id: `${Date.now()}-${i}`,
            name: file.name,
            relativePath: relativePath !== file.name ? relativePath : undefined,
            displayName: displayName,
            width: img.width,
            height: img.height,
            blob: file,
            createdAt: Date.now(),
          }

          await addImage(imageData)
          uploadedCount++
          URL.revokeObjectURL(objectUrl)
          resolve()
        }

        img.onerror = () => {
          console.error(`Failed to load image: ${file.name}`)
          skippedCount++
          skippedFiles.push(file.name)
          URL.revokeObjectURL(objectUrl)
          resolve()
        }

        img.src = objectUrl
      })
    }

    // Show success message
    if (uploadedCount > 0) {
      const folderUploaded = validFiles.some(f => getRelativePath(f) !== f.name)
      const message = folderUploaded
        ? `Uploaded ${uploadedCount} image(s) from folder`
        : `Uploaded ${uploadedCount} image(s)`
      toast.success(message)
    }
  }

  const handleAddAnnotation = async (annotation: Omit<Annotation, 'imageId' | 'labelId' | 'createdAt' | 'updatedAt'>) => {
    console.log('[APP] handleAddAnnotation called:', {
      type: annotation.type,
      currentImageId,
      selectedLabelId,
      isBboxPromptMode,
      annotation
    })

    // If in bbox-prompt mode and it's a rectangle, add to promptBboxes instead
    if (isBboxPromptMode && annotation.type === 'rectangle') {
      console.log('[APP] Bbox prompt mode: adding rectangle to promptBboxes')
      const rect = annotation as Omit<RectangleAnnotation, 'imageId' | 'labelId' | 'createdAt' | 'updatedAt'>

      // Use the currently selected label, or the first available label
      const labelIdToUse = selectedLabelId || (labels.length > 0 ? labels[0].id : '')

      setPromptBboxes(prev => [
        ...prev,
        {
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
          id: rect.id,
          labelId: labelIdToUse,
        }
      ])
      toast('Rectangle added as prompt bbox', { icon: 'ℹ️' })
      return
    }

    if (!currentImageId) {
      console.log('[APP] Early return: no currentImageId')
      toast.error('Please load an image first')
      return
    }

    if (!selectedLabelId) {
      console.log('[APP] Early return: no selectedLabelId')
      toast.error('Please select a label before creating annotations')
      return
    }

    const now = Date.now()
    const fullAnnotation: Annotation = {
      ...annotation,
      imageId: currentImageId,
      labelId: selectedLabelId,
      createdAt: now,
      updatedAt: now,
    } as Annotation

    try {
      console.log('[APP] Adding annotation to storage:', fullAnnotation)
      console.log('[APP] Current annotations before add:', {
        count: currentAnnotations.length,
        ids: currentAnnotations.map(a => a.id)
      })
      await addAnnotation(fullAnnotation)
      console.log('[APP] Annotation successfully saved')

      // Wait a bit and check if state updated
      setTimeout(() => {
        console.log('[APP] Current annotations after add (delayed check):', {
          count: currentAnnotations.length,
          ids: currentAnnotations.map(a => a.id)
        })
      }, 100)

      toast.success('Annotation created')

      // Record history after user action (not during undo/redo)
      if (!isUndoingRef.current) {
        recordChange([...currentAnnotations, fullAnnotation])
      }
    } catch (error) {
      console.error('[APP] Failed to save annotation:', error)
      toast.error('Failed to save annotation')
    }
  }

  const handleUpdateAnnotation = async (annotation: Annotation) => {
    console.log('[APP] handleUpdateAnnotation called for:', annotation.type, 'id:', annotation.id)
    if (annotation.type === 'polygon') {
      const poly = annotation as PolygonAnnotation
      console.log('[APP] Polygon first point:', poly.points[0])
    }
    const updatedAnnotation = {
      ...annotation,
      updatedAt: Date.now(),
    }
    await updateAnnotation(updatedAnnotation)
    console.log('[APP] updateAnnotation completed')
    // Record history after user action (not during undo/redo)
    if (!isUndoingRef.current) {
      recordChange(currentAnnotations.map(a => a.id === annotation.id ? updatedAnnotation : a))
    }
  }

  const handleUpdateManyAnnotations = async (annotationsToUpdate: Annotation[]) => {
    console.log('[APP] handleUpdateManyAnnotations called for', annotationsToUpdate.length, 'annotations')
    const updatedAnnotations = annotationsToUpdate.map(ann => ({
      ...ann,
      updatedAt: Date.now(),
    }))
    await updateManyAnnotations(updatedAnnotations)
    console.log('[APP] updateManyAnnotations completed')
    // Record history after user action (not during undo/redo)
    if (!isUndoingRef.current) {
      const updateMap = new Map(updatedAnnotations.map(a => [a.id, a]))
      recordChange(currentAnnotations.map(a => updateMap.has(a.id) ? updateMap.get(a.id)! : a))
    }
  }

  const handleDeleteAnnotation = async (id: string) => {
    await removeAnnotation(id)
    // Remove from selection if it was selected
    setSelectedAnnotations(prev => prev.filter(selectedId => selectedId !== id))
    // Record history after user action (not during undo/redo)
    if (!isUndoingRef.current) {
      recordChange(currentAnnotations.filter(a => a.id !== id))
    }
  }

  const handleBulkDeleteAnnotations = async (ids: string[]) => {
    await removeManyAnnotations(ids)
    // Remove deleted annotations from selection
    setSelectedAnnotations(prev => prev.filter(selectedId => !ids.includes(selectedId)))
    // Record history after user action (not during undo/redo)
    if (!isUndoingRef.current) {
      recordChange(currentAnnotations.filter(a => !ids.includes(a.id)))
    }
  }

  // Annotation bulk operation handlers
  const handleBulkChangeLabel = async (annotationIds: string[], newLabelId: string) => {
    try {
      // Get the annotations that need to be updated
      const annotationsToUpdate = annotations
        .filter(a => annotationIds.includes(a.id))
        .map(a => ({
          ...a,
          labelId: newLabelId,
          updatedAt: Date.now(),
        }))

      // Update state directly without page reload
      await updateManyAnnotations(annotationsToUpdate)

      const label = labels.find(l => l.id === newLabelId)
      toast.success(`${annotationIds.length} annotation(s) moved to "${label?.name}"`)
    } catch (error) {
      console.error('Failed to change labels:', error)
      toast.error('Failed to change labels')
    }
  }

  // Single annotation label change handler (for inline editing in table)
  const handleLabelChange = async (annotationId: string, newLabelId: string) => {
    try {
      const annotation = annotations.find(a => a.id === annotationId)
      if (!annotation) return

      const updatedAnnotation = {
        ...annotation,
        labelId: newLabelId,
        updatedAt: Date.now(),
      }

      await updateAnnotation(updatedAnnotation)
    } catch (error) {
      console.error('Failed to change label:', error)
      toast.error('Failed to change label')
    }
  }

  const handleUpdateAnnotationAttributes = async (
    annotationId: string,
    attributes: Record<string, string | number | boolean>
  ) => {
    try {
      const annotation = annotations.find(a => a.id === annotationId)
      if (!annotation) return

      const updatedAnnotation = {
        ...annotation,
        attributes,
        updatedAt: Date.now(),
      }

      await updateAnnotation(updatedAnnotation)
      toast.success('Attributes updated')
    } catch (error) {
      console.error('Failed to update attributes:', error)
      toast.error('Failed to update attributes')
    }
  }

  const handleToggleAnnotationVisibility = async (annotationId: string) => {
    const annotation = annotations.find(a => a.id === annotationId)
    if (!annotation) return

    const updatedAnnotation = {
      ...annotation,
      isVisible: !(annotation.isVisible ?? true),
      updatedAt: Date.now(),
    }

    try {
      await updateAnnotation(updatedAnnotation)
    } catch (error) {
      console.error('Failed to toggle annotation visibility:', error)
      toast.error('Failed to toggle visibility')
    }
  }

  const handleBulkToggleVisibility = async (annotationIds: string[]) => {
    if (annotationIds.length === 0) return

    try {
      await bulkToggleAnnotationVisibility(annotationIds)
    } catch (error) {
      console.error('Failed to bulk toggle visibility:', error)
      toast.error('Failed to toggle visibility')
    }
  }

  const handleAutoAnnotateResults = async (results: {
    boxes: Array<[number, number, number, number]>
    masks: Array<{ polygons: Array<Array<[number, number]>>; area: number }>
    scores: number[]
    annotationType: 'bbox' | 'polygon'
    labelId?: string
    imageId?: string
    modelId?: string
  }) => {
    // Use passed imageId for batch processing, otherwise use currentImageId
    const targetImageId = results.imageId || currentImageId
    if (!targetImageId) return

    // Use the labelId from results if provided, otherwise use selectedLabelId
    const labelToUse = results.labelId || selectedLabelId
    if (!labelToUse) return

    const now = Date.now()
    const annotationsToAdd: Annotation[] = []

    if (results.annotationType === 'bbox') {
      // Create rectangle annotations from bounding boxes
      for (let i = 0; i < results.boxes.length; i++) {
        const [x1, y1, x2, y2] = results.boxes[i]

        // Convert from [x1, y1, x2, y2] to [x, y, width, height]
        const x = x1
        const y = y1
        const width = x2 - x1
        const height = y2 - y1

        const annotation: RectangleAnnotation = {
          id: generateUUID(),
          imageId: targetImageId,
          labelId: labelToUse,
          type: 'rectangle',
          x,
          y,
          width,
          height,
          createdAt: now,
          updatedAt: now,
          confidence: results.scores[i],
          isAutoGenerated: true,
          source: results.modelId ? `model:${results.modelId}` : 'manual',
        }

        annotationsToAdd.push(annotation)
      }
    } else {
      // Create polygon annotations from masks
      for (let i = 0; i < results.masks.length; i++) {
        const mask = results.masks[i]

        // Use the first polygon from the mask (SAM3 can return multiple polygons per mask)
        if (mask.polygons.length > 0) {
          const polygonCoords = mask.polygons[0]

          // Convert from [x, y] tuples to {x, y} objects
          const points = polygonCoords.map(([x, y]) => ({ x, y }))

          const annotation: PolygonAnnotation = {
            id: generateUUID(),
            imageId: targetImageId,
            labelId: labelToUse,
            type: 'polygon',
            points,
            createdAt: now,
            updatedAt: now,
            confidence: results.scores[i],
            isAutoGenerated: true,
            source: results.modelId ? `model:${results.modelId}` : 'manual',
          }

          annotationsToAdd.push(annotation)
        }
      }
    }

    // Batch add all annotations in a single transaction for better performance
    // This updates both IndexedDB AND React state
    if (annotationsToAdd.length > 0) {
      await addManyAnnotations(annotationsToAdd)
    }

    // Record history after AI annotations are created (no delay needed with batch operation)
    if (!isUndoingRef.current && currentImageId) {
      recordChange(annotations.filter(a => a.imageId === (results.imageId || currentImageId)))
    }
  }

  // Get current image as data URL for canvas
  const [currentImageUrl, setCurrentImageUrl] = useState<string | null>(null)

  useEffect(() => {
    if (currentImage) {
      // In job mode, use API URL for full-size image (blob is empty placeholder)
      if (isJobMode && currentImage.s3Key && currentImage.jobId && currentImage.jobImageId) {
        const apiUrl = imagesApi.getFullImageUrl(
          currentImage.s3Key,
          currentImage.jobId.toString(),
          currentImage.jobImageId
        )
        setCurrentImageUrl(apiUrl)
        // No cleanup needed for API URLs
        return
      }

      // For local mode, create blob URL from file
      if (currentImage.blob && currentImage.blob.size > 0) {
        const url = URL.createObjectURL(currentImage.blob)
        setCurrentImageUrl(url)
        return () => URL.revokeObjectURL(url)
      }

      // Fallback: no valid image source
      setCurrentImageUrl(null)
    } else {
      setCurrentImageUrl(null)
    }
    // Clear selection when image changes
    setSelectedAnnotations([])
  }, [currentImage, isJobMode])


  // Clear selection when navigating between images
  useEffect(() => {
    setSelectedAnnotations([])
  }, [currentImageId])

  // Auto-scroll to center the current image in gallery
  useEffect(() => {
    if (currentImageId && !isGalleryCollapsed) {
      // Small delay to ensure DOM has updated and refs are set
      const timer = setTimeout(() => {
        const thumbnailElement = thumbnailRefs.current.get(currentImageId)
        const container = thumbnailsContainerRef.current

        if (thumbnailElement && container) {
          // Calculate the position to center the thumbnail in the container
          const thumbnailRect = thumbnailElement.getBoundingClientRect()
          const containerRect = container.getBoundingClientRect()

          // Calculate scroll position to center the thumbnail
          const thumbnailCenter = thumbnailElement.offsetLeft + (thumbnailRect.width / 2)
          const containerCenter = containerRect.width / 2
          const scrollPosition = thumbnailCenter - containerCenter

          // Smooth scroll to the calculated position
          container.scrollTo({
            left: scrollPosition,
            behavior: 'smooth'
          })
        }
      }, 100)

      return () => clearTimeout(timer)
    }
  }, [currentImageId, isGalleryCollapsed])

  // Clear prompt bboxes when changing images to avoid confusion
  useEffect(() => {
    if (isBboxPromptMode) {
      setPromptBboxes([])
    }
  }, [currentImageId])

  // Get current image index for display
  const currentImageIndex = images.findIndex(img => img.id === currentImageId)
  const currentImageNumber = currentImageIndex >= 0 ? currentImageIndex + 1 : 0

  // Image navigation functions
  const goToNextImage = () => {
    const nextIndex = currentImageIndex + 1
    if (nextIndex < images.length) {
      setCurrentImageId(images[nextIndex].id)
    }
  }

  const goToPreviousImage = () => {
    const prevIndex = currentImageIndex - 1
    if (prevIndex >= 0) {
      setCurrentImageId(images[prevIndex].id)
    }
  }

  // Zoom controls
  const MIN_ZOOM = 0.1
  const MAX_ZOOM = 5
  const ZOOM_STEP = 0.1

  const handleZoomIn = () => {
    setZoomLevel(prev => {
      const newZoom = Math.min(MAX_ZOOM, prev + ZOOM_STEP)

      // Zoom toward center of viewport
      if (currentImage) {
        const centerX = window.innerWidth / 2
        const centerY = window.innerHeight / 2

        const mousePointTo = {
          x: (centerX - stagePosition.x) / prev,
          y: (centerY - stagePosition.y) / prev,
        }

        const newPos = {
          x: centerX - mousePointTo.x * newZoom,
          y: centerY - mousePointTo.y * newZoom,
        }

        setStagePosition(newPos)
      }

      return newZoom
    })
  }

  const handleZoomOut = () => {
    setZoomLevel(prev => {
      const newZoom = Math.max(MIN_ZOOM, prev - ZOOM_STEP)

      // Zoom toward center of viewport
      if (currentImage) {
        const centerX = window.innerWidth / 2
        const centerY = window.innerHeight / 2

        const mousePointTo = {
          x: (centerX - stagePosition.x) / prev,
          y: (centerY - stagePosition.y) / prev,
        }

        const newPos = {
          x: centerX - mousePointTo.x * newZoom,
          y: centerY - mousePointTo.y * newZoom,
        }

        setStagePosition(newPos)
      }

      return newZoom
    })
  }

  const handleAutofit = () => {
    setZoomLevel(1)
    setStagePosition({ x: 0, y: 0 })
  }

  const handleResetZoom = () => {
    setZoomLevel(1)
    setStagePosition({ x: 0, y: 0 })
  }

  // Undo/Redo handlers
  const handleUndo = async () => {
    const previousState = undo()
    if (previousState) {
      isUndoingRef.current = true

      // Restore previous state to IndexedDB
      // We need to update all annotations for the current image
      await Promise.all(previousState.map(annotation => updateAnnotation(annotation)))

      // Also remove annotations that were added after
      const currentIds = new Set(previousState.map(a => a.id))
      const annotationsToRemove = currentAnnotations.filter(a => !currentIds.has(a.id))
      if (annotationsToRemove.length > 0) {
        await removeManyAnnotations(annotationsToRemove.map(a => a.id))
      }

      // Reset flag after a short delay to allow state to settle
      setTimeout(() => {
        isUndoingRef.current = false
      }, 100)
    }
  }

  const handleRedo = async () => {
    const nextState = redo()
    if (nextState) {
      isUndoingRef.current = true

      // Restore next state to IndexedDB
      await Promise.all(nextState.map(annotation => updateAnnotation(annotation)))

      // Also remove annotations that shouldn't exist
      const nextIds = new Set(nextState.map(a => a.id))
      const annotationsToRemove = currentAnnotations.filter(a => !nextIds.has(a.id))
      if (annotationsToRemove.length > 0) {
        await removeManyAnnotations(annotationsToRemove.map(a => a.id))
      }

      // Reset flag after a short delay to allow state to settle
      setTimeout(() => {
        isUndoingRef.current = false
      }, 100)
    }
  }

  // Initialize history when image changes
  useEffect(() => {
    if (currentImageId && currentAnnotations.length > 0) {
      // Record initial state when switching to an image that has annotations
      recordChange(currentAnnotations)
    }
  }, [currentImageId]) // Only on image change, not on every annotation change

  // Copy annotation link to clipboard
  const copyAnnotationLinkToClipboard = async () => {
    if (!currentImageId) {
      toast.error('No image selected')
      return
    }

    try {
      // Build full URL with domain and quoted parameters
      const params: string[] = []

      if (jobId) {
        params.push(`jobId="${jobId}"`)
      }
      params.push(`imageId="${currentImageId}"`)

      const queryString = params.length > 0 ? '?' + params.join('&') : ''
      const fullUrl = `${window.location.origin}/annotation${queryString}`

      // Check if clipboard API is available
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(fullUrl)
        toast.success('Annotation link copied to clipboard!')
      } else {
        // Fallback for browsers without clipboard API
        const textArea = document.createElement('textarea')
        textArea.value = fullUrl
        textArea.style.position = 'fixed'
        textArea.style.left = '-999999px'
        document.body.appendChild(textArea)
        textArea.select()
        try {
          document.execCommand('copy')
          toast.success('Annotation link copied to clipboard!')
        } catch (err) {
          toast.error('Failed to copy to clipboard')
        }
        document.body.removeChild(textArea)
      }
    } catch (error) {
      toast.error('Failed to copy to clipboard')
      console.error('Clipboard error:', error)
    }
  }

  // Keyboard shortcuts
  useKeyboardShortcuts({
    onSelectTool: setSelectedTool,
    onDelete: () => {
      // Show confirmation dialog before deleting
      if (selectedAnnotations.length > 0) {
        setShowKeyboardDeleteConfirm(true)
      }
    },
    onNewAnnotation: () => {
      // If on select tool, switch to rectangle; otherwise keep current drawing tool
      if (selectedTool === 'select') {
        setSelectedTool('rectangle')
      }
      // If already on a drawing tool, it stays active (ready to draw)
    },
    onNextImage: goToNextImage,
    onPreviousImage: goToPreviousImage,
    onUndo: handleUndo,
    onRedo: handleRedo,
    onZoomIn: handleZoomIn,
    onZoomOut: handleZoomOut,
    onAutofit: handleAutofit,
    onResetZoom: handleResetZoom,
    onShowShortcuts: () => setShowShortcutsModal(prev => !prev),
    onToggleSidebar: () => setIsRightSidebarCollapsed(prev => !prev),
  })

  // Get preloaded image for current image
  const preloadedImage = currentImage
    ? getCachedImage(currentImage.id)
    : null

  // Show LoadingScreen during critical loading phase
  const showLoadingScreen = loading || loadingProgress.phase === 'loading-critical'

  return (
    <>
      <LoadingScreen
        isVisible={showLoadingScreen}
        message={loadingProgress.currentStep}
        current={loadingProgress.current}
        total={loadingProgress.total}
        percentage={loadingProgress.percentage}
        subProgress={loadingProgress.subProgress}
      />

      {!showLoadingScreen && (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {isJobMode ? (
            // Job mode: Back button - swaps logo for back arrow on hover
            <button
              onClick={handleBackNavigation}
              className="relative h-10 min-w-[180px] flex items-center group"
              title="Back to job list"
              aria-label="Back to job list"
            >
              {/* Default state: Logo + AnnotateANU */}
              <div className="absolute inset-0 flex items-center gap-2 group-hover:opacity-0 transition-opacity duration-150">
                <img
                  src="/logo.png"
                  alt="AnnotateANU"
                  className="h-10 w-10"
                />
                <span className="text-xl font-bold text-emerald-600">AnnotateANU</span>
              </div>
              {/* Hover state: Back arrow + text */}
              <div className="absolute inset-0 flex items-center gap-2 text-emerald-600 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                <ArrowLeft className="w-5 h-5" />
                <span className="text-lg font-semibold">Back</span>
              </div>
            </button>
          ) : (
            // Solo mode: Link to home page
            <Link
              to="/"
              className="flex items-center gap-2 hover:opacity-90 transition-opacity group"
              title="Return to home"
              aria-label="AnnotateANU - Return to home"
            >
              <img
                src="/logo.png"
                alt="AnnotateANU"
                className="h-10 w-10 transition-transform group-hover:scale-105"
              />
              <span className="text-xl font-bold text-emerald-600">AnnotateANU</span>
            </Link>
          )}
        </div>
        <div className="flex items-center gap-3">
          {images.length > 0 && (
            <span className="text-gray-600 text-sm">
              Image {currentImageNumber} of {images.length} • {currentAnnotations.length} annotations
            </span>
          )}

          {/* Job Mode: Sync Status and Auto-save Settings */}
          {isJobMode && (
            <div className="flex items-center gap-3 px-3 py-1.5 glass rounded-lg border border-gray-200">
              {/* Online/Offline indicator */}
              {isOnline ? (
                <Cloud className="w-4 h-4 text-emerald-600" />
              ) : (
                <CloudOff className="w-4 h-4 text-amber-600" />
              )}

              {/* Sync status */}
              <div className="flex items-center gap-1.5">
                {syncStatus === 'syncing' && (
                  <>
                    <Loader2 className="w-3.5 h-3.5 text-blue-600 animate-spin" />
                    <span className="text-xs text-blue-600">Saving...</span>
                  </>
                )}
                {syncStatus === 'success' && (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                    <span className="text-xs text-emerald-600">Saved</span>
                  </>
                )}
                {syncStatus === 'error' && (
                  <span className="text-xs text-red-600">Save failed</span>
                )}
                {syncStatus === 'idle' && pendingCount > 0 && (
                  <span className="text-xs text-gray-500">{pendingCount} pending</span>
                )}
                {syncStatus === 'idle' && pendingCount === 0 && (
                  <span className="text-xs text-gray-500">Up to date</span>
                )}
              </div>

              {/* Auto-save interval selector */}
              <select
                value={autoSaveConfig?.intervalMs ?? 5000}
                onChange={(e) => setAutoSaveConfig?.({
                  ...autoSaveConfig!,
                  intervalMs: parseInt(e.target.value),
                })}
                className="text-xs bg-white border border-gray-200 rounded px-1.5 py-0.5 text-gray-700 focus:outline-none focus:border-emerald-500"
                title="Auto-save interval"
              >
                <option value="3000">3s</option>
                <option value="5000">5s</option>
                <option value="10000">10s</option>
                <option value="30000">30s</option>
                <option value="60000">1m</option>
              </select>

              {/* Manual sync button */}
              {pendingCount > 0 && (
                <button
                  onClick={syncNow}
                  disabled={syncStatus === 'syncing'}
                  className="text-xs px-2 py-0.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-300 text-white rounded transition-colors"
                >
                  Sync Now
                </button>
              )}
            </div>
          )}

          {/* Model Selector */}
          {/* Hide Manage Models in job mode - models are managed at project level */}
          <ModelSelector
            selectedModel={selectedModel}
            allModels={allModels}
            onSelectModel={selectModel}
            onOpenSettings={isJobMode ? undefined : () => navigate({ to: '/dashboard/models' })}
            onRefresh={isNotConfigured ? undefined : refreshModels}
            isNotConfigured={isNotConfigured}
          />

          <button
            onClick={() => setShowExportModal(true)}
            disabled={annotations.length === 0}
            className="px-3 py-1.5 bg-teal-600 hover:bg-teal-700 disabled:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm rounded transition-colors flex items-center gap-1.5"
            title="Export annotations to COCO JSON or YOLO format"
          >
            <Download className="w-4 h-4" />
            Export
          </button>
          <button
            onClick={() => setShowResetModal(true)}
            className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-sm rounded transition-colors flex items-center gap-1.5"
            title="Reset all data (annotations and optionally images)"
          >
            <RotateCcw className="w-4 h-4" />
            Reset
          </button>
          {/* Hide Manage Labels in job mode - labels are managed at project level */}
          {!isJobMode && (
            <button
              onClick={() => setShowLabelManager(true)}
              className="px-3 py-1.5 bg-slate-600 hover:bg-slate-700 text-white text-sm rounded transition-colors"
              title="Create, edit, and delete labels"
            >
              Manage Labels
            </button>
          )}
        </div>
      </header>

      {/* Main Layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar */}
        <LeftSidebar
            selectedTool={selectedTool}
            onToolChange={setSelectedTool}
            labels={labels}
            selectedLabelId={selectedLabelId}
            onSelectLabel={setSelectedLabelId}
            currentImage={currentImage || null}
            images={images}
            promptMode={promptMode}
            setPromptMode={setPromptMode}
            onAnnotationsCreated={handleAutoAnnotateResults}
            onBboxPromptModeChange={setIsBboxPromptMode}
            onAIPanelActiveChange={setIsAIPanelActive}
            onTextPromptChange={setCurrentTextPrompt}
            promptBboxes={promptBboxes}
            onPromptBboxesChange={setPromptBboxes}
            currentAnnotations={currentAnnotations}
            onAutoApplyLoadingChange={setIsAutoApplyLoading}
            onZoomIn={handleZoomIn}
            onZoomOut={handleZoomOut}
            onAutofit={handleAutofit}
            onUndo={handleUndo}
            onRedo={handleRedo}
            canUndo={canUndo}
            canRedo={canRedo}
            onShowShortcuts={() => setShowShortcutsModal(true)}
            selectedModel={selectedModel}
          />

          {/* Canvas */}
          <div className="flex-1 bg-white flex flex-col border-x border-gray-200 overflow-visible">
            {/* Image Viewer Header */}
            {currentImage && (
              <div className="glass border-b border-gray-200 px-4 py-2 flex items-center justify-between overflow-visible">
                {/* Left: Image info */}
                <div className="flex items-center gap-3">
                  <span className="text-emerald-600 font-semibold">
                    {currentImageNumber} / {images.length}
                  </span>
                  <span className="text-gray-400 text-sm">|</span>
                  <div className="text-gray-600 text-xs">
                    {currentImage.width} × {currentImage.height} px
                  </div>
                </div>

                {/* Center: Navigation with filename */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={goToPreviousImage}
                    disabled={currentImageIndex === 0}
                    className="p-1.5 hover:bg-gray-100 rounded transition-colors text-gray-600 hover:text-gray-900 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                    title="Previous image (Left Arrow)"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="text-gray-900 text-sm font-mono">{currentImage.displayName}</span>
                  <button
                    onClick={copyAnnotationLinkToClipboard}
                    className="p-1 hover:bg-gray-100 rounded transition-colors text-gray-600 hover:text-gray-900"
                    title="Copy annotation link"
                  >
                    <LinkIcon className="w-4 h-4" />
                  </button>
                  <button
                    onClick={goToNextImage}
                    disabled={currentImageIndex === images.length - 1}
                    className="p-1.5 hover:bg-gray-100 rounded transition-colors text-gray-600 hover:text-gray-900 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                    title="Next image (Right Arrow)"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>

                {/* Right: AI Mode Indicator */}
                <div className="overflow-visible">
                  <AIModeIndicator
                    mode={promptMode}
                    isActive={isAIPanelActive}
                    textPrompt={currentTextPrompt}
                    isProcessing={isAutoApplyLoading}
                  />
                </div>
              </div>
            )}

            <div className="flex-1 overflow-hidden relative">
              <Canvas
                image={currentImageUrl}
                preloadedImage={preloadedImage || undefined}
                selectedTool={selectedTool}
                annotations={currentAnnotations}
                labels={labels}
                selectedLabelId={selectedLabelId}
                onAddAnnotation={handleAddAnnotation}
                onUpdateAnnotation={handleUpdateAnnotation}
                onUpdateManyAnnotations={handleUpdateManyAnnotations}
                selectedAnnotations={selectedAnnotations}
                onSelectAnnotations={setSelectedAnnotations}
                promptBboxes={promptBboxes}
                zoomLevel={zoomLevel}
                onZoomChange={setZoomLevel}
                stagePosition={stagePosition}
                onStagePositionChange={setStagePosition}
                pendingChanges={currentImageId ? (dirtyImageInfo?.get(currentImageId)?.count || 0) : 0}
                hasError={currentImageId ? (dirtyImageInfo?.get(currentImageId)?.hasError || false) : false}
                fillOpacity={appearanceSettings.fillOpacity / 100}
                selectedOpacity={appearanceSettings.selectedOpacity / 100}
                strokeWidth={appearanceSettings.strokeWidth}
                showLabels={appearanceSettings.showLabels}
                showPolygons={appearanceSettings.showPolygons}
                showRectangles={appearanceSettings.showRectangles}
                showHoverTooltips={appearanceSettings.showHoverTooltips}
                highlightMode={appearanceSettings.highlightMode}
                dimLevel={appearanceSettings.dimLevel}
                onDeleteAnnotation={handleDeleteAnnotation}
                onLabelChange={handleLabelChange}
                onUpdateAnnotationAttributes={handleUpdateAnnotationAttributes}
              />
              {/* Auto-apply loading overlay */}
              {isAutoApplyLoading && (
                <div className="absolute inset-0 bg-black/30 flex items-center justify-center pointer-events-none">
                  <div className="glass-strong px-6 py-4 rounded-lg shadow-xl flex items-center gap-3">
                    <Loader2 className="w-5 h-5 text-emerald-600 animate-spin" />
                    <span className="text-gray-900 font-medium">Auto-detecting objects...</span>
                  </div>
                </div>
              )}
            </div>

            {/* Image Gallery - Collapsible Bottom strip */}
            <div className={`glass border-t border-gray-200 transition-all duration-200 ${isGalleryCollapsed ? 'h-8' : 'h-32'}`}>
              {/* Gallery Header - Always visible */}
              <button
                onClick={() => setIsGalleryCollapsed(prev => !prev)}
                className="w-full h-8 px-4 flex items-center justify-between hover:bg-gray-100/50 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <svg
                    className={`w-4 h-4 text-gray-500 transition-transform duration-200 ${isGalleryCollapsed ? '' : 'rotate-180'}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                  </svg>
                  <span className="text-xs font-medium text-gray-600">
                    Image Gallery
                  </span>
                  <span className="text-xs text-gray-400">
                    ({images.length} images)
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {currentImage && (
                    <span className="text-xs text-emerald-600 font-medium">
                      {currentImageNumber} / {images.length}
                    </span>
                  )}
                </div>
              </button>

              {/* Gallery Content - Collapsible */}
              {!isGalleryCollapsed && (
                <div className="h-24 flex items-center px-4 gap-3">
                  {/* Previous button */}
                  <button
                    onClick={() => {
                      const prevIndex = currentImageIndex - 1
                      if (prevIndex >= 0) {
                        setCurrentImageId(images[prevIndex].id)
                      }
                    }}
                    disabled={currentImageIndex <= 0 || images.length === 0}
                    className="p-2 bg-white hover:bg-gray-100 disabled:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed text-gray-900 rounded transition-colors border border-gray-300"
                    title="Previous image (D)"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>

                  {/* Thumbnails */}
                  <div
                    ref={thumbnailsContainerRef}
                    className="flex-1 flex gap-3 overflow-x-auto py-3 px-2"
                    style={{ scrollPaddingInline: '50%' }}
                  >
                    {/* Left spacer for centering */}
                    <div className="flex-shrink-0" style={{ width: 'calc(50% - 50px)' }} />

                    {/* Upload buttons container - hidden in job mode */}
                    {!isJobMode && (
                      <div className="flex-shrink-0 flex gap-2">
                        {/* Upload Files Button */}
                        <label className="cursor-pointer group" title="Upload image files">
                          <div className="h-20 w-20 border-2 border-dashed border-gray-300 hover:border-emerald-500 rounded flex flex-col items-center justify-center gap-1 transition-colors bg-white hover:bg-emerald-50">
                            <Upload className="w-5 h-5 text-gray-400 group-hover:text-emerald-600 transition-colors" />
                            <span className="text-xs text-gray-500 group-hover:text-emerald-600 transition-colors">Files</span>
                          </div>
                          <input
                            type="file"
                            accept=".jpg,.jpeg,.png,.webp,.bmp"
                            multiple
                            className="hidden"
                            onChange={(e) => {
                              if (e.target.files) {
                                handleImageUpload(e.target.files)
                              }
                            }}
                          />
                        </label>

                        {/* Upload Folder Button */}
                        {folderUploadSupported && (
                          <label className="cursor-pointer group" title="Upload entire folder of images">
                            <div className="h-20 w-20 border-2 border-dashed border-blue-300 hover:border-blue-500 rounded flex flex-col items-center justify-center gap-1 transition-colors bg-white hover:bg-blue-50">
                              <svg
                                className="w-5 h-5 text-gray-400 group-hover:text-blue-600 transition-colors"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                              </svg>
                              <span className="text-xs text-gray-500 group-hover:text-blue-600 transition-colors">Folder</span>
                            </div>
                            <input
                              type="file"
                              accept=".jpg,.jpeg,.png,.webp,.bmp"
                              {...({ webkitdirectory: "", mozdirectory: "", directory: "" } as any)}
                              className="hidden"
                              onChange={(e) => {
                                if (e.target.files) {
                                  handleImageUpload(e.target.files)
                                }
                              }}
                            />
                          </label>
                        )}
                      </div>
                    )}

                    {images.map((image) => {
                      // Count annotations for this specific image
                      const imageAnnotationCount = annotations.filter(a => a.imageId === image.id).length

                      return (
                        <ImageThumbnail
                          key={image.id}
                          image={image}
                          isActive={currentImageId === image.id}
                          annotationCount={imageAnnotationCount}
                          onClick={() => setCurrentImageId(image.id)}
                          isJobMode={isJobMode}
                          s3Key={image.s3Key}
                          dirtyInfo={dirtyImageInfo?.get(image.id)}
                          isDirty={dirtyImageIds?.has(image.id)}
                          thumbnailRef={(el) => {
                            if (el) {
                              thumbnailRefs.current.set(image.id, el)
                            } else {
                              thumbnailRefs.current.delete(image.id)
                            }
                          }}
                          onDelete={(e) => {
                            e.stopPropagation()
                            // Don't allow deleting job images
                            if (isJobMode) {
                              toast.error('Cannot delete images in job mode')
                              return
                            }
                            if (window.confirm(`Delete "${image.name}"? This will also remove all associated annotations.`)) {
                              removeImage(image.id)
                            }
                          }}
                        />
                      )
                    })}

                    {/* Right spacer for centering */}
                    <div className="flex-shrink-0" style={{ width: 'calc(50% - 50px)' }} />
                  </div>

                  {/* Next button */}
                  <button
                    onClick={() => {
                      const nextIndex = currentImageIndex + 1
                      if (nextIndex < images.length) {
                        setCurrentImageId(images[nextIndex].id)
                      }
                    }}
                    disabled={currentImageIndex >= images.length - 1 || images.length === 0}
                    className="p-2 bg-white hover:bg-gray-100 disabled:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed text-gray-900 rounded transition-colors border border-gray-300"
                    title="Next image (F)"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Sidebar */}
          <AnnotationsSidebar
            annotations={currentAnnotations}
            labels={labels}
            selectedAnnotations={selectedAnnotations}
            selectedLabelId={selectedLabelId}
            onSelectAnnotations={setSelectedAnnotations}
            onSelectLabel={setSelectedLabelId}
            onDeleteAnnotation={handleDeleteAnnotation}
            onBulkDeleteAnnotations={handleBulkDeleteAnnotations}
            onBulkChangeLabel={handleBulkChangeLabel}
            onLabelChange={handleLabelChange}
            onToggleAnnotationVisibility={handleToggleAnnotationVisibility}
            onBulkToggleVisibility={handleBulkToggleVisibility}
            isCollapsed={isRightSidebarCollapsed}
            onToggleCollapse={() => setIsRightSidebarCollapsed(prev => !prev)}
            appearanceSettings={appearanceSettings}
            onAppearanceChange={setAppearanceSettings}
            appearanceDefaults={DEFAULT_APPEARANCE_SETTINGS}
            imageWidth={currentImage?.width}
            imageHeight={currentImage?.height}
            onUpdateAnnotationAttributes={handleUpdateAnnotationAttributes}
          />
      </div>

      {/* Label Manager Modal */}
      {showLabelManager && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
          onClick={(e) => {
            // Allow closing by clicking backdrop only if there are labels
            if (labels.length > 0 && e.target === e.currentTarget) {
              setShowLabelManager(false)
            }
          }}
        >
          <div className="glass-strong rounded-lg shadow-2xl max-w-md w-full mx-4 max-h-[80vh] overflow-hidden flex flex-col">
            <div className="px-4 py-3 border-b border-gray-200/50 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">
                Labels
                {labels.length === 0 && (
                  <span className="ml-2 text-xs text-emerald-600">(Create one)</span>
                )}
              </h2>
              {labels.length > 0 && (
                <button
                  onClick={() => setShowLabelManager(false)}
                  className="text-gray-600 hover:text-gray-900"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>

            <div className="p-4 overflow-y-auto flex-1">
              <div className="space-y-2">
                {labels.map(label => (
                  <div
                    key={label.id}
                    className="flex items-center gap-2 p-2 glass rounded border border-gray-200/30"
                  >
                    <div
                      className="w-5 h-5 rounded flex-shrink-0"
                      style={{ backgroundColor: label.color }}
                    />
                    <span className="flex-1 text-sm text-gray-900 truncate">{label.name}</span>

                    {/* Annotation count badge */}
                    <span className="text-xs text-gray-600 bg-gray-100 px-2 py-0.5 rounded">
                      {annotations.filter(a => a.labelId === label.id).length}
                    </span>

                    {/* Edit Button */}
                    <button
                      onClick={() => {
                        setEditingLabelId(label.id)
                        setSelectedColor(label.color)
                      }}
                      className="p-1 text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded transition-colors"
                      title="Edit label"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>

                    {/* Delete Button */}
                    <button
                      onClick={async () => {
                        // Check if label has annotations
                        const count = annotations.filter(a => a.labelId === label.id).length

                        if (count > 0) {
                          // Show confirmation dialog
                          setLabelToDelete({ id: label.id, name: label.name, count })

                          // Set default reassign target (first other label)
                          const otherLabel = labels.find(l => l.id !== label.id)
                          setDeleteReassignTarget(otherLabel?.id || null)

                          setShowLabelDeleteModal(true)
                        } else {
                          // Safe to delete directly
                          await removeLabel(label.id)
                          toast.success('Label deleted')
                        }
                      }}
                      disabled={labels.length === 1 && annotations.length > 0}
                      className="p-1 text-red-500 hover:text-red-600 hover:bg-red-50 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      title={
                        labels.length === 1 && annotations.length > 0
                          ? "Cannot delete last label with annotations"
                          : "Delete label"
                      }
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>

              <form
                onSubmit={async (e) => {
                  e.preventDefault()
                  const formData = new FormData(e.currentTarget)
                  const name = formData.get('name') as string

                  if (!name.trim()) {
                    toast.error('Label name is required')
                    return
                  }

                  const isEditMode = editingLabelId !== null

                  try {
                    if (isEditMode) {
                      // Update existing label
                      const existingLabel = labels.find(l => l.id === editingLabelId)
                      if (!existingLabel) return

                      const updatedLabel: Label = {
                        ...existingLabel,
                        name: name.trim(),
                        color: selectedColor,
                        // Preserve original metadata
                        id: existingLabel.id,
                        createdAt: existingLabel.createdAt,
                      }

                      await updateLabel(updatedLabel)
                      setEditingLabelId(null)
                      toast.success('Label updated')
                    } else {
                      // Create new label
                      const newLabel: Label = {
                        id: Date.now().toString(),
                        name: name.trim(),
                        color: selectedColor,
                        createdAt: Date.now(),
                      }
                      await addLabel(newLabel)
                      toast.success('Label created')
                    }

                    // Reset form
                    e.currentTarget.reset()
                    setSelectedColor(DEFAULT_LABEL_COLOR)
                    setShowColorPicker(false)
                  } catch (error) {
                    console.error('Failed to save label:', error)
                    toast.error('Failed to save label')
                  }
                }}
                className="mt-4 space-y-2"
              >
                <h3 className="text-sm font-medium text-gray-700">
                  {editingLabelId ? 'Edit Label' : 'Add New Label'}
                </h3>

                {/* Label Name + Color Picker Button */}
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    name="name"
                    placeholder="Label name"
                    defaultValue={editingLabelId ? labels.find(l => l.id === editingLabelId)?.name : ''}
                    key={editingLabelId || 'create'} // Force re-render on mode change
                    required
                    className="flex-1 px-2.5 py-1.5 text-sm bg-white/80 text-gray-900 rounded border border-gray-300 focus:border-emerald-500 focus:outline-none"
                  />

                  {/* Color Picker Button */}
                  <button
                    ref={colorButtonRef}
                    type="button"
                    onClick={() => setShowColorPicker(prev => !prev)}
                    className="w-8 h-8 rounded border-2 border-gray-300 hover:border-emerald-500 transition-colors flex-shrink-0"
                    style={{ backgroundColor: selectedColor }}
                    title="Choose color"
                    aria-label="Choose color"
                  />
                </div>

                {/* Color Picker Popup */}
                {showColorPicker && (
                  <ColorPickerPopup
                    selectedColor={selectedColor}
                    onColorChange={setSelectedColor}
                    isOpen={showColorPicker}
                    onClose={() => setShowColorPicker(false)}
                    anchorEl={colorButtonRef.current}
                  />
                )}

                {/* Action Buttons */}
                <div className="space-y-1.5">
                  <button
                    type="submit"
                    className="w-full px-3 py-1.5 text-sm bg-emerald-600 hover:bg-emerald-700 text-white rounded transition-colors"
                  >
                    {editingLabelId ? 'Update' : 'Add Label'}
                  </button>

                  {editingLabelId && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingLabelId(null)
                        setSelectedColor(DEFAULT_LABEL_COLOR)
                        setShowColorPicker(false)
                      }}
                      className="w-full px-3 py-1.5 text-sm glass hover:glass-strong text-gray-900 rounded transition-colors border border-gray-300"
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Orphan Recovery Modal */}
      <Modal
        isOpen={showOrphanRecoveryModal}
        onClose={() => {}}
        title="Orphaned Annotations Detected"
        blocking={true}
        showCloseButton={false}
        maxWidth="lg"
      >
        <div className="space-y-4">
          <div className="bg-amber-50/80 border border-amber-200 rounded-lg p-4">
            <p className="text-amber-800 font-medium">
              ⚠️ Found {orphanedAnnotations.length} annotation(s) with deleted labels
            </p>
          </div>

          <p className="text-gray-800">
            These annotations were created with labels that no longer exist.
            You can reassign them to an existing label or delete them permanently.
          </p>

          <div className="bg-white/50 rounded-lg p-4 space-y-3">
            <label className="block">
              <span className="text-sm font-medium text-gray-700 mb-2 block">
                Reassign to label:
              </span>
              <select
                value={orphanRecoveryTarget || ''}
                onChange={(e) => setOrphanRecoveryTarget(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-gray-300 rounded-md focus:border-emerald-500 focus:outline-none"
              >
                {labels.map(label => (
                  <option key={label.id} value={label.id}>
                    {label.name} ({annotations.filter(a => a.labelId === label.id).length} existing)
                  </option>
                ))}
              </select>
            </label>

            <div className="text-xs text-gray-600 bg-blue-50/50 p-2 rounded">
              💡 Tip: You can reorganize these annotations later using the label manager
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-gray-200/50">
            <button
              onClick={async () => {
                // Delete orphaned annotations
                await removeManyAnnotations(orphanedAnnotations.map(a => a.id))
                setShowOrphanRecoveryModal(false)
                toast.success(`Deleted ${orphanedAnnotations.length} orphaned annotation(s)`)
                setOrphanedAnnotations([])
              }}
              className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded transition-colors"
            >
              Delete Orphans
            </button>
            <button
              onClick={async () => {
                if (orphanRecoveryTarget) {
                  // Reassign all orphaned annotations to selected label
                  await annotationStorage.bulkChangeLabel(
                    orphanedAnnotations.map(a => a.id),
                    orphanRecoveryTarget
                  )
                  // Reload to reflect changes
                  window.location.reload()
                }
              }}
              disabled={!orphanRecoveryTarget}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white rounded transition-colors"
            >
              Reassign Annotations
            </button>
          </div>
        </div>
      </Modal>

      {/* Label Deletion Confirmation Modal */}
      <Modal
        isOpen={showLabelDeleteModal}
        onClose={() => {
          setShowLabelDeleteModal(false)
          setLabelToDelete(null)
          setDeleteReassignTarget(null)
        }}
        title="Delete Label with Annotations"
        maxWidth="lg"
      >
        <div className="space-y-4">
          <div className="bg-amber-50/80 border border-amber-200 rounded-lg p-4">
            <p className="text-amber-800 font-medium">
              ⚠️ Label "{labelToDelete?.name}" has {labelToDelete?.count} annotation(s)
            </p>
          </div>

          <p className="text-gray-800">
            Choose what to do with the annotations before deleting this label:
          </p>

          <div className="space-y-3">
            {/* Reassign Option (Recommended) */}
            {labels.filter(l => l.id !== labelToDelete?.id).length > 0 && (
              <div className="bg-emerald-50/50 border border-emerald-200 rounded-lg p-4 space-y-3">
                <div className="flex items-start gap-2">
                  <span className="text-emerald-600 font-medium text-sm">✓ Recommended</span>
                </div>
                <label className="block">
                  <span className="text-sm font-medium text-gray-700 mb-2 block">
                    Reassign annotations to:
                  </span>
                  <select
                    value={deleteReassignTarget || ''}
                    onChange={(e) => setDeleteReassignTarget(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-gray-300 rounded-md focus:border-emerald-500 focus:outline-none"
                  >
                    {labels
                      .filter(l => l.id !== labelToDelete?.id)
                      .map(label => (
                        <option key={label.id} value={label.id}>
                          {label.name}
                        </option>
                      ))}
                  </select>
                </label>
              </div>
            )}

            {/* Cascade Delete Option */}
            <div className="bg-red-50/50 border border-red-200 rounded-lg p-4">
              <p className="text-red-700 text-sm font-medium">
                ⚠️ Or delete label and all {labelToDelete?.count} annotation(s)
              </p>
              <p className="text-red-600 text-xs mt-1">
                This action cannot be undone
              </p>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-gray-200/50">
            <button
              onClick={() => {
                setShowLabelDeleteModal(false)
                setLabelToDelete(null)
                setDeleteReassignTarget(null)
              }}
              className="px-4 py-2 glass hover:glass-strong text-gray-900 rounded transition-colors border border-gray-300"
            >
              Cancel
            </button>

            {/* Cascade Delete Button */}
            <button
              onClick={async () => {
                if (!labelToDelete) return

                // Delete all annotations with this label
                const annotationsToDelete = annotations
                  .filter(a => a.labelId === labelToDelete.id)
                  .map(a => a.id)

                await removeManyAnnotations(annotationsToDelete)
                await removeLabel(labelToDelete.id)

                setShowLabelDeleteModal(false)
                toast.success(`Deleted label and ${annotationsToDelete.length} annotation(s)`)
                setLabelToDelete(null)
              }}
              className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded transition-colors"
            >
              Delete All
            </button>

            {/* Reassign Button (only show if other labels exist) */}
            {deleteReassignTarget && (
              <button
                onClick={async () => {
                  if (!labelToDelete || !deleteReassignTarget) return

                  // Reassign annotations to target label
                  const annotationsToReassign = annotations
                    .filter(a => a.labelId === labelToDelete.id)
                    .map(a => a.id)

                  await annotationStorage.bulkChangeLabel(annotationsToReassign, deleteReassignTarget)
                  await removeLabel(labelToDelete.id)

                  // Reload to reflect changes
                  window.location.reload()
                }}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded transition-colors"
              >
                Reassign & Delete
              </button>
            )}
          </div>
        </div>
      </Modal>

      {/* Blocking Popup: No Labels */}
      {!loading && images.length > 0 && labels.length === 0 && !showLabelManager && (
        <Modal
          isOpen={true}
          onClose={() => {}}
          title="No Labels Available"
          blocking={true}
          showCloseButton={false}
          maxWidth="md"
        >
          <div className="text-center space-y-4">
            <div className="text-gray-800">
              You need to create at least one label before annotating images.
            </div>
            <button
              onClick={() => setShowLabelManager(true)}
              className="px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded transition-colors"
            >
              Create Labels
            </button>
          </div>
        </Modal>
      )}

      {/* Reset Confirmation Modal */}
      <Modal
        isOpen={showResetModal}
        onClose={() => {
          setShowResetModal(false)
          setResetOptions({
            annotations: true,
            labels: false,
            toolConfig: true,
            images: false,
          })
        }}
        title={isJobMode ? "Reset Job Annotations" : "Reset Confirmation"}
        maxWidth="md"
      >
        {isJobMode ? (
          /* Simplified reset modal for job mode - only reset annotations */
          <div className="space-y-4">
            <div className="bg-red-50/80 border border-red-200 rounded-lg p-4">
              <p className="text-red-600 font-medium">⚠️ Warning: This action cannot be undone!</p>
            </div>
            <p className="text-gray-800">
              This will clear all annotations for all images in this job. Labels and images are managed at the project level and will not be affected.
            </p>

            <div className="flex justify-end gap-3 pt-4 border-t border-gray-200/50">
              <button
                onClick={() => setShowResetModal(false)}
                className="px-4 py-2 glass hover:glass-strong text-gray-900 rounded transition-colors border border-gray-300"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  await resetAll({
                    clearAnnotations: true,
                    clearLabels: false,
                    clearImages: false,
                    clearToolConfig: false,
                  })
                  setShowResetModal(false)
                  setSelectedAnnotations([])
                  setSelectedTool('select')
                }}
                className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded transition-colors"
              >
                Reset Annotations
              </button>
            </div>
          </div>
        ) : (
          /* Full reset modal for solo mode with all options */
          <div className="space-y-4">
            <div className="bg-red-50/80 border border-red-200 rounded-lg p-4">
              <p className="text-red-600 font-medium">⚠️ Warning: This action cannot be undone!</p>
            </div>
            <p className="text-gray-800">
              Select what you want to reset:
            </p>

            {/* Checklist */}
            <div className="space-y-2 bg-white/50 rounded-lg p-4">
              <label className="flex items-center gap-3 text-gray-800 cursor-pointer hover:bg-white/50 p-2 rounded transition-colors">
                <input
                  type="checkbox"
                  checked={resetOptions.annotations}
                  onChange={(e) => setResetOptions(prev => ({ ...prev, annotations: e.target.checked }))}
                  className="w-4 h-4 text-emerald-600 focus:ring-emerald-500 focus:ring-offset-white rounded"
                />
                <span>All annotations</span>
              </label>

              <label className="flex items-center gap-3 text-gray-800 cursor-pointer hover:bg-white/50 p-2 rounded transition-colors">
                <input
                  type="checkbox"
                  checked={resetOptions.labels}
                  onChange={(e) => setResetOptions(prev => ({ ...prev, labels: e.target.checked }))}
                  className="w-4 h-4 text-emerald-600 focus:ring-emerald-500 focus:ring-offset-white rounded"
                />
                <span>All labels (will reset to defaults)</span>
              </label>

              <label className="flex items-center gap-3 text-gray-800 cursor-pointer hover:bg-white/50 p-2 rounded transition-colors">
                <input
                  type="checkbox"
                  checked={resetOptions.toolConfig}
                  onChange={(e) => setResetOptions(prev => ({ ...prev, toolConfig: e.target.checked }))}
                  className="w-4 h-4 text-emerald-600 focus:ring-emerald-500 focus:ring-offset-white rounded"
                />
                <span>Tool configuration</span>
              </label>

              <label className="flex items-center gap-3 text-gray-800 cursor-pointer hover:bg-white/50 p-2 rounded transition-colors">
                <input
                  type="checkbox"
                  checked={resetOptions.images}
                  onChange={(e) => setResetOptions(prev => ({ ...prev, images: e.target.checked }))}
                  className="w-4 h-4 text-emerald-600 focus:ring-emerald-500 focus:ring-offset-white rounded"
                />
                <span className={resetOptions.images ? 'text-red-600 font-medium' : ''}>
                  Also clear loaded images
                </span>
              </label>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-gray-200/50">
              <button
                onClick={() => {
                  setShowResetModal(false)
                  setResetOptions({
                    annotations: true,
                    labels: false,
                    toolConfig: true,
                    images: false,
                  })
                }}
                className="px-4 py-2 glass hover:glass-strong text-gray-900 rounded transition-colors border border-gray-300"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  await resetAll({
                    clearAnnotations: resetOptions.annotations,
                    clearLabels: resetOptions.labels,
                    clearImages: resetOptions.images,
                    clearToolConfig: resetOptions.toolConfig,
                  })
                  setShowResetModal(false)
                  setResetOptions({
                    annotations: true,
                    labels: false,
                    toolConfig: true,
                    images: false,
                  })
                  setSelectedAnnotations([])
                  setSelectedTool('select')
                }}
                disabled={!resetOptions.annotations && !resetOptions.labels && !resetOptions.toolConfig && !resetOptions.images}
                className="px-4 py-2 bg-red-500 hover:bg-red-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-white rounded transition-colors"
              >
                Reset Selected
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Keyboard Shortcuts Help Modal */}
      <ShortcutsHelpModal
        isOpen={showShortcutsModal}
        onClose={() => setShowShortcutsModal(false)}
      />

      {/* Export Modal */}
      <ExportModal
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
        images={images}
        annotations={annotations}
        labels={labels}
      />

      {/* Unsaved Changes Dialog (Job Mode) */}
      {isJobMode && (
        <UnsavedChangesDialog
          isOpen={showUnsavedChangesDialog}
          pendingCount={pendingCount}
          isSyncing={syncStatus === 'syncing'}
          onSave={handleSaveAndLeave}
          onDiscard={handleDiscardAndLeave}
          onCancel={handleCancelNavigation}
        />
      )}

      {/* Keyboard Delete Confirmation Modal */}
      <ConfirmationModal
        isOpen={showKeyboardDeleteConfirm}
        onClose={() => setShowKeyboardDeleteConfirm(false)}
        onConfirm={() => {
          if (selectedAnnotations.length === 1) {
            handleDeleteAnnotation(selectedAnnotations[0])
          } else {
            handleBulkDeleteAnnotations(selectedAnnotations)
          }
          setShowKeyboardDeleteConfirm(false)
        }}
        title="Delete Annotations"
        message={`Are you sure you want to delete ${selectedAnnotations.length} annotation${selectedAnnotations.length !== 1 ? 's' : ''}? This action cannot be undone.`}
        confirmText="Delete"
        cancelText="Cancel"
        isDangerous={true}
      />

      {/* Toast Notifications */}
      <Toaster
        position="bottom-right"
        toastOptions={{
          duration: 3000,
          style: {
            background: 'rgba(255, 255, 255, 0.25)', // White frosted glass with blue hint
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)', // Safari support
            color: '#111827', // Dark text for readability on white
            border: '1px solid rgba(59, 130, 246, 0.3)', // Blue border hint
            boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.1)',
          },
          success: {
            style: {
              background: 'rgba(255, 255, 255, 0.25)', // White frosted glass
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
              border: '1px solid rgba(16, 185, 129, 0.3)', // Green border hint
              color: '#111827', // Dark text
            },
            iconTheme: {
              primary: '#10b981', // Emerald-500
              secondary: '#fff',
            },
          },
          error: {
            style: {
              background: 'rgba(255, 255, 255, 0.25)', // White frosted glass
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
              border: '1px solid rgba(239, 68, 68, 0.3)', // Red border hint
              color: '#111827', // Dark text
            },
            iconTheme: {
              primary: '#ef4444', // Red-500
              secondary: '#fff',
            },
          },
        }}
      />
    </div>
      )}
    </>
  )
}

export default AnnotationApp
