/**
 * Annotation Coverage Analytics Panel
 * Shows annotation completeness and density distribution
 */

import { motion } from 'framer-motion';
import { CheckCircle2, AlertCircle, Loader2, Tag } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';

import type { PanelProps } from '@/types/analytics';
import { useAnnotationCoverage } from '@/hooks/useAnnotationCoverage';
import { useReducedMotion } from '@/hooks/useReducedMotion';

/**
 * Custom tooltip for coverage charts
 */
const CoverageTooltip = ({ active, payload }: any) => {
  if (!active || !payload || payload.length === 0) return null;

  const data = payload[0].payload;

  return (
    <div className="bg-white/90 backdrop-blur-md rounded-lg shadow-lg px-4 py-3 border border-emerald-200">
      <p className="font-semibold text-gray-800">{data.bucket}</p>
      <p className="text-sm text-gray-600">
        {data.count} image{data.count !== 1 ? 's' : ''}
      </p>
    </div>
  );
};

/**
 * Get color for density bucket
 */
function getDensityColor(bucket: string): string {
  if (bucket === '0') return '#EF4444'; // Red - no annotations
  if (bucket === '1-5') return '#F59E0B'; // Yellow - low annotations
  return '#10B981'; // Green - healthy annotations
}

/**
 * Annotation Coverage Panel Component
 */
export default function AnnotationCoveragePanel({
  projectId,
  filters,
  onFilterUpdate,
}: PanelProps) {
  const prefersReducedMotion = useReducedMotion();

  // Fetch annotation coverage data
  const { data, isLoading, error } = useAnnotationCoverage({
    projectId,
    filters,
    enabled: !!projectId,
  });

  /**
   * Handle click on density bucket to filter images
   */
  const handleDensityClick = (bucketData: any) => {
    if (!bucketData) return;

    const { bucket, min, max } = bucketData;

    // For density filtering, we need a custom filter (not yet implemented in backend)
    // For now, just show a toast
    toast.success(`Filtering to images with ${bucket} annotations`, {
      icon: '📊',
      duration: 3000,
    });

    // TODO: Implement annotation count filtering in backend
    // onFilterUpdate({ annotation_count_min: min, annotation_count_max: max });
  };

  /**
   * Handle click on unannotated card
   */
  const handleUnannotatedClick = () => {
    toast.success('Filtering to unannotated images', {
      icon: '⚠️',
      duration: 3000,
    });

    // TODO: Use is_annotated filter when it supports false value
    // onFilterUpdate({ is_annotated: false });
  };

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
        <p className="text-lg font-medium">Failed to load annotation coverage</p>
        <p className="text-sm">{(error as Error).message}</p>
      </div>
    );
  }

  // Empty state
  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-gray-500">
        <Tag className="w-16 h-16 text-gray-300 mb-4" />
        <p className="text-lg font-medium">No data available</p>
      </div>
    );
  }

  const coveragePercentage = data.coverage_percentage;
  const isHealthy = coveragePercentage >= 80;
  const isModerate = coveragePercentage >= 50 && coveragePercentage < 80;

  return (
    <div className="space-y-6 p-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Total Images */}
        <motion.div
          initial={prefersReducedMotion ? {} : { opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: prefersReducedMotion ? 0 : 0.3 }}
          className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl p-4 border-l-4 border-blue-500"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-blue-700">Total Images</p>
              <p className="text-3xl font-bold text-blue-900 mt-1">
                {data.total_images.toLocaleString()}
              </p>
            </div>
            <CheckCircle2 className="w-10 h-10 text-blue-500 opacity-50" />
          </div>
        </motion.div>

        {/* Annotated Images */}
        <motion.div
          initial={prefersReducedMotion ? {} : { opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: prefersReducedMotion ? 0 : 0.3, delay: 0.1 }}
          className="bg-gradient-to-br from-emerald-50 to-emerald-100 rounded-xl p-4 border-l-4 border-emerald-500"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-emerald-700">Annotated</p>
              <p className="text-3xl font-bold text-emerald-900 mt-1">
                {data.annotated_images.toLocaleString()}
              </p>
              <p className="text-xs text-emerald-600 mt-1">
                {coveragePercentage.toFixed(1)}% coverage
              </p>
            </div>
            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
              isHealthy ? 'bg-emerald-500' :
              isModerate ? 'bg-yellow-500' : 'bg-red-500'
            }`}>
              <CheckCircle2 className="w-6 h-6 text-white" />
            </div>
          </div>
        </motion.div>

        {/* Unannotated Images */}
        <motion.div
          initial={prefersReducedMotion ? {} : { opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: prefersReducedMotion ? 0 : 0.3, delay: 0.2 }}
          className="bg-gradient-to-br from-red-50 to-red-100 rounded-xl p-4 border-l-4 border-red-500 cursor-pointer hover:shadow-md transition-shadow"
          onClick={handleUnannotatedClick}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-red-700">Unannotated</p>
              <p className="text-3xl font-bold text-red-900 mt-1">
                {data.unannotated_images.toLocaleString()}
              </p>
              <p className="text-xs text-red-600 mt-1">Click to filter</p>
            </div>
            <AlertCircle className="w-10 h-10 text-red-500 opacity-50" />
          </div>
        </motion.div>
      </div>

      {/* Annotation Density Histogram */}
      <motion.div
        initial={prefersReducedMotion ? {} : { opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: prefersReducedMotion ? 0 : 0.3, delay: 0.3 }}
        className="bg-white rounded-xl shadow-sm p-6 border border-gray-200"
        style={{ minHeight: 400 }}
      >
        <div className="flex items-center gap-2 mb-4">
          <Tag className="w-5 h-5 text-emerald-600" />
          <h3 className="text-lg font-semibold text-gray-800">Annotation Density</h3>
        </div>
        <p className="text-sm text-gray-600 mb-4">
          Distribution of annotation counts per image. Click bars to filter gallery.
        </p>

        <ResponsiveContainer width="100%" height={300}>
          <BarChart
            data={data.density_histogram}
            margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis
              dataKey="bucket"
              tick={{ fill: '#6b7280' }}
              tickLine={{ stroke: '#9ca3af' }}
            />
            <YAxis
              tick={{ fill: '#6b7280' }}
              tickLine={{ stroke: '#9ca3af' }}
              label={{ value: 'Image Count', angle: -90, position: 'insideLeft', fill: '#6b7280' }}
            />
            <Tooltip content={<CoverageTooltip />} />
            <Bar
              dataKey="count"
              onClick={handleDensityClick}
              radius={[8, 8, 0, 0]}
              cursor="pointer"
              animationDuration={prefersReducedMotion ? 0 : 800}
              style={{ outline: 'none' }}
            >
              {data.density_histogram.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={getDensityColor(entry.bucket)}
                  className="hover:opacity-80 transition-opacity"
                  style={{ outline: 'none' }}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>

        {/* Legend */}
        <div className="flex items-center justify-center gap-6 mt-4 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-red-500" />
            <span className="text-gray-600">No annotations</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-yellow-500" />
            <span className="text-gray-600">Low density (1-5)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-emerald-500" />
            <span className="text-gray-600">Healthy (6+)</span>
          </div>
        </div>
      </motion.div>

      {/* Coverage Recommendations */}
      <motion.div
        initial={prefersReducedMotion ? {} : { opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: prefersReducedMotion ? 0 : 0.3, delay: 0.4 }}
        className={`rounded-xl p-4 border-l-4 ${
          isHealthy
            ? 'bg-emerald-50 border-emerald-500'
            : isModerate
            ? 'bg-yellow-50 border-yellow-500'
            : 'bg-red-50 border-red-500'
        }`}
      >
        <p className={`font-semibold ${
          isHealthy ? 'text-emerald-700' :
          isModerate ? 'text-yellow-700' : 'text-red-700'
        }`}>
          {isHealthy
            ? '✅ Excellent annotation coverage!'
            : isModerate
            ? '⚠️ Moderate annotation coverage'
            : '❌ Low annotation coverage'}
        </p>
        <p className={`text-sm mt-1 ${
          isHealthy ? 'text-emerald-600' :
          isModerate ? 'text-yellow-600' : 'text-red-600'
        }`}>
          {isHealthy
            ? `${coveragePercentage.toFixed(1)}% of images are annotated. Your dataset is well-labeled!`
            : isModerate
            ? `${coveragePercentage.toFixed(1)}% of images are annotated. Consider labeling more images for better model performance.`
            : `Only ${coveragePercentage.toFixed(1)}% of images are annotated. Aim for at least 80% coverage before training.`}
        </p>
      </motion.div>
    </div>
  );
}
