import { Copy, Check } from 'lucide-react'
import { useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import toast from 'react-hot-toast'
import type { Annotation, Label, PolygonAnnotation, RectangleAnnotation } from '@/types/annotations'

interface AnnotationTooltipProps {
  annotation: Annotation
  label: Label | undefined
  // Annotation bounds in screen coordinates
  annotationBounds: { x: number; y: number; width: number; height: number }
  visible: boolean
  // Image dimensions for percentage calculation
  imageWidth: number
  imageHeight: number
  // Keep tooltip visible when mouse enters it
  onMouseEnter?: () => void
  onMouseLeave?: () => void
}

// Calculate polygon area using the Shoelace formula
function calculatePolygonArea(points: Array<{ x: number; y: number }>): number {
  if (points.length < 3) return 0

  let area = 0
  for (let i = 0; i < points.length; i++) {
    const j = (i + 1) % points.length
    area += points[i].x * points[j].y
    area -= points[j].x * points[i].y
  }
  return Math.abs(area / 2)
}

// Get polygon bounding box
function getPolygonBounds(points: Array<{ x: number; y: number }>) {
  if (points.length === 0) return { x: 0, y: 0, width: 0, height: 0 }

  const xs = points.map(p => p.x)
  const ys = points.map(p => p.y)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY
  }
}

// Get annotation dimensions and area
function getAnnotationMetrics(annotation: Annotation): { dimensions: string; area: number; width: number; height: number } {
  if (annotation.type === 'rectangle') {
    const rect = annotation as RectangleAnnotation
    return {
      dimensions: `${Math.round(rect.width)} × ${Math.round(rect.height)}`,
      area: Math.round(rect.width * rect.height),
      width: rect.width,
      height: rect.height
    }
  } else if (annotation.type === 'polygon') {
    const poly = annotation as PolygonAnnotation
    const bounds = getPolygonBounds(poly.points)
    return {
      dimensions: `${Math.round(bounds.width)} × ${Math.round(bounds.height)}`,
      area: Math.round(calculatePolygonArea(poly.points)),
      width: bounds.width,
      height: bounds.height
    }
  }
  return { dimensions: 'N/A', area: 0, width: 0, height: 0 }
}

const TOOLTIP_GAP = 20
const TOOLTIP_MARGIN = 12

const getOverlapArea = (
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number }
) => {
  const xOverlap = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x))
  const yOverlap = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y))
  return xOverlap * yOverlap
}

const getRectDistance = (
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number }
) => {
  const dx = Math.max(b.x - (a.x + a.width), a.x - (b.x + b.width), 0)
  const dy = Math.max(b.y - (a.y + a.height), a.y - (b.y + b.height), 0)
  return Math.hypot(dx, dy)
}

export function AnnotationTooltip({
  annotation,
  label,
  annotationBounds,
  visible,
  imageWidth,
  imageHeight,
  onMouseEnter,
  onMouseLeave,
}: AnnotationTooltipProps) {
  const tooltipRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 })
  const [copiedField, setCopiedField] = useState<string | null>(null)

  const { dimensions, area } = getAnnotationMetrics(annotation)
  const confidence = annotation.confidence
  const imageArea = imageWidth * imageHeight
  const areaPercent = imageArea > 0 ? ((area / imageArea) * 100) : 0

  // Calculate a nearby position that avoids covering the annotation
  useLayoutEffect(() => {
    if (!visible || !tooltipRef.current) return

    const tooltip = tooltipRef.current
    const tooltipRect = tooltip.getBoundingClientRect()
    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight

    const { x: annX, y: annY, width: annWidth, height: annHeight } = annotationBounds

    const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(value, max))

    const maxX = viewportWidth - tooltipRect.width - TOOLTIP_MARGIN
    const maxY = viewportHeight - tooltipRect.height - TOOLTIP_MARGIN

    const annRect = {
      x: annX,
      y: annY,
      width: annWidth,
      height: annHeight,
    }

    const centerX = annX + annWidth / 2
    const centerY = annY + annHeight / 2
    const xLeft = annX - tooltipRect.width - TOOLTIP_GAP
    const xRight = annX + annWidth + TOOLTIP_GAP
    const yTop = annY - tooltipRect.height - TOOLTIP_GAP
    const yBottom = annY + annHeight + TOOLTIP_GAP
    const centeredX = centerX - tooltipRect.width / 2
    const centeredY = centerY - tooltipRect.height / 2

    const candidates = [
      { x: xRight, y: centeredY },
      { x: xRight, y: yTop },
      { x: xRight, y: yBottom },
      { x: xLeft, y: centeredY },
      { x: xLeft, y: yTop },
      { x: xLeft, y: yBottom },
      { x: centeredX, y: yTop },
      { x: xLeft, y: yTop },
      { x: xRight, y: yTop },
      { x: centeredX, y: yBottom },
      { x: xLeft, y: yBottom },
      { x: xRight, y: yBottom },
    ]

    let best = { x: clamp(centeredX, TOOLTIP_MARGIN, maxX), y: clamp(centeredY, TOOLTIP_MARGIN, maxY) }
    let bestScore = Number.POSITIVE_INFINITY

    for (const candidate of candidates) {
      const clampedX = clamp(candidate.x, TOOLTIP_MARGIN, maxX)
      const clampedY = clamp(candidate.y, TOOLTIP_MARGIN, maxY)
      const tooltipBox = { x: clampedX, y: clampedY, width: tooltipRect.width, height: tooltipRect.height }
      const overlapArea = getOverlapArea(tooltipBox, annRect)
      const distance = getRectDistance(tooltipBox, annRect)
      const clampShift = Math.abs(clampedX - candidate.x) + Math.abs(clampedY - candidate.y)
      const score = overlapArea > 0
        ? overlapArea + 100000 + clampShift
        : distance + clampShift * 0.25

      if (score < bestScore) {
        bestScore = score
        best = { x: clampedX, y: clampedY }
      }
    }

    setPosition(best)
  }, [annotationBounds, visible, annotation.id, label?.name, confidence, dimensions])

  const copyToClipboard = async (text: string, field: string, fieldName: string) => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text)
      } else {
        // Fallback for browsers without clipboard API
        const textArea = document.createElement('textarea')
        textArea.value = text
        textArea.style.position = 'fixed'
        textArea.style.left = '-999999px'
        textArea.style.top = '-999999px'
        document.body.appendChild(textArea)
        textArea.focus()
        textArea.select()
        document.execCommand('copy')
        document.body.removeChild(textArea)
      }
      setCopiedField(field)
      toast.success(`${fieldName} copied!`)
      setTimeout(() => setCopiedField(null), 1500)
    } catch (err) {
      console.error('Failed to copy:', err)
      toast.error('Failed to copy')
    }
  }

  const copyAllInfo = () => {
    // Build full JSON object with all annotation data
    const jsonData: Record<string, unknown> = {
      id: annotation.id,
      type: annotation.type,
      label: label?.name || 'Unknown',
      labelId: annotation.labelId,
      labelColor: label?.color,
    }

    // Add geometry based on type
    if (annotation.type === 'rectangle') {
      const rect = annotation as RectangleAnnotation
      jsonData.geometry = {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
      }
    } else if (annotation.type === 'polygon') {
      const poly = annotation as PolygonAnnotation
      jsonData.geometry = {
        points: poly.points,
      }
    }

    // Add metrics
    jsonData.metrics = {
      dimensions,
      area,
      areaPercent: parseFloat(areaPercent.toFixed(2)),
      imageWidth,
      imageHeight,
    }

    // Add optional fields
    if (confidence !== undefined) {
      jsonData.confidence = confidence
    }
    if (annotation.isAutoGenerated !== undefined) {
      jsonData.isAutoGenerated = annotation.isAutoGenerated
    }
    if (annotation.attributes && Object.keys(annotation.attributes).length > 0) {
      jsonData.attributes = annotation.attributes
    }

    copyToClipboard(JSON.stringify(jsonData, null, 2), 'all', 'Annotation JSON')
  }

  if (!visible) return null

  return createPortal(
    <div
      ref={tooltipRef}
      className="fixed z-[9999]"
      style={{
        left: position.x,
        top: position.y,
      }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div
        className="rounded-lg shadow-xl px-3 py-2 text-xs space-y-1.5 min-w-[200px] max-w-[260px] border border-white/30"
        style={{
          background: 'rgba(255, 255, 255, 0.65)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
        }}
      >
        {/* Header with label and copy all button */}
        <div className="flex items-center justify-between gap-2">
          <div className="font-semibold text-gray-900 flex items-center gap-2 min-w-0">
            <div
              className="w-2.5 h-2.5 rounded-sm flex-shrink-0 shadow-sm"
              style={{ backgroundColor: label?.color || '#f97316' }}
            />
            <span className="truncate">{label?.name || 'Unknown'}</span>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation()
              copyAllInfo()
            }}
            className="p-1 hover:bg-gray-200/50 rounded transition-colors flex-shrink-0 cursor-pointer"
            title="Copy all info"
          >
            {copiedField === 'all' ? (
              <Check className="w-3.5 h-3.5 text-emerald-600" />
            ) : (
              <Copy className="w-3.5 h-3.5 text-gray-500 hover:text-gray-700" />
            )}
          </button>
        </div>

        {/* Confidence score (if available) */}
        {confidence !== undefined && (
          <div className="text-gray-600 flex justify-between gap-4">
            <span>Confidence:</span>
            <span className="font-medium text-gray-800">{(confidence * 100).toFixed(1)}%</span>
          </div>
        )}

        {/* Dimensions */}
        <div className="text-gray-600 flex justify-between gap-4">
          <span>Size:</span>
          <span className="font-medium text-gray-800">{dimensions} px</span>
        </div>

        {/* Area with percentage */}
        <div className="text-gray-600 flex justify-between gap-4">
          <span>Area:</span>
          <span className="font-medium text-gray-800">
            {area.toLocaleString()} px²
            <span className="text-gray-500 ml-1">({areaPercent.toFixed(2)}%)</span>
          </span>
        </div>

        {/* Custom Attributes (if any) */}
        {annotation.attributes && Object.keys(annotation.attributes).length > 0 && (
          <div className="pt-1.5 border-t border-gray-200/50 space-y-1">
            <span className="text-gray-500 text-[10px] font-medium uppercase tracking-wide">Attributes</span>
            {Object.entries(annotation.attributes).map(([key, value]) => (
              <div key={key} className="text-gray-600 flex justify-between gap-2">
                <span className="truncate">{key}:</span>
                <span className="font-medium text-gray-800 truncate max-w-[120px]" title={String(value)}>
                  {typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value)}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Annotation ID with copy button */}
        <div className="flex items-center justify-between pt-1.5 border-t border-gray-200/50">
          <span className="text-gray-400 font-mono text-[10px]">
            ID: {annotation.id.slice(0, 12)}...
          </span>
          <button
            onClick={(e) => {
              e.stopPropagation()
              copyToClipboard(annotation.id, 'id', 'ID')
            }}
            className="p-0.5 hover:bg-gray-200/50 rounded transition-colors cursor-pointer"
            title="Copy ID"
          >
            {copiedField === 'id' ? (
              <Check className="w-3 h-3 text-emerald-600" />
            ) : (
              <Copy className="w-3 h-3 text-gray-400 hover:text-gray-600" />
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
