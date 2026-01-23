/**
 * MoondreamOCRPanel - Text extraction (OCR) using Moondream
 * Extracts text from images using visual question answering
 */

import { imagesApi } from '@/lib/api-client'
import type { ImageData, Label } from '@/types/annotations'
import type { AvailableModel } from '@/types/byom'
import { MoondreamClient } from '@/lib/moondream-client'
import { Check, Copy, FileText, Loader2, X } from 'lucide-react'
import { useState } from 'react'
import toast from 'react-hot-toast'
import { Button } from './ui/button'

interface MoondreamOCRPanelProps {
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
    attributes?: { text?: string }
  }) => void
  onClose: () => void
  selectedModel: AvailableModel
}

type OCRMode = 'all' | 'reading' | 'table' | 'custom'

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

const OCR_MODES: { id: OCRMode; label: string; description: string }[] = [
  { id: 'all', label: 'All Text', description: 'Extract all visible text' },
  { id: 'reading', label: 'Reading Order', description: 'Extract text in natural reading order' },
  { id: 'table', label: 'Table', description: 'Extract table content preserving structure' },
  { id: 'custom', label: 'Custom', description: 'Ask a custom question about text' },
]

export function MoondreamOCRPanel({
  labels,
  selectedLabelId,
  currentImage,
  onAnnotationsCreated,
  onClose,
  selectedModel,
}: MoondreamOCRPanelProps) {
  const [ocrMode, setOcrMode] = useState<OCRMode>('all')
  const [customQuery, setCustomQuery] = useState('')
  const [labelId, setLabelId] = useState(selectedLabelId || '')
  const [isLoading, setIsLoading] = useState(false)
  const [extractedText, setExtractedText] = useState<string | null>(null)
  const [createAnnotation, setCreateAnnotation] = useState(true)

  const selectedLabel = labels.find((l) => l.id === labelId)

  const getOCRPrompt = (): string => {
    switch (ocrMode) {
      case 'all':
        return 'Transcribe all text visible in this image.'
      case 'reading':
        return 'Transcribe the text in natural reading order.'
      case 'table':
        return 'Transcribe the table content, preserving structure.'
      case 'custom':
        return customQuery || 'What text is visible in this image?'
      default:
        return 'Transcribe all text visible in this image.'
    }
  }

  const handleExtract = async () => {
    if (!currentImage) {
      toast.error('No image selected')
      return
    }

    if (ocrMode === 'custom' && !customQuery.trim()) {
      toast.error('Please enter a custom query')
      return
    }

    setIsLoading(true)
    setExtractedText(null)

    try {
      // Get image file
      const imageFile = await getImageFile(currentImage)

      // Create Moondream client
      const client = new MoondreamClient({
        baseUrl: selectedModel.endpoint_url,
        apiKey: selectedModel.auth_token,
      })

      // Call query endpoint with OCR prompt
      const result = await client.query({
        image: imageFile,
        question: getOCRPrompt(),
      })

      if (!result.answer || result.answer.trim() === '') {
        toast.error('No text found in the image')
        return
      }

      setExtractedText(result.answer)
      toast.success('Text extracted successfully')
    } catch (error) {
      console.error('OCR error:', error)
      toast.error('Text extraction failed. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleCopyToClipboard = () => {
    if (extractedText) {
      navigator.clipboard.writeText(extractedText)
      toast.success('Copied to clipboard')
    }
  }

  const handleAddAnnotation = () => {
    if (!createAnnotation || !labelId) {
      toast.error('Please select a label')
      return
    }

    if (!extractedText || !currentImage) {
      toast.error('No extracted text')
      return
    }

    // Create a full-image bounding box for the text annotation
    const imageWidth = currentImage.width || 1
    const imageHeight = currentImage.height || 1

    const boxes: Array<[number, number, number, number]> = [
      [0, 0, imageWidth, imageHeight],
    ]

    const masks: Array<{ polygons: Array<Array<[number, number]>>; area: number }> = [
      {
        polygons: [],
        area: imageWidth * imageHeight,
      },
    ]

    onAnnotationsCreated({
      boxes,
      masks,
      scores: [1.0],
      annotationType: 'bbox',
      labelId,
      imageId: currentImage.id,
      attributes: { text: extractedText },
    })

    toast.success('Added annotation with OCR text')
    setExtractedText(null)
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
        <div className="flex items-center gap-2 flex-1">
          <FileText className="w-5 h-5 text-indigo-500" />
          <h2 className="text-lg font-semibold text-gray-900">Moondream OCR</h2>
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
        <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3">
          <p className="text-sm text-indigo-700">
            Extract text from images using AI. Great for documents, signs, labels, and any visible text.
          </p>
        </div>

        {/* OCR Mode Selection */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Extraction Mode
          </label>
          <div className="space-y-2">
            {OCR_MODES.map((mode) => (
              <label
                key={mode.id}
                className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                  ocrMode === mode.id
                    ? 'border-indigo-500 bg-indigo-50'
                    : 'border-gray-200 hover:bg-gray-50'
                }`}
              >
                <input
                  type="radio"
                  name="ocrMode"
                  value={mode.id}
                  checked={ocrMode === mode.id}
                  onChange={() => setOcrMode(mode.id)}
                  disabled={isLoading}
                  className="mt-0.5 w-4 h-4 text-indigo-600 focus:ring-indigo-500"
                />
                <div>
                  <div className="text-sm font-medium text-gray-900">{mode.label}</div>
                  <div className="text-xs text-gray-500">{mode.description}</div>
                </div>
              </label>
            ))}
          </div>

          {/* Custom Query Input */}
          {ocrMode === 'custom' && (
            <div className="mt-3">
              <input
                type="text"
                value={customQuery}
                onChange={(e) => setCustomQuery(e.target.value)}
                placeholder="e.g., What numbers are on the license plate?"
                className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm"
                disabled={isLoading}
              />
            </div>
          )}
        </div>

        {/* Extract Button */}
        <Button
          type="button"
          onClick={handleExtract}
          disabled={isLoading || !currentImage || (ocrMode === 'custom' && !customQuery.trim())}
          className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 disabled:text-gray-500 text-white"
        >
          {isLoading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Extracting...
            </>
          ) : (
            <>
              <FileText className="w-4 h-4 mr-2" />
              Extract Text
            </>
          )}
        </Button>

        {/* Extracted Text Result */}
        {extractedText && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-700">
                Extracted Text
              </span>
              <button
                onClick={handleCopyToClipboard}
                className="text-xs text-indigo-600 hover:text-indigo-700 flex items-center gap-1"
              >
                <Copy className="w-3 h-3" />
                Copy
              </button>
            </div>

            <div className="p-3 bg-gray-50 rounded-lg border border-gray-200 max-h-48 overflow-y-auto">
              <pre className="text-sm text-gray-800 whitespace-pre-wrap font-mono">
                {extractedText}
              </pre>
            </div>

            {/* Create Annotation Option */}
            <div className="space-y-3">
              <label className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={createAnnotation}
                  onChange={(e) => setCreateAnnotation(e.target.checked)}
                  className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500"
                />
                <span className="text-sm text-gray-700">
                  Create annotation with OCR text attribute
                </span>
              </label>

              {createAnnotation && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Assign Label
                  </label>
                  <div className="relative">
                    <select
                      value={labelId}
                      onChange={(e) => setLabelId(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent appearance-none"
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
              )}
            </div>
          </div>
        )}
      </div>

      {/* Actions */}
      {extractedText && createAnnotation && (
        <div className="px-4 py-3 border-t border-gray-200">
          <Button
            type="button"
            onClick={handleAddAnnotation}
            disabled={!labelId}
            className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-300 disabled:text-gray-500 text-white"
          >
            <Check className="w-4 h-4 mr-2" />
            Add Annotation with Text
          </Button>
        </div>
      )}
    </div>
  )
}
