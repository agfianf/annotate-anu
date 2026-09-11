import { useMemo, useState } from 'react'
import { ImageOff } from '@/components/ui/icons'
import { useAuthenticatedImage } from '@/hooks/useAuthenticatedImage'
import type { QCItem } from '@/lib/qc-client'

interface InstanceQCViewerProps {
  item: QCItem
  imageUrl: string
  fillOpacity?: number
}

/**
 * Frame plus translucent shape overlays. The image uses object-contain and the
 * SVG uses xMidYMid meet, so both letterbox identically and the overlay lines up.
 */
export function InstanceQCViewer({ item, imageUrl, fillOpacity = 0.3 }: InstanceQCViewerProps) {
  const { width, height } = item
  const { blobUrl, error } = useAuthenticatedImage(imageUrl)
  const [failed, setFailed] = useState(false)

  // Polygons arrive normalized (0-1); scale into the viewBox
  const shapes = useMemo(
    () =>
      item.shapes.map((shape) => {
        const color = shape.label_color || '#10b981'
        if (shape.type === 'polygon' && shape.polygon?.length) {
          return {
            id: shape.id,
            color,
            points: shape.polygon.map(([x, y]) => `${x * width},${y * height}`).join(' '),
            rect: null as null | { x: number; y: number; w: number; h: number },
          }
        }
        if (shape.type === 'bbox' && shape.bbox) {
          const [x0, y0, x1, y1] = shape.bbox
          return {
            id: shape.id,
            color,
            points: null,
            rect: { x: x0 * width, y: y0 * height, w: (x1 - x0) * width, h: (y1 - y0) * height },
          }
        }
        return { id: shape.id, color, points: null, rect: null }
      }),
    [item, width, height]
  )

  const strokeWidth = Math.max(1.5, width / 350)
  const labelNames = Array.from(new Set(item.shapes.map((s) => s.label_name || 'unlabelled')))

  return (
    <div className="relative w-full h-full bg-gray-950 rounded-lg overflow-hidden">
      {failed || error ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-400 gap-2">
          <ImageOff className="w-8 h-8" />
          <p className="text-sm">Image file could not be loaded</p>
          <p className="text-xs font-mono text-gray-500">{item.s3_key}</p>
        </div>
      ) : (
        <>
          <img
            src={blobUrl ?? undefined}
            alt={item.filename}
            onError={() => setFailed(true)}
            className="absolute inset-0 w-full h-full object-contain"
          />
          <svg
            viewBox={`0 0 ${width} ${height}`}
            preserveAspectRatio="xMidYMid meet"
            className="absolute inset-0 w-full h-full pointer-events-none"
          >
            {shapes.map((shape) =>
              shape.points ? (
                <polygon
                  key={shape.id}
                  points={shape.points}
                  fill={shape.color}
                  fillOpacity={fillOpacity}
                  stroke={shape.color}
                  strokeWidth={strokeWidth}
                  strokeLinejoin="round"
                />
              ) : shape.rect ? (
                <rect
                  key={shape.id}
                  x={shape.rect.x}
                  y={shape.rect.y}
                  width={shape.rect.w}
                  height={shape.rect.h}
                  fill={shape.color}
                  fillOpacity={fillOpacity}
                  stroke={shape.color}
                  strokeWidth={strokeWidth}
                />
              ) : null
            )}
          </svg>
        </>
      )}

      {labelNames.length > 0 && (
        <div className="absolute top-2 left-2 flex flex-wrap gap-1.5">
          {labelNames.map((name) => {
            const shape = item.shapes.find((s) => (s.label_name || 'unlabelled') === name)
            return (
              <span
                key={name}
                className="px-2 py-0.5 rounded text-xs font-medium text-white shadow"
                style={{ backgroundColor: shape?.label_color || '#10b981' }}
              >
                {name}
              </span>
            )
          })}
        </div>
      )}

      <div className="absolute bottom-2 left-2 text-xs text-white/70 font-mono bg-black/40 px-2 py-0.5 rounded">
        {item.filename} · {item.shapes.length} shape{item.shapes.length === 1 ? '' : 's'}
      </div>
    </div>
  )
}
