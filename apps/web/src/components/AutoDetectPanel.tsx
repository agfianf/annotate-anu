import { useState } from 'react'
import { Loader2, Scan, X } from 'lucide-react'
import { Button } from './ui/button'
import type { Label, ImageData } from '@/types/annotations'
import type { AvailableModel } from '@/types/byom'
import { inferenceClient } from '@/lib/inference-client'
import { imagesApi } from '@/lib/api-client'
import toast from 'react-hot-toast'

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
    console.log('[AutoDetectPanel] Fetching job image from:', imageUrl)
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

interface AutoDetectPanelProps {
  labels: Label[]
  selectedLabelId: string | null
  currentImage: ImageData | null
  onAnnotationsCreated: (results: {
    boxes: Array<[number, number, number, number]>
    masks: Array<{ polygons: Array<Array<[number, number]>>; area: number }>
    scores: number[]
    annotationType: 'bbox' | 'polygon'
    labelId?: string
    labels?: string[]
  }) => void
  onClose: () => void
  selectedModel: AvailableModel
}

export function AutoDetectPanel({
  labels,
  selectedLabelId,
  currentImage,
  onAnnotationsCreated,
  onClose,
  selectedModel,
}: AutoDetectPanelProps) {
  const [threshold, setThreshold] = useState(0.5)
  const [classFilter, setClassFilter] = useState<string[]>([])
  const [annotationType, setAnnotationType] = useState<'bbox' | 'polygon'>(
    selectedModel.capabilities.output_types.includes('polygon') ? 'polygon' : 'bbox'
  )
  const [isLoading, setIsLoading] = useState(false)

  const availableClasses = selectedModel.capabilities.classes || []
  const supportsClassFilter = selectedModel.capabilities.supports_class_filter && availableClasses.length > 0

  const handleDetect = async () => {
    if (!currentImage) {
      toast.error('No image selected')
      return
    }

    setIsLoading(true)

    try {
      // Get image file (handles both local and job mode)
      const imageFile = await getImageFile(currentImage)
      console.log(`[AutoDetectPanel] Image file size: ${imageFile.size} bytes`)

      const result = await inferenceClient.autoDetect(selectedModel, {
        image: imageFile,
        threshold,
        class_filter: classFilter.length > 0 ? classFilter : undefined,
      })

      if (result.num_objects === 0) {
        toast.error('No objects detected')
        setIsLoading(false)
        return
      }

      // Convert boxes from flat arrays to tuples
      const boxes = result.boxes.map((box): [number, number, number, number] => [
        box[0], box[1], box[2], box[3]
      ])

      await onAnnotationsCreated({
        boxes,
        masks: result.masks,
        scores: result.scores,
        annotationType,
        labelId: selectedLabelId || undefined,
        labels: result.labels,
        modelId: selectedModel.id,
      })

      toast.success(`Detected ${result.num_objects} object(s)`)
    } catch (error) {
      console.error('Auto-detect error:', error)
      toast.error(error instanceof Error ? error.message : 'Auto-detection failed')
    } finally {
      setIsLoading(false)
    }
  }

  const toggleClassFilter = (cls: string) => {
    if (classFilter.includes(cls)) {
      setClassFilter(classFilter.filter((c) => c !== cls))
    } else {
      setClassFilter([...classFilter, cls])
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Scan className="w-5 h-5 text-orange-500" />
          <h2 className="text-lg font-semibold text-gray-900">Auto-Detect</h2>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded hover:bg-gray-100 transition-colors"
        >
          <X className="w-5 h-5 text-gray-500" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* Model Info */}
        <div className="bg-orange-50 border border-orange-200 rounded-lg p-3">
          <p className="text-sm text-orange-700">
            <span className="font-medium">{selectedModel.name}</span> will automatically
            detect all objects in the image without prompts.
          </p>
        </div>

        {/* Class Filter (if supported) */}
        {supportsClassFilter && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Filter Classes (optional)
            </label>
            <p className="text-xs text-gray-500 mb-2">
              Select specific classes to detect. Leave empty to detect all.
            </p>
            <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
              {availableClasses.map((cls) => (
                <button
                  key={cls}
                  onClick={() => toggleClassFilter(cls)}
                  className={`px-2 py-1 text-xs rounded-full border transition-colors ${
                    classFilter.includes(cls)
                      ? 'bg-orange-500 text-white border-orange-500'
                      : 'bg-white text-gray-700 border-gray-300 hover:border-orange-300'
                  }`}
                >
                  {cls}
                </button>
              ))}
            </div>
            {classFilter.length > 0 && (
              <button
                onClick={() => setClassFilter([])}
                className="mt-2 text-xs text-orange-600 hover:text-orange-700"
              >
                Clear selection
              </button>
            )}
          </div>
        )}

        {/* Threshold */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Confidence Threshold: {(threshold * 100).toFixed(0)}%
          </label>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={threshold}
            onChange={(e) => setThreshold(parseFloat(e.target.value))}
            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-orange-500"
          />
          <div className="flex justify-between text-xs text-gray-500 mt-1">
            <span>Low (more detections)</span>
            <span>High (fewer detections)</span>
          </div>
        </div>

        {/* Output Type */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Output Type
          </label>
          <div className="space-y-2">
            {selectedModel.capabilities.output_types.includes('polygon') && (
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  value="polygon"
                  checked={annotationType === 'polygon'}
                  onChange={() => setAnnotationType('polygon')}
                  className="text-orange-500 focus:ring-orange-500"
                />
                <span className="text-sm text-gray-700">Polygon (segmentation mask)</span>
              </label>
            )}
            {selectedModel.capabilities.output_types.includes('bbox') && (
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  value="bbox"
                  checked={annotationType === 'bbox'}
                  onChange={() => setAnnotationType('bbox')}
                  className="text-orange-500 focus:ring-orange-500"
                />
                <span className="text-sm text-gray-700">Bounding Box</span>
              </label>
            )}
          </div>
        </div>

        {/* Label Assignment */}
        {labels.length > 0 && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Assign Label
            </label>
            <p className="text-xs text-gray-500 mb-2">
              {selectedModel.capabilities.classes
                ? 'Detected class labels will be used when available.'
                : 'Selected label will be applied to all detections.'}
            </p>
            <div className="text-sm text-gray-600 bg-gray-50 rounded p-2">
              {selectedLabelId
                ? labels.find((l) => l.id === selectedLabelId)?.name || 'Unknown'
                : 'No label selected'}
            </div>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="px-4 py-3 border-t border-gray-200">
        <Button
          onClick={handleDetect}
          disabled={isLoading || !currentImage}
          className="w-full bg-orange-600 hover:bg-orange-700 text-white disabled:bg-gray-300"
        >
          {isLoading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Detecting...
            </>
          ) : (
            <>
              <Scan className="w-4 h-4 mr-2" />
              Run Auto-Detect
            </>
          )}
        </Button>
        {!currentImage && (
          <p className="text-xs text-gray-500 text-center mt-2">
            Select an image to enable detection
          </p>
        )}
      </div>
    </div>
  )
}
