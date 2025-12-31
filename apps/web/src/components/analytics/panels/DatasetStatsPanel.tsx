/**
 * Dataset Statistics Panel
 * Interactive charts showing tag distribution and dimension histograms
 * Features emerald glass morphism design with click-to-filter interactions
 */

import { useMemo } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  Legend,
  ReferenceLine,
} from 'recharts';
import {
  Loader2,
  BarChart3,
  Ruler,
  HardDrive,
  Tag as TagIcon,
  TrendingUp,
  AlertTriangle,
  Info,
} from 'lucide-react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import type { PanelProps } from '@/types/analytics';
import { useDatasetStats } from '@/hooks/useDatasetStats';
import { useReducedMotion } from '@/hooks/useReducedMotion';

/**
 * Format file size to human-readable format
 */
function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

/**
 * Calculate mean and standard deviation from array of numbers
 */
function calculateStats(values: number[]): { mean: number; stdDev: number } {
  if (values.length === 0) return { mean: 0, stdDev: 0 };

  const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
  const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
  const stdDev = Math.sqrt(variance);

  return { mean, stdDev };
}

/**
 * Identify outliers using IQR method (values below Q1 - 1.5*IQR or above Q3 + 1.5*IQR)
 */
function identifyOutliers(values: number[]): Set<number> {
  if (values.length === 0) return new Set();

  const sorted = [...values].sort((a, b) => a - b);
  const q1Index = Math.floor(sorted.length * 0.25);
  const q3Index = Math.floor(sorted.length * 0.75);
  const q1 = sorted[q1Index];
  const q3 = sorted[q3Index];
  const iqr = q3 - q1;
  const lowerBound = q1 - 1.5 * iqr;
  const upperBound = q3 + 1.5 * iqr;

  const outliers = new Set<number>();
  values.forEach((value, index) => {
    if (value < lowerBound || value > upperBound) {
      outliers.add(index);
    }
  });

  return outliers;
}

/**
 * Custom tooltip for charts with glass morphism styling
 */
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload || !payload.length) return null;

  const dataPoint = payload[0].payload;
  const isOutlier = dataPoint.isOutlier;
  const percentOfMean = dataPoint.percentOfMean;

  return (
    <div
      className="rounded-lg p-3 shadow-xl border border-emerald-200/50"
      style={{
        background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.95) 0%, rgba(255, 255, 255, 0.9) 100%)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
      }}
    >
      <p className="text-sm font-semibold text-gray-900 mb-1">{label}</p>
      <p className="text-sm text-emerald-600 font-medium">
        {payload[0].value.toLocaleString()} images
      </p>
      {percentOfMean !== undefined && (
        <p className="text-xs text-gray-500 mt-1">
          {percentOfMean.toFixed(0)}% of average
        </p>
      )}
      {isOutlier && (
        <div className="flex items-center gap-1 mt-1">
          <AlertTriangle className="w-3 h-3 text-orange-500" />
          <span className="text-xs text-orange-600 font-medium">Statistical outlier</span>
        </div>
      )}
    </div>
  );
}

export default function DatasetStatsPanel({
  projectId,
  filters,
  onFilterUpdate,
}: PanelProps) {
  const { data, isLoading, error } = useDatasetStats({
    projectId,
    filters,
    enabled: !!projectId,
  });

  const prefersReducedMotion = useReducedMotion();

  // Transform tag distribution for chart with outlier detection
  const tagChartData = useMemo(() => {
    if (!data?.tag_distribution) return [];

    // Identify outliers in tag distribution
    const counts = data.tag_distribution.map((tag) => tag.count);
    const outlierIndices = identifyOutliers(counts);
    const { mean } = calculateStats(counts);

    // Limit to top 20 tags for better visualization
    return data.tag_distribution.slice(0, 20).map((tag, index) => ({
      name: tag.name,
      count: tag.count,
      color: tag.color || '#10B981',
      tag_id: tag.tag_id,
      isOutlier: outlierIndices.has(index),
      percentOfMean: mean > 0 ? (tag.count / mean) * 100 : 0,
    }));
  }, [data]);

  // Transform dimension histogram for chart with outlier detection
  const dimensionChartData = useMemo(() => {
    if (!data?.dimension_histogram) return [];

    // Identify outliers in dimension distribution
    const counts = data.dimension_histogram.map((bucket) => bucket.count);
    const outlierIndices = identifyOutliers(counts);
    const { mean } = calculateStats(counts);

    return data.dimension_histogram.map((bucket, index) => ({
      name: bucket.bucket,
      count: bucket.count,
      min: bucket.min,
      max: bucket.max,
      isOutlier: outlierIndices.has(index),
      percentOfMean: mean > 0 ? (bucket.count / mean) * 100 : 0,
    }));
  }, [data]);

  // Calculate statistics for insights
  const statsInsights = useMemo(() => {
    if (!data) return null;

    const tagCounts = data.tag_distribution.map((t) => t.count);
    const dimensionCounts = data.dimension_histogram.map((d) => d.count);

    const tagStats = calculateStats(tagCounts);
    const dimensionStats = calculateStats(dimensionCounts);

    // Count outliers
    const tagOutliers = identifyOutliers(tagCounts).size;
    const dimensionOutliers = identifyOutliers(dimensionCounts).size;

    return {
      tagStats,
      dimensionStats,
      tagOutliers,
      dimensionOutliers,
      totalTags: data.tag_distribution.length,
      totalDimensionBuckets: data.dimension_histogram.length,
    };
  }, [data]);

  /**
   * Handle tag bar click - filter gallery to clicked tag
   */
  const handleTagClick = (data: any) => {
    if (!data || !data.tag_id) return;

    // Update filters to show only images with this tag
    onFilterUpdate({
      tag_ids: [data.tag_id],
    });

    toast.success(`Filtering by tag: ${data.name}`, {
      icon: '🏷️',
      duration: 3000,
    });
  };

  /**
   * Handle dimension bucket click - filter by dimension range
   */
  const handleDimensionClick = (data: any) => {
    if (!data) return;

    onFilterUpdate({
      width_min: data.min,
      width_max: data.max,
      height_min: data.min,
      height_max: data.max,
    });

    toast.success(`Filtering by size: ${data.name}`, {
      icon: '📐',
      duration: 3000,
    });
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full min-h-[400px]">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-emerald-600 animate-spin mx-auto mb-3" />
          <p className="text-sm text-gray-500">Loading dataset statistics...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="flex items-center justify-center h-full min-h-[400px]">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <BarChart3 className="w-8 h-8 text-red-600" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Failed to load statistics</h3>
          <p className="text-sm text-gray-500">{(error as Error).message}</p>
        </div>
      </div>
    );
  }

  // Empty state
  if (!data || (tagChartData.length === 0 && dimensionChartData.length === 0)) {
    return (
      <div className="flex items-center justify-center h-full min-h-[400px]">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <BarChart3 className="w-8 h-8 text-gray-400" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No data available</h3>
          <p className="text-sm text-gray-500">
            No statistics to display. Try adjusting your filters or adding images to the project.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-6 space-y-6">
      {/* Header Stats Cards */}
      <motion.div
        initial={prefersReducedMotion ? {} : { opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: prefersReducedMotion ? 0.01 : 0.3 }}
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4"
      >
        {/* File Size Stats */}
        <div
          className="p-4 rounded-xl border border-emerald-200/50"
          style={{
            background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.05) 0%, rgba(5, 150, 105, 0.08) 100%)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
          }}
        >
          <div className="flex items-center gap-2 mb-2">
            <HardDrive className="w-4 h-4 text-emerald-600" />
            <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">File Size</span>
          </div>
          <div className="space-y-1">
            <div className="text-2xl font-bold text-gray-900">
              {formatFileSize(data.file_size_stats.avg)}
            </div>
            <div className="text-xs text-gray-500">
              Range: {formatFileSize(data.file_size_stats.min)} - {formatFileSize(data.file_size_stats.max)}
            </div>
            {data.file_size_stats.median && (
              <div className="text-xs text-gray-500">
                Median: {formatFileSize(data.file_size_stats.median)}
              </div>
            )}
          </div>
        </div>

        {/* Tag Count */}
        <div
          className="p-4 rounded-xl border border-blue-200/50"
          style={{
            background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.05) 0%, rgba(37, 99, 235, 0.08) 100%)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
          }}
        >
          <div className="flex items-center gap-2 mb-2">
            <TagIcon className="w-4 h-4 text-blue-600" />
            <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Tags</span>
          </div>
          <div className="space-y-1">
            <div className="text-2xl font-bold text-gray-900">
              {statsInsights?.totalTags || tagChartData.length}
            </div>
            <div className="text-xs text-gray-500">
              Unique tags in dataset
            </div>
            {statsInsights && statsInsights.tagOutliers > 0 && (
              <div className="flex items-center gap-1 text-xs text-orange-600">
                <AlertTriangle className="w-3 h-3" />
                <span>{statsInsights.tagOutliers} outlier{statsInsights.tagOutliers > 1 ? 's' : ''}</span>
              </div>
            )}
          </div>
        </div>

        {/* Dimension Buckets */}
        <div
          className="p-4 rounded-xl border border-purple-200/50"
          style={{
            background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.05) 0%, rgba(124, 58, 237, 0.08) 100%)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
          }}
        >
          <div className="flex items-center gap-2 mb-2">
            <Ruler className="w-4 h-4 text-purple-600" />
            <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Size Groups</span>
          </div>
          <div className="space-y-1">
            <div className="text-2xl font-bold text-gray-900">
              {dimensionChartData.length}
            </div>
            <div className="text-xs text-gray-500">
              Image size categories
            </div>
            {statsInsights && statsInsights.dimensionOutliers > 0 && (
              <div className="flex items-center gap-1 text-xs text-orange-600">
                <AlertTriangle className="w-3 h-3" />
                <span>{statsInsights.dimensionOutliers} outlier{statsInsights.dimensionOutliers > 1 ? 's' : ''}</span>
              </div>
            )}
          </div>
        </div>

        {/* Distribution Balance */}
        <div
          className="p-4 rounded-xl border border-orange-200/50"
          style={{
            background: 'linear-gradient(135deg, rgba(249, 115, 22, 0.05) 0%, rgba(234, 88, 12, 0.08) 100%)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
          }}
        >
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="w-4 h-4 text-orange-600" />
            <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Balance</span>
          </div>
          <div className="space-y-1">
            <div className="text-2xl font-bold text-gray-900">
              {statsInsights ? `${((1 - statsInsights.tagStats.stdDev / statsInsights.tagStats.mean) * 100).toFixed(0)}%` : 'N/A'}
            </div>
            <div className="text-xs text-gray-500">
              Tag distribution score
            </div>
            <div className="flex items-center gap-1 text-xs text-blue-600">
              <Info className="w-3 h-3" />
              <span>Higher is better</span>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Tag Distribution Chart */}
      {tagChartData.length > 0 && (
        <motion.div
          initial={prefersReducedMotion ? {} : { opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: prefersReducedMotion ? 0.01 : 0.4, delay: prefersReducedMotion ? 0 : 0.1 }}
          className="p-6 rounded-2xl border border-emerald-200/50"
          style={{
            background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.95) 0%, rgba(255, 255, 255, 0.85) 100%)',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
          }}
        >
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-emerald-100 rounded-lg">
              <TagIcon className="w-5 h-5 text-emerald-600" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-gray-900">Tag Distribution</h3>
              <p className="text-sm text-gray-500">
                Click any bar to filter images by that tag •
                <span className="text-orange-600 ml-1">Orange borders = statistical outliers</span>
              </p>
            </div>
          </div>

          <div style={{ width: '100%', height: 400, minHeight: 400 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={tagChartData}
                margin={{ top: 10, right: 30, left: 0, bottom: 100 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis
                  dataKey="name"
                  angle={-45}
                  textAnchor="end"
                  height={100}
                  tick={{ fill: '#6B7280', fontSize: 12 }}
                />
                <YAxis tick={{ fill: '#6B7280', fontSize: 12 }} />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(16, 185, 129, 0.1)' }} />
                <Bar
                  dataKey="count"
                  onClick={handleTagClick}
                  radius={[8, 8, 0, 0]}
                  cursor="pointer"
                  animationDuration={prefersReducedMotion ? 0 : 800}
                  style={{ outline: 'none' }}
                >
                  {tagChartData.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={entry.color}
                      stroke={entry.isOutlier ? '#F97316' : 'none'}
                      strokeWidth={entry.isOutlier ? 3 : 0}
                      className="hover:opacity-80 transition-opacity"
                      style={{ outline: 'none' }}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </motion.div>
      )}

      {/* Dimension Histogram */}
      {dimensionChartData.length > 0 && (
        <motion.div
          initial={prefersReducedMotion ? {} : { opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: prefersReducedMotion ? 0.01 : 0.4, delay: prefersReducedMotion ? 0 : 0.2 }}
          className="p-6 rounded-2xl border border-purple-200/50"
          style={{
            background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.95) 0%, rgba(255, 255, 255, 0.85) 100%)',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
          }}
        >
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-purple-100 rounded-lg">
              <Ruler className="w-5 h-5 text-purple-600" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-gray-900">Dimension Distribution</h3>
              <p className="text-sm text-gray-500">
                Click any bar to filter by image size range •
                <span className="text-orange-600 ml-1">Orange borders = statistical outliers</span>
              </p>
            </div>
          </div>

          <div style={{ width: '100%', height: 300, minHeight: 300 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={dimensionChartData}
                margin={{ top: 10, right: 30, left: 0, bottom: 60 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis
                  dataKey="name"
                  angle={-30}
                  textAnchor="end"
                  height={60}
                  tick={{ fill: '#6B7280', fontSize: 12 }}
                />
                <YAxis tick={{ fill: '#6B7280', fontSize: 12 }} />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(139, 92, 246, 0.1)' }} />
                <Bar
                  dataKey="count"
                  onClick={handleDimensionClick}
                  radius={[8, 8, 0, 0]}
                  cursor="pointer"
                  animationDuration={prefersReducedMotion ? 0 : 800}
                  style={{ outline: 'none' }}
                >
                  {dimensionChartData.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill="url(#purpleGradient)"
                      stroke={entry.isOutlier ? '#F97316' : 'none'}
                      strokeWidth={entry.isOutlier ? 3 : 0}
                      style={{ outline: 'none' }}
                    />
                  ))}
                </Bar>
                <defs>
                  <linearGradient id="purpleGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#8B5CF6" stopOpacity={0.8} />
                    <stop offset="100%" stopColor="#7C3AED" stopOpacity={0.6} />
                  </linearGradient>
                </defs>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </motion.div>
      )}
    </div>
  );
}
