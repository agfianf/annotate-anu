import { useState } from 'react'
import { Modal } from './ui/Modal'
import { Button } from './ui/button'
import type { Label, ImageData } from '@/types/annotations'
import { sam3Client } from '@/lib/sam3-client'
import { Sparkles, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'

interface AutoAnnotateModalProps {
  isOpen: boolean
  onClose: () => void
  currentImage: ImageData | null
  labels: Label[]
  selectedLabelId: string | null
  onAnnotationsCreated: (results: {
    boxes: Array<[number, number, number, number]>
    masks: Array<{ polygons: Array<Array<[number, number]>>; area: number }>
    scores: number[]
    annotationType: 'bbox' | 'polygon'
  }) => void
}

type AnnotationMode = 'text' | 'bbox'
type AnnotationType = 'bbox' | 'polygon'

export function AutoAnnotateModal({
  isOpen,
  onClose,
  currentImage,
  labels,
  selectedLabelId,
  onAnnotationsCreated,
}: AutoAnnotateModalProps) {
  const [mode, setMode] = useState<AnnotationMode>('text')
  const [annotationType, setAnnotationType] = useState<AnnotationType>('polygon')
  const [textPrompt, setTextPrompt] = useState('')
  const [labelId, setLabelId] = useState(selectedLabelId || '')
  const [threshold, setThreshold] = useState(0.25)
  const [maskThreshold, setMaskThreshold] = useState(0.25)
  const [isLoading, setIsLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!currentImage) {
      toast.error('No image selected')
      return
    }

    if (mode === 'text' && !textPrompt.trim()) {
      toast.error('Please enter a text prompt')
      return
    }

    if (!labelId) {
      toast.error('Please select a label')
      return
    }

    setIsLoading(true)

    try {
      // Convert blob to File
      const imageFile = new File([currentImage.blob], currentImage.name, {
        type: currentImage.blob.type,
      })

      if (mode === 'text') {
        // Call text prompt API
        const response = await sam3Client.textPrompt({
          image: imageFile,
          text_prompt: textPrompt,
          threshold,
          mask_threshold: maskThreshold,
          return_visualization: false,
        })

        const { num_objects, boxes, masks, scores } = response.data

        if (num_objects === 0) {
          toast.error('No objects detected. Try adjusting thresholds or prompt.')
          return
        }

        // Pass results to parent component
        onAnnotationsCreated({ boxes, masks, scores, annotationType })

        toast.success(`Successfully detected ${num_objects} object${num_objects > 1 ? 's' : ''}!`)
        onClose()
      } else {
        // Bbox mode - to be implemented later
        toast.error('Bounding box mode not yet implemented')
      }
    } catch (error) {
      console.error('Auto-annotate error:', error)
      toast.error('Failed to auto-annotate. Please check the backend connection.')
    } finally {
      setIsLoading(false)
    }
  }

  const selectedLabel = labels.find((l) => l.id === labelId)

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Auto-Annotate" maxWidth="lg">
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Mode Selection */}
        <div>
          <label className="block text-sm font-medium text-gray-800 mb-3">
            Annotation Mode
          </label>
          <div className="space-y-2">
            <label className="flex items-center space-x-3 cursor-pointer">
              <input
                type="radio"
                name="mode"
                value="text"
                checked={mode === 'text'}
                onChange={(e) => setMode(e.target.value as AnnotationMode)}
                className="w-4 h-4 text-purple-600 focus:ring-purple-500 focus:ring-offset-white"
              />
              <div>
                <div className="text-gray-900 font-medium">Text Prompt</div>
                <div className="text-sm text-gray-700">
                  Describe what to detect (e.g., "truck plate", "person")
                </div>
              </div>
            </label>

            <label className="flex items-center space-x-3 cursor-pointer opacity-50">
              <input
                type="radio"
                name="mode"
                value="bbox"
                checked={mode === 'bbox'}
                onChange={(e) => setMode(e.target.value as AnnotationMode)}
                disabled
                className="w-4 h-4 text-purple-600 focus:ring-purple-500 focus:ring-offset-white"
              />
              <div>
                <div className="text-gray-900 font-medium">Bounding Box</div>
                <div className="text-sm text-gray-700">
                  Use existing annotations as prompts (coming soon)
                </div>
              </div>
            </label>
          </div>
        </div>

        {/* Text Prompt Input */}
        {mode === 'text' && (
          <div>
            <label htmlFor="textPrompt" className="block text-sm font-medium text-gray-800 mb-2">
              Text Prompt
            </label>
            <input
              type="text"
              id="textPrompt"
              value={textPrompt}
              onChange={(e) => setTextPrompt(e.target.value)}
              placeholder="e.g., truck plate, person, car"
              className="w-full px-3 py-2 bg-white/80 border border-gray-300 rounded-lg text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              disabled={isLoading}
            />
            <p className="mt-1 text-xs text-gray-600">
              Describe the object(s) you want to detect in the image
            </p>
          </div>
        )}

        {/* Label Selection */}
        <div>
          <label htmlFor="labelSelect" className="block text-sm font-medium text-gray-800 mb-2">
            Assign Label
          </label>
          <div className="relative">
            <select
              id="labelSelect"
              value={labelId}
              onChange={(e) => setLabelId(e.target.value)}
              className="w-full px-3 py-2 bg-white/80 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent appearance-none"
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
          <p className="mt-1 text-xs text-gray-600">
            All detected objects will be tagged with this label
          </p>
        </div>

        {/* Annotation Type Selection */}
        <div>
          <label className="block text-sm font-medium text-gray-800 mb-3">
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
                className="w-4 h-4 text-purple-600 focus:ring-purple-500 focus:ring-offset-white"
                disabled={isLoading}
              />
              <div>
                <div className="text-gray-900 font-medium">Polygon / Mask</div>
                <div className="text-sm text-gray-700">
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
                className="w-4 h-4 text-purple-600 focus:ring-purple-500 focus:ring-offset-white"
                disabled={isLoading}
              />
              <div>
                <div className="text-gray-900 font-medium">Bounding Box</div>
                <div className="text-sm text-gray-700">
                  Rectangular boxes around detected objects
                </div>
              </div>
            </label>
          </div>
        </div>

        {/* Threshold Settings */}
        <div className="space-y-4">
          <div>
            <label htmlFor="threshold" className="block text-sm font-medium text-gray-800 mb-2">
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
              className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-purple-600"
              disabled={isLoading}
            />
            <p className="mt-1 text-xs text-gray-600">
              Higher values = more confident detections (fewer results)
            </p>
          </div>

          <div>
            <label htmlFor="maskThreshold" className="block text-sm font-medium text-gray-800 mb-2">
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
              className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-purple-600"
              disabled={isLoading}
            />
            <p className="mt-1 text-xs text-gray-600">
              Controls segmentation mask precision
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200/50">
          <Button variant="outline" onClick={onClose} type="button" disabled={isLoading}>
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={isLoading || (mode === 'text' && !textPrompt.trim()) || !labelId}
            className="bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 disabled:opacity-50"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 mr-2" />
                Run Auto-Annotate
              </>
            )}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
