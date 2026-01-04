import { inferenceClient } from '@/lib/inference-client'
import { imagesApi } from '@/lib/api-client'
import type { ImageData, Label, PromptMode } from '@/types/annotations'
import type { AvailableModel } from '@/types/byom'
import { Loader2, Sparkles, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { BatchProgressModal, type BatchProgressItem } from './ui/BatchProgressModal'
import { Button } from './ui/button'
import { ImageSelectorModal } from './ui/ImageSelectorModal'
import { PromptModeSelector } from './ui/PromptModeSelector'

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
    console.log('[TextPromptPanel] Fetching job image from:', imageUrl)
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

interface TextPromptPanelProps {
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
  currentAnnotations?: any[] // Add annotations to check if image already has AI annotations
  onLoadingChange?: (loading: boolean) => void // Callback to notify parent of loading state
  onTextPromptChange?: (prompt: string) => void // Callback to notify parent of text prompt changes
  selectedModel: AvailableModel
}

type AnnotationType = 'bbox' | 'polygon'

export function TextPromptPanel({
  labels,
  selectedLabelId,
  currentImage,
  images,
  promptMode,
  setPromptMode,
  onAnnotationsCreated,
  onClose,
  currentAnnotations = [],
  onLoadingChange,
  onTextPromptChange,
  selectedModel,
}: TextPromptPanelProps) {
  const [textPrompt, setTextPrompt] = useState(() => {
    const saved = localStorage.getItem('textPrompt')
    return saved || ''
  })
  const [labelId, setLabelId] = useState(selectedLabelId || '')
  const [threshold, setThreshold] = useState(0.25)
  const [maskThreshold, setMaskThreshold] = useState(0.25)
  const [simplifyTolerance, setSimplifyTolerance] = useState(1.5)
  const [annotationType, setAnnotationType] = useState<AnnotationType>('polygon')
  const [isLoading, setIsLoading] = useState(false)

  // Batch mode state
  const [showImageSelector, setShowImageSelector] = useState(false)
  const [showBatchProgress, setShowBatchProgress] = useState(false)
  const [batchProgress, setBatchProgress] = useState<BatchProgressItem[]>([])
  const [batchCurrentIndex, setBatchCurrentIndex] = useState(0)
  const batchCancelRef = useRef(false)

  // Track if user has run the prompt at least once (to enable auto-apply)
  const [hasRunOnce, setHasRunOnce] = useState(false)
  const lastProcessedImageIdRef = useRef<string | null>(null)

  // Sync labelId with selectedLabelId from parent
  useEffect(() => {
    if (selectedLabelId) {
      setLabelId(selectedLabelId)
    }
  }, [selectedLabelId])

  // Notify parent of text prompt changes for indicator display
  useEffect(() => {
    onTextPromptChange?.(textPrompt)
  }, [textPrompt, onTextPromptChange])

  // Persist text prompt to localStorage
  useEffect(() => {
    localStorage.setItem('textPrompt', textPrompt)
  }, [textPrompt])

  // Reset auto-apply state only when switching away from auto-apply mode
  useEffect(() => {
    // Only reset when switching to single or batch mode
    if (promptMode === 'single' || promptMode === 'batch') {
      setHasRunOnce(false)
      lastProcessedImageIdRef.current = null
    }
  }, [promptMode])

  // Auto-apply mode: Execute prompt when image changes (but only after user has run manually once)
  useEffect(() => {
    console.log('[AUTO-APPLY] Effect triggered', {
      promptMode,
      currentImage: currentImage?.name,
      hasRunOnce,
      textPrompt,
      labelId,
      isLoading,
      annotationsCount: currentAnnotations.length
    })

    if (promptMode !== 'auto-apply') {
      console.log('[AUTO-APPLY] Guard: Not in auto-apply mode')
      return
    }
    if (!currentImage) {
      console.log('[AUTO-APPLY] Guard: No current image')
      return
    }
    if (!hasRunOnce) {
      console.log('[AUTO-APPLY] Guard: hasRunOnce is false - user must run manually first')
      return
    }
    if (!textPrompt.trim()) {
      console.log('[AUTO-APPLY] Guard: No text prompt entered')
      return
    }
    if (!labelId) {
      console.log('[AUTO-APPLY] Guard: No label selected')
      return
    }
    if (isLoading) {
      console.log('[AUTO-APPLY] Guard: Already loading')
      return
    }

    // Don't re-process the same image
    if (lastProcessedImageIdRef.current === currentImage.id) {
      console.log('[AUTO-APPLY] Guard: Image already processed (lastProcessed =', lastProcessedImageIdRef.current, ')')
      return
    }

    // Skip if image already has auto-generated annotations
    const hasAutoAnnotations = currentAnnotations.some((ann: any) => ann.isAutoGenerated)
    if (hasAutoAnnotations) {
      console.log(`[AUTO-APPLY] Guard: Skipping "${currentImage.name}" - already has AI annotations`)
      lastProcessedImageIdRef.current = currentImage.id
      return
    }

    console.log(`[AUTO-APPLY] ✓ All checks passed - triggering for "${currentImage.name}"`)
    console.log(`[AUTO-APPLY] Settings - Prompt: "${textPrompt}", Label: ${labelId}, Threshold: ${threshold}`)

    const autoExecute = async () => {
      console.log(`[AUTO-APPLY] Starting auto-execute for "${currentImage.name}"`)
      setIsLoading(true)
      onLoadingChange?.(true) // Notify parent to show dimming effect
      console.log('[AUTO-APPLY] Loading state set to TRUE, dimming overlay should show')

      try {
        // Get image file (handles both local and job mode)
        const imageFile = await getImageFile(currentImage)
        console.log(`[AUTO-APPLY] Image file size: ${imageFile.size} bytes`)

        console.log(`[AUTO-APPLY] Calling inference API with ${selectedModel.name} for "${currentImage.name}"...`)
        // Call text prompt API using unified inference client
        const result = await inferenceClient.textPrompt(selectedModel, {
          image: imageFile,
          text_prompt: textPrompt,
          threshold,
          mask_threshold: maskThreshold,
          return_visualization: false,
        })
        console.log(`[AUTO-APPLY] API response received for "${currentImage.name}":`, result)

        const { num_objects, boxes, masks, scores } = result

        // Mark this image as processed
        lastProcessedImageIdRef.current = currentImage.id
        console.log('[AUTO-APPLY] Marked image as processed:', currentImage.id)

        if (num_objects === 0) {
          console.log('[AUTO-APPLY] No objects detected')
          toast.error(`No objects detected in "${currentImage.name}"`)
          return
        }

        // Use selected annotation type and label
        console.log(`[AUTO-APPLY] Creating ${num_objects} annotations`)
        await onAnnotationsCreated({ boxes, masks, scores, annotationType, labelId, modelId: selectedModel.id })

        toast.success(`Auto-detected ${num_objects} object${num_objects > 1 ? 's' : ''} in "${currentImage.name}"`)
      } catch (error) {
        console.error('[AUTO-APPLY] Error occurred:', error)
        console.error('[AUTO-APPLY] Error details:', error)
        toast.error(`Failed to auto-annotate "${currentImage.name}"`)
        // Mark as processed even on error to avoid retry loop
        lastProcessedImageIdRef.current = currentImage.id
      } finally {
        console.log(`[AUTO-APPLY] Cleaning up loading state for "${currentImage.name}"`)
        setIsLoading(false)
        onLoadingChange?.(false) // Hide dimming effect
        console.log('[AUTO-APPLY] Loading state set to FALSE, dimming overlay should hide')
      }
    }

    autoExecute().catch(err => {
      console.error('[AUTO-APPLY] Unhandled error in autoExecute:', err)
      setIsLoading(false)
      onLoadingChange?.(false)
    })
  }, [currentImage?.id, promptMode, textPrompt, labelId, threshold, maskThreshold, annotationType, hasRunOnce, currentAnnotations.length])

  const runPrompt = async () => {
    if (!currentImage) {
      toast.error('No image selected')
      return
    }

    if (!textPrompt.trim()) {
      toast.error('Please enter a text prompt')
      return
    }

    if (!labelId) {
      toast.error('Please select a label')
      return
    }

    setIsLoading(true)
    console.log(`Manual run triggered for "${currentImage.name}"`)

    try {
      // Get image file (handles both local and job mode)
      const imageFile = await getImageFile(currentImage)
      console.log(`[MANUAL] Image file size: ${imageFile.size} bytes`)

      console.log(`Calling API manually with ${selectedModel.name} for "${currentImage.name}"...`)
      // Call text prompt API using unified inference client
      const result = await inferenceClient.textPrompt(selectedModel, {
        image: imageFile,
        text_prompt: textPrompt,
        threshold,
        mask_threshold: maskThreshold,
        simplify_tolerance: simplifyTolerance,
        return_visualization: false,
      })
      console.log(`Manual API response:`, result)

      const { num_objects, boxes, masks, scores } = result

      if (num_objects === 0) {
        toast.error('No objects detected. Try adjusting thresholds or prompt.')
        return
      }

      // Use selected annotation type and label
      await onAnnotationsCreated({ boxes, masks, scores, annotationType, labelId, modelId: selectedModel.id })

      toast.success(`Successfully detected ${num_objects} object${num_objects > 1 ? 's' : ''}!`)

      // Mark that user has run at least once (enables auto-apply)
      setHasRunOnce(true)
      lastProcessedImageIdRef.current = currentImage.id
      console.log(`Auto-apply enabled! hasRunOnce = true`)

      // Reset form only in single mode (keep prompt in auto-apply mode for reuse)
      if (promptMode === 'single') {
        setTextPrompt('')
      }
    } catch (error) {
      console.error('Text-prompt auto-annotate error:', error)
      toast.error('Failed to auto-annotate. Please check the backend connection.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await runPrompt()
  }

  const handleBatchStart = async (selectedImageIds: string[]) => {
    if (!textPrompt.trim() || !labelId) {
      toast.error('Please enter a text prompt and select a label')
      return
    }

    // Show confirmation
    const confirmed = window.confirm(
      `Process ${selectedImageIds.length} image${selectedImageIds.length !== 1 ? 's' : ''} with text prompt "${textPrompt}"?`
    )
    if (!confirmed) return

    // Initialize progress tracking
    const imagesToProcess = images.filter(img => selectedImageIds.includes(img.id))
    const progressItems: BatchProgressItem[] = imagesToProcess.map(img => ({
      imageName: img.name,
      status: 'pending' as const,
    }))

    setBatchProgress(progressItems)
    setBatchCurrentIndex(0)
    setShowBatchProgress(true)
    batchCancelRef.current = false

    // Process images sequentially
    for (let i = 0; i < imagesToProcess.length; i++) {
      if (batchCancelRef.current) {
        toast.success('Batch processing cancelled')
        break
      }

      const image = imagesToProcess[i]
      setBatchCurrentIndex(i)

      // Update status to processing
      setBatchProgress(prev => prev.map((item, idx) =>
        idx === i ? { ...item, status: 'processing' } : item
      ))

      try {
        // Convert blob to File
        const imageFile = new File([image.blob], image.name, {
          type: image.blob.type,
        })

        // Call text prompt API using unified inference client
        const result = await inferenceClient.textPrompt(selectedModel, {
          image: imageFile,
          text_prompt: textPrompt,
          threshold,
          mask_threshold: maskThreshold,
          simplify_tolerance: simplifyTolerance,
          return_visualization: false,
        })

        const { num_objects, boxes, masks, scores } = result

        if (num_objects === 0) {
          setBatchProgress(prev => prev.map((item, idx) =>
            idx === i ? { ...item, status: 'error', error: 'No objects detected' } : item
          ))
        } else {
          // Use selected annotation type and label - pass imageId for batch processing
          await onAnnotationsCreated({ boxes, masks, scores, annotationType, labelId, imageId: image.id, modelId: selectedModel.id })

          setBatchProgress(prev => prev.map((item, idx) =>
            idx === i ? { ...item, status: 'success', count: num_objects } : item
          ))
        }
      } catch (error) {
        console.error(`Batch processing error for ${image.name}:`, error)
        setBatchProgress(prev => prev.map((item, idx) =>
          idx === i ? { ...item, status: 'error', error: 'Processing failed' } : item
        ))
      }
    }

    const successCount = batchProgress.filter(p => p.status === 'success').length
    const errorCount = batchProgress.filter(p => p.status === 'error').length
    toast.success(`Batch complete: ${successCount} succeeded, ${errorCount} failed`)
  }

  const handleBatchCancel = () => {
    batchCancelRef.current = true
    setShowBatchProgress(false)
  }

  const handleActionButtonClick = async () => {
    if (promptMode === 'batch') {
      setShowImageSelector(true)
    } else {
      await runPrompt()
    }
  }

  const selectedLabel = labels.find((l) => l.id === labelId)

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
        <div className="flex items-center gap-2 flex-1">
          <Sparkles className="w-5 h-5 text-purple-500" />
          <h2 className="text-lg font-semibold text-gray-900">Text-Prompt</h2>
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
        <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
          <p className="text-sm text-purple-700">
            Describe what objects you want to detect in natural language. The AI will automatically find and segment them.
          </p>
        </div>

        {/* Text Prompt Input */}
        <div>
          <label htmlFor="textPrompt" className="block text-sm font-medium text-gray-700 mb-2">
            Text Prompt
          </label>
          <input
            type="text"
            id="textPrompt"
            value={textPrompt}
            onChange={(e) => setTextPrompt(e.target.value)}
            placeholder="e.g., truck plate, person, car"
            className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            disabled={isLoading}
          />
          <p className="mt-1 text-xs text-gray-600">
            Describe the object(s) you want to detect
          </p>
        </div>

        {/* Label Selection */}
        <div>
          <label htmlFor="labelSelect" className="block text-sm font-medium text-gray-700 mb-2">
            Assign Label
          </label>
          <div className="relative">
            <select
              id="labelSelect"
              value={labelId}
              onChange={(e) => setLabelId(e.target.value)}
              className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent appearance-none"
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
                className="w-4 h-4 text-purple-600 focus:ring-purple-500 focus:ring-offset-gray-800"
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
                className="w-4 h-4 text-purple-600 focus:ring-purple-500 focus:ring-offset-gray-800"
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
              className="w-full slider-purple"
              style={{
                background: `linear-gradient(to right, rgb(147, 51, 234) 0%, rgb(147, 51, 234) ${threshold * 100}%, rgb(209, 213, 219) ${threshold * 100}%, rgb(209, 213, 219) 100%)`
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
              className="w-full slider-purple"
              style={{
                background: `linear-gradient(to right, rgb(147, 51, 234) 0%, rgb(147, 51, 234) ${maskThreshold * 100}%, rgb(209, 213, 219) ${maskThreshold * 100}%, rgb(209, 213, 219) 100%)`
              }}
              disabled={isLoading}
            />
            <p className="mt-1 text-xs text-gray-600">
              Controls segmentation mask precision
            </p>
          </div>

          <div>
            <label htmlFor="simplifyTolerance" className="block text-sm font-medium text-gray-700 mb-2">
              Polygon Simplification: {simplifyTolerance.toFixed(1)}
            </label>
            <input
              type="range"
              id="simplifyTolerance"
              min="0"
              max="10"
              step="0.5"
              value={simplifyTolerance}
              onChange={(e) => setSimplifyTolerance(parseFloat(e.target.value))}
              className="w-full slider-purple"
              style={{
                background: `linear-gradient(to right, rgb(147, 51, 234) 0%, rgb(147, 51, 234) ${simplifyTolerance * 10}%, rgb(209, 213, 219) ${simplifyTolerance * 10}%, rgb(209, 213, 219) 100%)`
              }}
              disabled={isLoading}
            />
            <p className="mt-1 text-xs text-gray-600">
              Reduces polygon points while preserving shape (higher = simpler polygons)
            </p>
          </div>
        </div>
      </form>

      {/* Actions */}
      <div className="px-4 py-3 border-t border-gray-200">
        <Button
          type="button"
          onClick={handleActionButtonClick}
          disabled={isLoading || !textPrompt.trim() || !labelId || (promptMode === 'single' && !currentImage)}
          className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-gray-300 disabled:text-gray-500 text-white"
        >
          {isLoading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Processing...
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4 mr-2" />
              {promptMode === 'batch' ? 'Select Images & Process' : 'Run Auto-Annotate'}
            </>
          )}
        </Button>
      </div>

      {/* Modals */}
      <ImageSelectorModal
        isOpen={showImageSelector}
        onClose={() => setShowImageSelector(false)}
        images={images}
        onConfirm={handleBatchStart}
      />

      <BatchProgressModal
        isOpen={showBatchProgress}
        onCancel={handleBatchCancel}
        progress={batchProgress}
        currentIndex={batchCurrentIndex}
        total={batchProgress.length}
      />
    </div>
  )
}
