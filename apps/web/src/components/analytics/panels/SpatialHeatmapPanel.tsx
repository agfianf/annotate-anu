/**
 * Spatial Heatmap Panel
 * Shows spatial distribution of annotations on images
 *
 * NOTE: Requires backend implementation to aggregate annotation coordinates
 */

import { motion } from 'framer-motion';
import { MapPin, AlertCircle, Loader2, Info } from 'lucide-react';

import type { PanelProps } from '@/types/analytics';
import { useSpatialHeatmap } from '@/hooks/useSpatialHeatmap';
import { useReducedMotion } from '@/hooks/useReducedMotion';

/**
 * Spatial Heatmap Panel Component
 */
export default function SpatialHeatmapPanel({
  projectId,
  filters,
  onFilterUpdate,
}: PanelProps) {
  const prefersReducedMotion = useReducedMotion();

  // Fetch spatial heatmap data
  const { data, isLoading, error } = useSpatialHeatmap({
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
        <p className="text-lg font-medium">Failed to load spatial heatmap</p>
        <p className="text-sm">{(error as Error).message}</p>
      </div>
    );
  }

  // Check if we have actual data (not stub)
  const hasRealData = data && data.total_annotations > 0 && data.annotation_points.length > 0;

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center gap-2">
        <MapPin className="w-6 h-6 text-emerald-600" />
        <h2 className="text-xl font-bold text-gray-800">Spatial Annotation Distribution</h2>
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
              <MapPin className="w-10 h-10 text-emerald-600" />
            </div>

            <h3 className="text-2xl font-bold text-gray-800 mb-4">
              Spatial Heatmap - Coming Soon
            </h3>

            <p className="text-gray-600 mb-6">
              This panel will visualize where annotations cluster spatially on your images,
              helping you identify potential overfitting risks from concentrated annotations.
            </p>

            {/* Feature Preview */}
            <div className="bg-white rounded-lg p-6 shadow-sm mb-6">
              <h4 className="font-semibold text-gray-700 mb-4">Planned Features:</h4>
              <ul className="text-left space-y-2 text-sm text-gray-600">
                <li className="flex items-start gap-2">
                  <span className="text-emerald-600">•</span>
                  <span><strong>2D Heatmap:</strong> Normalized coordinate space showing annotation density</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-600">•</span>
                  <span><strong>Center of Mass:</strong> Average annotation position with std deviation</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-600">•</span>
                  <span><strong>Clustering Score:</strong> Metric showing if annotations are concentrated</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-600">•</span>
                  <span><strong>Drag-to-Select:</strong> Interactive brush to filter images by annotation region</span>
                </li>
              </ul>
            </div>

            {/* Technical Note */}
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex items-start gap-3">
              <Info className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
              <div className="text-left text-sm">
                <p className="font-medium text-yellow-800 mb-1">Implementation Required</p>
                <p className="text-yellow-700">
                  Backend needs to aggregate annotation bounding box coordinates and normalize them
                  to 0-1 space. This requires reading annotation data from the database and computing
                  spatial statistics.
                </p>
              </div>
            </div>
          </div>
        </motion.div>
      ) : (
        /* Real Data View (when backend is implemented) */
        <div className="space-y-6">
          {/* Heatmap Canvas Placeholder */}
          <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-200">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">Annotation Heatmap</h3>
            <div className="aspect-square bg-gray-100 rounded-lg flex items-center justify-center">
              <p className="text-gray-500">Heatmap visualization will render here</p>
            </div>
          </div>

          {/* Statistics */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl p-4 border-l-4 border-blue-500">
              <p className="text-sm font-medium text-blue-700">Total Annotations</p>
              <p className="text-3xl font-bold text-blue-900 mt-1">
                {data?.total_annotations.toLocaleString()}
              </p>
            </div>

            <div className="bg-gradient-to-br from-emerald-50 to-emerald-100 rounded-xl p-4 border-l-4 border-emerald-500">
              <p className="text-sm font-medium text-emerald-700">Center of Mass</p>
              <p className="text-lg font-bold text-emerald-900 mt-1">
                ({data?.center_of_mass.x.toFixed(2)}, {data?.center_of_mass.y.toFixed(2)})
              </p>
            </div>

            <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-xl p-4 border-l-4 border-purple-500">
              <p className="text-sm font-medium text-purple-700">Clustering Score</p>
              <p className="text-3xl font-bold text-purple-900 mt-1">
                {data?.clustering_score.toFixed(2)}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
