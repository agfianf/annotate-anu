import { useState, useEffect, useRef } from 'react'
import toast, { Toaster } from 'react-hot-toast'
import { LeftSidebar } from './components/LeftSidebar'
import Canvas from './components/Canvas'
import Sidebar from './components/Sidebar'
import { Modal } from './components/ui/Modal'
import { ExportModal } from './components/ExportModal'
import ShortcutsHelpModal from './components/ui/ShortcutsHelpModal'
import { AIModeIndicator } from './components/ui/AIModeIndicator'
import { useStorage } from './hooks/useStorage'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'
import { useHistory } from './hooks/useHistory'
import type { Tool, Annotation, ImageData, PolygonAnnotation, RectangleAnnotation, PromptMode } from './types/annotations'
import { annotationStorage } from './lib/storage'
import { Copy, RotateCcw, Download, Upload, Trash2, Loader2 } from 'lucide-react'
import './App.css'

// Thumbnail component to prevent re-creating blob URLs on every render
interface ImageThumbnailProps {
  image: ImageData
  isActive: boolean
  annotationCount: number
  onClick: () => void
  onDelete: (e: React.MouseEvent) => void
}

const ImageThumbnail = ({
  image,
  isActive,
  onClick,
  onDelete,
  annotationCount
}: ImageThumbnailProps) => {
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null)

  useEffect(() => {
    // Create URL only once when component mounts or image changes
    const url = URL.createObjectURL(image.blob)
    setThumbnailUrl(url)

    // Cleanup: revoke URL when component unmounts or image changes
    return () => URL.revokeObjectURL(url)
  }, [image.blob])

  // Show loading placeholder while URL is being created
  if (!thumbnailUrl) {
    return (
      <div className="h-20 w-20 bg-gray-800 animate-pulse rounded border-2 border-gray-600" />
    )
  }

  return (
    <div
      onClick={onClick}
      className={`group relative flex-shrink-0 cursor-pointer rounded overflow-hidden border-2 transition-all ${
        isActive
          ? 'border-orange-500 ring-2 ring-orange-500/50'
          : 'border-gray-600 hover:border-gray-500'
      }`}
    >
      <img
        src={thumbnailUrl}
        alt={image.name}
        className="h-20 w-auto object-contain bg-gray-900"
      />
      {annotationCount > 0 && (
        <div className="absolute top-1 right-1 bg-orange-600 text-white text-xs px-1.5 py-0.5 rounded">
          {annotationCount}
        </div>
      )}
      <button
        onClick={onDelete}
        className="absolute top-1 left-1 p-1 bg-red-600 hover:bg-red-700 text-white rounded opacity-0 group-hover:opacity-100 transition-opacity"
        title="Delete image"
      >
        <Trash2 className="w-3 h-3" />
      </button>
    </div>
  )
}

function App() {
  const [selectedTool, setSelectedTool] = useState<Tool>('select')
  const [selectedAnnotation, setSelectedAnnotation] = useState<string | null>(null)
  const [selectedLabelId, setSelectedLabelId] = useState<string | null>(null)
  const [showLabelManager, setShowLabelManager] = useState(false)
  const [showExportModal, setShowExportModal] = useState(false)
  const [showResetModal, setShowResetModal] = useState(false)
  const [showShortcutsModal, setShowShortcutsModal] = useState(false)
  const [resetIncludeImages, setResetIncludeImages] = useState(false)
  const [isRightSidebarCollapsed, setIsRightSidebarCollapsed] = useState(false)
  const [promptBboxes, setPromptBboxes] = useState<Array<{ x: number; y: number; width: number; height: number; id: string; labelId: string }>>([])
  const [isBboxPromptMode, setIsBboxPromptMode] = useState(false)
  const [isAIPanelActive, setIsAIPanelActive] = useState(false)
  const [currentTextPrompt, setCurrentTextPrompt] = useState('')
  const [promptMode, setPromptMode] = useState<PromptMode>(() => {
    const saved = localStorage.getItem('promptMode')
    return (saved as PromptMode) || 'single'
  })
  const [isAutoApplyLoading, setIsAutoApplyLoading] = useState(false)

  // Zoom and pan state
  const [zoomLevel, setZoomLevel] = useState(1)
  const [stagePosition, setStagePosition] = useState({ x: 0, y: 0 })

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
    updateAnnotation,
    removeAnnotation,
    removeManyAnnotations,
    addLabel,
    removeLabel,
    resetAll,
  } = useStorage()

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

  // Persist prompt mode to localStorage
  useEffect(() => {
    localStorage.setItem('promptMode', promptMode)
  }, [promptMode])

  const handleImageUpload = async (files: FileList) => {
    for (let i = 0; i < files.length; i++) {
      const file = files[i]

      // Create image element to get dimensions
      const img = new Image()
      const objectUrl = URL.createObjectURL(file)

      await new Promise<void>((resolve) => {
        img.onload = async () => {
          const imageData: ImageData = {
            id: `${Date.now()}-${i}`,
            name: file.name,
            width: img.width,
            height: img.height,
            blob: file,
            createdAt: Date.now(),
          }

          await addImage(imageData)
          URL.revokeObjectURL(objectUrl)
          resolve()
        }
        img.src = objectUrl
      })
    }
  }

  const handleAddAnnotation = async (annotation: Omit<Annotation, 'imageId' | 'labelId' | 'createdAt' | 'updatedAt'>) => {
    // If in bbox-prompt mode and it's a rectangle, add to promptBboxes instead
    if (isBboxPromptMode && annotation.type === 'rectangle') {
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
      return
    }

    if (!currentImageId || !selectedLabelId) return

    const now = Date.now()
    const fullAnnotation: Annotation = {
      ...annotation,
      imageId: currentImageId,
      labelId: selectedLabelId,
      createdAt: now,
      updatedAt: now,
    } as Annotation

    await addAnnotation(fullAnnotation)
    // Record history after user action (not during undo/redo)
    if (!isUndoingRef.current) {
      recordChange([...currentAnnotations, fullAnnotation])
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

  const handleDeleteAnnotation = async (id: string) => {
    await removeAnnotation(id)
    if (selectedAnnotation === id) {
      setSelectedAnnotation(null)
    }
    // Record history after user action (not during undo/redo)
    if (!isUndoingRef.current) {
      recordChange(currentAnnotations.filter(a => a.id !== id))
    }
  }

  const handleBulkDeleteAnnotations = async (ids: string[]) => {
    await removeManyAnnotations(ids)
    if (selectedAnnotation && ids.includes(selectedAnnotation)) {
      setSelectedAnnotation(null)
    }
    // Record history after user action (not during undo/redo)
    if (!isUndoingRef.current) {
      recordChange(currentAnnotations.filter(a => !ids.includes(a.id)))
    }
  }

  // Annotation bulk operation handlers
  const handleBulkChangeLabel = async (annotationIds: string[], newLabelId: string) => {
    try {
      await annotationStorage.bulkChangeLabel(annotationIds, newLabelId)

      // Reload annotations via useStorage reload
      window.location.reload() // Temporary - ideally update state directly

      const label = labels.find(l => l.id === newLabelId)
      toast.success(`${annotationIds.length} annotation(s) moved to "${label?.name}"`)
    } catch (error) {
      console.error('Failed to change labels:', error)
      toast.error('Failed to change labels')
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

  const handleAutoAnnotateResults = async (results: {
    boxes: Array<[number, number, number, number]>
    masks: Array<{ polygons: Array<Array<[number, number]>>; area: number }>
    scores: number[]
    annotationType: 'bbox' | 'polygon'
    labelId?: string
    imageId?: string
  }) => {
    // Use passed imageId for batch processing, otherwise use currentImageId
    const targetImageId = results.imageId || currentImageId
    if (!targetImageId) return

    // Use the labelId from results if provided, otherwise use selectedLabelId
    const labelToUse = results.labelId || selectedLabelId
    if (!labelToUse) return

    const now = Date.now()

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
          id: `${Date.now()}-${i}`,
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
        }

        await addAnnotation(annotation)
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
            id: `${Date.now()}-${i}`,
            imageId: targetImageId,
            labelId: labelToUse,
            type: 'polygon',
            points,
            createdAt: now,
            updatedAt: now,
            confidence: results.scores[i],
            isAutoGenerated: true,
          }

          await addAnnotation(annotation)
        }
      }
    }

    // Record history after AI annotations are created
    if (!isUndoingRef.current && currentImageId) {
      // Give a small delay for state to update
      setTimeout(() => {
        recordChange(annotations.filter(a => a.imageId === (results.imageId || currentImageId)))
      }, 50)
    }
  }

  // Get current image as data URL for canvas
  const [currentImageUrl, setCurrentImageUrl] = useState<string | null>(null)

  useEffect(() => {
    if (currentImage) {
      const url = URL.createObjectURL(currentImage.blob)
      setCurrentImageUrl(url)
      return () => URL.revokeObjectURL(url)
    } else {
      setCurrentImageUrl(null)
    }
    // Clear selection when image changes
    setSelectedAnnotation(null)
  }, [currentImage])

  // Clear selection when navigating between images
  useEffect(() => {
    setSelectedAnnotation(null)
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

  // Copy filename to clipboard
  const copyFilenameToClipboard = async () => {
    if (currentImage) {
      try {
        // Check if clipboard API is available
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(currentImage.name)
          toast.success('Filename copied to clipboard!')
        } else {
          // Fallback for browsers without clipboard API
          const textArea = document.createElement('textarea')
          textArea.value = currentImage.name
          textArea.style.position = 'fixed'
          textArea.style.left = '-999999px'
          document.body.appendChild(textArea)
          textArea.select()
          try {
            document.execCommand('copy')
            toast.success('Filename copied to clipboard!')
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
  }

  // Keyboard shortcuts
  useKeyboardShortcuts({
    onSelectTool: setSelectedTool,
    onDelete: () => {
      if (selectedAnnotation) {
        handleDeleteAnnotation(selectedAnnotation)
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

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-900">
        <div className="text-white text-lg">Loading...</div>
      </div>
    )
  }

  return (
    <div className="h-screen flex flex-col bg-gray-900">
      {/* Header */}
      <header className="bg-gray-800 border-b border-gray-700 px-4 py-3 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-white">SAM3 Annotation Platform</h1>
        <div className="flex items-center gap-3">
          {images.length > 0 && (
            <span className="text-gray-400 text-sm">
              Image {currentImageNumber} of {images.length} • {currentAnnotations.length} annotations
            </span>
          )}
          <button
            onClick={() => setShowExportModal(true)}
            disabled={annotations.length === 0}
            className="px-3 py-1.5 bg-green-600 hover:bg-green-700 disabled:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm rounded transition-colors flex items-center gap-1.5"
            title="Export annotations to COCO JSON or YOLO format"
          >
            <Download className="w-4 h-4" />
            Export
          </button>
          <button
            onClick={() => setShowResetModal(true)}
            className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-sm rounded transition-colors flex items-center gap-1.5"
            title="Reset all data (annotations and optionally images)"
          >
            <RotateCcw className="w-4 h-4" />
            Reset
          </button>
          <button
            onClick={() => setShowLabelManager(true)}
            className="px-3 py-1.5 bg-orange-600 hover:bg-orange-700 text-white text-sm rounded transition-colors"
            title="Create, edit, and delete labels"
          >
            Manage Labels
          </button>
        </div>
      </header>

      {/* Main Layout */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex-1 flex overflow-hidden">
          {/* Left Sidebar */}
          <LeftSidebar
            selectedTool={selectedTool}
            onToolChange={setSelectedTool}
            labels={labels}
            selectedLabelId={selectedLabelId}
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
          />

          {/* Canvas */}
          <div className="flex-1 bg-gray-950 overflow-hidden flex flex-col">
            {/* Image Viewer Header */}
            {currentImage && (
              <div className="bg-gray-800/50 border-b border-gray-700 px-4 py-2 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-orange-500 font-semibold">
                    {currentImageNumber} / {images.length}
                  </span>
                  <span className="text-gray-400 text-sm">|</span>
                  <span className="text-white text-sm font-mono">{currentImage.name}</span>
                  <button
                    onClick={copyFilenameToClipboard}
                    className="p-1 hover:bg-gray-700 rounded transition-colors text-gray-400 hover:text-white"
                    title="Copy filename to clipboard"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <div className="text-gray-400 text-xs">
                    {currentImage.width} × {currentImage.height} px
                  </div>
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
                selectedTool={selectedTool}
                annotations={currentAnnotations}
                labels={labels}
                selectedLabelId={selectedLabelId}
                onAddAnnotation={handleAddAnnotation}
                onUpdateAnnotation={handleUpdateAnnotation}
                selectedAnnotation={selectedAnnotation}
                onSelectAnnotation={setSelectedAnnotation}
                promptBboxes={promptBboxes}
                zoomLevel={zoomLevel}
                onZoomChange={setZoomLevel}
                stagePosition={stagePosition}
                onStagePositionChange={setStagePosition}
              />
              {/* Auto-apply loading overlay */}
              {isAutoApplyLoading && (
                <div className="absolute inset-0 bg-black/50 flex items-center justify-center pointer-events-none">
                  <div className="bg-gray-800 px-6 py-4 rounded-lg shadow-xl flex items-center gap-3">
                    <Loader2 className="w-5 h-5 text-orange-500 animate-spin" />
                    <span className="text-white font-medium">Auto-detecting objects...</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Sidebar */}
          <Sidebar
            annotations={currentAnnotations}
            labels={labels}
            selectedAnnotation={selectedAnnotation}
            selectedLabelId={selectedLabelId}
            onSelectAnnotation={setSelectedAnnotation}
            onSelectLabel={setSelectedLabelId}
            onDeleteAnnotation={handleDeleteAnnotation}
            onBulkDeleteAnnotations={handleBulkDeleteAnnotations}
            onBulkChangeLabel={handleBulkChangeLabel}
            onToggleAnnotationVisibility={handleToggleAnnotationVisibility}
            isCollapsed={isRightSidebarCollapsed}
            onToggleCollapse={() => setIsRightSidebarCollapsed(prev => !prev)}
          />
        </div>

        {/* Image Gallery - Bottom strip */}
        <div className="h-28 bg-gray-800 border-t border-gray-700 flex items-center px-4 gap-3">
          {/* Previous button */}
          <button
            onClick={() => {
              const prevIndex = currentImageIndex - 1
              if (prevIndex >= 0) {
                setCurrentImageId(images[prevIndex].id)
              }
            }}
            disabled={currentImageIndex <= 0 || images.length === 0}
            className="p-2 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded transition-colors"
            title="Previous image (D)"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>

          {/* Thumbnails */}
          <div className="flex-1 flex gap-2 overflow-x-auto py-2">
            {/* Upload placeholder button */}
            <label className="flex-shrink-0 cursor-pointer group" title="Upload images to annotate">
              <div className="h-20 w-20 border-2 border-dashed border-gray-600 hover:border-orange-500 rounded flex flex-col items-center justify-center gap-1 transition-colors bg-gray-900/50 hover:bg-gray-900">
                <Upload className="w-6 h-6 text-gray-400 group-hover:text-orange-500 transition-colors" />
                <span className="text-xs text-gray-500 group-hover:text-orange-500 transition-colors">Add</span>
              </div>
              <input
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => {
                  if (e.target.files) {
                    handleImageUpload(e.target.files)
                  }
                }}
              />
            </label>

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
                  onDelete={(e) => {
                    e.stopPropagation()
                    if (window.confirm(`Delete "${image.name}"? This will also remove all associated annotations.`)) {
                      removeImage(image.id)
                    }
                  }}
                />
              )
            })}
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
              className="p-2 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded transition-colors"
              title="Next image (F)"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
        </div>
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
          <div className="bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[80vh] overflow-hidden flex flex-col">
            <div className="px-6 py-4 border-b border-gray-700 flex items-center justify-between">
              <h2 className="text-xl font-semibold text-white">
                Label Management
                {labels.length === 0 && (
                  <span className="ml-2 text-sm text-orange-500">(Create at least one label)</span>
                )}
              </h2>
              {labels.length > 0 && (
                <button
                  onClick={() => setShowLabelManager(false)}
                  className="text-gray-400 hover:text-white"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>

            <div className="p-6 overflow-y-auto flex-1">
              <div className="space-y-3">
                {labels.map(label => (
                  <div
                    key={label.id}
                    className="flex items-center gap-3 p-3 bg-gray-700 rounded-lg"
                  >
                    <div
                      className="w-6 h-6 rounded"
                      style={{ backgroundColor: label.color }}
                    />
                    <span className="flex-1 text-white">{label.name}</span>
                    <button
                      onClick={() => removeLabel(label.id)}
                      className="text-red-400 hover:text-red-300 text-sm"
                    >
                      Delete
                    </button>
                  </div>
                ))}
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  const formData = new FormData(e.currentTarget)
                  const name = formData.get('name') as string
                  const color = formData.get('color') as string

                  if (name && color) {
                    const newLabel = {
                      id: Date.now().toString(),
                      name,
                      color,
                      createdAt: Date.now(),
                    }
                    addLabel(newLabel)
                    e.currentTarget.reset()
                  }
                }}
                className="mt-6 space-y-3"
              >
                <h3 className="text-white font-medium">Add New Label</h3>
                <input
                  type="text"
                  name="name"
                  placeholder="Label name"
                  required
                  className="w-full px-3 py-2 bg-gray-700 text-white rounded border border-gray-600 focus:border-orange-500 focus:outline-none"
                />
                <div className="flex gap-2">
                  <input
                    type="color"
                    name="color"
                    defaultValue="#f97316"
                    className="w-16 h-10 bg-gray-700 rounded border border-gray-600"
                  />
                  <button
                    type="submit"
                    className="flex-1 px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded transition-colors"
                  >
                    Add Label
                  </button>
                </div>
                <div className="flex gap-2 mt-2">
                  <button
                    type="button"
                    onClick={(e) => {
                      const form = e.currentTarget.closest('form')
                      const colorInput = form?.querySelector('input[name="color"]') as HTMLInputElement
                      if (colorInput) colorInput.value = '#f97316'
                    }}
                    className="px-3 py-1 text-xs bg-orange-600 hover:bg-orange-700 text-white rounded"
                  >
                    Orange
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      const form = e.currentTarget.closest('form')
                      const colorInput = form?.querySelector('input[name="color"]') as HTMLInputElement
                      if (colorInput) colorInput.value = '#6b7280'
                    }}
                    className="px-3 py-1 text-xs bg-gray-600 hover:bg-gray-500 text-white rounded"
                  >
                    Gray
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      const form = e.currentTarget.closest('form')
                      const colorInput = form?.querySelector('input[name="color"]') as HTMLInputElement
                      if (colorInput) colorInput.value = '#111827'
                    }}
                    className="px-3 py-1 text-xs bg-gray-900 hover:bg-gray-800 text-white rounded border border-gray-700"
                  >
                    Dark
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

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
            <div className="text-gray-300">
              You need to create at least one label before annotating images.
            </div>
            <button
              onClick={() => setShowLabelManager(true)}
              className="px-6 py-3 bg-orange-600 hover:bg-orange-700 text-white rounded transition-colors"
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
          setResetIncludeImages(false)
        }}
        title="Reset Confirmation"
        maxWidth="md"
      >
        <div className="space-y-4">
          <div className="bg-red-900/20 border border-red-700 rounded-lg p-4">
            <p className="text-red-400 font-medium">⚠️ Warning: This action cannot be undone!</p>
          </div>
          <p className="text-gray-300">
            Are you sure you want to reset? This will permanently delete:
          </p>
          <ul className="list-disc list-inside text-gray-400 space-y-1">
            <li>All annotations</li>
            <li>All labels (will reset to defaults)</li>
            <li>Tool configuration</li>
            {resetIncludeImages && <li className="text-red-400 font-medium">All loaded images</li>}
          </ul>
          <label className="flex items-center gap-2 text-gray-300 cursor-pointer">
            <input
              type="checkbox"
              checked={resetIncludeImages}
              onChange={(e) => setResetIncludeImages(e.target.checked)}
              className="w-4 h-4 text-orange-600 focus:ring-orange-500 focus:ring-offset-gray-800"
            />
            Also clear loaded images
          </label>
          <div className="flex justify-end gap-3 pt-4 border-t border-gray-700">
            <button
              onClick={() => {
                setShowResetModal(false)
                setResetIncludeImages(false)
              }}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={async () => {
                await resetAll(resetIncludeImages)
                setShowResetModal(false)
                setResetIncludeImages(false)
                setSelectedAnnotation(null)
                setSelectedTool('select')
              }}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded transition-colors"
            >
              Reset All
            </button>
          </div>
        </div>
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

      {/* Toast Notifications */}
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 3000,
          style: {
            background: '#1f2937',
            color: '#f2f2f2',
            border: '1px solid #374151',
          },
          success: {
            iconTheme: {
              primary: '#f97316',
              secondary: '#fff',
            },
          },
        }}
      />
    </div>
  )
}

export default App
