import { useState } from 'react'
import { BarChart3, Loader2, Tags, Trophy, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { Button } from './ui/button'
import type { ImageData } from '@/types/annotations'
import type { AvailableModel, ClassificationResult } from '@/types/byom'
import { inferenceClient } from '@/lib/inference-client'

interface ClassificationPanelProps {
  currentImage: ImageData | null
  onClose: () => void
  selectedModel: AvailableModel
  onClassificationComplete?: (result: ClassificationResult) => void
}

/**
 * Get image file from ImageData
 */
function getImageFile(image: ImageData): File {
  // ImageData contains a blob directly
  return new File([image.blob], image.name || 'image.jpg', {
    type: image.blob.type || 'image/jpeg'
  })
}

export function ClassificationPanel({
  currentImage,
  onClose,
  selectedModel,
  onClassificationComplete,
}: ClassificationPanelProps) {
  const [topK, setTopK] = useState(5)
  const [isLoading, setIsLoading] = useState(false)
  const [result, setResult] = useState<ClassificationResult | null>(null)

  const handleClassify = async () => {
    if (!currentImage) {
      toast.error('No image selected')
      return
    }

    setIsLoading(true)
    setResult(null)

    try {
      const imageFile = await getImageFile(currentImage)

      const classificationResult = await inferenceClient.classify(selectedModel, {
        image: imageFile,
        top_k: topK,
      })

      setResult(classificationResult)
      onClassificationComplete?.(classificationResult)

      toast.success(
        `Classified as "${classificationResult.predicted_class}" (${(classificationResult.confidence * 100).toFixed(1)}%)`
      )
    } catch (error) {
      console.error('Classification error:', error)
      toast.error(error instanceof Error ? error.message : 'Classification failed')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Tags className="w-5 h-5 text-violet-500" />
          <h2 className="text-lg font-semibold text-gray-900">Classify Image</h2>
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
        <div className="bg-violet-50 border border-violet-200 rounded-lg p-3">
          <p className="text-sm text-violet-700">
            <span className="font-medium">{selectedModel.name}</span> will analyze the
            entire image and predict what it contains.
          </p>
        </div>

        {/* Top-K Setting */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Number of Predictions: {topK}
          </label>
          <input
            type="range"
            min="1"
            max="10"
            value={topK}
            onChange={(e) => setTopK(parseInt(e.target.value))}
            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-violet-500"
          />
          <div className="flex justify-between text-xs text-gray-500 mt-1">
            <span>Top 1</span>
            <span>Top 10</span>
          </div>
        </div>

        {/* Results */}
        {result && (
          <div className="space-y-4">
            {/* Top Prediction */}
            <div className="bg-gradient-to-r from-violet-500 to-purple-600 rounded-lg p-4 text-white">
              <div className="flex items-center gap-2 mb-2">
                <Trophy className="w-5 h-5" />
                <span className="text-sm font-medium">Top Prediction</span>
              </div>
              <div className="text-2xl font-bold capitalize">
                {result.predicted_class}
              </div>
              <div className="text-violet-200 mt-1">
                {(result.confidence * 100).toFixed(1)}% confidence
              </div>
            </div>

            {/* Top-K Predictions */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <BarChart3 className="w-4 h-4 text-gray-600" />
                <span className="text-sm font-medium text-gray-700">
                  Top {result.top_k_predictions.length} Predictions
                </span>
              </div>
              <div className="space-y-2">
                {result.top_k_predictions.map((pred, idx) => (
                  <div key={pred.class_name} className="flex items-center gap-3">
                    <span className="w-6 text-sm font-medium text-gray-500">
                      {idx + 1}.
                    </span>
                    <div className="flex-1">
                      <div className="flex justify-between mb-1">
                        <span className="text-sm font-medium text-gray-700 capitalize">
                          {pred.class_name}
                        </span>
                        <span className="text-sm text-gray-500">
                          {(pred.probability * 100).toFixed(1)}%
                        </span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div
                          className="bg-violet-500 h-2 rounded-full transition-all"
                          style={{ width: `${pred.probability * 100}%` }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Processing Time */}
            <div className="text-xs text-gray-500 text-center">
              Processed in {result.processing_time_ms.toFixed(0)}ms
            </div>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="px-4 py-3 border-t border-gray-200">
        <Button
          onClick={handleClassify}
          disabled={isLoading || !currentImage}
          className="w-full bg-violet-600 hover:bg-violet-700 text-white disabled:bg-gray-300"
        >
          {isLoading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Classifying...
            </>
          ) : (
            <>
              <Tags className="w-4 h-4 mr-2" />
              Classify Image
            </>
          )}
        </Button>
        {!currentImage && (
          <p className="text-xs text-gray-500 text-center mt-2">
            Select an image to enable classification
          </p>
        )}
      </div>
    </div>
  )
}
