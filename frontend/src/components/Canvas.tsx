import Konva from 'konva'
import React, { useEffect, useRef, useState } from 'react'
import { Circle, Group, Image as KonvaImage, Layer, Line, Rect, Stage, Text, Transformer } from 'react-konva'
import type { Annotation, Label, PolygonAnnotation, RectangleAnnotation, Tool } from '../types/annotations'

interface CanvasProps {
  image: string | null
  selectedTool: Tool
  annotations: Annotation[]
  labels: Label[]
  onAddAnnotation: (annotation: Omit<Annotation, 'imageId' | 'labelId' | 'createdAt' | 'updatedAt'>) => void
  onUpdateAnnotation: (annotation: Annotation) => void
  selectedAnnotation: string | null
  onSelectAnnotation: (id: string | null) => void
}

export default function Canvas({
  image,
  selectedTool,
  annotations,
  labels,
  onAddAnnotation,
  onUpdateAnnotation,
  selectedAnnotation,
  onSelectAnnotation,
}: CanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<Konva.Stage>(null)
  const transformerRef = useRef<Konva.Transformer>(null)
  const [konvaImage, setKonvaImage] = useState<HTMLImageElement | null>(null)
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 })
  const [scale, setScale] = useState(1)
  const [isDrawing, setIsDrawing] = useState(false)
  const [currentRectangle, setCurrentRectangle] = useState<number[] | null>(null)
  const [polygonPoints, setPolygonPoints] = useState<Array<{ x: number; y: number }>>([])
  const [mousePosition, setMousePosition] = useState<{ x: number; y: number } | null>(null)
  const [cursorScreenPosition, setCursorScreenPosition] = useState<{ x: number; y: number } | null>(null)
  const [isNearFirstPoint, setIsNearFirstPoint] = useState(false)

  const SNAP_DISTANCE = 10 // pixels in original image coordinates

  // Load image
  useEffect(() => {
    if (image) {
      const img = new window.Image()
      img.src = image
      img.onload = () => {
        setKonvaImage(img)
        // Resize canvas to fit container while maintaining aspect ratio
        if (containerRef.current) {
          const containerWidth = containerRef.current.offsetWidth
          const containerHeight = containerRef.current.offsetHeight
          const scaleX = containerWidth / img.width
          const scaleY = containerHeight / img.height
          const newScale = Math.min(scaleX, scaleY, 1) // Don't scale up beyond 100%
          setScale(newScale)
          setDimensions({
            width: img.width * newScale,
            height: img.height * newScale,
          })
        }
      }
    }
  }, [image])

  // Resize on container size change
  useEffect(() => {
    const handleResize = () => {
      if (containerRef.current && konvaImage) {
        const containerWidth = containerRef.current.offsetWidth
        const containerHeight = containerRef.current.offsetHeight
        const scaleX = containerWidth / konvaImage.width
        const scaleY = containerHeight / konvaImage.height
        const newScale = Math.min(scaleX, scaleY, 1)
        setScale(newScale)
        setDimensions({
          width: konvaImage.width * newScale,
          height: konvaImage.height * newScale,
        })
      }
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [konvaImage])

  // Update transformer when selection changes
  useEffect(() => {
    if (transformerRef.current && stageRef.current && selectedTool === 'select') {
      if (selectedAnnotation) {
        const node = stageRef.current.findOne(`#ann-${selectedAnnotation}`)
        if (node) {
          transformerRef.current.nodes([node])
          transformerRef.current.getLayer()?.batchDraw()
        }
      } else {
        transformerRef.current.nodes([])
        transformerRef.current.getLayer()?.batchDraw()
      }
    }
  }, [selectedAnnotation, selectedTool])

  const getLabel = (labelId: string) => {
    return labels.find(l => l.id === labelId)
  }

  const calculateDistance = (p1: { x: number; y: number }, p2: { x: number; y: number }) => {
    return Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2))
  }

  const handleMouseDown = (e: any) => {
    // Deselect when clicking on stage
    const clickedOnEmpty = e.target === e.target.getStage()
    if (clickedOnEmpty && selectedTool === 'select') {
      onSelectAnnotation(null)
      return
    }

    if (selectedTool === 'select') return

    const stage = e.target.getStage()
    const pos = stage.getPointerPosition()

    // Convert to original image coordinates
    const originalX = pos.x / scale
    const originalY = pos.y / scale

    if (selectedTool === 'rectangle') {
      setIsDrawing(true)
      setCurrentRectangle([originalX, originalY, 0, 0])
    } else if (selectedTool === 'polygon') {
      // Check if clicking near the first point to close polygon
      if (polygonPoints.length >= 3 && isNearFirstPoint) {
        // Close the polygon
        const newAnnotation: Omit<PolygonAnnotation, 'imageId' | 'labelId' | 'createdAt' | 'updatedAt'> = {
          id: Date.now().toString(),
          type: 'polygon',
          points: polygonPoints,
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

  const handleMouseMove = (e: any) => {
    const stage = e.target.getStage()
    const pos = stage.getPointerPosition()

    if (!pos || !stage) return

    // Get Stage position in the page
    const stageBox = stage.container().getBoundingClientRect()

    // Get container position to calculate relative coordinates
    const containerBox = containerRef.current?.getBoundingClientRect()

    // Convert to original image coordinates
    const originalX = pos.x / scale
    const originalY = pos.y / scale

    // Update mouse position for coordinate display
    if (selectedTool === 'rectangle' || selectedTool === 'polygon') {
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

    // Check if near first point for polygon
    if (selectedTool === 'polygon' && polygonPoints.length >= 3) {
      const distance = calculateDistance({ x: originalX, y: originalY }, polygonPoints[0])
      setIsNearFirstPoint(distance <= SNAP_DISTANCE)
    } else {
      setIsNearFirstPoint(false)
    }

    if (!isDrawing || selectedTool !== 'rectangle') return

    if (currentRectangle) {
      const [x, y] = currentRectangle
      setCurrentRectangle([x, y, originalX - x, originalY - y])
    }
  }

  const handleMouseUp = () => {
    if (!isDrawing || selectedTool !== 'rectangle') return

    if (currentRectangle) {
      const [x, y, width, height] = currentRectangle
      if (Math.abs(width) > 5 && Math.abs(height) > 5) {
        // Normalize rectangle (handle negative width/height)
        const normalizedX = width < 0 ? x + width : x
        const normalizedY = height < 0 ? y + height : y
        const normalizedWidth = Math.abs(width)
        const normalizedHeight = Math.abs(height)

        const newAnnotation: Omit<RectangleAnnotation, 'imageId' | 'labelId' | 'createdAt' | 'updatedAt'> = {
          id: Date.now().toString(),
          type: 'rectangle',
          x: normalizedX,
          y: normalizedY,
          width: normalizedWidth,
          height: normalizedHeight,
        }
        onAddAnnotation(newAnnotation)
      }
    }

    setIsDrawing(false)
    setCurrentRectangle(null)
  }

  const handleDoubleClick = () => {
    if (selectedTool === 'polygon' && polygonPoints.length >= 3) {
      // Create polygon annotation
      const newAnnotation: Omit<PolygonAnnotation, 'imageId' | 'labelId' | 'createdAt' | 'updatedAt'> = {
        id: Date.now().toString(),
        type: 'polygon',
        points: polygonPoints,
      }
      onAddAnnotation(newAnnotation)
      setPolygonPoints([])
      setIsNearFirstPoint(false)
    }
  }

  // Handle Escape key to cancel polygon
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && selectedTool === 'polygon') {
        setPolygonPoints([])
        setIsNearFirstPoint(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedTool])

  // Reset drawing states when image changes
  useEffect(() => {
    setIsDrawing(false)
    setCurrentRectangle(null)
    setPolygonPoints([])
    setIsNearFirstPoint(false)
    setMousePosition(null)
    setCursorScreenPosition(null)
  }, [image])

  const handleDragEnd = (annotation: Annotation, e: any) => {
    const node = e.target
    const scaleX = node.scaleX()
    const scaleY = node.scaleY()

    // Reset scale to 1 and adjust dimensions
    node.scaleX(1)
    node.scaleY(1)

    if (annotation.type === 'rectangle') {
      const updatedAnnotation: RectangleAnnotation = {
        ...annotation,
        x: node.x() / scale,
        y: node.y() / scale,
        width: (node.width() * scaleX) / scale,
        height: (node.height() * scaleY) / scale,
      }
      onUpdateAnnotation(updatedAnnotation)
    } else if (annotation.type === 'polygon') {
      const poly = annotation as PolygonAnnotation
      const offsetX = node.x() / scale
      const offsetY = node.y() / scale

      // Update all polygon points with the offset
      const updatedPoints = poly.points.map(point => ({
        x: point.x + offsetX,
        y: point.y + offsetY,
      }))

      const updatedAnnotation: PolygonAnnotation = {
        ...poly,
        points: updatedPoints,
        updatedAt: Date.now(),
      }

      // Reset position to 0,0 since we've updated the points
      node.x(0)
      node.y(0)

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

    if (annotation.type === 'rectangle') {
      const updatedAnnotation: RectangleAnnotation = {
        ...annotation,
        x: node.x() / scale,
        y: node.y() / scale,
        width: (node.width() * scaleX) / scale,
        height: (node.height() * scaleY) / scale,
      }
      onUpdateAnnotation(updatedAnnotation)
    }
  }

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

  // Determine cursor style based on tool
  const getCursorStyle = () => {
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

          {/* Existing annotations */}
          {annotations.map((annotation) => {
            const label = getLabel(annotation.labelId)
            const color = label?.color || '#f97316'
            const labelName = label?.name || 'Unknown'
            const isSelected = selectedAnnotation === annotation.id

            if (annotation.type === 'rectangle') {
              const rect = annotation as RectangleAnnotation
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
                    strokeWidth={2}
                    fill={`${color}33`}
                    onClick={() => onSelectAnnotation(annotation.id)}
                    onTap={() => onSelectAnnotation(annotation.id)}
                    draggable={selectedTool === 'select'}
                    onDragEnd={(e) => handleDragEnd(annotation, e)}
                    onTransformEnd={(e) => handleTransformEnd(annotation, e)}
                    opacity={isSelected ? 1 : 0.7}
                  />
                  {/* Label text above rectangle */}
                  <Text
                    key={`rect-label-${annotation.id}`}
                    x={rect.x * scale}
                    y={rect.y * scale - 20}
                    text={labelName}
                    fontSize={14}
                    fill="white"
                    padding={4}
                    listening={false}
                  />
                </React.Fragment>
              )
            } else if (annotation.type === 'polygon') {
              const poly = annotation as PolygonAnnotation
              const points = poly.points.flatMap(p => [p.x * scale, p.y * scale])

              return (
                <Group
                  key={`poly-group-${annotation.id}`}
                  id={`ann-${annotation.id}`}
                  draggable={selectedTool === 'select'}
                  onDragMove={() => {
                    // Force transformer to update during drag
                    if (selectedTool === 'select' && transformerRef.current) {
                      transformerRef.current.getLayer()?.batchDraw()
                    }
                  }}
                  onDragEnd={(e) => handleDragEnd(annotation, e)}
                >
                  <Line
                    key={`poly-${annotation.id}`}
                    points={points}
                    stroke={color}
                    strokeWidth={2}
                    fill={`${color}33`}
                    closed
                    onClick={() => onSelectAnnotation(annotation.id)}
                    onTap={() => onSelectAnnotation(annotation.id)}
                    opacity={isSelected ? 1 : 0.7}
                  />
                  {/* Label text above polygon (use first point) */}
                  {poly.points.length > 0 && (
                    <Text
                      key={`poly-label-${annotation.id}`}
                      x={poly.points[0].x * scale}
                      y={poly.points[0].y * scale - 20}
                      text={labelName}
                      fontSize={14}
                      fill="white"
                      padding={4}
                      listening={false}
                    />
                  )}
                  {/* Show polygon points as small circles */}
                  {isSelected && poly.points.map((point, idx) => (
                    <Circle
                      key={`poly-point-${annotation.id}-${idx}`}
                      x={point.x * scale}
                      y={point.y * scale}
                      radius={4}
                      fill={color}
                      listening={false}
                    />
                  ))}
                </Group>
              )
            }
            return null
          })}

          {/* Current drawing shape */}
          {isDrawing && selectedTool === 'rectangle' && currentRectangle && (
            <Rect
              key="current-rect"
              x={currentRectangle[0] * scale}
              y={currentRectangle[1] * scale}
              width={currentRectangle[2] * scale}
              height={currentRectangle[3] * scale}
              stroke="#f97316"
              strokeWidth={2}
              dash={[5, 5]}
              listening={false}
            />
          )}

          {/* Polygon in progress */}
          {selectedTool === 'polygon' && polygonPoints.length > 0 && (
            <React.Fragment key="polygon-drawing">
              {/* Lines connecting points */}
              <Line
                key="poly-lines"
                points={polygonPoints.flatMap(p => [p.x * scale, p.y * scale])}
                stroke="#f97316"
                strokeWidth={2}
                dash={[5, 5]}
                listening={false}
              />
              {/* Line from last point to mouse position (preview) */}
              {mousePosition && (
                <Line
                  key="poly-preview-line"
                  points={[
                    polygonPoints[polygonPoints.length - 1].x * scale,
                    polygonPoints[polygonPoints.length - 1].y * scale,
                    isNearFirstPoint ? polygonPoints[0].x * scale : mousePosition.x * scale,
                    isNearFirstPoint ? polygonPoints[0].y * scale : mousePosition.y * scale,
                  ]}
                  stroke="#f97316"
                  strokeWidth={1}
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
                  radius={idx === 0 && isNearFirstPoint ? 8 : 5}
                  fill={idx === 0 && isNearFirstPoint ? '#10b981' : '#f97316'}
                  stroke={idx === 0 && isNearFirstPoint ? '#10b981' : undefined}
                  strokeWidth={idx === 0 && isNearFirstPoint ? 2 : 0}
                  listening={false}
                />
              ))}
              {/* Preview point at mouse position */}
              {mousePosition && !isNearFirstPoint && (
                <Circle
                  key="poly-preview-point"
                  x={mousePosition.x * scale}
                  y={mousePosition.y * scale}
                  radius={4}
                  fill="#f97316"
                  opacity={0.5}
                  listening={false}
                />
              )}
            </React.Fragment>
          )}

          {/* Transformer for selected annotation */}
          {selectedTool === 'select' && <Transformer key="transformer" ref={transformerRef} />}
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

      {/* Bounding box coordinates for selected annotation */}
      {selectedAnnotation && (() => {
        const annotation = annotations.find(a => a.id === selectedAnnotation)
        if (!annotation) return null

        let topLeft: { x: number; y: number } | null = null
        let bottomRight: { x: number; y: number } | null = null

        if (annotation.type === 'rectangle') {
          const rect = annotation as RectangleAnnotation
          topLeft = { x: Math.round(rect.x), y: Math.round(rect.y) }
          bottomRight = { x: Math.round(rect.x + rect.width), y: Math.round(rect.y + rect.height) }
        } else if (annotation.type === 'polygon') {
          const poly = annotation as PolygonAnnotation
          const xs = poly.points.map(p => p.x)
          const ys = poly.points.map(p => p.y)
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

        return (
          <React.Fragment key="bbox-coords">
            {/* Top-left coordinate */}
            <div
              className="absolute text-white px-1.5 py-0.5 rounded text-[10px] font-mono pointer-events-none leading-tight whitespace-nowrap"
              style={{
                backgroundColor: labelColor,
                opacity: 0.95,
                left: `${offsetX + topLeft.x * scale - 20}px`,
                top: `${offsetY + topLeft.y * scale - 30}px`,
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
                left: `${offsetX + bottomRight.x * scale + 2}px`,
                top: `${offsetY + bottomRight.y * scale + 10}px`,
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
}

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
