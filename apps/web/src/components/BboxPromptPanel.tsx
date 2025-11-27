import { useState, useEffect } from 'react'
import { Loader2, X, Trash2, Square } from 'lucide-react'
import { Button } from './ui/button'
import { PromptModeSelector } from './ui/PromptModeSelector'
import type { Label, ImageData, PromptMode } from '@/types/annotations'
import { sam3Client } from '@/lib/sam3-client'
import toast from 'react-hot-toast'

interface BboxPromptPanelProps {
  labels: Label[]
  selectedLabelId: string | null
  currentImage: ImageData | null
  images: ImageData[]
  promptMode: PromptMode
  setPromptMode: (mode: PromptMode) => void
  onAnnotationsCreated: (results: {
    boxes: Array<[number, number, number, number]>
    masks: Array<{ polygons: Array<Array<[number, number]>>; area: number }>
    scores: number[]
    annotationType: 'bbox' | 'polygon'
    labelId?: string
    imageId?: string
  }) => void
  onClose: () => void
  promptBboxes?: Array<{ x: number; y: number; width: number; height: number; id: string; labelId: string }>
  onPromptBboxesChange?: (bboxes: Array<{ x: number; y: number; width: number; height: number; id: string; labelId: string }>) => void
}

type AnnotationType = 'bbox' | 'polygon'

export function BboxPromptPanel({
  labels,
  currentImage,
  images,
  promptMode,
  setPromptMode,
  onAnnotationsCreated,
  onClose,
  promptBboxes = [],
  onPromptBboxesChange,
}: BboxPromptPanelProps) {
  const [threshold, setThreshold] = useState(0.5)
  const [maskThreshold, setMaskThreshold] = useState(0.5)
  const [annotationType, setAnnotationType] = useState<AnnotationType>('polygon')
  const [isLoading, setIsLoading] = useState(false)

  // Auto-switch to 'single' mode if currently in a disabled mode
  useEffect(() => {
    if (promptMode !== 'single') {
      setPromptMode('single')
    }
  }, []) // Only run on mount

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!currentImage) {
      toast.error('No image selected')
      return
    }

    if (promptBboxes.length === 0) {
      toast.error('Please draw at least one bounding box')
      return
    }

    // Check that all bboxes have labels assigned
    const missingLabels = promptBboxes.filter(bbox => !bbox.labelId)
    if (missingLabels.length > 0) {
      toast.error('Please assign labels to all bounding boxes')
      return
    }

    setIsLoading(true)

    try {
      // Convert blob to File
      const imageFile = new File([currentImage.blob], currentImage.name, {
        type: currentImage.blob.type,
      })

      // Group bboxes by label so we can assign correct labels to detected objects
      const bboxesByLabel = new Map<string, typeof promptBboxes>()
      promptBboxes.forEach(bbox => {
        if (!bboxesByLabel.has(bbox.labelId)) {
          bboxesByLabel.set(bbox.labelId, [])
        }
        bboxesByLabel.get(bbox.labelId)!.push(bbox)
      })

      let totalDetected = 0

      // Call API separately for each unique label
      for (const [labelId, bboxes] of bboxesByLabel) {
        // Convert bboxes to API format: [[x1, y1, x2, y2, 1], ...]
        const bboxesForAPI: Array<[number, number, number, number, number]> = bboxes.map((bbox) => {
          const x1 = bbox.x
          const y1 = bbox.y
          const x2 = bbox.x + bbox.width
          const y2 = bbox.y + bbox.height
          return [x1, y1, x2, y2, 1] // Using 1 as the class ID
        })

        // Call bbox prompt API
        const response = await sam3Client.bboxPrompt({
          image: imageFile,
          bounding_boxes: bboxesForAPI,
          threshold,
          mask_threshold: maskThreshold,
          return_visualization: false,
        })

        const { num_objects, boxes, masks, scores } = response.data

        if (num_objects > 0) {
          totalDetected += num_objects

          // Create annotations with the correct label for this group
          // We need to call a modified version that accepts labelId
          await onAnnotationsCreated({
            boxes,
            masks,
            scores,
            annotationType,
            labelId // Pass the label for this group
          })
        }
      }

      if (totalDetected === 0) {
        toast.error('No objects detected. Try adjusting thresholds.')
        return
      }

      toast.success(`Successfully detected ${totalDetected} object${totalDetected > 1 ? 's' : ''}!`)

      // Clear prompt bboxes after successful inference
      if (onPromptBboxesChange) {
        onPromptBboxesChange([])
      }
    } catch (error) {
      console.error('Bbox-prompt auto-annotate error:', error)
      toast.error('Failed to auto-annotate. Please check the backend connection.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleDeleteBbox = (id: string) => {
    if (onPromptBboxesChange) {
      onPromptBboxesChange(promptBboxes.filter((bbox) => bbox.id !== id))
    }
  }

  const handleClearAll = () => {
    if (onPromptBboxesChange) {
      onPromptBboxesChange([])
    }
  }

  const handleBboxLabelChange = (bboxId: string, newLabelId: string) => {
    if (onPromptBboxesChange) {
      onPromptBboxesChange(
        promptBboxes.map((bbox) =>
          bbox.id === bboxId ? { ...bbox, labelId: newLabelId } : bbox
        )
      )
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Square className="w-5 h-5 text-blue-500" />
          <h2 className="text-lg font-semibold text-gray-900">Bbox-Prompt</h2>
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
      <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* Description */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
          <p className="text-sm text-blue-700">
            Draw bounding boxes around objects on the canvas, then run inference to automatically segment them.
          </p>
        </div>

        {/* Instructions */}
        <div className="bg-white/50 rounded-lg p-3 space-y-2">
          <p className="text-sm font-medium text-gray-900">How to use:</p>
          <ol className="text-xs text-gray-700 space-y-1 list-decimal list-inside">
            <li>Use the Rectangle tool to draw bounding boxes</li>
            <li>Select a label for the annotations</li>
            <li>Adjust thresholds if needed</li>
            <li>Click "Run Auto-Annotate" to detect objects</li>
          </ol>
        </div>

        {/* Drawn Bboxes List */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="block text-sm font-medium text-gray-700">
              Drawn Bounding Boxes ({promptBboxes.length})
            </label>
            {promptBboxes.length > 0 && (
              <button
                type="button"
                onClick={handleClearAll}
                className="text-xs text-red-400 hover:text-red-300"
              >
                Clear All
              </button>
            )}
          </div>
          <div className="bg-white rounded-lg max-h-40 overflow-y-auto">
            {promptBboxes.length === 0 ? (
              <div className="p-4 text-center text-sm text-gray-600">
                No bounding boxes drawn yet. Use the Rectangle tool on the canvas.
              </div>
            ) : (
              <div className="p-2 space-y-2">
                {promptBboxes.map((bbox, index) => {
                  const bboxLabel = labels.find(l => l.id === bbox.labelId)
                  return (
                    <div
                      key={bbox.id}
                      className="p-2 glass-strong rounded space-y-1.5 shadow-md"
                    >
                      {/* Bbox info and delete button */}
                      <div className="flex items-center justify-between">
                        <span className="text-gray-900 font-mono text-xs">
                          Box {index + 1}: ({Math.round(bbox.x)}, {Math.round(bbox.y)}) - {Math.round(bbox.width)}×{Math.round(bbox.height)}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleDeleteBbox(bbox.id)}
                          className="p-1 rounded hover:bg-red-500 transition-colors text-gray-700 hover:text-white"
                          title="Delete"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                      {/* Label selector */}
                      <div className="relative">
                        <select
                          value={bbox.labelId}
                          onChange={(e) => handleBboxLabelChange(bbox.id, e.target.value)}
                          className="w-full px-2 py-1 bg-white border border-gray-300 rounded text-gray-900 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 appearance-none pr-8"
                        >
                          <option value="">Select label...</option>
                          {labels.map((label) => (
                            <option key={label.id} value={label.id}>
                              {label.name}
                            </option>
                          ))}
                        </select>
                        {bboxLabel && (
                          <div
                            className="absolute right-7 top-1/2 -translate-y-1/2 w-3 h-3 rounded"
                            style={{ backgroundColor: bboxLabel.color }}
                          />
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* Annotation Type Selection */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-3">
            Annotation Type
          </label>
          <div className="space-y-2">
            <label className="flex items-center space-x-3 cursor-pointer">
              <input
                type="radio"
                name="annotationType"
                value="polygon"
                checked={annotationType === 'polygon'}
                onChange={(e) => setAnnotationType(e.target.value as AnnotationType)}
                className="w-4 h-4 text-blue-600 focus:ring-blue-500 focus:ring-offset-gray-800"
                disabled={isLoading}
              />
              <div>
                <div className="text-gray-900 font-medium">Polygon / Mask</div>
                <div className="text-sm text-gray-600">
                  Precise segmentation masks following object contours
                </div>
              </div>
            </label>

            <label className="flex items-center space-x-3 cursor-pointer">
              <input
                type="radio"
                name="annotationType"
                value="bbox"
                checked={annotationType === 'bbox'}
                onChange={(e) => setAnnotationType(e.target.value as AnnotationType)}
                className="w-4 h-4 text-blue-600 focus:ring-blue-500 focus:ring-offset-gray-800"
                disabled={isLoading}
              />
              <div>
                <div className="text-gray-900 font-medium">Bounding Box</div>
                <div className="text-sm text-gray-600">
                  Rectangular boxes around detected objects
                </div>
              </div>
            </label>
          </div>
        </div>

        {/* Prompt Mode Selector */}
        <PromptModeSelector
          value={promptMode}
          onChange={setPromptMode}
          disabled={isLoading}
          disabledModes={['auto-apply', 'batch']}
          disabledLabel="(coming soon)"
        />

        {/* Threshold Settings */}
        <div className="space-y-4">
          <div>
            <label htmlFor="threshold" className="block text-sm font-medium text-gray-700 mb-2">
              Detection Threshold: {threshold.toFixed(2)}
            </label>
            <input
              type="range"
              id="threshold"
              min="0"
              max="1"
              step="0.05"
              value={threshold}
              onChange={(e) => setThreshold(parseFloat(e.target.value))}
              className="w-full slider-blue"
              style={{
                background: `linear-gradient(to right, rgb(37, 99, 235) 0%, rgb(37, 99, 235) ${threshold * 100}%, rgb(209, 213, 219) ${threshold * 100}%, rgb(209, 213, 219) 100%)`
              }}
              disabled={isLoading}
            />
            <p className="mt-1 text-xs text-gray-600">
              Higher values = more confident detections (fewer results)
            </p>
          </div>

          <div>
            <label htmlFor="maskThreshold" className="block text-sm font-medium text-gray-700 mb-2">
              Mask Threshold: {maskThreshold.toFixed(2)}
            </label>
            <input
              type="range"
              id="maskThreshold"
              min="0"
              max="1"
              step="0.05"
              value={maskThreshold}
              onChange={(e) => setMaskThreshold(parseFloat(e.target.value))}
              className="w-full slider-blue"
              style={{
                background: `linear-gradient(to right, rgb(37, 99, 235) 0%, rgb(37, 99, 235) ${maskThreshold * 100}%, rgb(209, 213, 219) ${maskThreshold * 100}%, rgb(209, 213, 219) 100%)`
              }}
              disabled={isLoading}
            />
            <p className="mt-1 text-xs text-gray-600">
              Controls segmentation mask precision
            </p>
          </div>
        </div>
      </form>

      {/* Actions */}
      <div className="px-4 py-3 border-t border-gray-200">
        <Button
          type="button"
          onClick={handleSubmit}
          disabled={isLoading || promptBboxes.length === 0 || !currentImage || promptBboxes.some(bbox => !bbox.labelId)}
          className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:text-gray-500 text-white"
        >
          {isLoading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Processing...
            </>
          ) : (
            <>
              <Square className="w-4 h-4 mr-2" />
              Run Auto-Annotate
            </>
          )}
        </Button>
      </div>
    </div>
  )
}
