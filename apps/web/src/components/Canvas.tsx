import Konva from 'konva'
import React, { startTransition, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { Circle, Group, Image as KonvaImage, Layer, Line, Rect, Stage, Text, Transformer } from 'react-konva'
import type { Annotation, Label, PolygonAnnotation, RectangleAnnotation, Tool } from '../types/annotations'
import { AnnotationTooltip } from './canvas/AnnotationTooltip'

// Disable hover effects above this count to avoid expensive re-renders.
const HOVER_DISABLE_THRESHOLD = 300

// Helper function to adjust sizes for zoom (keep constant screen size when zooming in)
const getZoomAdjustedSize = (baseSize: number, zoomLevel: number): number => {
  return zoomLevel > 1 ? baseSize / zoomLevel : baseSize
}

const getZoomAdjustedStrokeWidth = (baseSize: number, zoomLevel: number): number => {
  if (zoomLevel <= 1) return baseSize
  const adjusted = baseSize / zoomLevel
  const minSize = 2
  return Math.max(adjusted, minSize)
}

const getZoomAdjustedHandleSize = (baseSize: number, zoomLevel: number): number => {
  if (zoomLevel <= 1) return baseSize
  const adjusted = baseSize / zoomLevel
  const minSize = 8
  return Math.max(adjusted, minSize)
}

// Memoized static rectangle annotation component
interface StaticRectAnnotationProps {
  annotation: RectangleAnnotation
  color: string
  labelName: string
  scale: number
  zoomLevel: number
  strokeWidth: number
  isHovered: boolean
  showLabels: boolean
  fillOpacity: number
  selectedFillOpacity: number
  onRegisterRef: (id: string, node: Konva.Node | null) => void
  onClick: (id: string) => void
  onMouseEnter?: (annotation: Annotation, e: any) => void
  onMouseLeave?: () => void
}

const StaticRectAnnotation = React.memo(function StaticRectAnnotation({
  annotation,
  color,
  labelName,
  scale,
  zoomLevel,
  strokeWidth,
  isHovered,
  showLabels,
  fillOpacity,
  selectedFillOpacity,
  onRegisterRef,
  onClick,
  onMouseEnter,
  onMouseLeave,
}: StaticRectAnnotationProps) {
  const LABEL_VISIBILITY_ZOOM_THRESHOLD = 0.5
  const ANNOTATION_STROKE_OPACITY = 0.9

  const hexToRgba = (hex: string, alpha: number): string => {
    const r = parseInt(hex.slice(1, 3), 16)
    const g = parseInt(hex.slice(3, 5), 16)
    const b = parseInt(hex.slice(5, 7), 16)
    return `rgba(${r}, ${g}, ${b}, ${alpha})`
  }

  return (
    <React.Fragment>
      <Rect
        ref={(node) => onRegisterRef(annotation.id, node)}
        id={`ann-${annotation.id}`}
        x={annotation.x * scale}
        y={annotation.y * scale}
        width={annotation.width * scale}
        height={annotation.height * scale}
        stroke={color}
        strokeWidth={getZoomAdjustedStrokeWidth(strokeWidth, zoomLevel)}
        strokeScaleEnabled={false}
        strokeOpacity={ANNOTATION_STROKE_OPACITY}
        fill={hexToRgba(color, isHovered ? selectedFillOpacity : fillOpacity)}
        perfectDrawEnabled={false}
        listening={true}
        hitStrokeWidth={10}
        onClick={() => onClick(annotation.id)}
        onTap={() => onClick(annotation.id)}
        onMouseEnter={onMouseEnter ? (e) => onMouseEnter(annotation, e) : undefined}
        onMouseLeave={onMouseLeave}
      />
      {showLabels && zoomLevel >= LABEL_VISIBILITY_ZOOM_THRESHOLD && (
        <Text
          x={annotation.x * scale}
          y={annotation.y * scale - 20}
          text={labelName}
          fontSize={getZoomAdjustedSize(14, zoomLevel)}
          fill="white"
          padding={4}
          perfectDrawEnabled={false}
          listening={false}
        />
      )}
    </React.Fragment>
  )
})

// Memoized static polygon annotation component
interface StaticPolygonAnnotationProps {
  annotation: PolygonAnnotation
  color: string
  labelName: string
  scale: number
  zoomLevel: number
  strokeWidth: number
  isHovered: boolean
  showLabels: boolean
  fillOpacity: number
  selectedFillOpacity: number
  onRegisterRef: (id: string, node: Konva.Node | null) => void
  onClick: (id: string) => void
  onMouseEnter?: (annotation: Annotation, e: any) => void
  onMouseLeave?: () => void
}

const StaticPolygonAnnotation = React.memo(function StaticPolygonAnnotation({
  annotation,
  color,
  labelName,
  scale,
  zoomLevel,
  strokeWidth,
  isHovered,
  showLabels,
  fillOpacity,
  selectedFillOpacity,
  onRegisterRef,
  onClick,
  onMouseEnter,
  onMouseLeave,
}: StaticPolygonAnnotationProps) {
  const LABEL_VISIBILITY_ZOOM_THRESHOLD = 0.5
  const ANNOTATION_STROKE_OPACITY = 0.9

  const hexToRgba = (hex: string, alpha: number): string => {
    const r = parseInt(hex.slice(1, 3), 16)
    const g = parseInt(hex.slice(3, 5), 16)
    const b = parseInt(hex.slice(5, 7), 16)
    return `rgba(${r}, ${g}, ${b}, ${alpha})`
  }

  const points = annotation.points.flatMap(p => [p.x * scale, p.y * scale])
  const firstPoint = annotation.points[0]

  return (
    <React.Fragment>
      <Line
        ref={(node) => onRegisterRef(annotation.id, node)}
        id={`ann-${annotation.id}`}
        points={points}
        stroke={color}
        strokeWidth={getZoomAdjustedStrokeWidth(strokeWidth, zoomLevel)}
        strokeScaleEnabled={false}
        strokeOpacity={ANNOTATION_STROKE_OPACITY}
        fill={hexToRgba(color, isHovered ? selectedFillOpacity : fillOpacity)}
        closed
        perfectDrawEnabled={false}
        listening={true}
        hitStrokeWidth={10}
        onClick={() => onClick(annotation.id)}
        onTap={() => onClick(annotation.id)}
        onMouseEnter={onMouseEnter ? (e) => onMouseEnter(annotation, e) : undefined}
        onMouseLeave={onMouseLeave}
      />
      {showLabels && firstPoint && zoomLevel >= LABEL_VISIBILITY_ZOOM_THRESHOLD && (
        <Text
          x={firstPoint.x * scale}
          y={firstPoint.y * scale - 20}
          text={labelName}
          fontSize={getZoomAdjustedSize(14, zoomLevel)}
          fill="white"
          padding={4}
          perfectDrawEnabled={false}
          listening={false}
        />
      )}
    </React.Fragment>
  )
})

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
  // Sync status indicator
  pendingChanges?: number // Number of unsaved changes for current image
  hasError?: boolean // Whether there's a sync error for current image
  // Appearance settings
  fillOpacity?: number       // 0-1, default 0 (no fill when unselected)
  selectedOpacity?: number   // 0-1, default 0.3 (fill when selected)
  strokeWidth?: number       // pixels, default 2
  showLabels?: boolean       // default false (hide labels)
  showPolygons?: boolean     // default true
  showRectangles?: boolean   // default true
  showHoverTooltips?: boolean // default true
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
  pendingChanges = 0,
  hasError = false,
  fillOpacity = 0,        // No fill when unselected by default
  selectedOpacity = 0.3,  // Fill shown when selected
  strokeWidth = 2,
  showLabels = false,     // Hide labels by default
  showPolygons = true,
  showRectangles = true,
  showHoverTooltips = true,
}: CanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<Konva.Stage>(null)
  const backgroundStageRef = useRef<Konva.Stage>(null)
  const transformerRef = useRef<Konva.Transformer>(null)
  const staticLayerRef = useRef<Konva.Layer>(null)
  const interactiveLayerRef = useRef<Konva.Layer>(null)
  const animationFrameRef = useRef<number | null>(null)
  const konvaImageRef = useRef<HTMLImageElement | null>(null)
  const zoomRef = useRef(zoomLevel)
  const stagePositionRef = useRef(stagePosition)
  const wheelCommitTimerRef = useRef<NodeJS.Timeout | null>(null)
  const zoomIdleTimerRef = useRef<NodeJS.Timeout | null>(null)
  const wheelRafRef = useRef<number | null>(null)
  const wheelDeltaRef = useRef(0)
  const wheelPointerRef = useRef<{ x: number; y: number } | null>(null)
  const selectionCommitRef = useRef<number | null>(null)
  const panCommitTimerRef = useRef<NodeJS.Timeout | null>(null)
  const selectionPendingRef = useRef<string[] | null>(null)
  const isZoomingRef = useRef(false)
  const isPanningRef = useRef(false)
  const frozenVisibleRef = useRef<Annotation[]>([])
  // Node reference cache for O(1) lookup instead of findOne() O(n) traversal
  const nodeRefMapRef = useRef<Map<string, Konva.Node>>(new Map())
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
  // Rubber-band selection state
  const [rubberBand, setRubberBand] = useState<{
    start: { x: number; y: number };
    end: { x: number; y: number };
  } | null>(null)
  // Hover tooltip state
  const [hoveredAnnotation, setHoveredAnnotation] = useState<{
    id: string
    bounds: { x: number; y: number; width: number; height: number }
  } | null>(null)
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  // Track if mouse is over tooltip to keep it visible
  const isMouseOverTooltipRef = useRef(false)
  // Cache container bounds to avoid getBoundingClientRect() on every hover (performance optimization)
  const containerBoundsRef = useRef<DOMRect | null>(null)
  const freezeVisibilityRef = useRef(false)
  // State trigger to force visibility recalculation after zoom ends
  // (refs don't trigger useMemo recalculation, so we need a state variable)
  const [visibilityVersion, setVisibilityVersion] = useState(0)

  const SNAP_DISTANCE = 10 // pixels in original image coordinates
  const hoverEnabled = showHoverTooltips && selectedTool === 'select' &&
    annotations.length <= HOVER_DISABLE_THRESHOLD
  const [localSelectedAnnotations, setLocalSelectedAnnotations] = useState<string[]>(selectedAnnotations)
  const selectedIds = localSelectedAnnotations
  const renderZoomLevel = isZoomingRef.current ? zoomRef.current : zoomLevel
  const renderStagePosition = (isZoomingRef.current || isPanningRef.current)
    ? stagePositionRef.current
    : stagePosition

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

  // Annotation appearance - use props with defaults
  const ANNOTATION_FILL_OPACITY_SELECTED = selectedOpacity  // Fill opacity when selected
  const ANNOTATION_FILL_OPACITY_UNSELECTED = fillOpacity  // Fill opacity when not selected
  const ANNOTATION_STROKE_OPACITY = 1  // Stroke/border opacity (always visible)
  const ANNOTATION_STROKE_WIDTH = Math.max(1, strokeWidth)  // Stroke/border width in pixels
  const LABEL_VISIBILITY_ZOOM_THRESHOLD = 0.3  // Hide labels when zoomed out below this level
  const transformerAnchorSize = getZoomAdjustedHandleSize(12, renderZoomLevel)
  const transformerAnchorStrokeWidth = getZoomAdjustedStrokeWidth(2, renderZoomLevel)

  // Helper function to convert hex color to rgba with opacity
  const hexToRgba = (hex: string, opacity: number): string => {
    const r = parseInt(hex.slice(1, 3), 16)
    const g = parseInt(hex.slice(3, 5), 16)
    const b = parseInt(hex.slice(5, 7), 16)
    return `rgba(${r}, ${g}, ${b}, ${opacity})`
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
          // Cache container bounds for tooltip positioning (avoids getBoundingClientRect on every hover)
          containerBoundsRef.current = containerRef.current.getBoundingClientRect()
        }
      })
    })

    // Initial cache of container bounds
    containerBoundsRef.current = containerRef.current.getBoundingClientRect()

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
      if (wheelRafRef.current !== null) {
        cancelAnimationFrame(wheelRafRef.current)
      }
      if (wheelCommitTimerRef.current) {
        clearTimeout(wheelCommitTimerRef.current)
      }
      if (zoomIdleTimerRef.current) {
        clearTimeout(zoomIdleTimerRef.current)
      }
      if (selectionCommitRef.current !== null) {
        cancelAnimationFrame(selectionCommitRef.current)
      }
      if (panCommitTimerRef.current) {
        clearTimeout(panCommitTimerRef.current)
      }
    }
  }, [])

  useEffect(() => {
    if (!isZoomingRef.current) {
      zoomRef.current = zoomLevel
    }
  }, [zoomLevel])

  useEffect(() => {
    if (!isZoomingRef.current && !isPanningRef.current) {
      stagePositionRef.current = stagePosition
    }
  }, [stagePosition.x, stagePosition.y])

  useLayoutEffect(() => {
    if (!stageRef.current || !backgroundStageRef.current) return
    // Skip during active zooming - handleWheel already applied transforms directly
    // This prevents redundant batchDraw() calls that cause flickering
    if (isZoomingRef.current || isPanningRef.current) return

    stageRef.current.scale({ x: zoomLevel, y: zoomLevel })
    stageRef.current.position(stagePosition)
    stageRef.current.batchDraw()
    backgroundStageRef.current.scale({ x: zoomLevel, y: zoomLevel })
    backgroundStageRef.current.position(stagePosition)
    backgroundStageRef.current.batchDraw()
  }, [zoomLevel, stagePosition.x, stagePosition.y])

  useEffect(() => {
    const currentSet = new Set(localSelectedAnnotations)
    const incomingSet = new Set(selectedAnnotations)
    const isSame =
      currentSet.size === incomingSet.size &&
      localSelectedAnnotations.every(id => incomingSet.has(id))

    const pending = selectionPendingRef.current
    if (pending) {
      const pendingSet = new Set(pending)
      const pendingMatches =
        pendingSet.size === incomingSet.size &&
        pending.every(id => incomingSet.has(id))

      if (pendingMatches) {
        selectionPendingRef.current = null
        if (!isSame) {
          setLocalSelectedAnnotations(selectedAnnotations)
        }
      }
      return
    }

    if (!isSame) {
      setLocalSelectedAnnotations(selectedAnnotations)
    }
  }, [selectedAnnotations, localSelectedAnnotations])

  // Update transformer when selection changes (rectangles only)
  useEffect(() => {
    if (transformerRef.current && stageRef.current && selectedTool === 'select') {
      if (selectedIds.length > 0) {
        // For multi-select, attach transformer to all selected rectangles
        // Use cached node refs for O(1) lookup instead of findOne() O(n) traversal
        const selectedNodes = selectedIds
          .map(id => {
            const annotation = annotations.find(a => a.id === id)
            if (!annotation || annotation.type !== 'rectangle') return null
            // Try cached ref first (O(1)), fallback to findOne (O(n)) if not cached yet
            const cachedNode = nodeRefMapRef.current.get(id)
            if (cachedNode) return cachedNode
            return stageRef.current?.findOne(`#ann-${id}`)
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
  }, [selectedIds, selectedTool, annotations])

  // Performance optimization: Cache complex polygons with many points
  // Caching rasterizes the shape to a bitmap, avoiding expensive path recalculation
  const POLYGON_CACHE_THRESHOLD = 20 // Cache polygons with more than this many points
  useEffect(() => {
    if (!stageRef.current) return

    // Find and cache complex polygons in the static layer
    annotations.forEach(ann => {
      if (ann.type === 'polygon') {
        const poly = ann as PolygonAnnotation
        if (poly.points.length > POLYGON_CACHE_THRESHOLD) {
          const shape = stageRef.current?.findOne(`#ann-${ann.id}`) as Konva.Shape | undefined
          if (shape && !shape.isCached()) {
            try {
              shape.cache()
            } catch {
              // Caching can fail for zero-sized shapes - ignore silently
            }
          }
        }
      }
    })
  }, [annotations, scale, zoomLevel])

  // Create label lookup map for O(1) access instead of O(n) search
  const labelMap = useMemo(() => {
    const map = new Map<string, Label>()
    labels.forEach(label => map.set(label.id, label))
    return map
  }, [labels])

  const getLabel = (labelId: string) => {
    return labelMap.get(labelId)
  }

  const annotationsById = useMemo(() => {
    const map = new Map<string, Annotation>()
    annotations.forEach(annotation => {
      map.set(annotation.id, annotation)
    })
    return map
  }, [annotations])

  const transformerColor = useMemo(() => {
    if (selectedIds.length === 1) {
      const ann = annotations.find(a => a.id === selectedIds[0])
      const label = ann ? labelMap.get(ann.labelId) : null
      return label?.color || '#f97316'
    }
    return '#f97316'
  }, [annotations, labelMap, selectedIds])

  // Register/unregister node references for O(1) transformer lookup
  const registerNodeRef = useCallback((id: string, node: Konva.Node | null) => {
    if (node) {
      nodeRefMapRef.current.set(id, node)
    } else {
      nodeRefMapRef.current.delete(id)
    }
  }, [])

  // Check if an annotation should be visible based on annotation visibility
  const isAnnotationVisible = useMemo(() => {
    return (annotation: Annotation): boolean => {
      if (annotation.type === 'rectangle' && !showRectangles) return false
      if (annotation.type === 'polygon' && !showPolygons) return false
      // Check annotation's own visibility (default to true if undefined)
      const annotationVisible = annotation.isVisible ?? true
      if (!annotationVisible) return false

      const label = labelMap.get(annotation.labelId)
      if (!label) return false

      return true
    }
  }, [labelMap, showPolygons, showRectangles])

  // Performance optimization: Viewport culling - only render annotations in view
  // This is especially important when zoomed in on a portion of the image
  const getAnnotationBounds = useCallback((annotation: Annotation): { x: number; y: number; width: number; height: number } => {
    if (annotation.type === 'rectangle') {
      const rect = annotation as RectangleAnnotation
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
    } else if (annotation.type === 'polygon') {
      const poly = annotation as PolygonAnnotation
      if (poly.points.length === 0) return { x: 0, y: 0, width: 0, height: 0 }
      const xs = poly.points.map(p => p.x)
      const ys = poly.points.map(p => p.y)
      const minX = Math.min(...xs)
      const maxX = Math.max(...xs)
      const minY = Math.min(...ys)
      const maxY = Math.max(...ys)
      return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
    }
    return { x: 0, y: 0, width: 0, height: 0 }
  }, [])

  const isInViewport = useCallback((annotation: Annotation): boolean => {
    // Get viewport bounds in original image coordinates
    const currentZoom = isZoomingRef.current ? zoomRef.current : zoomLevel
    const currentStagePosition = (isZoomingRef.current || isPanningRef.current)
      ? stagePositionRef.current
      : stagePosition
    const viewportBounds = {
      x: -currentStagePosition.x / (scale * currentZoom),
      y: -currentStagePosition.y / (scale * currentZoom),
      width: dimensions.width / (scale * currentZoom),
      height: dimensions.height / (scale * currentZoom),
    }

    const annBounds = getAnnotationBounds(annotation)

    // Check AABB intersection with some padding for edge cases
    const padding = 50 // pixels in original coords
    return !(
      annBounds.x + annBounds.width + padding < viewportBounds.x ||
      annBounds.x - padding > viewportBounds.x + viewportBounds.width ||
      annBounds.y + annBounds.height + padding < viewportBounds.y ||
      annBounds.y - padding > viewportBounds.y + viewportBounds.height
    )
  }, [stagePosition, scale, zoomLevel, dimensions, getAnnotationBounds])

  const calculateDistance = (p1: { x: number; y: number }, p2: { x: number; y: number }) => {
    return Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2))
  }

  // Zoom constants
  const MIN_ZOOM = 0.1
  const MAX_ZOOM = 5

  // Handle mouse wheel for zooming
  const handleWheel = (e: any) => {
    e.evt.preventDefault()

    if (!onZoomChange || !stageRef.current) return

    freezeVisibilityRef.current = true

    if (hoveredAnnotation) {
      setHoveredAnnotation(null)
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current)
        hoverTimeoutRef.current = null
      }
      isMouseOverTooltipRef.current = false
    }

    const stage = stageRef.current
    const pointer = stage.getPointerPosition()
    if (pointer) {
      wheelPointerRef.current = pointer
    }

    const LIMIT_DELTA_Y = 8
    const clampedDelta = Math.max(-LIMIT_DELTA_Y, Math.min(LIMIT_DELTA_Y, e.evt.deltaY))
    wheelDeltaRef.current += clampedDelta

    if (wheelRafRef.current !== null) return

    wheelRafRef.current = requestAnimationFrame(() => {
      wheelRafRef.current = null
      const deltaY = Math.max(-LIMIT_DELTA_Y * 3, Math.min(LIMIT_DELTA_Y * 3, wheelDeltaRef.current))
      wheelDeltaRef.current = 0

      const currentPointer = wheelPointerRef.current ?? stage.getPointerPosition()
      if (!currentPointer) return

      const oldScale = zoomRef.current
      const basicZoomCoef = 6 / 5
      const adjustCoef = 1 / 10
      const scaleFactor = basicZoomCoef ** (-deltaY * adjustCoef)
      const newScale = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, oldScale * scaleFactor))

      if (newScale === oldScale) return

      const mousePointTo = {
        x: (currentPointer.x - stagePositionRef.current.x) / oldScale,
        y: (currentPointer.y - stagePositionRef.current.y) / oldScale,
      }

      const newPos = {
        x: currentPointer.x - mousePointTo.x * newScale,
        y: currentPointer.y - mousePointTo.y * newScale,
      }

      isZoomingRef.current = true

      // Disable static layer event listening during zoom for better performance
      if (staticLayerRef.current) {
        staticLayerRef.current.listening(false)
      }

      if (zoomIdleTimerRef.current) {
        clearTimeout(zoomIdleTimerRef.current)
      }
      zoomIdleTimerRef.current = setTimeout(() => {
        isZoomingRef.current = false
        freezeVisibilityRef.current = false
        zoomIdleTimerRef.current = null
        // Re-enable static layer event listening after zoom ends
        if (staticLayerRef.current) {
          staticLayerRef.current.listening(true)
        }
        // Trigger visibility recalculation to show annotations in new viewport
        setVisibilityVersion(v => v + 1)
      }, 200) // Extended from 150ms to better handle rapid zoom sequences

      zoomRef.current = newScale
      stagePositionRef.current = newPos

      stage.scale({ x: newScale, y: newScale })
      stage.position(newPos)
      stage.batchDraw()
      const backgroundStage = backgroundStageRef.current
      if (backgroundStage) {
        backgroundStage.scale({ x: newScale, y: newScale })
        backgroundStage.position(newPos)
        backgroundStage.batchDraw()
      }

      if (wheelCommitTimerRef.current) {
        clearTimeout(wheelCommitTimerRef.current)
      }

      wheelCommitTimerRef.current = setTimeout(() => {
        startTransition(() => {
          onZoomChange(newScale)
          onStagePositionChange?.(newPos)
        })
      }, 100) // Increased from 80ms for better batching of rapid wheel events
    })
  }

  const handleMouseDown = (e: any) => {
    // If Space is held (pan mode), start panning regardless of tool or target
    if (isPanMode) {
      const stage = e.target.getStage()
      const pos = stage.getPointerPosition()
      if (pos) {
        setIsDraggingStage(true)
        isPanningRef.current = true
        const currentStagePosition = stagePositionRef.current
        setStageDragStart({ x: pos.x - currentStagePosition.x, y: pos.y - currentStagePosition.y })
      }
      return // Don't process other interactions while in pan mode
    }

    if (selectedTool === 'select') {
      const stage = e.target.getStage()
      if (!stage) return

      const isTransformerHandle =
        e.target.getParent()?.getClassName?.() === 'Transformer' ||
        e.target.getClassName?.() === 'Transformer'

      if (isTransformerHandle) {
        return
      }

      const clickedOnStage = e.target === stage || e.target.getClassName?.() === 'Stage'
      if (!clickedOnStage) {
        // Let shape handlers manage selection, dragging, and transforms.
        setIsDraggingStage(false)
        setStageDragStart(null)
        return
      }

      // Clicked on empty area (stage or image background)
      // Clear tooltip immediately for better performance
      if (hoveredAnnotation) {
        setHoveredAnnotation(null)
        if (hoverTimeoutRef.current) {
          clearTimeout(hoverTimeoutRef.current)
          hoverTimeoutRef.current = null
        }
      }

      // Clear selection unless Shift is pressed (non-blocking update)
      if (!isShiftPressed) {
        commitSelection([])
      }

      // Only start rubber-band if we have a valid position
      const pos = stage?.getPointerPosition()
      if (pos) {
        const currentZoom = zoomRef.current
        const currentStagePosition = stagePositionRef.current
        const originalX = (pos.x - currentStagePosition.x) / (scale * currentZoom)
        const originalY = (pos.y - currentStagePosition.y) / (scale * currentZoom)
        setRubberBand({
          start: { x: originalX, y: originalY },
          end: { x: originalX, y: originalY },
        })
      }
      return
    }

    const stage = e.target.getStage()
    const pos = stage.getPointerPosition()

    // Convert to original image coordinates (account for both zoom and autofit scale)
    const currentZoom = zoomRef.current
    const currentStagePosition = stagePositionRef.current
    const originalX = (pos.x - currentStagePosition.x) / (scale * currentZoom)
    const originalY = (pos.y - currentStagePosition.y) / (scale * currentZoom)

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
    const currentZoom = zoomRef.current
    const currentStagePosition = stagePositionRef.current

    // Handle manual stage panning (works in pan mode or select mode)
    if (isDraggingStage && stageDragStart && (isPanMode || selectedTool === 'select')) {
      const newPos = {
        x: pos.x - stageDragStart.x,
        y: pos.y - stageDragStart.y,
      }
      stagePositionRef.current = newPos
      stage.position(newPos)
      stage.batchDraw()
      const backgroundStage = backgroundStageRef.current
      if (backgroundStage) {
        backgroundStage.position(newPos)
        backgroundStage.batchDraw()
      }
      if (panCommitTimerRef.current) {
        clearTimeout(panCommitTimerRef.current)
      }
      panCommitTimerRef.current = setTimeout(() => {
        startTransition(() => {
          onStagePositionChange?.(newPos)
        })
      }, 50)
      return
    }

    // Handle rubber-band selection drag
    if (rubberBand) {
      const originalX = (pos.x - currentStagePosition.x) / (scale * currentZoom)
      const originalY = (pos.y - currentStagePosition.y) / (scale * currentZoom)
      setRubberBand(prev => prev ? { ...prev, end: { x: originalX, y: originalY } } : null)
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
      const originalX = (pos.x - currentStagePosition.x) / (scale * currentZoom)
      const originalY = (pos.y - currentStagePosition.y) / (scale * currentZoom)

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
  }, [isDraggingStage, stageDragStart, isPanMode, selectedTool, onStagePositionChange, scale, polygonPoints, rectangleStartPoint, rubberBand])

  const handleMouseUp = () => {
    // Rectangle creation now happens on second click in handleMouseDown
    // This function is kept for compatibility but no longer handles rectangle drag

    // Handle rubber-band selection completion
    if (rubberBand) {
      // Calculate selection bounds
      const bounds = {
        x: Math.min(rubberBand.start.x, rubberBand.end.x),
        y: Math.min(rubberBand.start.y, rubberBand.end.y),
        width: Math.abs(rubberBand.end.x - rubberBand.start.x),
        height: Math.abs(rubberBand.end.y - rubberBand.start.y),
      }

      // Only select if rubber-band has meaningful size (not just a click)
      if (bounds.width > 5 || bounds.height > 5) {
        // Find all visible annotations that intersect with the rubber-band bounds
        const rubberBandIds = visibleAnnotations
          .filter(ann => annotationIntersectsRect(ann, bounds))
          .map(ann => ann.id)

        if (rubberBandIds.length > 0) {
          // If Shift is held, add to existing selection; otherwise replace
          if (isShiftPressed) {
            const newSelection = [...new Set([...selectedIds, ...rubberBandIds])]
            commitSelection(newSelection)
          } else {
            commitSelection(rubberBandIds)
          }
          console.log('[RUBBER-BAND] Selected', rubberBandIds.length, 'annotations')
        }
      }

      // Clear rubber-band
      setRubberBand(null)
      return
    }

    // Stop manual stage panning on mouse up
    if (isDraggingStage) {
      if (panCommitTimerRef.current) {
        clearTimeout(panCommitTimerRef.current)
        panCommitTimerRef.current = null
      }
      startTransition(() => {
        onStagePositionChange?.(stagePositionRef.current)
      })
    }
    setIsDraggingStage(false)
    isPanningRef.current = false
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

  /**
   * Check if annotation intersects with rubber-band selection bounds
   * Used for rubber-band multi-select
   */
  const annotationIntersectsRect = (
    annotation: Annotation,
    bounds: { x: number; y: number; width: number; height: number }
  ): boolean => {
    let annBounds: { x: number; y: number; width: number; height: number }

    if (annotation.type === 'rectangle') {
      const rect = annotation as RectangleAnnotation
      annBounds = { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
    } else if (annotation.type === 'polygon') {
      const poly = annotation as PolygonAnnotation
      if (poly.points.length === 0) return false
      const xs = poly.points.map(p => p.x)
      const ys = poly.points.map(p => p.y)
      annBounds = {
        x: Math.min(...xs),
        y: Math.min(...ys),
        width: Math.max(...xs) - Math.min(...xs),
        height: Math.max(...ys) - Math.min(...ys),
      }
    } else {
      return false
    }

    // AABB intersection test
    return !(
      annBounds.x + annBounds.width < bounds.x ||
      bounds.x + bounds.width < annBounds.x ||
      annBounds.y + annBounds.height < bounds.y ||
      bounds.y + bounds.height < annBounds.y
    )
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
        if (selectedIds.length > 0) {
          const annotationToCopy = annotations.find(a => a.id === selectedIds[0])
          if (annotationToCopy) {
            setCopiedAnnotation(annotationToCopy)
            toast.success(selectedIds.length === 1 ? 'Annotation copied' : 'First annotation copied')
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
            const currentZoom = zoomRef.current
            const currentStagePosition = stagePositionRef.current
            pasteX = (pointerPos.x - currentStagePosition.x) / (scale * currentZoom)
            pasteY = (pointerPos.y - currentStagePosition.y) / (scale * currentZoom)
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
  }, [selectedTool, isPanMode, selectedIds, annotations, copiedAnnotation, onAddAnnotation])

  // Reset drawing states when image changes
  useEffect(() => {
    setCurrentRectangle(null)
    setRectangleStartPoint(null)
    setPolygonPoints([])
    setIsNearFirstPoint(false)
    setMousePosition(null)
    setCursorScreenPosition(null)
    setHoveredAnnotation(null)
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current)
      hoverTimeoutRef.current = null
    }
    isMouseOverTooltipRef.current = false
  }, [image])

  // Handle annotation selection with Shift+Click support for multi-select
  const commitSelection = useCallback((nextSelection: string[]) => {
    setLocalSelectedAnnotations(nextSelection)
    selectionPendingRef.current = nextSelection
    if (selectionCommitRef.current !== null) {
      cancelAnimationFrame(selectionCommitRef.current)
    }
    selectionCommitRef.current = requestAnimationFrame(() => {
      onSelectAnnotations(nextSelection)
    })
  }, [onSelectAnnotations])

  const handleAnnotationClick = useCallback((annotationId: string) => {
    if (isShiftPressed) {
      // Shift+Click: Toggle annotation in selection
      if (selectedIds.includes(annotationId)) {
        commitSelection(selectedIds.filter(id => id !== annotationId))
      } else {
        commitSelection([...selectedIds, annotationId])
      }
    } else {
      // Normal click: Select only this annotation
      commitSelection([annotationId])
    }
  }, [isShiftPressed, selectedIds, commitSelection])

  // Pre-compute annotation bounds for tooltip positioning (performance optimization)
  // This avoids expensive calculations on every hover event
  const annotationBoundsMap = useMemo(() => {
    if (!hoverEnabled) {
      return new Map<string, { x: number; y: number; width: number; height: number }>()
    }

    const boundsMap = new Map<string, { x: number; y: number; width: number; height: number }>()

    for (const ann of annotations) {
      if (ann.type === 'rectangle') {
        const rect = ann as RectangleAnnotation
        boundsMap.set(ann.id, {
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
        })
      } else if (ann.type === 'polygon') {
        const poly = ann as PolygonAnnotation
        if (poly.points.length > 0) {
          // Single pass O(n) instead of 4x O(n) with map/spread
          let minX = poly.points[0].x
          let minY = poly.points[0].y
          let maxX = minX
          let maxY = minY

          for (let i = 1; i < poly.points.length; i++) {
            const p = poly.points[i]
            if (p.x < minX) minX = p.x
            if (p.x > maxX) maxX = p.x
            if (p.y < minY) minY = p.y
            if (p.y > maxY) maxY = p.y
          }

          boundsMap.set(ann.id, {
            x: minX,
            y: minY,
            width: maxX - minX,
            height: maxY - minY,
          })
        }
      }
    }

    return boundsMap
  }, [annotations, hoverEnabled])

  useEffect(() => {
    if (!hoverEnabled && hoveredAnnotation) {
      setHoveredAnnotation(null)
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current)
        hoverTimeoutRef.current = null
      }
    }
  }, [hoverEnabled, hoveredAnnotation])

  // Handle annotation hover for tooltip (optimized - uses cached bounds)
  const handleAnnotationMouseEnter = useCallback((annotation: Annotation, _e: any) => {
    if (!hoverEnabled) return
    if (isZoomingRef.current) return
    console.log('[Canvas] Hover annotation:', annotation.id, 'draggingId:', draggingAnnotationId)
    // Don't show tooltip while dragging
    if (draggingAnnotationId) return

    // Debounce to avoid flickering on quick mouse movements
    hoverTimeoutRef.current = setTimeout(() => {
      // Use cached container bounds (no getBoundingClientRect - avoids browser reflow!)
      const containerBox = containerBoundsRef.current
      if (!containerBox) return

      // Use pre-computed annotation bounds from useMemo (no expensive calculations!)
      const annBounds = annotationBoundsMap.get(annotation.id)
      if (!annBounds) return

      // Calculate screen coordinates from cached bounds
      const currentZoom = zoomRef.current
      const currentStagePosition = stagePositionRef.current
      const bounds = {
        x: containerBox.left + currentStagePosition.x + (annBounds.x * scale * currentZoom),
        y: containerBox.top + currentStagePosition.y + (annBounds.y * scale * currentZoom),
        width: annBounds.width * scale * currentZoom,
        height: annBounds.height * scale * currentZoom,
      }

      setHoveredAnnotation({
        id: annotation.id,
        bounds,
      })
    }, 150) // 150ms delay before showing tooltip
  }, [hoverEnabled, draggingAnnotationId, scale, annotationBoundsMap])

  const handleAnnotationMouseLeave = useCallback(() => {
    if (!hoverEnabled) return
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current)
      hoverTimeoutRef.current = null
    }
    // Delay hiding to allow mouse to enter tooltip
    setTimeout(() => {
      if (!isMouseOverTooltipRef.current) {
        setHoveredAnnotation(null)
      }
    }, 100)
  }, [hoverEnabled])

  // Tooltip mouse handlers
  const handleTooltipMouseEnter = useCallback(() => {
    isMouseOverTooltipRef.current = true
  }, [])

  const handleTooltipMouseLeave = useCallback(() => {
    isMouseOverTooltipRef.current = false
    setHoveredAnnotation(null)
  }, [])

  // Handle drag start - initialize dragging state
  const handleDragStart = (annotation: Annotation, e: any) => {
    setDraggingAnnotationId(annotation.id)
    // Hide tooltip when dragging starts
    setHoveredAnnotation(null)
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current)
      hoverTimeoutRef.current = null
    }
    // Store initial position to detect click vs drag
    const node = e.target
    dragStartPosRef.current = {
      x: node.x(),
      y: node.y()
    }

    // Multi-drag: Store original positions of ALL selected annotations
    if (selectedIds.length > 1 && selectedIds.includes(annotation.id)) {
      const originalPositions = new Map<string, { annotation: Annotation }>()

      selectedIds.forEach(id => {
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
      selectedIds.forEach(id => {
        if (id === annotation.id) return // Skip the dragged one (it's already moving)

        const original = originalPositions.get(id)
        if (!original) return

        const targetNode = nodeRefMapRef.current.get(id) as any
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

    // Clear cache for this shape (it will be re-cached if still complex enough)
    if (node.isCached?.()) {
      node.clearCache()
    }

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

      selectedIds.forEach(id => {
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

    // Get image dimensions for boundary constraints
    const imageWidth = konvaImageRef.current?.width
    const imageHeight = konvaImageRef.current?.height

    // Note: Only divide by 'scale' (autofit scale), not zoomLevel
    // The Stage handles zoomLevel transform, so node positions are in Layer coordinates

    if (annotation.type === 'rectangle') {
      // Reset scale to 1 and adjust dimensions
      node.scaleX(1)
      node.scaleY(1)

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

    // Clear cache for the parent polygon (if cached) since points changed
    const polygonShape = stageRef.current?.findOne(`#ann-${annotation.id}`) as Konva.Shape | undefined
    if (polygonShape?.isCached?.()) {
      polygonShape.clearCache()
    }

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
    const totalScale = scale * zoomRef.current
    const currentStagePosition = stagePositionRef.current
    const clickX = (pos.x - currentStagePosition.x) / totalScale
    const clickY = (pos.y - currentStagePosition.y) / totalScale

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

  const visibleInViewport = useMemo(() => {
    if (freezeVisibilityRef.current && frozenVisibleRef.current.length > 0) {
      return frozenVisibleRef.current
    }

    const visible = annotations.filter(isAnnotationVisible)
    const inView = visible.filter(isInViewport)

    if (!freezeVisibilityRef.current || frozenVisibleRef.current.length === 0) {
      frozenVisibleRef.current = inView
    }

    return inView
    // visibilityVersion forces recalculation when zoom ends (refs don't trigger useMemo)
  }, [annotations, isAnnotationVisible, isInViewport, visibilityVersion])

  // Selected annotations are always rendered regardless of viewport.
  const visibleAnnotations = useMemo(() => {
    if (selectedIds.length === 0) return visibleInViewport

    const combined = [...visibleInViewport]
    const visibleSet = new Set(visibleInViewport.map(ann => ann.id))

    selectedIds.forEach(id => {
      if (!visibleSet.has(id)) {
        const annotation = annotationsById.get(id)
        if (annotation && isAnnotationVisible(annotation)) {
          combined.push(annotation)
        }
      }
    })

    return combined
  }, [visibleInViewport, selectedIds, annotationsById, isAnnotationVisible])

  const konvaAnnotations = visibleAnnotations

  // Performance optimization: Split annotations into static vs interactive layers
  // Static layer has listening={false} and won't redraw when interactive layer changes
  // This is especially important in basic mode (< 100 annotations) where all are in Konva
  // NOTE: Hover no longer moves annotations between layers (was causing FPS drops)
  const { staticAnnotations, interactiveAnnotations } = useMemo(() => {
    const selectedSet = new Set(selectedIds)
    const staticAnns: Annotation[] = []
    const interactiveAnns: Annotation[] = []

    for (const ann of konvaAnnotations) {
      // Only selected annotations go to interactive layer (not hovered - for performance)
      if (selectedSet.has(ann.id)) {
        interactiveAnns.push(ann)
      } else {
        staticAnns.push(ann)
      }
    }

    return { staticAnnotations: staticAnns, interactiveAnnotations: interactiveAnns }
  }, [konvaAnnotations, selectedIds])

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
      {/* Layer 0: Image background */}
      <Stage
        ref={backgroundStageRef}
        width={dimensions.width}
        height={dimensions.height}
        style={{ position: 'absolute', zIndex: 0, pointerEvents: 'none' }}
        listening={false}
      >
        <Layer listening={false}>
          {/* Image */}
          {konvaImage && (
            <KonvaImage
              key="canvas-image"
              image={konvaImage}
              width={dimensions.width}
              height={dimensions.height}
              listening={false}
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
              strokeWidth={getZoomAdjustedSize(2, renderZoomLevel)}
              fill="transparent"
              listening={false}
            />
          )}
        </Layer>
      </Stage>

      {/* Layer 1: Konva interactive layer (selected annotations + drawing tools) */}
      <Stage
        ref={stageRef}
        width={dimensions.width}
        height={dimensions.height}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onDblClick={handleDoubleClick}
        style={{
          position: 'absolute',
          zIndex: 2,
          pointerEvents: 'auto'
        }}
      >
        {/* Static Layer: Non-selected annotations (optimized with memoized components) */}
        <Layer ref={staticLayerRef} listening={true}>
          {staticAnnotations.map((annotation) => {
            const label = getLabel(annotation.labelId)
            const color = label?.color || '#f97316'
            const labelName = label?.name || 'Unknown'
            const isHovered = hoverEnabled && hoveredAnnotation?.id === annotation.id

            if (annotation.type === 'rectangle') {
              return (
                <StaticRectAnnotation
                  key={`static-rect-${annotation.id}`}
                  annotation={annotation as RectangleAnnotation}
                  color={color}
                  labelName={labelName}
                  scale={scale}
                  zoomLevel={renderZoomLevel}
                  strokeWidth={ANNOTATION_STROKE_WIDTH}
                  isHovered={isHovered}
                  showLabels={showLabels}
                  fillOpacity={ANNOTATION_FILL_OPACITY_UNSELECTED}
                  selectedFillOpacity={ANNOTATION_FILL_OPACITY_SELECTED}
                  onRegisterRef={registerNodeRef}
                  onClick={handleAnnotationClick}
                  onMouseEnter={hoverEnabled ? handleAnnotationMouseEnter : undefined}
                  onMouseLeave={hoverEnabled ? handleAnnotationMouseLeave : undefined}
                />
              )
            } else if (annotation.type === 'polygon') {
              return (
                <StaticPolygonAnnotation
                  key={`static-poly-${annotation.id}`}
                  annotation={annotation as PolygonAnnotation}
                  color={color}
                  labelName={labelName}
                  scale={scale}
                  zoomLevel={renderZoomLevel}
                  strokeWidth={ANNOTATION_STROKE_WIDTH}
                  isHovered={isHovered}
                  showLabels={showLabels}
                  fillOpacity={ANNOTATION_FILL_OPACITY_UNSELECTED}
                  selectedFillOpacity={ANNOTATION_FILL_OPACITY_SELECTED}
                  onRegisterRef={registerNodeRef}
                  onClick={handleAnnotationClick}
                  onMouseEnter={hoverEnabled ? handleAnnotationMouseEnter : undefined}
                  onMouseLeave={hoverEnabled ? handleAnnotationMouseLeave : undefined}
                />
              )
            }
            return null
          })}
        </Layer>

        {/* Interactive Layer: Selected annotations with full interactivity */}
        <Layer ref={interactiveLayerRef}>
          {interactiveAnnotations.map((annotation) => {
            const label = getLabel(annotation.labelId)
            const color = label?.color || '#f97316'
            const labelName = label?.name || 'Unknown'
            const isSelected = selectedIds.includes(annotation.id)
            // Show selected appearance when hovered or selected
            const isHovered = hoverEnabled && hoveredAnnotation?.id === annotation.id
            const showSelectedFill = isSelected || isHovered

            if (annotation.type === 'rectangle') {
              const rect = annotation as RectangleAnnotation
              const isDragging = draggingAnnotationId === annotation.id
              const isInMultiDrag = draggingAnnotationId !== null && selectedIds.includes(annotation.id)
              const shouldHideLabel = isDragging || isInMultiDrag

              return (
                <React.Fragment key={`rect-group-${annotation.id}`}>
                  <Rect
                    ref={(node) => registerNodeRef(annotation.id, node)}
                    key={`rect-${annotation.id}`}
                    id={`ann-${annotation.id}`}
                    x={rect.x * scale}
                    y={rect.y * scale}
                    width={rect.width * scale}
                    height={rect.height * scale}
                    stroke={color}
                    strokeWidth={getZoomAdjustedStrokeWidth(ANNOTATION_STROKE_WIDTH, renderZoomLevel)}
                    strokeScaleEnabled={false}
                    strokeOpacity={ANNOTATION_STROKE_OPACITY}
                    fill={hexToRgba(
                      color,
                      showSelectedFill ? ANNOTATION_FILL_OPACITY_SELECTED : ANNOTATION_FILL_OPACITY_UNSELECTED
                    )}
                    // Performance optimizations
                    perfectDrawEnabled={false}
                    hitStrokeWidth={0}
                    listening={true}
                    onClick={() => handleAnnotationClick(annotation.id)}
                    onTap={() => handleAnnotationClick(annotation.id)}
                    draggable={selectedTool === 'select' && isSelected}
                    onDragStart={(e) => handleDragStart(annotation, e)}
                    onDragMove={(e) => handleDragMove(annotation, e)}
                    onDragEnd={(e) => handleDragEnd(annotation, e)}
                    onTransformEnd={(e) => handleTransformEnd(annotation, e)}
                    onMouseEnter={hoverEnabled ? (e) => handleAnnotationMouseEnter(annotation, e) : undefined}
                    onMouseLeave={hoverEnabled ? handleAnnotationMouseLeave : undefined}
                  />
                  {/* Label text above rectangle - hide during drag and when zoomed out */}
                  {showLabels && !shouldHideLabel && renderZoomLevel >= LABEL_VISIBILITY_ZOOM_THRESHOLD && (
                    <Text
                      key={`rect-label-${annotation.id}`}
                      x={rect.x * scale}
                      y={rect.y * scale - 20}
                      text={labelName}
                      fontSize={getZoomAdjustedSize(14, renderZoomLevel)}
                      fill="white"
                      padding={4}
                      perfectDrawEnabled={false}
                      listening={false}
                    />
                  )}
                </React.Fragment>
              )
            } else if (annotation.type === 'polygon') {
              const poly = annotation as PolygonAnnotation
              const isDragging = draggingAnnotationId === annotation.id
              const isInMultiDrag = draggingAnnotationId !== null && selectedIds.includes(annotation.id)
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
                    ref={(node) => registerNodeRef(annotation.id, node)}
                    key={`poly-${annotation.id}`}
                    id={`ann-${annotation.id}`}
                    points={points}
                    stroke={color}
                    strokeWidth={getZoomAdjustedStrokeWidth(ANNOTATION_STROKE_WIDTH, renderZoomLevel)}
                    strokeScaleEnabled={false}
                    strokeOpacity={ANNOTATION_STROKE_OPACITY}
                    fill={hexToRgba(
                      color,
                      showSelectedFill ? ANNOTATION_FILL_OPACITY_SELECTED : ANNOTATION_FILL_OPACITY_UNSELECTED
                    )}
                    closed
                    // Performance optimizations
                    perfectDrawEnabled={false}
                    hitStrokeWidth={0}
                    listening={true}
                    draggable={selectedTool === 'select' && isSelected}
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
                    onMouseEnter={hoverEnabled ? (e) => handleAnnotationMouseEnter(annotation, e) : undefined}
                    onMouseLeave={hoverEnabled ? handleAnnotationMouseLeave : undefined}
                  />
                  {/* Label text above polygon - hide during drag and when zoomed out */}
                  {showLabels && displayPoints.length > 0 && !shouldHideLabel && renderZoomLevel >= LABEL_VISIBILITY_ZOOM_THRESHOLD && (
                    <Text
                      key={`poly-label-${annotation.id}`}
                      x={displayPoints[0].x * scale}
                      y={displayPoints[0].y * scale - 20}
                      text={labelName}
                      fontSize={getZoomAdjustedSize(14, renderZoomLevel)}
                      fill="white"
                      padding={4}
                      perfectDrawEnabled={false}
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
                        radius={getZoomAdjustedSize(6, renderZoomLevel)}
                        fill={color}
                        stroke="white"
                        strokeWidth={getZoomAdjustedSize(2, renderZoomLevel)}
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
                  strokeWidth={getZoomAdjustedSize(2, renderZoomLevel)}
                  dash={[10, 5]}
                  fill={`${bboxColor}1A`}
                  listening={false}
                />
                <Text
                  x={bbox.x * scale}
                  y={bbox.y * scale - 20}
                  text={`${bboxLabelName} (Prompt)`}
                  fontSize={getZoomAdjustedSize(12, renderZoomLevel)}
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
                strokeWidth={getZoomAdjustedStrokeWidth(ANNOTATION_STROKE_WIDTH, renderZoomLevel)}
                dash={[5, 5]}
                listening={false}
              />
              {/* Start point marker */}
              <Circle
                key="rect-start-marker"
                x={rectangleStartPoint.x * scale}
                y={rectangleStartPoint.y * scale}
                radius={getZoomAdjustedSize(6, renderZoomLevel)}
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
                strokeWidth={getZoomAdjustedStrokeWidth(ANNOTATION_STROKE_WIDTH, renderZoomLevel)}
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
                  strokeWidth={getZoomAdjustedStrokeWidth(ANNOTATION_STROKE_WIDTH, renderZoomLevel)}
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
                  radius={getZoomAdjustedSize(idx === 0 && isNearFirstPoint ? 8 : 5, renderZoomLevel)}
                  fill={idx === 0 && isNearFirstPoint ? '#10b981' : selectedLabelColor}
                  stroke={idx === 0 && isNearFirstPoint ? '#10b981' : undefined}
                  strokeWidth={idx === 0 && isNearFirstPoint ? getZoomAdjustedSize(2, renderZoomLevel) : 0}
                  listening={false}
                />
              ))}
              {/* Preview point at mouse position */}
              {mousePosition && !isNearFirstPoint && (
                <Circle
                  key="poly-preview-point"
                  x={mousePosition.x * scale}
                  y={mousePosition.y * scale}
                  radius={getZoomAdjustedSize(4, renderZoomLevel)}
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
                strokeWidth={getZoomAdjustedSize(1.5, renderZoomLevel)}
                dash={[8, 4]}
                opacity={0.8}
                listening={false}
              />
              {/* Horizontal crosshair line */}
              <Line
                key="crosshair-horizontal"
                points={[0, mousePosition.y * scale, dimensions.width, mousePosition.y * scale]}
                stroke="white"
                strokeWidth={getZoomAdjustedSize(1.5, renderZoomLevel)}
                dash={[8, 4]}
                opacity={0.8}
                listening={false}
              />
            </React.Fragment>
          )}

          {/* Rubber-band selection rectangle */}
          {rubberBand && (
            <Rect
              key="rubber-band-selection"
              x={Math.min(rubberBand.start.x, rubberBand.end.x) * scale}
              y={Math.min(rubberBand.start.y, rubberBand.end.y) * scale}
              width={Math.abs(rubberBand.end.x - rubberBand.start.x) * scale}
              height={Math.abs(rubberBand.end.y - rubberBand.start.y) * scale}
              stroke="#3b82f6"
              strokeWidth={getZoomAdjustedSize(2, renderZoomLevel)}
              dash={[getZoomAdjustedSize(4, renderZoomLevel), getZoomAdjustedSize(4, renderZoomLevel)]}
              fill="rgba(59, 130, 246, 0.1)"
              listening={false}
            />
          )}

          {/* Transformer for selected annotation */}
          {selectedTool === 'select' && (
            <Transformer
              key="transformer"
              ref={transformerRef}
              keepRatio={isShiftPressed}
              rotateEnabled={false}
              anchorSize={transformerAnchorSize}
              anchorCornerRadius={transformerAnchorSize / 2}
              anchorFill={transformerColor}
              anchorStroke="white"
              anchorStrokeWidth={transformerAnchorStrokeWidth}
              borderStroke={transformerColor}
              borderStrokeWidth={getZoomAdjustedSize(1.5, renderZoomLevel)}
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
      {selectedIds.length === 1 && draggingAnnotationId !== selectedIds[0] && (() => {
        const annotation = annotations.find(a => a.id === selectedIds[0])
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
        const totalScale = scale * renderZoomLevel

        return (
          <React.Fragment key="bbox-coords">
            {/* Top-left coordinate */}
            <div
              className="absolute text-white px-1.5 py-0.5 rounded text-[10px] font-mono pointer-events-none leading-tight whitespace-nowrap"
              style={{
                backgroundColor: labelColor,
                opacity: 0.95,
                left: `${offsetX + renderStagePosition.x + topLeft.x * totalScale - 20}px`,
                top: `${offsetY + renderStagePosition.y + topLeft.y * totalScale - 30}px`,
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
                left: `${offsetX + renderStagePosition.x + bottomRight.x * totalScale + 2}px`,
                top: `${offsetY + renderStagePosition.y + bottomRight.y * totalScale + 10}px`,
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

      {/* Unsaved changes indicator */}
      {pendingChanges > 0 && (
        <div className="absolute top-4 right-4 flex items-center gap-2 pointer-events-none">
          <div
            className={`px-3 py-2 rounded-lg shadow-lg border-2 flex items-center gap-2 ${
              hasError
                ? 'bg-red-500/90 border-red-400 text-white'
                : 'bg-orange-500/90 border-orange-400 text-white'
            }`}
          >
            {hasError ? (
              <>
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
                <span className="font-semibold text-sm">Sync Error</span>
              </>
            ) : (
              <>
                <svg
                  className="w-5 h-5 animate-pulse"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <span className="font-semibold text-sm">
                  {pendingChanges} unsaved change{pendingChanges !== 1 ? 's' : ''}
                </span>
              </>
            )}
          </div>
        </div>
      )}

      {/* Annotation Hover Tooltip */}
      {hoverEnabled && hoveredAnnotation && !draggingAnnotationId && (() => {
        const annotation = annotations.find(a => a.id === hoveredAnnotation.id)
        if (!annotation) return null
        return (
          <AnnotationTooltip
            annotation={annotation}
            label={labelMap.get(annotation.labelId)}
            annotationBounds={hoveredAnnotation.bounds}
            visible={!draggingAnnotationId}
            imageWidth={konvaImage?.width || 1}
            imageHeight={konvaImage?.height || 1}
            onMouseEnter={handleTooltipMouseEnter}
            onMouseLeave={handleTooltipMouseLeave}
          />
        )
      })()}
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
