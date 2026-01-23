/**
 * MoondreamSegmentPanel - Object segmentation using Moondream
 * Returns SVG path masks for objects
 */

import { imagesApi } from '@/lib/api-client'
import type { ImageData, Label } from '@/types/annotations'
import type { AvailableModel, MoondreamSegmentResult } from '@/types/byom'
import { MoondreamClient } from '@/lib/moondream-client'
import { svgPathToPolygon, normalizedBboxToPixels } from '@/lib/svg-path-utils'
import { Check, Loader2, Scissors, X } from 'lucide-react'
import { useState } from 'react'
import toast from 'react-hot-toast'
import { Button } from './ui/button'

interface MoondreamSegmentPanelProps {
  labels: Label[]
  selectedLabelId: string | null
  currentImage: ImageData | null
  onAnnotationsCreated: (results: {
    boxes: Array<[number, number, number, number]>
    masks: Array<{ polygons: Array<Array<[number, number]>>; area: number }>
    scores: number[]
    annotationType: 'bbox' | 'polygon'
    labelId?: string
    imageId?: string
  }) => void
  onClose: () => void
  selectedModel: AvailableModel
}

/**
 * Fetch image as blob from URL (for job mode images)
 */
async function fetchImageAsBlob(url: string): Promise<Blob> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to fetch image: ${response.statusText}`)
  }
  return await response.blob()
}

/**
 * Get image file from ImageData - handles both local and job mode
 */
async function getImageFile(image: ImageData): Promise<File> {
  let imageBlob: Blob

  if (image.s3Key && image.jobId && image.jobImageId) {
    // Job mode: fetch image from API
    const imageUrl = imagesApi.getFullImageUrl(
      image.s3Key,
      image.jobId.toString(),
      image.jobImageId
    )
    imageBlob = await fetchImageAsBlob(imageUrl)
  } else if (image.blob && image.blob.size > 0) {
    // Local mode: use existing blob
    imageBlob = image.blob
  } else {
    throw new Error('No valid image data available')
  }

  return new File([imageBlob], image.name, {
    type: imageBlob.type || 'image/jpeg',
  })
}

// Quick preset objects
const PRESETS = ['person', 'dog', 'cat', 'car', 'tree', 'flower', 'building']

export function MoondreamSegmentPanel({
  labels,
  selectedLabelId,
  currentImage,
  onAnnotationsCreated,
  onClose,
  selectedModel,
}: MoondreamSegmentPanelProps) {
  const [objectQuery, setObjectQuery] = useState('')
  const [labelId, setLabelId] = useState(selectedLabelId || '')
  const [isLoading, setIsLoading] = useState(false)
  const [segmentResult, setSegmentResult] = useState<{
    path: string
    bbox: { x: number; y: number; width: number; height: number }
    polygonPoints: number
  } | null>(null)

  const selectedLabel = labels.find((l) => l.id === labelId)

  const handleSegment = async () => {
    if (!currentImage) {
      toast.error('No image selected')
      return
    }

    if (!objectQuery.trim()) {
      toast.error('Please enter an object to segment')
      return
    }

    setIsLoading(true)
    setSegmentResult(null)

    try {
      // Get image file
      const imageFile = await getImageFile(currentImage)

      // Create Moondream client
      const client = new MoondreamClient({
        baseUrl: selectedModel.endpoint_url,
        apiKey: selectedModel.auth_token,
      })

      // Call segment endpoint
      const result: MoondreamSegmentResult = await client.segment({
        image: imageFile,
        object: objectQuery,
      })

      if (!result.path) {
        toast.error(`Could not segment "${objectQuery}" in the image`)
        return
      }

      // Convert SVG path to polygon points
      const imageWidth = currentImage.width || 1
      const imageHeight = currentImage.height || 1

      const polygonPoints = svgPathToPolygon(result.path, imageWidth, imageHeight, true)
      const pixelBbox = normalizedBboxToPixels(result.bbox, imageWidth, imageHeight)

      setSegmentResult({
        path: result.path,
        bbox: pixelBbox,
        polygonPoints: polygonPoints.length,
      })

      toast.success(`Segmented "${objectQuery}" (${polygonPoints.length} points)`)
    } catch (error) {
      console.error('Segmentation error:', error)
      toast.error('Segmentation failed. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleAddAnnotation = () => {
    if (!labelId) {
      toast.error('Please select a label')
      return
    }

    if (!segmentResult || !currentImage) {
      toast.error('No segmentation result')
      return
    }

    // Convert SVG path to polygon points
    const imageWidth = currentImage.width || 1
    const imageHeight = currentImage.height || 1
    const points = svgPathToPolygon(segmentResult.path, imageWidth, imageHeight, true)

    if (points.length < 3) {
      toast.error('Invalid polygon: not enough points')
      return
    }

    // Convert points to the format expected by onAnnotationsCreated
    const polygonArray: Array<[number, number]> = points.map((p) => [p.x, p.y])

    // Calculate area using shoelace formula
    let area = 0
    for (let i = 0; i < points.length; i++) {
      const j = (i + 1) % points.length
      area += points[i].x * points[j].y
      area -= points[j].x * points[i].y
    }
    area = Math.abs(area) / 2

    const boxes: Array<[number, number, number, number]> = [
      [segmentResult.bbox.x, segmentResult.bbox.y, segmentResult.bbox.width, segmentResult.bbox.height],
    ]

    const masks: Array<{ polygons: Array<Array<[number, number]>>; area: number }> = [
      {
        polygons: [polygonArray],
        area,
      },
    ]

    onAnnotationsCreated({
      boxes,
      masks,
      scores: [1.0],
      annotationType: 'polygon',
      labelId,
      imageId: currentImage.id,
    })

    toast.success('Added polygon annotation')
    setSegmentResult(null)
    setObjectQuery('')
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
        <div className="flex items-center gap-2 flex-1">
          <Scissors className="w-5 h-5 text-teal-500" />
          <h2 className="text-lg font-semibold text-gray-900">Moondream Segment</h2>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded hover:bg-white transition-colors text-gray-600 hover:text-gray-900"
          title="Close"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* Description */}
        <div className="bg-teal-50 border border-teal-200 rounded-lg p-3">
          <p className="text-sm text-teal-700">
            Describe an object to get a precise segmentation mask (polygon). Great for detailed object outlines.
          </p>
        </div>

        {/* Object Query Input */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Object to Segment
          </label>
          <input
            type="text"
            value={objectQuery}
            onChange={(e) => setObjectQuery(e.target.value)}
            placeholder="e.g., dog, person, car"
            className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
            disabled={isLoading}
            onKeyDown={(e) => e.key === 'Enter' && handleSegment()}
          />

          {/* Presets */}
          <div className="mt-2 flex flex-wrap gap-1">
            {PRESETS.map((preset) => (
              <button
                key={preset}
                onClick={() => setObjectQuery(preset)}
                disabled={isLoading}
                className="px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 rounded transition-colors disabled:opacity-50"
              >
                {preset}
              </button>
            ))}
          </div>
        </div>

        {/* Label Selection */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Assign Label
          </label>
          <div className="relative">
            <select
              value={labelId}
              onChange={(e) => setLabelId(e.target.value)}
              className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent appearance-none"
              disabled={isLoading}
            >
              <option value="">Select a label...</option>
              {labels.map((label) => (
                <option key={label.id} value={label.id}>
                  {label.name}
                </option>
              ))}
            </select>
            {selectedLabel && (
              <div
                className="absolute right-10 top-1/2 -translate-y-1/2 w-4 h-4 rounded"
                style={{ backgroundColor: selectedLabel.color }}
              />
            )}
          </div>
        </div>

        {/* Segment Button */}
        <Button
          type="button"
          onClick={handleSegment}
          disabled={isLoading || !objectQuery.trim() || !currentImage}
          className="w-full bg-teal-600 hover:bg-teal-700 disabled:bg-gray-300 disabled:text-gray-500 text-white"
        >
          {isLoading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Segmenting...
            </>
          ) : (
            <>
              <Scissors className="w-4 h-4 mr-2" />
              Segment Object
            </>
          )}
        </Button>

        {/* Segmentation Result */}
        {segmentResult && (
          <div className="space-y-3">
            <div className="text-sm font-medium text-gray-700">
              Segmentation Result
            </div>

            <div className="p-3 bg-gray-50 rounded-lg space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Polygon points:</span>
                <span className="font-medium text-gray-900">
                  {segmentResult.polygonPoints}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Bounding box:</span>
                <span className="font-mono text-xs text-gray-700">
                  [{Math.round(segmentResult.bbox.x)}, {Math.round(segmentResult.bbox.y)},{' '}
                  {Math.round(segmentResult.bbox.width)}x{Math.round(segmentResult.bbox.height)}]
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Actions */}
      {segmentResult && (
        <div className="px-4 py-3 border-t border-gray-200">
          <Button
            type="button"
            onClick={handleAddAnnotation}
            disabled={!labelId}
            className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-300 disabled:text-gray-500 text-white"
          >
            <Check className="w-4 h-4 mr-2" />
            Add as Polygon Annotation
          </Button>
        </div>
      )}
    </div>
  )
}
