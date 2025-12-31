/**
 * Image Quality Panel
 * Detects blurry, dark, corrupted images
 *
 * NOTE: Requires backend implementation to analyze image quality metrics
 */

import { motion } from 'framer-motion';
import { Eye, AlertCircle, Loader2, Info } from 'lucide-react';

import type { PanelProps } from '@/types/analytics';
import { useImageQuality } from '@/hooks/useImageQuality';
import { useReducedMotion } from '@/hooks/useReducedMotion';

/**
 * Image Quality Panel Component
 */
export default function ImageQualityPanel({
  projectId,
  filters,
  onFilterUpdate,
}: PanelProps) {
  const prefersReducedMotion = useReducedMotion();

  // Fetch image quality data
  const { data, isLoading, error } = useImageQuality({
    projectId,
    filters,
    enabled: !!projectId,
  });

  // Loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-emerald-600 animate-spin" />
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-gray-500">
        <AlertCircle className="w-16 h-16 text-red-400 mb-4" />
        <p className="text-lg font-medium">Failed to load image quality</p>
        <p className="text-sm">{(error as Error).message}</p>
      </div>
    );
  }

  // Check if we have actual data (not stub)
  const hasRealData = data && data.quality_distribution.length > 0 && data.flagged_images.length > 0;

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Eye className="w-6 h-6 text-emerald-600" />
        <h2 className="text-xl font-bold text-gray-800">Image Quality Assessment</h2>
      </div>

      {!hasRealData ? (
        /* Coming Soon State */
        <motion.div
          initial={prefersReducedMotion ? {} : { opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: prefersReducedMotion ? 0 : 0.3 }}
          className="bg-gradient-to-br from-blue-50 to-emerald-50 rounded-xl p-12 border-2 border-dashed border-emerald-300"
        >
          <div className="max-w-2xl mx-auto text-center">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-emerald-100 mb-6">
              <Eye className="w-10 h-10 text-emerald-600" />
            </div>

            <h3 className="text-2xl font-bold text-gray-800 mb-4">
              Image Quality - Coming Soon
            </h3>

            <p className="text-gray-600 mb-6">
              This panel will automatically detect quality issues in your dataset,
              helping you identify blurry, dark, corrupted, or duplicate images that could
              harm model performance.
            </p>

            {/* Feature Preview */}
            <div className="bg-white rounded-lg p-6 shadow-sm mb-6">
              <h4 className="font-semibold text-gray-700 mb-4">Planned Features:</h4>
              <ul className="text-left space-y-2 text-sm text-gray-600">
                <li className="flex items-start gap-2">
                  <span className="text-emerald-600">•</span>
                  <span><strong>Blur Detection:</strong> Laplacian variance to detect out-of-focus images</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-600">•</span>
                  <span><strong>Brightness Analysis:</strong> Detect overly dark or bright images</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-600">•</span>
                  <span><strong>Corruption Detection:</strong> Identify truncated or malformed files</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-600">•</span>
                  <span><strong>Duplicate Detection:</strong> Perceptual hashing to find near-duplicates</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-600">•</span>
                  <span><strong>Quality Score:</strong> Composite score (0-100) for each image</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-600">•</span>
                  <span><strong>Interactive Flagging:</strong> Click bars to filter images by quality issue type</span>
                </li>
              </ul>
            </div>

            {/* Technical Note */}
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex items-start gap-3">
              <Info className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
              <div className="text-left text-sm">
                <p className="font-medium text-yellow-800 mb-1">Implementation Required</p>
                <p className="text-yellow-700">
                  Backend needs to implement image quality analysis using OpenCV or PIL:
                  Laplacian variance for blur, histogram analysis for brightness, perceptual
                  hashing (pHash) for duplicates, and file validation for corruption detection.
                </p>
              </div>
            </div>
          </div>
        </motion.div>
      ) : (
        /* Real Data View (when backend is implemented) */
        <div className="space-y-6">
          {/* Quality Overview Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-gradient-to-br from-red-50 to-red-100 rounded-xl p-4 border-l-4 border-red-500">
              <p className="text-sm font-medium text-red-700">Blurry</p>
              <p className="text-3xl font-bold text-red-900 mt-1">
                {data?.issue_breakdown.blur_detected.toLocaleString()}
              </p>
            </div>

            <div className="bg-gradient-to-br from-orange-50 to-orange-100 rounded-xl p-4 border-l-4 border-orange-500">
              <p className="text-sm font-medium text-orange-700">Dark</p>
              <p className="text-3xl font-bold text-orange-900 mt-1">
                {data?.issue_breakdown.low_brightness.toLocaleString()}
              </p>
            </div>

            <div className="bg-gradient-to-br from-yellow-50 to-yellow-100 rounded-xl p-4 border-l-4 border-yellow-500">
              <p className="text-sm font-medium text-yellow-700">Overexposed</p>
              <p className="text-3xl font-bold text-yellow-900 mt-1">
                {data?.issue_breakdown.high_brightness.toLocaleString()}
              </p>
            </div>

            <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-xl p-4 border-l-4 border-purple-500">
              <p className="text-sm font-medium text-purple-700">Corrupted</p>
              <p className="text-3xl font-bold text-purple-900 mt-1">
                {data?.issue_breakdown.corrupted.toLocaleString()}
              </p>
            </div>
          </div>

          {/* Quality Score Distribution */}
          <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-200">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">Quality Score Distribution</h3>
            <div className="aspect-video bg-gray-100 rounded-lg flex items-center justify-center">
              <p className="text-gray-500">Quality distribution chart will render here</p>
            </div>
          </div>

          {/* Flagged Images */}
          <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-200">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">
              Flagged Images ({data?.flagged_images.length})
            </h3>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {data?.flagged_images.slice(0, 20).map((image) => (
                <div
                  key={image.image_id}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-700 truncate">{image.filename}</p>
                    <p className="text-xs text-gray-500">{image.issues.join(', ')}</p>
                  </div>
                  <div className="ml-3 flex-shrink-0">
                    <span className={`text-sm font-semibold ${
                      image.quality_score < 0.3 ? 'text-red-600' :
                      image.quality_score < 0.6 ? 'text-orange-600' :
                      'text-green-600'
                    }`}>
                      {(image.quality_score * 100).toFixed(0)}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
