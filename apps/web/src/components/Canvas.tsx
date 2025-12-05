import Konva from 'konva'
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { Circle, Group, Image as KonvaImage, Layer, Line, Rect, Stage, Text, Transformer } from 'react-konva'
import type { Annotation, Label, PolygonAnnotation, RectangleAnnotation, Tool } from '../types/annotations'

interface CanvasProps {
  image: string | null
  selectedTool: Tool
  annotations: Annotation[]
  labels: Label[]
  selectedLabelId: string | null
  onAddAnnotation: (annotation: Omit<Annotation, 'imageId' | 'labelId' | 'createdAt' | 'updatedAt'>) => void
  onUpdateAnnotation: (annotation: Annotation) => void
  onUpdateManyAnnotations?: (annotations: Annotation[]) => void
  selectedAnnotations: string[]
  onSelectAnnotations: (ids: string[]) => void
  promptBboxes?: Array<{ x: number; y: number; width: number; height: number; id: string; labelId: string }>
  zoomLevel?: number
  onZoomChange?: (zoom: number) => void
  stagePosition?: { x: number; y: number }
  onStagePositionChange?: (position: { x: number; y: number }) => void
}

const Canvas = React.memo(function Canvas({
  image,
  selectedTool,
  annotations,
  labels,
  selectedLabelId,
  onAddAnnotation,
  onUpdateAnnotation,
  onUpdateManyAnnotations,
  selectedAnnotations,
  onSelectAnnotations,
  promptBboxes = [],
  zoomLevel = 1,
  onZoomChange,
  stagePosition = { x: 0, y: 0 },
  onStagePositionChange,
}: CanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<Konva.Stage>(null)
  const transformerRef = useRef<Konva.Transformer>(null)
  const animationFrameRef = useRef<number | null>(null)
  const konvaImageRef = useRef<HTMLImageElement | null>(null)
  const [konvaImage, setKonvaImage] = useState<HTMLImageElement | null>(null)
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 })
  const [scale, setScale] = useState(1)
  const [currentRectangle, setCurrentRectangle] = useState<number[] | null>(null)
  const [rectangleStartPoint, setRectangleStartPoint] = useState<{ x: number; y: number } | null>(null)
  const [polygonPoints, setPolygonPoints] = useState<Array<{ x: number; y: number }>>([])
  const [mousePosition, setMousePosition] = useState<{ x: number; y: number } | null>(null)
  const [cursorScreenPosition, setCursorScreenPosition] = useState<{ x: number; y: number } | null>(null)
  const [isNearFirstPoint, setIsNearFirstPoint] = useState(false)
  const [isShiftPressed, setIsShiftPressed] = useState(false)
  const [isCtrlPressed, setIsCtrlPressed] = useState(false)
  const [draggingPoint, setDraggingPoint] = useState<{
    annotationId: string
    pointIndex: number
    x: number
    y: number
  } | null>(null)
  // Track which annotation is being dragged (to hide points/label/coordinates during drag)
  const [draggingAnnotationId, setDraggingAnnotationId] = useState<string | null>(null)
  // Track if we're waiting for annotation data to update after drag end
  const pendingDragEndRef = useRef<{ annotationId: string; node: any } | null>(null)
  // Track if we're waiting for annotation data to update after polygon point drag end
  const pendingPointDragEndRef = useRef<{ annotationId: string; pointIndex: number; finalX: number; finalY: number } | null>(null)
  // Track drag start position to detect click vs drag
  const dragStartPosRef = useRef<{ x: number; y: number } | null>(null)
  // Track original positions of all selected annotations for multi-drag
  const dragOriginalPositionsRef = useRef<Map<string, { annotation: Annotation }> | null>(null)
  // Track current multi-drag delta for real-time visual updates
  const multiDragDeltaRef = useRef<{ deltaX: number; deltaY: number } | null>(null)
  const [isDraggingStage, setIsDraggingStage] = useState(false)
  const [stageDragStart, setStageDragStart] = useState<{ x: number; y: number } | null>(null)
  const [isPanMode, setIsPanMode] = useState(false) // Space key hold-to-pan mode
  const [copiedAnnotation, setCopiedAnnotation] = useState<Annotation | null>(null) // Clipboard for copy-paste

  const SNAP_DISTANCE = 10 // pixels in original image coordinates

  // Debug: Log when annotations prop changes
  useEffect(() => {
    console.log('[CANVAS] Annotations prop changed:', {
      count: annotations.length,
      annotations: annotations.map(a => ({ id: a.id, type: a.type, labelId: a.labelId, imageId: a.imageId }))
    })
  }, [annotations])

  // Clear dragging state when annotations update (after drag end)
  // useLayoutEffect runs synchronously after DOM mutations but BEFORE browser paint
  // This prevents any visual flicker by resetting node position before the user sees the frame
  useLayoutEffect(() => {
    if (pendingDragEndRef.current) {
      const { annotationId, node } = pendingDragEndRef.current

      // Find the updated annotation to get its new coordinates
      const updatedAnnotation = annotations.find(a => a.id === annotationId)

      if (node && updatedAnnotation) {
        if (updatedAnnotation.type === 'rectangle') {
          // For rectangles, set the node position to match the new annotation coordinates
          // This ensures the visual position matches the data
          const rect = updatedAnnotation as RectangleAnnotation
          node.x(rect.x * scale)
          node.y(rect.y * scale)
          node.width(rect.width * scale)
          node.height(rect.height * scale)
        } else if (updatedAnnotation.type === 'polygon') {
          // For polygons, reset to 0,0 since points contain absolute coordinates
          node.x(0)
          node.y(0)
        }
        console.log('[DRAG] Reset node position for:', annotationId, updatedAnnotation.type)
      }

      // Clear pending state
      pendingDragEndRef.current = null
      // Clear dragging UI state
      setDraggingAnnotationId(null)
    }

    // Handle pending polygon point drag end - clear draggingPoint only after annotation updates
    if (pendingPointDragEndRef.current) {
      const { annotationId, pointIndex, finalX, finalY } = pendingPointDragEndRef.current
      const updatedAnnotation = annotations.find(a => a.id === annotationId) as PolygonAnnotation | undefined

      // Check if the annotation has been updated with the new point position
      if (updatedAnnotation && updatedAnnotation.type === 'polygon') {
        const updatedPoint = updatedAnnotation.points[pointIndex]
        // Verify the point position matches what we expect (with small tolerance for floating point)
        if (updatedPoint && 
            Math.abs(updatedPoint.x - finalX) < 0.01 && 
            Math.abs(updatedPoint.y - finalY) < 0.01) {
          console.log('[POINT DRAG] Annotation updated, clearing dragging state:', annotationId, pointIndex)
          pendingPointDragEndRef.current = null
          setDraggingPoint(null)
        }
      }
    }
  }, [annotations, scale])

  // Annotation appearance constants - adjust these to customize look
  const ANNOTATION_FILL_OPACITY_SELECTED = 0.2  // Fill opacity when selected
  const ANNOTATION_FILL_OPACITY_UNSELECTED = 0.4  // Fill opacity when not selected
  const ANNOTATION_STROKE_OPACITY = 1  // Stroke/border opacity (always visible)
  const ANNOTATION_STROKE_WIDTH = 2  // Stroke/border width in pixels

  // Helper function to convert hex color to rgba with opacity
  const hexToRgba = (hex: string, opacity: number): string => {
    const r = parseInt(hex.slice(1, 3), 16)
    const g = parseInt(hex.slice(3, 5), 16)
    const b = parseInt(hex.slice(5, 7), 16)
    return `rgba(${r}, ${g}, ${b}, ${opacity})`
  }

  // Helper function to adjust sizes for zoom (keep constant screen size when zooming in)
  const getZoomAdjustedSize = (baseSize: number, zoomLevel: number): number => {
    return zoomLevel > 1 ? baseSize / zoomLevel : baseSize
  }

  // Get selected label color (default to orange if no label selected)
  const selectedLabelColor = selectedLabelId
    ? labels.find(l => l.id === selectedLabelId)?.color || '#f97316'
    : '#f97316'

  // Load image
  useEffect(() => {
    if (image) {
      const img = new window.Image()
      img.src = image
      img.onload = () => {
        konvaImageRef.current = img
        setKonvaImage(img)
        // Resize canvas to fit container while maintaining aspect ratio
        if (containerRef.current) {
          const containerWidth = containerRef.current.offsetWidth
          const containerHeight = containerRef.current.offsetHeight
          const scaleX = containerWidth / img.width
          const scaleY = containerHeight / img.height
          // Remove 100% cap to allow upscaling for small images
          const newScale = Math.min(scaleX, scaleY)
          setScale(newScale)
          setDimensions({
            width: img.width * newScale,
            height: img.height * newScale,
          })
        }
      }
    }
  }, [image])

  // Resize on container size change using ResizeObserver
  // This detects both window resize AND flexbox layout changes (sidebar expand/collapse)
  useEffect(() => {
    // Guard: Only create observer if container ref is available
    if (!containerRef.current) return

    // Create ResizeObserver to watch container size changes
    const resizeObserver = new ResizeObserver(() => {
      // Use requestAnimationFrame to debounce rapid resize events
      requestAnimationFrame(() => {
        const img = konvaImageRef.current
        if (containerRef.current && img) {
          const containerWidth = containerRef.current.offsetWidth
          const containerHeight = containerRef.current.offsetHeight
          const scaleX = containerWidth / img.width
          const scaleY = containerHeight / img.height
          // Remove 100% cap to allow upscaling for small images
          const newScale = Math.min(scaleX, scaleY)
          setScale(newScale)
          setDimensions({
            width: img.width * newScale,
            height: img.height * newScale,
          })
        }
      })
    })

    // Start observing the container element
    resizeObserver.observe(containerRef.current)

    // Cleanup: disconnect observer when component unmounts
    return () => {
      resizeObserver.disconnect()
    }
  }, [])

  // Cleanup animation frame on unmount
  useEffect(() => {
    return () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [])

  // Update transformer when selection changes (only for rectangles)
  useEffect(() => {
    if (transformerRef.current && stageRef.current && selectedTool === 'select') {
      if (selectedAnnotations.length > 0) {
        // For multi-select, attach transformer to all selected rectangles
        const selectedNodes = selectedAnnotations
          .map(id => {
            const annotation = annotations.find(a => a.id === id)
            // Only attach transformer to rectangles, polygons use point-based editing
            if (annotation && annotation.type === 'rectangle') {
              return stageRef.current?.findOne(`#ann-${id}`)
            }
            return null
          })
          .filter((node): node is Konva.Node => node !== null && node !== undefined)

        if (selectedNodes.length > 0) {
          transformerRef.current.nodes(selectedNodes)
          transformerRef.current.getLayer()?.batchDraw()
        } else {
          transformerRef.current.nodes([])
          transformerRef.current.getLayer()?.batchDraw()
        }
      } else {
        transformerRef.current.nodes([])
        transformerRef.current.getLayer()?.batchDraw()
      }
    }
  }, [selectedAnnotations, selectedTool, annotations])

  // Create label lookup map for O(1) access instead of O(n) search
  const labelMap = useMemo(() => {
    const map = new Map<string, Label>()
    labels.forEach(label => map.set(label.id, label))
    return map
  }, [labels])

  const getLabel = (labelId: string) => {
    return labelMap.get(labelId)
  }

  // Check if an annotation should be visible based on annotation visibility
  const isAnnotationVisible = useMemo(() => {
    return (annotation: Annotation): boolean => {
      // Check annotation's own visibility (default to true if undefined)
      const annotationVisible = annotation.isVisible ?? true
      if (!annotationVisible) {
        console.log('[VISIBILITY] Annotation hidden (isVisible=false):', annotation.id)
        return false
      }

      const label = labelMap.get(annotation.labelId)
      if (!label) {
        console.log('[VISIBILITY] Annotation hidden (label not found):', {
          annotationId: annotation.id,
          labelId: annotation.labelId,
          availableLabels: Array.from(labelMap.keys())
        })
        return false
      }

      return true
    }
  }, [labelMap])

  const calculateDistance = (p1: { x: number; y: number }, p2: { x: number; y: number }) => {
    return Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2))
  }

  // Zoom constants
  const MIN_ZOOM = 0.1
  const MAX_ZOOM = 5
  const ZOOM_SPEED = 1.1

  // Handle mouse wheel for zooming
  const handleWheel = (e: any) => {
    e.evt.preventDefault()
    if (!onZoomChange || !stageRef.current) return

    const stage = stageRef.current
    const oldScale = zoomLevel
    const pointer = stage.getPointerPosition()

    if (!pointer) return

    // Calculate new zoom level
    const direction = e.evt.deltaY > 0 ? -1 : 1
    const newScale = direction > 0
      ? Math.min(MAX_ZOOM, oldScale * ZOOM_SPEED)
      : Math.max(MIN_ZOOM, oldScale / ZOOM_SPEED)

    if (newScale === oldScale) return

    // Calculate new position to zoom toward mouse cursor
    const mousePointTo = {
      x: (pointer.x - stagePosition.x) / oldScale,
      y: (pointer.y - stagePosition.y) / oldScale,
    }

    const newPos = {
      x: pointer.x - mousePointTo.x * newScale,
      y: pointer.y - mousePointTo.y * newScale,
    }

    onZoomChange(newScale)
    onStagePositionChange?.(newPos)
  }

  const handleMouseDown = (e: any) => {
    // If Space is held (pan mode), start panning regardless of tool or target
    if (isPanMode) {
      const stage = e.target.getStage()
      const pos = stage.getPointerPosition()
      if (pos) {
        setIsDraggingStage(true)
        setStageDragStart({ x: pos.x - stagePosition.x, y: pos.y - stagePosition.y })
      }
      return // Don't process other interactions while in pan mode
    }

    // Deselect when clicking on stage or image (empty area)
    const clickedOnEmpty = e.target === e.target.getStage() || e.target.attrs?.image
    if (clickedOnEmpty && selectedTool === 'select') {
      // Clear selection unless Shift is pressed
      if (!isShiftPressed) {
        onSelectAnnotations([]
)
      }
      // Start manual stage panning only when clicking on empty space
      const stage = e.target.getStage()
      const pos = stage.getPointerPosition()
      if (pos) {
        setIsDraggingStage(true)
        setStageDragStart({ x: pos.x - stagePosition.x, y: pos.y - stagePosition.y })
      }
      return
    }

    if (selectedTool === 'select') {
      // Clicking on an annotation - disable stage dragging
      setIsDraggingStage(false)
      setStageDragStart(null)
      return
    }

    const stage = e.target.getStage()
    const pos = stage.getPointerPosition()

    // Convert to original image coordinates (account for both zoom and autofit scale)
    const originalX = (pos.x - stagePosition.x) / (scale * zoomLevel)
    const originalY = (pos.y - stagePosition.y) / (scale * zoomLevel)

    if (selectedTool === 'rectangle') {
      if (!rectangleStartPoint) {
        // First click: Set the start point
        console.log('[CANVAS] Rectangle start point set:', { x: originalX, y: originalY })
        setRectangleStartPoint({ x: originalX, y: originalY })
        setCurrentRectangle([originalX, originalY, 0, 0])
      } else {
        // Second click: Create the rectangle
        const width = originalX - rectangleStartPoint.x
        const height = originalY - rectangleStartPoint.y
        console.log('[CANVAS] Rectangle completed:', {
          start: rectangleStartPoint,
          end: { x: originalX, y: originalY },
          width,
          height
        })

        if (Math.abs(width) > 5 && Math.abs(height) > 5) {
          // Normalize rectangle (handle negative width/height)
          let normalizedX = width < 0 ? rectangleStartPoint.x + width : rectangleStartPoint.x
          let normalizedY = height < 0 ? rectangleStartPoint.y + height : rectangleStartPoint.y
          let normalizedWidth = Math.abs(width)
          let normalizedHeight = Math.abs(height)

          // Apply CVAT-like clipping if image dimensions available
          const imageWidth = konvaImageRef.current?.width
          const imageHeight = konvaImageRef.current?.height

          if (imageWidth && imageHeight) {
            const clipped = clipRectangleToBounds(
              normalizedX,
              normalizedY,
              normalizedWidth,
              normalizedHeight,
              imageWidth,
              imageHeight
            )
            normalizedX = clipped.x
            normalizedY = clipped.y
            normalizedWidth = clipped.width
            normalizedHeight = clipped.height
          }

          const newAnnotation: Omit<RectangleAnnotation, 'imageId' | 'labelId' | 'createdAt' | 'updatedAt'> = {
            id: Date.now().toString(),
            type: 'rectangle',
            x: normalizedX,
            y: normalizedY,
            width: normalizedWidth,
            height: normalizedHeight,
          }
          console.log('[CANVAS] Calling onAddAnnotation with rectangle:', newAnnotation)
          onAddAnnotation(newAnnotation)
        } else {
          console.log('[CANVAS] Rectangle too small, not creating annotation:', { width: Math.abs(width), height: Math.abs(height) })
          toast.error('Rectangle too small (minimum 5x5 pixels)')
        }

        // Reset rectangle state
        setRectangleStartPoint(null)
        setCurrentRectangle(null)
      }
    } else if (selectedTool === 'polygon') {
      // Check if clicking near the first point to close polygon
      if (polygonPoints.length >= 3 && isNearFirstPoint) {
        // Apply CVAT-like clipping if image dimensions available
        const imageWidth = konvaImageRef.current?.width
        const imageHeight = konvaImageRef.current?.height

        let finalPoints = polygonPoints
        if (imageWidth && imageHeight) {
          finalPoints = clipPolygonPointsToBounds(polygonPoints, imageWidth, imageHeight)
        }

        // Close the polygon
        const newAnnotation: Omit<PolygonAnnotation, 'imageId' | 'labelId' | 'createdAt' | 'updatedAt'> = {
          id: Date.now().toString(),
          type: 'polygon',
          points: finalPoints,
        }
        onAddAnnotation(newAnnotation)
        setPolygonPoints([])
        setIsNearFirstPoint(false)
      } else {
        // Add point to polygon
        setPolygonPoints(prev => [...prev, { x: originalX, y: originalY }])
      }
    }
  }

  const handleMouseMove = useCallback((e: any) => {
    const stage = e.target.getStage()
    const pos = stage.getPointerPosition()

    if (!pos || !stage) return

    // Handle manual stage panning (works in pan mode or select mode)
    if (isDraggingStage && stageDragStart && (isPanMode || selectedTool === 'select')) {
      const newPos = {
        x: pos.x - stageDragStart.x,
        y: pos.y - stageDragStart.y,
      }
      onStagePositionChange?.(newPos)
      return
    }

    // Cancel any pending animation frame to avoid duplicate updates
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current)
    }

    // Throttle state updates using requestAnimationFrame (max 60fps)
    animationFrameRef.current = requestAnimationFrame(() => {
      // Get Stage position in the page
      const stageBox = stage.container().getBoundingClientRect()

      // Get container position to calculate relative coordinates
      const containerBox = containerRef.current?.getBoundingClientRect()

      // Convert to original image coordinates (account for both zoom and autofit scale)
      const originalX = (pos.x - stagePosition.x) / (scale * zoomLevel)
      const originalY = (pos.y - stagePosition.y) / (scale * zoomLevel)

      // Update mouse position for coordinate display (hide when in pan mode)
      if (!isPanMode && (selectedTool === 'rectangle' || selectedTool === 'polygon')) {
        setMousePosition({ x: Math.round(originalX), y: Math.round(originalY) })

        // Calculate position relative to container (not screen)
        if (containerBox) {
          const containerRelativeX = stageBox.left - containerBox.left + pos.x
          const containerRelativeY = stageBox.top - containerBox.top + pos.y
          setCursorScreenPosition({ x: containerRelativeX, y: containerRelativeY })
        }
      } else {
        setMousePosition(null)
        setCursorScreenPosition(null)
      }

      // Check if near first point for polygon (not in pan mode)
      if (!isPanMode && selectedTool === 'polygon' && polygonPoints.length >= 3) {
        const distance = calculateDistance({ x: originalX, y: originalY }, polygonPoints[0])
        setIsNearFirstPoint(distance <= SNAP_DISTANCE)
      } else {
        setIsNearFirstPoint(false)
      }

      // Update rectangle preview when start point is set (not in pan mode)
      if (!isPanMode && selectedTool === 'rectangle' && rectangleStartPoint) {
        const width = originalX - rectangleStartPoint.x
        const height = originalY - rectangleStartPoint.y
        setCurrentRectangle([rectangleStartPoint.x, rectangleStartPoint.y, width, height])
      }

      animationFrameRef.current = null
    })
  }, [isDraggingStage, stageDragStart, isPanMode, selectedTool, onStagePositionChange, stagePosition.x, stagePosition.y, scale, zoomLevel, polygonPoints, rectangleStartPoint])

  const handleMouseUp = () => {
    // Rectangle creation now happens on second click in handleMouseDown
    // This function is kept for compatibility but no longer handles rectangle drag

    // Stop manual stage panning on mouse up
    setIsDraggingStage(false)
    setStageDragStart(null)
  }

  const handleDoubleClick = () => {
    if (selectedTool === 'polygon' && polygonPoints.length >= 3) {
      // Apply CVAT-like clipping if image dimensions available
      const imageWidth = konvaImageRef.current?.width
      const imageHeight = konvaImageRef.current?.height

      let finalPoints = polygonPoints
      if (imageWidth && imageHeight) {
        finalPoints = clipPolygonPointsToBounds(polygonPoints, imageWidth, imageHeight)
      }

      // Create polygon annotation
      const newAnnotation: Omit<PolygonAnnotation, 'imageId' | 'labelId' | 'createdAt' | 'updatedAt'> = {
        id: Date.now().toString(),
        type: 'polygon',
        points: finalPoints,
      }
      onAddAnnotation(newAnnotation)
      setPolygonPoints([])
      setIsNearFirstPoint(false)
    }
  }

  /**
   * Clips a rectangle to stay within image bounds (CVAT-like behavior)
   * Cuts off any part that extends beyond the boundary
   * @param x - Rectangle X position
   * @param y - Rectangle Y position
   * @param width - Rectangle width
   * @param height - Rectangle height
   * @param imageWidth - Image width in pixels
   * @param imageHeight - Image height in pixels
   * @returns Clipped rectangle {x, y, width, height}
   */
  const clipRectangleToBounds = (
    x: number,
    y: number,
    width: number,
    height: number,
    imageWidth: number,
    imageHeight: number
  ): { x: number; y: number; width: number; height: number } => {
    // Clip left edge
    let clippedX = Math.max(0, x)
    // Clip top edge
    let clippedY = Math.max(0, y)

    // Calculate how much was clipped from left/top
    const leftClip = clippedX - x
    const topClip = clippedY - y

    // Adjust width/height for left/top clipping
    let clippedWidth = width - leftClip
    let clippedHeight = height - topClip

    // Clip right edge
    if (clippedX + clippedWidth > imageWidth) {
      clippedWidth = imageWidth - clippedX
    }

    // Clip bottom edge
    if (clippedY + clippedHeight > imageHeight) {
      clippedHeight = imageHeight - clippedY
    }

    // Ensure minimum size of 1 pixel
    clippedWidth = Math.max(1, clippedWidth)
    clippedHeight = Math.max(1, clippedHeight)

    return {
      x: clippedX,
      y: clippedY,
      width: clippedWidth,
      height: clippedHeight,
    }
  }

  /**
   * Clips polygon points to stay within image bounds (CVAT-like behavior)
   * Each point is individually clamped to the boundary
   * @param points - Array of polygon points
   * @param imageWidth - Image width in pixels
   * @param imageHeight - Image height in pixels
   * @returns Clipped array of points
   */
  const clipPolygonPointsToBounds = (
    points: Array<{ x: number; y: number }>,
    imageWidth: number,
    imageHeight: number
  ): Array<{ x: number; y: number }> => {
    return points.map(point => ({
      x: Math.max(0, Math.min(point.x, imageWidth)),
      y: Math.max(0, Math.min(point.y, imageHeight)),
    }))
  }

  /**
   * Clips a single point to stay within image bounds
   * @param x - Point X position
   * @param y - Point Y position
   * @param imageWidth - Image width in pixels
   * @param imageHeight - Image height in pixels
   * @returns Clipped point {x, y}
   */
  const clipPointToBounds = (
    x: number,
    y: number,
    imageWidth: number,
    imageHeight: number
  ): { x: number; y: number } => {
    return {
      x: Math.max(0, Math.min(x, imageWidth)),
      y: Math.max(0, Math.min(y, imageHeight)),
    }
  }

  // Handle keyboard events (Escape to cancel, Shift for proportional scaling, Ctrl/Cmd for adding points, Space for pan)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Check if user is typing in an input field
      const target = e.target as HTMLElement
      const isTyping = target.tagName === 'INPUT' ||
                       target.tagName === 'TEXTAREA' ||
                       target.isContentEditable

      if (e.key === 'Escape') {
        if (selectedTool === 'polygon') {
          setPolygonPoints([])
          setIsNearFirstPoint(false)
        } else if (selectedTool === 'rectangle') {
          setRectangleStartPoint(null)
          setCurrentRectangle(null)
        }
      } else if (e.key === 'Shift') {
        setIsShiftPressed(true)
      } else if (e.key === 'Control' || e.key === 'Meta') {
        setIsCtrlPressed(true)
      } else if (e.key === ' ' && !isPanMode && !isTyping) {
        // Enable pan mode when Space is pressed (prevent repeat triggers)
        // Only if not typing in an input field
        e.preventDefault() // Prevent page scrolling
        setIsPanMode(true)
      } else if (e.key === 'c' && (e.ctrlKey || e.metaKey) && !isTyping) {
        // Copy selected annotation (Ctrl+C / Cmd+C) - only copy first if multiple selected
        if (selectedAnnotations.length > 0) {
          const annotationToCopy = annotations.find(a => a.id === selectedAnnotations[0])
          if (annotationToCopy) {
            setCopiedAnnotation(annotationToCopy)
            toast.success(selectedAnnotations.length === 1 ? 'Annotation copied' : 'First annotation copied')
          }
        }
      } else if (e.key === 'v' && (e.ctrlKey || e.metaKey) && !isTyping) {
        // Paste annotation (Ctrl+V / Cmd+V)
        e.preventDefault() // Prevent default paste behavior
        if (copiedAnnotation && stageRef.current) {
          const newId = Date.now().toString()
          
          // Get current mouse position on stage
          const stage = stageRef.current
          const pointerPos = stage.getPointerPosition()
          
          // Convert to original image coordinates if cursor is on canvas
          let pasteX: number
          let pasteY: number
          
          if (pointerPos) {
            // Convert screen position to image coordinates
            pasteX = (pointerPos.x - stagePosition.x) / (scale * zoomLevel)
            pasteY = (pointerPos.y - stagePosition.y) / (scale * zoomLevel)
          } else {
            // Fallback: use offset from original position if cursor not available
            const PASTE_OFFSET = 20
            if (copiedAnnotation.type === 'rectangle') {
              const rect = copiedAnnotation as RectangleAnnotation
              pasteX = rect.x + PASTE_OFFSET
              pasteY = rect.y + PASTE_OFFSET
            } else {
              pasteX = 0
              pasteY = 0
            }
          }
          
          if (copiedAnnotation.type === 'rectangle') {
            const rect = copiedAnnotation as RectangleAnnotation

            // Get image dimensions
            const imageWidth = konvaImageRef.current?.width
            const imageHeight = konvaImageRef.current?.height

            if (!imageWidth || !imageHeight) {
              toast.error('Cannot paste: Image dimensions unavailable')
              return
            }

            // Apply CVAT-like clipping to paste position and dimensions
            const clipped = clipRectangleToBounds(
              pasteX,
              pasteY,
              rect.width,
              rect.height,
              imageWidth,
              imageHeight
            )

            // Create annotation with clipped position and dimensions
            const newAnnotation: Omit<RectangleAnnotation, 'imageId' | 'labelId' | 'createdAt' | 'updatedAt'> = {
              id: newId,
              type: 'rectangle',
              x: clipped.x,
              y: clipped.y,
              width: clipped.width,
              height: clipped.height,
            }
            onAddAnnotation(newAnnotation)
            toast.success('Annotation pasted')
          } else if (copiedAnnotation.type === 'polygon') {
            const poly = copiedAnnotation as PolygonAnnotation

            // Get image dimensions
            const imageWidth = konvaImageRef.current?.width
            const imageHeight = konvaImageRef.current?.height

            if (!imageWidth || !imageHeight) {
              toast.error('Cannot paste: Image dimensions unavailable')
              return
            }

            // Calculate the center of the original polygon (bounding box center)
            const xs = poly.points.map(p => p.x)
            const ys = poly.points.map(p => p.y)
            const originalCenterX = (Math.min(...xs) + Math.max(...xs)) / 2
            const originalCenterY = (Math.min(...ys) + Math.max(...ys)) / 2

            // Calculate offset to move polygon
            let offsetX: number
            let offsetY: number

            if (pointerPos) {
              // Move center to cursor position
              offsetX = pasteX - originalCenterX
              offsetY = pasteY - originalCenterY
            } else {
              // Fallback: use fixed offset
              const PASTE_OFFSET = 20
              offsetX = PASTE_OFFSET
              offsetY = PASTE_OFFSET
            }

            // Apply offset to all points
            const movedPoints = poly.points.map(p => ({
              x: p.x + offsetX,
              y: p.y + offsetY,
            }))

            // Apply CVAT-like clipping to all points
            const clippedPoints = clipPolygonPointsToBounds(movedPoints, imageWidth, imageHeight)

            const newAnnotation: Omit<PolygonAnnotation, 'imageId' | 'labelId' | 'createdAt' | 'updatedAt'> = {
              id: newId,
              type: 'polygon',
              points: clippedPoints,
            }
            onAddAnnotation(newAnnotation)
            toast.success('Annotation pasted')
          }
        }
      }
    }

    const handleKeyUp = (e: KeyboardEvent) => {
      // Check if user is typing in an input field
      const target = e.target as HTMLElement
      const isTyping = target.tagName === 'INPUT' ||
                       target.tagName === 'TEXTAREA' ||
                       target.isContentEditable

      if (e.key === 'Shift') {
        setIsShiftPressed(false)
      } else if (e.key === 'Control' || e.key === 'Meta') {
        setIsCtrlPressed(false)
      } else if (e.key === ' ' && !isTyping) {
        // Disable pan mode when Space is released
        setIsPanMode(false)
        // Stop dragging if currently panning
        setIsDraggingStage(false)
        setStageDragStart(null)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [selectedTool, isPanMode, selectedAnnotations, annotations, copiedAnnotation, onAddAnnotation])

  // Reset drawing states when image changes
  useEffect(() => {
    setCurrentRectangle(null)
    setRectangleStartPoint(null)
    setPolygonPoints([])
    setIsNearFirstPoint(false)
    setMousePosition(null)
    setCursorScreenPosition(null)
  }, [image])

  // Handle annotation selection with Shift+Click support for multi-select
  const handleAnnotationClick = useCallback((annotationId: string) => {
    if (isShiftPressed) {
      // Shift+Click: Toggle annotation in selection
      if (selectedAnnotations.includes(annotationId)) {
        // Deselect if already selected
        onSelectAnnotations(selectedAnnotations.filter(id => id !== annotationId))
      } else {
        // Add to selection
        onSelectAnnotations([...selectedAnnotations, annotationId])
      }
    } else {
      // Normal click: Select only this annotation
      onSelectAnnotations([annotationId])
    }
  }, [isShiftPressed, selectedAnnotations, onSelectAnnotations])

  // Handle drag start - initialize dragging state
  const handleDragStart = (annotation: Annotation, e: any) => {
    setDraggingAnnotationId(annotation.id)
    // Store initial position to detect click vs drag
    const node = e.target
    dragStartPosRef.current = {
      x: node.x(),
      y: node.y()
    }

    // Multi-drag: Store original positions of ALL selected annotations
    if (selectedAnnotations.length > 1 && selectedAnnotations.includes(annotation.id)) {
      const originalPositions = new Map<string, { annotation: Annotation }>()

      selectedAnnotations.forEach(id => {
        const ann = annotations.find(a => a.id === id)
        if (ann) {
          // Store a deep copy of the annotation to preserve original state
          if (ann.type === 'rectangle') {
            const rect = ann as RectangleAnnotation
            originalPositions.set(id, {
              annotation: {
                ...rect,
                x: rect.x,
                y: rect.y,
                width: rect.width,
                height: rect.height,
              }
            })
          } else if (ann.type === 'polygon') {
            const poly = ann as PolygonAnnotation
            originalPositions.set(id, {
              annotation: {
                ...poly,
                points: poly.points.map(p => ({ x: p.x, y: p.y })) // Deep copy points
              }
            })
          }
        }
      })

      dragOriginalPositionsRef.current = originalPositions
      multiDragDeltaRef.current = { deltaX: 0, deltaY: 0 } // Initialize delta
      console.log('[MULTI-DRAG] Stored original positions for', originalPositions.size, 'annotations')
    } else {
      // Single annotation drag - no need to store positions
      dragOriginalPositionsRef.current = null
      multiDragDeltaRef.current = null
    }
  }

  const handleDragMove = (annotation: Annotation, e: any) => {
    // Multi-drag: Calculate and store delta for real-time visual updates
    if (dragOriginalPositionsRef.current && dragOriginalPositionsRef.current.size > 1) {
      const node = e.target
      const originalPositions = dragOriginalPositionsRef.current
      const draggedOriginal = originalPositions.get(annotation.id)

      if (!draggedOriginal) return

      // Calculate current delta
      let deltaX = 0
      let deltaY = 0

      if (annotation.type === 'rectangle') {
        const currentX = node.x() / scale
        const currentY = node.y() / scale
        const originalRect = draggedOriginal.annotation as RectangleAnnotation
        deltaX = currentX - originalRect.x
        deltaY = currentY - originalRect.y
      } else if (annotation.type === 'polygon') {
        deltaX = node.x() / scale
        deltaY = node.y() / scale
      }

      // Store delta for later use
      multiDragDeltaRef.current = { deltaX, deltaY }

      // Update visual position of all other selected nodes (rectangles and polygons)
      selectedAnnotations.forEach(id => {
        if (id === annotation.id) return // Skip the dragged one (it's already moving)

        const original = originalPositions.get(id)
        if (!original) return

        const targetNode = stageRef.current?.findOne(`#ann-${id}`) as any
        if (!targetNode) return

        if (original.annotation.type === 'rectangle') {
          const origRect = original.annotation as RectangleAnnotation
          // Update visual position only (not state)
          targetNode.x((origRect.x + deltaX) * scale)
          targetNode.y((origRect.y + deltaY) * scale)
        } else if (original.annotation.type === 'polygon') {
          const origPoly = original.annotation as PolygonAnnotation
          // Update polygon points directly on the Konva Line node
          const adjustedPoints = origPoly.points.flatMap(p => [
            (p.x + deltaX) * scale,
            (p.y + deltaY) * scale
          ])
          targetNode.points(adjustedPoints)
        }
      })

      // Redraw the layer
      node.getLayer()?.batchDraw()
    }
  }

  const handleDragEnd = (annotation: Annotation, e: any) => {
    console.log('[DRAG] handleDragEnd called for:', annotation.type, 'id:', annotation.id)
    const node = e.target
    const scaleX = node.scaleX()
    const scaleY = node.scaleY()

    // Check if this was actually a click (minimal movement)
    const CLICK_THRESHOLD = 3 // pixels
    if (dragStartPosRef.current) {
      const deltaX = Math.abs(node.x() - dragStartPosRef.current.x)
      const deltaY = Math.abs(node.y() - dragStartPosRef.current.y)
      const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY)

      if (distance < CLICK_THRESHOLD) {
        // This was a click, not a drag - trigger selection
        console.log('[DRAG] Detected click (distance:', distance, 'px)')
        // Reset node position to prevent any visual shift
        node.x(dragStartPosRef.current.x)
        node.y(dragStartPosRef.current.y)
        setDraggingAnnotationId(null)
        dragStartPosRef.current = null
        // Clear multi-drag state
        dragOriginalPositionsRef.current = null
        multiDragDeltaRef.current = null
        // Trigger the click handler
        handleAnnotationClick(annotation.id)
        return
      }
    }

    // Reset scale to 1
    node.scaleX(1)
    node.scaleY(1)

    // Get image dimensions for boundary constraints
    const imageWidth = konvaImageRef.current?.width
    const imageHeight = konvaImageRef.current?.height

    // CHECK: Is this a multi-drag operation?
    const isMultiDrag = dragOriginalPositionsRef.current !== null &&
                        dragOriginalPositionsRef.current.size > 1

    if (isMultiDrag) {
      // === MULTI-DRAG PATH ===
      console.log('[MULTI-DRAG] Processing group movement')

      const originalPositions = dragOriginalPositionsRef.current!
      const draggedOriginal = originalPositions.get(annotation.id)

      if (!draggedOriginal) {
        console.error('[MULTI-DRAG] Original position not found for dragged annotation')
        return
      }

      // Calculate delta based on annotation type
      let deltaX = 0
      let deltaY = 0

      if (annotation.type === 'rectangle') {
        // For rectangles: delta = current position - original position
        const currentX = node.x() / scale
        const currentY = node.y() / scale
        const originalRect = draggedOriginal.annotation as RectangleAnnotation
        deltaX = currentX - originalRect.x
        deltaY = currentY - originalRect.y
        console.log('[MULTI-DRAG] Rectangle delta:', { deltaX, deltaY })
      } else if (annotation.type === 'polygon') {
        // For polygons: node offset is the delta (since Line renders at 0,0)
        deltaX = node.x() / scale
        deltaY = node.y() / scale
        console.log('[MULTI-DRAG] Polygon delta:', { deltaX, deltaY })
      }

      // Apply delta to ALL selected annotations
      const updatedAnnotations: Annotation[] = []

      selectedAnnotations.forEach(id => {
        const ann = annotations.find(a => a.id === id)
        const original = originalPositions.get(id)

        if (!ann || !original) return

        if (ann.type === 'rectangle') {
          const origRect = original.annotation as RectangleAnnotation

          // Apply delta to original position
          let newX = origRect.x + deltaX
          let newY = origRect.y + deltaY
          let newWidth = origRect.width
          let newHeight = origRect.height

          // Individual clipping for this rectangle
          if (imageWidth && imageHeight) {
            const clipped = clipRectangleToBounds(
              newX, newY, newWidth, newHeight,
              imageWidth, imageHeight
            )
            newX = clipped.x
            newY = clipped.y
            newWidth = clipped.width
            newHeight = clipped.height
          }

          updatedAnnotations.push({
            ...ann,
            x: newX,
            y: newY,
            width: newWidth,
            height: newHeight,
          } as RectangleAnnotation)

        } else if (ann.type === 'polygon') {
          const origPoly = original.annotation as PolygonAnnotation

          // Apply delta to all points
          let newPoints = origPoly.points.map(p => ({
            x: p.x + deltaX,
            y: p.y + deltaY,
          }))

          // Individual clipping for this polygon
          if (imageWidth && imageHeight) {
            newPoints = clipPolygonPointsToBounds(newPoints, imageWidth, imageHeight)
          }

          updatedAnnotations.push({
            ...ann,
            points: newPoints,
            updatedAt: Date.now(),
          } as PolygonAnnotation)
        }
      })

      // Batch update all annotations
      if (updatedAnnotations.length > 0) {
        console.log('[MULTI-DRAG] Updating', updatedAnnotations.length, 'annotations')
        if (onUpdateManyAnnotations) {
          // Use batch update if available
          onUpdateManyAnnotations(updatedAnnotations)
        } else {
          // Fallback: sequential updates (less efficient)
          updatedAnnotations.forEach(ann => onUpdateAnnotation(ann))
        }

        // Store pending drag end for the dragged node
        pendingDragEndRef.current = { annotationId: annotation.id, node }
      }

      // Clear multi-drag state
      dragOriginalPositionsRef.current = null
      multiDragDeltaRef.current = null

    } else if (annotation.type === 'rectangle') {
      // === SINGLE-DRAG PATH (rectangles) ===
      // For Rect, node.x() and node.y() are the ABSOLUTE position on canvas after drag
      // We need to convert from canvas coordinates back to image coordinates
      // Canvas coords = image coords * scale, so image coords = canvas coords / scale
      const newX = node.x() / scale
      const newY = node.y() / scale
      const newWidth = (node.width() * scaleX) / scale
      const newHeight = (node.height() * scaleY) / scale

      console.log('[DRAG] Rectangle new position:', { newX, newY, newWidth, newHeight })

      // Apply CVAT-like clipping if image dimensions available
      let clippedX = newX
      let clippedY = newY
      let clippedWidth = newWidth
      let clippedHeight = newHeight

      if (imageWidth && imageHeight) {
        const clipped = clipRectangleToBounds(
          newX,
          newY,
          newWidth,
          newHeight,
          imageWidth,
          imageHeight
        )
        clippedX = clipped.x
        clippedY = clipped.y
        clippedWidth = clipped.width
        clippedHeight = clipped.height
      }

      const updatedAnnotation: RectangleAnnotation = {
        ...annotation,
        x: clippedX,
        y: clippedY,
        width: clippedWidth,
        height: clippedHeight,
      }

      // Store ref to clear dragging state after React updates
      pendingDragEndRef.current = { annotationId: annotation.id, node }

      // Update annotation - this triggers parent state update
      // The useLayoutEffect watching annotations will reset node position and clear dragging state
      onUpdateAnnotation(updatedAnnotation)
    } else if (annotation.type === 'polygon') {
      const poly = annotation as PolygonAnnotation

      // For Polygon (Line), node.x() and node.y() are the OFFSET from the original position
      // (since we render the Line at position 0,0 with points containing absolute coords)
      const offsetX = node.x() / scale
      const offsetY = node.y() / scale

      console.log('[DRAG] Polygon offset:', { offsetX, offsetY })

      // Update all polygon points with the offset
      let updatedPoints = poly.points.map(point => ({
        x: point.x + offsetX,
        y: point.y + offsetY,
      }))

      // Apply CVAT-like clipping if image dimensions available
      if (imageWidth && imageHeight) {
        updatedPoints = clipPolygonPointsToBounds(updatedPoints, imageWidth, imageHeight)
      }

      const updatedAnnotation: PolygonAnnotation = {
        ...poly,
        points: updatedPoints,
        updatedAt: Date.now(),
      }

      // Store ref to clear dragging state after React updates
      pendingDragEndRef.current = { annotationId: annotation.id, node }

      // Update annotation - this triggers parent state update
      // The useLayoutEffect watching annotations will reset node position and clear dragging state
      onUpdateAnnotation(updatedAnnotation)
    }
  }

  const handleTransformEnd = (annotation: Annotation, e: any) => {
    const node = e.target
    const scaleX = node.scaleX()
    const scaleY = node.scaleY()

    // Reset scale to 1 and adjust dimensions
    node.scaleX(1)
    node.scaleY(1)

    // Get image dimensions for boundary constraints
    const imageWidth = konvaImageRef.current?.width
    const imageHeight = konvaImageRef.current?.height

    // Note: Only divide by 'scale' (autofit scale), not zoomLevel
    // The Stage handles zoomLevel transform, so node positions are in Layer coordinates

    if (annotation.type === 'rectangle') {
      const newX = node.x() / scale
      const newY = node.y() / scale
      const newWidth = (node.width() * scaleX) / scale
      const newHeight = (node.height() * scaleY) / scale

      // Apply CVAT-like clipping if image dimensions available
      let clippedX = newX
      let clippedY = newY
      let clippedWidth = newWidth
      let clippedHeight = newHeight

      if (imageWidth && imageHeight) {
        const clipped = clipRectangleToBounds(
          newX,
          newY,
          newWidth,
          newHeight,
          imageWidth,
          imageHeight
        )
        clippedX = clipped.x
        clippedY = clipped.y
        clippedWidth = clipped.width
        clippedHeight = clipped.height
      }

      const updatedAnnotation: RectangleAnnotation = {
        ...annotation,
        x: clippedX,
        y: clippedY,
        width: clippedWidth,
        height: clippedHeight,
      }
      onUpdateAnnotation(updatedAnnotation)
    }
  }

  const handlePolygonPointDragStart = (annotation: PolygonAnnotation, pointIndex: number) => {
    setDraggingPoint({
      annotationId: annotation.id,
      pointIndex,
      x: annotation.points[pointIndex].x,
      y: annotation.points[pointIndex].y,
    })
  }

  const handlePolygonPointDragMove = (annotation: PolygonAnnotation, pointIndex: number, e: any) => {
    const node = e.target
    // Note: Only divide by 'scale' (autofit scale), not zoomLevel
    const newX = node.x() / scale
    const newY = node.y() / scale

    setDraggingPoint({
      annotationId: annotation.id,
      pointIndex,
      x: newX,
      y: newY,
    })
  }

  const handlePolygonPointDragEnd = (annotation: PolygonAnnotation, pointIndex: number, e: any) => {
    const node = e.target
    // Note: Only divide by 'scale' (autofit scale), not zoomLevel
    const newX = node.x() / scale
    const newY = node.y() / scale

    // Get image dimensions for boundary constraints
    const imageWidth = konvaImageRef.current?.width
    const imageHeight = konvaImageRef.current?.height

    // Apply CVAT-like clipping if image dimensions available
    let clippedX = newX
    let clippedY = newY

    if (imageWidth && imageHeight) {
      const clipped = clipPointToBounds(newX, newY, imageWidth, imageHeight)
      clippedX = clipped.x
      clippedY = clipped.y
    }

    const updatedPoints = [...annotation.points]
    updatedPoints[pointIndex] = { x: clippedX, y: clippedY }

    const updatedAnnotation: PolygonAnnotation = {
      ...annotation,
      points: updatedPoints,
      updatedAt: Date.now(),
    }

    // Set pending state to delay clearing draggingPoint until annotation updates
    // This prevents flickering when the component re-renders
    pendingPointDragEndRef.current = {
      annotationId: annotation.id,
      pointIndex,
      finalX: clippedX,
      finalY: clippedY,
    }

    onUpdateAnnotation(updatedAnnotation)
  }

  const handlePolygonPointDelete = (annotation: PolygonAnnotation, pointIndex: number) => {
    // Don't allow deletion if only 3 points remain (minimum for a polygon)
    if (annotation.points.length <= 3) {
      return
    }

    const updatedPoints = annotation.points.filter((_, idx) => idx !== pointIndex)
    const updatedAnnotation: PolygonAnnotation = {
      ...annotation,
      points: updatedPoints,
      updatedAt: Date.now(),
    }

    onUpdateAnnotation(updatedAnnotation)
  }

  const handlePolygonLineClick = (annotation: PolygonAnnotation, e: any) => {
    // Only add point if Ctrl/Cmd is pressed
    if (!isCtrlPressed) return

    const stage = e.target.getStage()
    const pos = stage.getPointerPosition()

    // Convert to original image coordinates (account for both zoom and autofit scale)
    const totalScale = scale * zoomLevel
    const clickX = (pos.x - stagePosition.x) / totalScale
    const clickY = (pos.y - stagePosition.y) / totalScale

    const poly = annotation as PolygonAnnotation

    // Find the nearest edge to insert the new point
    let minDistance = Infinity
    let insertIndex = 0

    for (let i = 0; i < poly.points.length; i++) {
      const p1 = poly.points[i]
      const p2 = poly.points[(i + 1) % poly.points.length]

      // Calculate distance from click point to line segment
      const distance = pointToLineSegmentDistance(
        { x: clickX, y: clickY },
        p1,
        p2
      )

      if (distance < minDistance) {
        minDistance = distance
        insertIndex = i + 1
      }
    }

    // Insert the new point after the first point of the nearest edge
    const updatedPoints = [...poly.points]
    updatedPoints.splice(insertIndex, 0, { x: clickX, y: clickY })

    const updatedAnnotation: PolygonAnnotation = {
      ...annotation,
      points: updatedPoints,
      updatedAt: Date.now(),
    }

    onUpdateAnnotation(updatedAnnotation)
  }

  // Helper function to calculate distance from point to line segment
  const pointToLineSegmentDistance = (
    point: { x: number; y: number },
    lineStart: { x: number; y: number },
    lineEnd: { x: number; y: number }
  ) => {
    const A = point.x - lineStart.x
    const B = point.y - lineStart.y
    const C = lineEnd.x - lineStart.x
    const D = lineEnd.y - lineStart.y

    const dot = A * C + B * D
    const lenSq = C * C + D * D
    let param = -1

    if (lenSq !== 0) param = dot / lenSq

    let xx, yy

    if (param < 0) {
      xx = lineStart.x
      yy = lineStart.y
    } else if (param > 1) {
      xx = lineEnd.x
      yy = lineEnd.y
    } else {
      xx = lineStart.x + param * C
      yy = lineStart.y + param * D
    }

    const dx = point.x - xx
    const dy = point.y - yy
    return Math.sqrt(dx * dx + dy * dy)
  }

  // Memoize visible annotations to prevent unnecessary re-renders
  const visibleAnnotations = useMemo(() => {
    console.log('[RENDER] Filtering annotations:', {
      totalAnnotations: annotations.length,
      annotationIds: annotations.map(a => ({ id: a.id, type: a.type, labelId: a.labelId }))
    })
    const visible = annotations.filter(isAnnotationVisible)
    console.log('[RENDER] Visible annotations:', {
      visibleCount: visible.length,
      hiddenCount: annotations.length - visible.length
    })
    return visible
  }, [annotations, isAnnotationVisible])

  if (!image) {
    return (
      <div className="w-full h-full flex items-center justify-center text-gray-400">
        <div className="text-center">
          <UploadIcon className="w-16 h-16 mx-auto mb-4 opacity-50" />
          <p>Upload an image to start annotating</p>
        </div>
      </div>
    )
  }

  // Determine cursor style based on tool and pan mode
  const getCursorStyle = () => {
    // Pan mode takes priority
    if (isPanMode) {
      return isDraggingStage ? 'grabbing' : 'grab'
    }
    if (selectedTool === 'rectangle' || selectedTool === 'polygon') {
      return 'crosshair'
    } else if (selectedTool === 'select') {
      return 'default'
    }
    return 'default'
  }

  return (
    <div
      ref={containerRef}
      className="w-full h-full flex items-center justify-center bg-gray-950 relative"
      style={{ cursor: getCursorStyle() }}
    >
      <Stage
        ref={stageRef}
        width={dimensions.width}
        height={dimensions.height}
        scaleX={zoomLevel}
        scaleY={zoomLevel}
        x={stagePosition.x}
        y={stagePosition.y}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onDblClick={handleDoubleClick}
      >
        <Layer>
          {/* Image */}
          {konvaImage && (
            <KonvaImage
              key="canvas-image"
              image={konvaImage}
              width={dimensions.width}
              height={dimensions.height}
            />
          )}

          {/* Image boundary border */}
          {konvaImage && (
            <Rect
              key="image-boundary"
              x={0}
              y={0}
              width={dimensions.width}
              height={dimensions.height}
              stroke="#4b5563"
              strokeWidth={getZoomAdjustedSize(2, zoomLevel)}
              fill="transparent"
              listening={false}
            />
          )}

          {/* Existing annotations */}
          {visibleAnnotations.map((annotation) => {
            const label = getLabel(annotation.labelId)
            const color = label?.color || '#f97316'
            const labelName = label?.name || 'Unknown'
            const isSelected = selectedAnnotations.includes(annotation.id)

            if (annotation.type === 'rectangle') {
              const rect = annotation as RectangleAnnotation
              const isDragging = draggingAnnotationId === annotation.id
              const isInMultiDrag = draggingAnnotationId !== null && selectedAnnotations.includes(annotation.id)
              const shouldHideLabel = isDragging || isInMultiDrag

              return (
                <React.Fragment key={`rect-group-${annotation.id}`}>
                  <Rect
                    key={`rect-${annotation.id}`}
                    id={`ann-${annotation.id}`}
                    x={rect.x * scale}
                    y={rect.y * scale}
                    width={rect.width * scale}
                    height={rect.height * scale}
                    stroke={color}
                    strokeWidth={getZoomAdjustedSize(ANNOTATION_STROKE_WIDTH, zoomLevel)}
                    strokeScaleEnabled={false}
                    strokeOpacity={ANNOTATION_STROKE_OPACITY}
                    fill={hexToRgba(
                      color,
                      isSelected ? ANNOTATION_FILL_OPACITY_SELECTED : ANNOTATION_FILL_OPACITY_UNSELECTED
                    )}
                    onClick={() => handleAnnotationClick(annotation.id)}
                    onTap={() => handleAnnotationClick(annotation.id)}
                    draggable={selectedTool === 'select'}
                    onDragStart={(e) => handleDragStart(annotation, e)}
                    onDragMove={(e) => handleDragMove(annotation, e)}
                    onDragEnd={(e) => handleDragEnd(annotation, e)}
                    onTransformEnd={(e) => handleTransformEnd(annotation, e)}
                  />
                  {/* Label text above rectangle - hide during drag */}
                  {!shouldHideLabel && (
                    <Text
                      key={`rect-label-${annotation.id}`}
                      x={rect.x * scale}
                      y={rect.y * scale - 20}
                      text={labelName}
                      fontSize={getZoomAdjustedSize(14, zoomLevel)}
                      fill="white"
                      padding={4}
                      listening={false}
                    />
                  )}
                </React.Fragment>
              )
            } else if (annotation.type === 'polygon') {
              const poly = annotation as PolygonAnnotation
              const isDragging = draggingAnnotationId === annotation.id
              const isInMultiDrag = draggingAnnotationId !== null && selectedAnnotations.includes(annotation.id)
              const shouldHideLabel = isDragging || isInMultiDrag
              const shouldHidePoints = isDragging || isInMultiDrag

              // Use dragging point if this polygon point is being edited (individual point drag)
              let displayPoints = poly.points
              if (draggingPoint && draggingPoint.annotationId === annotation.id) {
                displayPoints = poly.points.map((p, idx) =>
                  idx === draggingPoint.pointIndex
                    ? { x: draggingPoint.x, y: draggingPoint.y }
                    : p
                )
              }

              const points = displayPoints.flatMap(p => [p.x * scale, p.y * scale])

              return (
                <Group
                  key={`poly-group-${annotation.id}`}
                >
                  <Line
                    key={`poly-${annotation.id}`}
                    id={`ann-${annotation.id}`}
                    points={points}
                    stroke={color}
                    strokeWidth={getZoomAdjustedSize(ANNOTATION_STROKE_WIDTH, zoomLevel)}
                    strokeScaleEnabled={false}
                    strokeOpacity={ANNOTATION_STROKE_OPACITY}
                    fill={hexToRgba(
                      color,
                      isSelected ? ANNOTATION_FILL_OPACITY_SELECTED : ANNOTATION_FILL_OPACITY_UNSELECTED
                    )}
                    closed
                    draggable={selectedTool === 'select'}
                    onDragStart={(e) => handleDragStart(annotation, e)}
                    onDragMove={(e) => handleDragMove(annotation, e)}
                    onDragEnd={(e) => handleDragEnd(annotation, e)}
                    onClick={(e) => {
                      if (isCtrlPressed && isSelected) {
                        handlePolygonLineClick(poly, e)
                      } else {
                        handleAnnotationClick(annotation.id)
                      }
                    }}
                    onTap={() => handleAnnotationClick(annotation.id)}
                  />
                  {/* Label text above polygon - hide during drag */}
                  {displayPoints.length > 0 && !shouldHideLabel && (
                    <Text
                      key={`poly-label-${annotation.id}`}
                      x={displayPoints[0].x * scale}
                      y={displayPoints[0].y * scale - 20}
                      text={labelName}
                      fontSize={getZoomAdjustedSize(14, zoomLevel)}
                      fill="white"
                      padding={4}
                      listening={false}
                    />
                  )}
                  {/* Show polygon points as small circles - hide during drag */}
                  {isSelected && !shouldHidePoints && displayPoints.map((point, idx) => {
                    return (
                      <Circle
                        key={`poly-point-${annotation.id}-${idx}`}
                        x={point.x * scale}
                        y={point.y * scale}
                        radius={getZoomAdjustedSize(6, zoomLevel)}
                        fill={color}
                        stroke="white"
                        strokeWidth={getZoomAdjustedSize(2, zoomLevel)}
                        draggable={true}
                        onDragStart={(e) => {
                          e.cancelBubble = true // Prevent group drag
                          handlePolygonPointDragStart(poly, idx)
                        }}
                        onDragMove={(e) => {
                          e.cancelBubble = true // Prevent group drag
                          handlePolygonPointDragMove(poly, idx, e)
                        }}
                        onDragEnd={(e) => {
                          e.cancelBubble = true // Prevent group drag
                          // Reset circle position to scaled coordinates before updating annotation
                          // This prevents visual flickering when the annotation data updates
                          const node = e.target
                          const newX = node.x() / scale
                          const newY = node.y() / scale
                          node.x(newX * scale)
                          node.y(newY * scale)
                          handlePolygonPointDragEnd(poly, idx, e)
                        }}
                        onDblClick={(e) => {
                          e.cancelBubble = true // Prevent double-click propagation
                          handlePolygonPointDelete(poly, idx)
                        }}
                        onMouseEnter={(e) => {
                          const container = e.target.getStage()?.container()
                          if (container) container.style.cursor = 'pointer'
                        }}
                        onMouseLeave={(e) => {
                          const container = e.target.getStage()?.container()
                          if (container) container.style.cursor = getCursorStyle()
                        }}
                      />
                    )
                  })}
                </Group>
              )
            }
            return null
          })}

          {/* Prompt Bboxes (for bbox-prompt mode) */}
          {promptBboxes.map((bbox) => {
            const bboxLabel = getLabel(bbox.labelId)
            const bboxColor = bboxLabel?.color || '#3b82f6'
            const bboxLabelName = bboxLabel?.name || 'No Label'

            return (
              <React.Fragment key={`prompt-bbox-${bbox.id}`}>
                <Rect
                  x={bbox.x * scale}
                  y={bbox.y * scale}
                  width={bbox.width * scale}
                  height={bbox.height * scale}
                  stroke={bboxColor}
                  strokeWidth={getZoomAdjustedSize(2, zoomLevel)}
                  dash={[10, 5]}
                  fill={`${bboxColor}1A`}
                  listening={false}
                />
                <Text
                  x={bbox.x * scale}
                  y={bbox.y * scale - 20}
                  text={`${bboxLabelName} (Prompt)`}
                  fontSize={getZoomAdjustedSize(12, zoomLevel)}
                  fill={bboxColor}
                  padding={4}
                  listening={false}
                />
              </React.Fragment>
            )
          })}

          {/* Rectangle preview (point-to-point mode) */}
          {selectedTool === 'rectangle' && rectangleStartPoint && currentRectangle && (
            <React.Fragment key="rectangle-preview">
              <Rect
                key="current-rect"
                x={currentRectangle[0] * scale}
                y={currentRectangle[1] * scale}
                width={currentRectangle[2] * scale}
                height={currentRectangle[3] * scale}
                stroke={selectedLabelColor}
                strokeWidth={getZoomAdjustedSize(2, zoomLevel)}
                dash={[5, 5]}
                listening={false}
              />
              {/* Start point marker */}
              <Circle
                key="rect-start-marker"
                x={rectangleStartPoint.x * scale}
                y={rectangleStartPoint.y * scale}
                radius={getZoomAdjustedSize(6, zoomLevel)}
                fill={selectedLabelColor}
                listening={false}
              />
            </React.Fragment>
          )}

          {/* Polygon in progress */}
          {selectedTool === 'polygon' && polygonPoints.length > 0 && (
            <React.Fragment key="polygon-drawing">
              {/* Filled polygon preview including cursor position */}
              {mousePosition && polygonPoints.length >= 2 && (
                <Line
                  key="poly-fill-preview"
                  points={[
                    ...polygonPoints.flatMap(p => [p.x * scale, p.y * scale]),
                    isNearFirstPoint ? polygonPoints[0].x * scale : mousePosition.x * scale,
                    isNearFirstPoint ? polygonPoints[0].y * scale : mousePosition.y * scale,
                  ]}
                  fill={hexToRgba(selectedLabelColor, ANNOTATION_FILL_OPACITY_UNSELECTED)}
                  closed
                  listening={false}
                />
              )}
              {/* Lines connecting existing points (stroke only) */}
              <Line
                key="poly-lines"
                points={polygonPoints.flatMap(p => [p.x * scale, p.y * scale])}
                stroke={selectedLabelColor}
                strokeWidth={getZoomAdjustedSize(ANNOTATION_STROKE_WIDTH, zoomLevel)}
                strokeScaleEnabled={false}
                strokeOpacity={ANNOTATION_STROKE_OPACITY}
                dash={[5, 5]}
                listening={false}
              />
              {/* Line from last point to mouse position (preview stroke) */}
              {mousePosition && (
                <Line
                  key="poly-preview-line"
                  points={[
                    polygonPoints[polygonPoints.length - 1].x * scale,
                    polygonPoints[polygonPoints.length - 1].y * scale,
                    isNearFirstPoint ? polygonPoints[0].x * scale : mousePosition.x * scale,
                    isNearFirstPoint ? polygonPoints[0].y * scale : mousePosition.y * scale,
                  ]}
                  stroke={selectedLabelColor}
                  strokeWidth={getZoomAdjustedSize(ANNOTATION_STROKE_WIDTH, zoomLevel)}
                  dash={[3, 3]}
                  opacity={0.6}
                  listening={false}
                />
              )}
              {/* Existing polygon points */}
              {polygonPoints.map((point, idx) => (
                <Circle
                  key={`temp-poly-point-${idx}`}
                  x={point.x * scale}
                  y={point.y * scale}
                  radius={getZoomAdjustedSize(idx === 0 && isNearFirstPoint ? 8 : 5, zoomLevel)}
                  fill={idx === 0 && isNearFirstPoint ? '#10b981' : selectedLabelColor}
                  stroke={idx === 0 && isNearFirstPoint ? '#10b981' : undefined}
                  strokeWidth={idx === 0 && isNearFirstPoint ? getZoomAdjustedSize(2, zoomLevel) : 0}
                  listening={false}
                />
              ))}
              {/* Preview point at mouse position */}
              {mousePosition && !isNearFirstPoint && (
                <Circle
                  key="poly-preview-point"
                  x={mousePosition.x * scale}
                  y={mousePosition.y * scale}
                  radius={getZoomAdjustedSize(4, zoomLevel)}
                  fill={selectedLabelColor}
                  opacity={0.5}
                  listening={false}
                />
              )}
            </React.Fragment>
          )}

          {/* Crosshair lines for Rect and Polygon modes */}
          {(selectedTool === 'rectangle' || selectedTool === 'polygon') && mousePosition && (
            <React.Fragment key="crosshair">
              {/* Vertical crosshair line */}
              <Line
                key="crosshair-vertical"
                points={[mousePosition.x * scale, 0, mousePosition.x * scale, dimensions.height]}
                stroke="white"
                strokeWidth={getZoomAdjustedSize(1.5, zoomLevel)}
                dash={[8, 4]}
                opacity={0.8}
                listening={false}
              />
              {/* Horizontal crosshair line */}
              <Line
                key="crosshair-horizontal"
                points={[0, mousePosition.y * scale, dimensions.width, mousePosition.y * scale]}
                stroke="white"
                strokeWidth={getZoomAdjustedSize(1.5, zoomLevel)}
                dash={[8, 4]}
                opacity={0.8}
                listening={false}
              />
            </React.Fragment>
          )}

          {/* Transformer for selected annotation */}
          {selectedTool === 'select' && (
            <Transformer
              key="transformer"
              ref={transformerRef}
              keepRatio={isShiftPressed}
              rotateEnabled={false}
              enabledAnchors={[
                'top-left',
                'top-right',
                'bottom-left',
                'bottom-right',
                'middle-left',
                'middle-right',
                'top-center',
                'bottom-center',
              ]}
            />
          )}
        </Layer>
      </Stage>

      {/* Coordinate display - follows cursor */}
      {mousePosition && cursorScreenPosition && (selectedTool === 'rectangle' || selectedTool === 'polygon') && (
        <div
          className="absolute bg-gray-800/95 text-white px-1.5 py-0.5 rounded text-[10px] font-mono pointer-events-none leading-tight whitespace-nowrap"
          style={{
            left: `${cursorScreenPosition.x + 8}px`,
            top: `${cursorScreenPosition.y - 20}px`,
          }}
        >
          x={mousePosition.x}, y={mousePosition.y}
        </div>
      )}

      {/* Bounding box coordinates for selected annotations - hide during drag */}
      {/* Only show coordinates if exactly one annotation is selected */}
      {selectedAnnotations.length === 1 && draggingAnnotationId !== selectedAnnotations[0] && (() => {
        const annotation = annotations.find(a => a.id === selectedAnnotations[0])
        if (!annotation) return null

        let topLeft: { x: number; y: number } | null = null
        let bottomRight: { x: number; y: number } | null = null

        if (annotation.type === 'rectangle') {
          const rect = annotation as RectangleAnnotation
          topLeft = { x: Math.round(rect.x), y: Math.round(rect.y) }
          bottomRight = { x: Math.round(rect.x + rect.width), y: Math.round(rect.y + rect.height) }
        } else if (annotation.type === 'polygon') {
          const poly = annotation as PolygonAnnotation

          // Use dragging point if this polygon is being edited
          const bboxPoints = draggingPoint && draggingPoint.annotationId === annotation.id
            ? poly.points.map((p, idx) =>
                idx === draggingPoint.pointIndex
                  ? { x: draggingPoint.x, y: draggingPoint.y }
                  : p
              )
            : poly.points

          const xs = bboxPoints.map(p => p.x)
          const ys = bboxPoints.map(p => p.y)
          const minX = Math.min(...xs)
          const minY = Math.min(...ys)
          const maxX = Math.max(...xs)
          const maxY = Math.max(...ys)
          topLeft = { x: Math.round(minX), y: Math.round(minY) }
          bottomRight = { x: Math.round(maxX), y: Math.round(maxY) }
        }

        if (!topLeft || !bottomRight) return null

        // Get Stage and Container positions for proper positioning
        const stageBox = stageRef.current?.container().getBoundingClientRect()
        const containerBox = containerRef.current?.getBoundingClientRect()
        if (!stageBox || !containerBox) return null

        // Calculate offset from container to stage
        const offsetX = stageBox.left - containerBox.left
        const offsetY = stageBox.top - containerBox.top

        // Get label color for this annotation
        const label = getLabel(annotation.labelId)
        const labelColor = label?.color || '#f97316'

        // Account for both scale and zoom level, plus stage position
        const totalScale = scale * zoomLevel

        return (
          <React.Fragment key="bbox-coords">
            {/* Top-left coordinate */}
            <div
              className="absolute text-white px-1.5 py-0.5 rounded text-[10px] font-mono pointer-events-none leading-tight whitespace-nowrap"
              style={{
                backgroundColor: labelColor,
                opacity: 0.95,
                left: `${offsetX + stagePosition.x + topLeft.x * totalScale - 20}px`,
                top: `${offsetY + stagePosition.y + topLeft.y * totalScale - 30}px`,
              }}
            >
              x1={topLeft.x}, y1={topLeft.y}
            </div>
            {/* Bottom-right coordinate */}
            <div
              className="absolute text-white px-1.5 py-0.5 rounded text-[10px] font-mono pointer-events-none leading-tight whitespace-nowrap"
              style={{
                backgroundColor: labelColor,
                opacity: 0.95,
                left: `${offsetX + stagePosition.x + bottomRight.x * totalScale + 2}px`,
                top: `${offsetY + stagePosition.y + bottomRight.y * totalScale + 10}px`,
              }}
            >
              x2={bottomRight.x}, y2={bottomRight.y}
            </div>
          </React.Fragment>
        )
      })()}

      {/* Instructions overlay */}
      {selectedTool === 'polygon' && polygonPoints.length > 0 && (
        <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 bg-gray-800 text-white px-4 py-2 rounded shadow-lg text-sm">
          {isNearFirstPoint ? (
            <span className="text-green-400 font-semibold">Click to close polygon</span>
          ) : (
            <>Click to add points • Double-click to finish • Press Escape to cancel</>
          )}
        </div>
      )}
    </div>
  )
})

export default Canvas

function UploadIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
      className={className}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
      />
    </svg>
  )
}
