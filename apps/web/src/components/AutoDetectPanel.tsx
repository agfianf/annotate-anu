import { useState, useEffect, useRef, useCallback } from 'react'
import { Loader2, Scan, X, Images } from '@/components/ui/icons'
import { Button } from './ui/button'
import { LabelMappingSection } from './LabelMappingSection'
import type { Annotation, Label, ImageData, DetectionLabelMappingConfig } from '@/types/annotations'
import type { AvailableModel } from '@/types/byom'
import { inferenceClient } from '@/lib/inference-client'
import { imagesApi } from '@/lib/api-client'
import {
  buildDefaultMapping,
  saveLabelMapping,
  loadLabelMapping,
  getLabelMappingStorageKey,
  resolveAllLabels,
  filterSkippedDetections,
} from '@/lib/label-mapping-utils'
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
  images: ImageData[]
  allAnnotations: Annotation[]
  onAnnotationsCreated: (results: {
    boxes: Array<[number, number, number, number]>
    masks: Array<{ polygons: Array<Array<[number, number]>>; area: number }>
    scores: number[]
    annotationType: 'bbox' | 'polygon'
    labelId?: string
    labelIds?: string[]
    imageId?: string
    modelId?: string
  }) => void
  onClose: () => void
  selectedModel: AvailableModel
}

export function AutoDetectPanel({
  labels,
  selectedLabelId,
  currentImage,
  images,
  allAnnotations,
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
  const [batchMode, setBatchMode] = useState(false)
  const [batchProgress, setBatchProgress] = useState<{ current: number; total: number; skipped: number } | null>(null)
  const [labelMapping, setLabelMapping] = useState<DetectionLabelMappingConfig>({})
  const cancelRef = useRef(false)

  const availableClasses = selectedModel.capabilities.classes || []
  const hasModelClasses = availableClasses.length > 0
  const supportsClassFilter = selectedModel.capabilities.supports_class_filter && hasModelClasses

  // Derive project context for localStorage key (jobId or "local")
  const projectContext = currentImage?.jobId?.toString() || 'local'
  const storageKey = getLabelMappingStorageKey(selectedModel.id, projectContext)

  // Load/initialize label mapping when model changes
  useEffect(() => {
    if (!hasModelClasses) {
      setLabelMapping({})
      return
    }

    const saved = loadLabelMapping(storageKey)
    if (saved) {
      // Merge saved mapping with current classes (handle new/removed classes)
      const merged = buildDefaultMapping(availableClasses, labels)
      for (const cls of availableClasses) {
        if (saved[cls]) {
          // Validate that mapped label still exists
          if (saved[cls].action === 'map' && saved[cls].projectLabelId) {
            const labelExists = labels.some((l) => l.id === saved[cls].projectLabelId)
            if (labelExists) {
              merged[cls] = saved[cls]
            }
          } else {
            merged[cls] = saved[cls]
          }
        }
      }
      setLabelMapping(merged)
    } else {
      setLabelMapping(buildDefaultMapping(availableClasses, labels))
    }
  }, [selectedModel.id, storageKey, hasModelClasses]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleMappingChange = useCallback((newMapping: DetectionLabelMappingConfig) => {
    setLabelMapping(newMapping)
    saveLabelMapping(storageKey, newMapping)
  }, [storageKey])

  const handleResetMapping = useCallback(() => {
    const defaults = buildDefaultMapping(availableClasses, labels)
    setLabelMapping(defaults)
    saveLabelMapping(storageKey, defaults)
  }, [availableClasses, labels, storageKey])

  /**
   * Check if an image already has auto-detect annotations from the current model
   */
  const imageHasModelAnnotations = useCallback((imageId: string) => {
    const modelSource = `model:${selectedModel.id}`
    return allAnnotations.some(
      (a) => a.imageId === imageId && a.source === modelSource
    )
  }, [allAnnotations, selectedModel.id])

  /**
   * Process a single image detection and call onAnnotationsCreated with resolved labels
   */
  const processDetection = async (image: ImageData) => {
    const imageFile = await getImageFile(image)

    const result = await inferenceClient.autoDetect(selectedModel, {
      image: imageFile,
      threshold,
      class_filter: classFilter.length > 0 ? classFilter : undefined,
    })

    if (result.num_objects === 0) return 0

    // Convert boxes from flat arrays to tuples
    const boxes = result.boxes.map((box): [number, number, number, number] => [
      box[0], box[1], box[2], box[3]
    ])

    // Resolve per-detection labels via mapping
    const resolved = resolveAllLabels(
      result.labels,
      labelMapping,
      selectedLabelId,
      result.num_objects
    )

    // Filter out skipped detections
    const { filtered: filteredBoxes, labelIds } = filterSkippedDetections(boxes, resolved)
    const { filtered: filteredMasks } = filterSkippedDetections(result.masks, resolved)
    const { filtered: filteredScores } = filterSkippedDetections(result.scores, resolved)

    if (filteredBoxes.length === 0) return 0

    await onAnnotationsCreated({
      boxes: filteredBoxes,
      masks: filteredMasks,
      scores: filteredScores,
      annotationType,
      labelIds,
      imageId: image.id,
      modelId: selectedModel.id,
    })

    return filteredBoxes.length
  }

  const handleDetect = async () => {
    if (!currentImage) {
      toast.error('No image selected')
      return
    }

    setIsLoading(true)

    try {
      const count = await processDetection(currentImage)

      if (count === 0) {
        toast.error('No objects detected (or all were skipped by mapping)')
      } else {
        toast.success(`Detected ${count} object(s)`)
      }
    } catch (error) {
      console.error('Auto-detect error:', error)
      toast.error(error instanceof Error ? error.message : 'Auto-detection failed')
    } finally {
      setIsLoading(false)
    }
  }

  const handleBatchDetect = async () => {
    cancelRef.current = false
    setIsLoading(true)

    // Determine which images to process (skip already-detected)
    const imagesToProcess: ImageData[] = []
    let skippedCount = 0
    for (const img of images) {
      if (imageHasModelAnnotations(img.id)) {
        skippedCount++
      } else {
        imagesToProcess.push(img)
      }
    }

    if (imagesToProcess.length === 0) {
      toast.error('All images already have detections from this model')
      setIsLoading(false)
      return
    }

    setBatchProgress({ current: 0, total: imagesToProcess.length, skipped: skippedCount })

    let totalDetections = 0
    let processedCount = 0
    let failedCount = 0

    for (let i = 0; i < imagesToProcess.length; i++) {
      if (cancelRef.current) break

      setBatchProgress({ current: i + 1, total: imagesToProcess.length, skipped: skippedCount })

      try {
        const count = await processDetection(imagesToProcess[i])
        totalDetections += count
        processedCount++
      } catch (error) {
        console.error(`Batch detect failed for image ${imagesToProcess[i].name}:`, error)
        failedCount++
      }
    }

    setIsLoading(false)
    setBatchProgress(null)

    if (cancelRef.current) {
      toast.success(`Cancelled. ${totalDetections} detections in ${processedCount} images.`)
    } else {
      const msg = `Batch complete: ${totalDetections} detections across ${processedCount} images.`
      const extra = failedCount > 0 ? ` ${failedCount} failed.` : ''
      const skipMsg = skippedCount > 0 ? ` ${skippedCount} skipped (already detected).` : ''
      toast.success(msg + extra + skipMsg)
    }
  }

  const handleCancel = () => {
    cancelRef.current = true
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
          disabled={isLoading}
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

        {/* Label Mapping (when model has classes) */}
        {hasModelClasses && labels.length > 0 && (
          <LabelMappingSection
            modelClasses={availableClasses}
            projectLabels={labels}
            mapping={labelMapping}
            onMappingChange={handleMappingChange}
            onReset={handleResetMapping}
          />
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

        {/* Label Assignment (only when model has NO classes — fallback mode) */}
        {!hasModelClasses && labels.length > 0 && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Assign Label
            </label>
            <p className="text-xs text-gray-500 mb-2">
              Selected label will be applied to all detections.
            </p>
            <div className="text-sm text-gray-600 bg-gray-50 rounded p-2">
              {selectedLabelId
                ? labels.find((l) => l.id === selectedLabelId)?.name || 'Unknown'
                : 'No label selected'}
            </div>
          </div>
        )}

        {/* Batch Mode Toggle */}
        {images.length > 1 && (
          <div className="flex items-center justify-between py-2 px-3 bg-gray-50 rounded-lg border border-gray-200">
            <div className="flex items-center gap-2">
              <Images className="w-4 h-4 text-gray-600" />
              <span className="text-sm font-medium text-gray-700">Run on all images</span>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={batchMode}
                onChange={(e) => setBatchMode(e.target.checked)}
                className="sr-only peer"
                disabled={isLoading}
              />
              <div className="w-9 h-5 bg-gray-300 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-orange-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-orange-500" />
            </label>
          </div>
        )}
        {batchMode && (
          <p className="text-xs text-gray-500 -mt-4">
            Will process {images.length} images. Images with existing detections from this model will be skipped.
          </p>
        )}
      </div>

      {/* Actions */}
      <div className="px-4 py-3 border-t border-gray-200">
        {batchProgress ? (
          <div className="space-y-2">
            <div className="flex justify-between text-sm text-gray-600">
              <span>Processing {batchProgress.current} / {batchProgress.total}</span>
              <span>{Math.round((batchProgress.current / batchProgress.total) * 100)}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-orange-500 h-2 rounded-full transition-all duration-300"
                style={{ width: `${(batchProgress.current / batchProgress.total) * 100}%` }}
              />
            </div>
            {batchProgress.skipped > 0 && (
              <p className="text-xs text-gray-500">
                {batchProgress.skipped} image(s) skipped (already detected)
              </p>
            )}
            <Button
              onClick={handleCancel}
              variant="outline"
              className="w-full border-orange-300 text-orange-600 hover:bg-orange-50"
            >
              Cancel
            </Button>
          </div>
        ) : (
          <>
            <Button
              onClick={batchMode ? handleBatchDetect : handleDetect}
              disabled={isLoading || (!batchMode && !currentImage)}
              className="w-full bg-orange-600 hover:bg-orange-700 text-white disabled:bg-gray-300"
            >
              {isLoading && !batchProgress ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Detecting...
                </>
              ) : batchMode ? (
                <>
                  <Images className="w-4 h-4 mr-2" />
                  Run on All {images.length} Images
                </>
              ) : (
                <>
                  <Scan className="w-4 h-4 mr-2" />
                  Run Auto-Detect
                </>
              )}
            </Button>
            {!batchMode && !currentImage && (
              <p className="text-xs text-gray-500 text-center mt-2">
                Select an image to enable detection
              </p>
            )}
          </>
        )}
      </div>
    </div>
  )
}
