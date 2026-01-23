/**
 * MoondreamDetectPanel - Zero-shot object detection using Moondream
 * Allows users to describe objects in natural language and get bounding boxes
 */

import { imagesApi } from '@/lib/api-client'
import type { ImageData, Label } from '@/types/annotations'
import type { AvailableModel, MoondreamDetectResult } from '@/types/byom'
import { MoondreamClient } from '@/lib/moondream-client'
import { normalizedBboxToPixels } from '@/lib/svg-path-utils'
import { Check, Loader2, Search, Target, X } from 'lucide-react'
import { useState } from 'react'
import toast from 'react-hot-toast'
import { Button } from './ui/button'

interface DetectedObject {
  id: string
  bbox: { x: number; y: number; width: number; height: number }
  selected: boolean
}

interface MoondreamDetectPanelProps {
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
const PRESETS = ['person', 'car', 'dog', 'cat', 'text', 'face', 'bird', 'tree']

export function MoondreamDetectPanel({
  labels,
  selectedLabelId,
  currentImage,
  onAnnotationsCreated,
  onClose,
  selectedModel,
}: MoondreamDetectPanelProps) {
  const [objectQuery, setObjectQuery] = useState('')
  const [labelId, setLabelId] = useState(selectedLabelId || '')
  const [isLoading, setIsLoading] = useState(false)
  const [detectedObjects, setDetectedObjects] = useState<DetectedObject[]>([])

  const selectedLabel = labels.find((l) => l.id === labelId)

  const handleDetect = async () => {
    if (!currentImage) {
      toast.error('No image selected')
      return
    }

    if (!objectQuery.trim()) {
      toast.error('Please enter an object to detect')
      return
    }

    setIsLoading(true)
    setDetectedObjects([])

    try {
      // Get image file
      const imageFile = await getImageFile(currentImage)

      // Create Moondream client
      const client = new MoondreamClient({
        baseUrl: selectedModel.endpoint_url,
        apiKey: selectedModel.auth_token,
      })

      // Call detect endpoint
      const result: MoondreamDetectResult = await client.detect({
        image: imageFile,
        object: objectQuery,
      })

      if (!result.objects || result.objects.length === 0) {
        toast.error(`No "${objectQuery}" found in the image`)
        return
      }

      // Convert normalized bboxes to pixel coordinates
      const imageWidth = currentImage.width || 1
      const imageHeight = currentImage.height || 1

      const detected: DetectedObject[] = result.objects.map((obj, index) => {
        const pixelBbox = normalizedBboxToPixels(obj, imageWidth, imageHeight)
        return {
          id: `detect-${index}`,
          bbox: pixelBbox,
          selected: true, // Select all by default
        }
      })

      setDetectedObjects(detected)
      toast.success(`Found ${detected.length} "${objectQuery}" object(s)`)
    } catch (error) {
      console.error('Detection error:', error)
      toast.error('Detection failed. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  const toggleSelection = (id: string) => {
    setDetectedObjects((prev) =>
      prev.map((obj) =>
        obj.id === id ? { ...obj, selected: !obj.selected } : obj
      )
    )
  }

  const selectAll = () => {
    setDetectedObjects((prev) => prev.map((obj) => ({ ...obj, selected: true })))
  }

  const clearSelection = () => {
    setDetectedObjects((prev) =>
      prev.map((obj) => ({ ...obj, selected: false }))
    )
  }

  const handleAddAnnotations = () => {
    if (!labelId) {
      toast.error('Please select a label')
      return
    }

    const selectedObjs = detectedObjects.filter((obj) => obj.selected)
    if (selectedObjs.length === 0) {
      toast.error('No detections selected')
      return
    }

    // Convert to annotation format
    const boxes: Array<[number, number, number, number]> = selectedObjs.map(
      (obj) => [obj.bbox.x, obj.bbox.y, obj.bbox.width, obj.bbox.height]
    )

    const masks: Array<{ polygons: Array<Array<[number, number]>>; area: number }> =
      selectedObjs.map((obj) => ({
        polygons: [],
        area: obj.bbox.width * obj.bbox.height,
      }))

    const scores = selectedObjs.map(() => 1.0) // Moondream doesn't return confidence

    onAnnotationsCreated({
      boxes,
      masks,
      scores,
      annotationType: 'bbox',
      labelId,
      imageId: currentImage?.id,
    })

    toast.success(`Added ${selectedObjs.length} annotation(s)`)
    setDetectedObjects([])
  }

  const selectedCount = detectedObjects.filter((obj) => obj.selected).length

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
        <div className="flex items-center gap-2 flex-1">
          <Target className="w-5 h-5 text-cyan-500" />
          <h2 className="text-lg font-semibold text-gray-900">Moondream Detect</h2>
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
        <div className="bg-cyan-50 border border-cyan-200 rounded-lg p-3">
          <p className="text-sm text-cyan-700">
            Describe any object to detect. Moondream uses zero-shot detection to find objects without pre-training.
          </p>
        </div>

        {/* Object Query Input */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Object to Detect
          </label>
          <div className="relative">
            <input
              type="text"
              value={objectQuery}
              onChange={(e) => setObjectQuery(e.target.value)}
              placeholder="e.g., person, blue car, stop sign"
              className="w-full px-3 py-2 pr-10 bg-white border border-gray-300 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
              disabled={isLoading}
              onKeyDown={(e) => e.key === 'Enter' && handleDetect()}
            />
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          </div>

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
              className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent appearance-none"
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

        {/* Detect Button */}
        <Button
          type="button"
          onClick={handleDetect}
          disabled={isLoading || !objectQuery.trim() || !currentImage}
          className="w-full bg-cyan-600 hover:bg-cyan-700 disabled:bg-gray-300 disabled:text-gray-500 text-white"
        >
          {isLoading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Detecting...
            </>
          ) : (
            <>
              <Target className="w-4 h-4 mr-2" />
              Detect Objects
            </>
          )}
        </Button>

        {/* Detection Results */}
        {detectedObjects.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-700">
                Detection Results ({detectedObjects.length})
              </span>
              <div className="flex gap-2">
                <button
                  onClick={selectAll}
                  className="text-xs text-cyan-600 hover:text-cyan-700"
                >
                  Select All
                </button>
                <span className="text-gray-300">|</span>
                <button
                  onClick={clearSelection}
                  className="text-xs text-gray-600 hover:text-gray-700"
                >
                  Clear
                </button>
              </div>
            </div>

            <div className="space-y-2 max-h-48 overflow-y-auto">
              {detectedObjects.map((obj, index) => (
                <label
                  key={obj.id}
                  className={`flex items-center gap-3 p-2 rounded-lg border cursor-pointer transition-colors ${
                    obj.selected
                      ? 'border-cyan-500 bg-cyan-50'
                      : 'border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={obj.selected}
                    onChange={() => toggleSelection(obj.id)}
                    className="w-4 h-4 text-cyan-600 rounded focus:ring-cyan-500"
                  />
                  <div className="flex-1">
                    <span className="text-sm font-medium text-gray-700">
                      #{index + 1} {objectQuery}
                    </span>
                    <span className="ml-2 text-xs text-gray-500">
                      [{Math.round(obj.bbox.x)}, {Math.round(obj.bbox.y)},{' '}
                      {Math.round(obj.bbox.width)}x{Math.round(obj.bbox.height)}]
                    </span>
                  </div>
                </label>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Actions */}
      {detectedObjects.length > 0 && (
        <div className="px-4 py-3 border-t border-gray-200">
          <Button
            type="button"
            onClick={handleAddAnnotations}
            disabled={selectedCount === 0 || !labelId}
            className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-300 disabled:text-gray-500 text-white"
          >
            <Check className="w-4 h-4 mr-2" />
            Add {selectedCount} Annotation{selectedCount !== 1 ? 's' : ''}
          </Button>
        </div>
      )}
    </div>
  )
}
