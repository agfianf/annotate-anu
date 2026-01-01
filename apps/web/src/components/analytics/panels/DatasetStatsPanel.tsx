/**
 * Dataset Statistics Panel
 * Interactive charts showing tag distribution and dimension histograms
 * Features emerald glass morphism design with click-to-filter interactions
 */

import { useMemo, useState, useEffect, useRef } from 'react';
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
import {
  Loader2,
  BarChart3,
  Ruler,
  HardDrive,
  Tag as TagIcon,
  TrendingUp,
  AlertTriangle,
} from 'lucide-react';
import { motion } from 'framer-motion';
import type { PanelProps } from '@/types/analytics';
import { useAnalyticsToast } from '@/hooks/useAnalyticsToast';
import { useDatasetStats } from '@/hooks/useDatasetStats';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import {
  CHART_CONFIG,
  getCellProps,
  getBarProps,
  getGridProps,
  getXAxisProps,
  getYAxisProps,
} from '../shared/chartConfig';

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
 * Types for grouped tag chart
 */
interface TagItem {
  name: string;
  count: number;
  color: string;
  tag_id: string;
}

interface GroupedCategory {
  category_id: string | null;
  category_name: string;
  category_color: string;
  tags: TagItem[];
}

/**
 * Custom tooltip for charts with glass morphism styling
 */
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload || !payload.length) return null;

  // Find the data point (may be in either payload for stacked bars)
  const dataPoint = payload.find((p: any) => p.payload)?.payload || payload[0].payload;
  const isOutlier = dataPoint.isOutlier;
  const percentOfMean = dataPoint.percentOfMean;
  const count = dataPoint.count;
  const categoryName = dataPoint.category_name;

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
      {categoryName && (
        <p className="text-xs text-gray-500 mb-1">
          {categoryName}
        </p>
      )}
      <p className="text-sm text-emerald-600 font-medium">
        {(count ?? payload[0].value).toLocaleString()} images
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
  const { showSuccess } = useAnalyticsToast();

  // Dimension chart container reference for measuring
  const dimensionChartRef = useRef<HTMLDivElement>(null);
  const [chartHasValidDimensions, setChartHasValidDimensions] = useState(false);

  // Track chart container dimensions
  useEffect(() => {
    const element = dimensionChartRef.current;
    if (!element) return;

    const checkDimensions = () => {
      const rect = element.getBoundingClientRect();
      setChartHasValidDimensions(rect.width > 0 && rect.height > 0);
    };

    // Initial check
    checkDimensions();

    const resizeObserver = new ResizeObserver(checkDimensions);
    resizeObserver.observe(element);

    return () => resizeObserver.disconnect();
  }, []);

  // Group tags by category for horizontal grouped bar chart
  const { groupedTagData, maxTagCount } = useMemo(() => {
    if (!data?.tag_distribution) return { groupedTagData: [], maxTagCount: 0 };

    const groups: Map<string, GroupedCategory> = new Map();
    let maxCount = 0;

    // Limit to top 20 tags and group by category
    data.tag_distribution.slice(0, 20).forEach((tag) => {
      const categoryKey = tag.category_id || 'uncategorized';

      if (!groups.has(categoryKey)) {
        groups.set(categoryKey, {
          category_id: tag.category_id || null,
          category_name: tag.category_name || 'Uncategorized',
          category_color: tag.category_color || '#6B7280',
          tags: [],
        });
      }

      groups.get(categoryKey)!.tags.push({
        name: tag.name,
        count: tag.count,
        color: tag.color || '#10B981',
        tag_id: tag.tag_id,
      });

      if (tag.count > maxCount) maxCount = tag.count;
    });

    return {
      groupedTagData: Array.from(groups.values()),
      maxTagCount: maxCount,
    };
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
  const handleTagClick = (tag: TagItem) => {
    if (!tag || !tag.tag_id) return;

    // Update filters to show only images with this tag
    onFilterUpdate({
      tag_ids: [tag.tag_id],
    });

    showSuccess(`Filtering by tag: ${tag.name}`, { icon: '🏷️' });
  };

  /**
   * Handle dimension bucket click - filter by dimension range
   */
  const handleDimensionClick = (bucketData: any) => {
    if (!bucketData) return;

    onFilterUpdate({
      width_min: bucketData.min,
      width_max: bucketData.max,
      height_min: bucketData.min,
      height_max: bucketData.max,
    });

    showSuccess(`Filtering by size: ${bucketData.name}`, { icon: '📐' });
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full min-h-[200px]">
        <div className="text-center">
          <Loader2 className="w-6 h-6 text-emerald-600 animate-spin mx-auto mb-2" />
          <p className="text-xs text-gray-500">Loading statistics...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="flex items-center justify-center h-full min-h-[200px] p-4">
        <div className="text-center">
          <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-2">
            <BarChart3 className="w-5 h-5 text-red-600" />
          </div>
          <h3 className="text-sm font-semibold text-gray-900 mb-1">Failed to load</h3>
          <p className="text-xs text-gray-500">{(error as Error).message}</p>
        </div>
      </div>
    );
  }

  // Empty state
  if (!data || (groupedTagData.length === 0 && dimensionChartData.length === 0)) {
    return (
      <div className="flex items-center justify-center h-full min-h-[200px] p-4">
        <div className="text-center">
          <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-2">
            <BarChart3 className="w-5 h-5 text-gray-400" />
          </div>
          <h3 className="text-sm font-semibold text-gray-900 mb-1">No data</h3>
          <p className="text-xs text-gray-500">Adjust filters or add images</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-3 space-y-3">
      {/* Header Stats Cards - Compact 2x2 Grid */}
      <motion.div
        initial={prefersReducedMotion ? {} : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: prefersReducedMotion ? 0.01 : 0.2 }}
        className="grid grid-cols-2 gap-2"
      >
        {/* File Size Stats */}
        <div
          className="p-2.5 rounded-lg border border-emerald-200/50"
          style={{
            background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.05) 0%, rgba(5, 150, 105, 0.08) 100%)',
          }}
        >
          <div className="flex items-center gap-1.5 mb-1">
            <HardDrive className="w-3 h-3 text-emerald-600" />
            <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">File Size</span>
          </div>
          <div className="text-base font-bold text-gray-900">
            {formatFileSize(data.file_size_stats.avg)}
          </div>
          <div className="text-[10px] text-gray-500 leading-tight">
            {formatFileSize(data.file_size_stats.min)} - {formatFileSize(data.file_size_stats.max)}
          </div>
        </div>

        {/* Tag Count */}
        <div
          className="p-2.5 rounded-lg border border-blue-200/50"
          style={{
            background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.05) 0%, rgba(37, 99, 235, 0.08) 100%)',
          }}
        >
          <div className="flex items-center gap-1.5 mb-1">
            <TagIcon className="w-3 h-3 text-blue-600" />
            <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Tags</span>
          </div>
          <div className="text-base font-bold text-gray-900">
            {statsInsights?.totalTags || data?.tag_distribution?.length || 0}
          </div>
          <div className="text-[10px] text-gray-500">
            {statsInsights && statsInsights.tagOutliers > 0 ? (
              <span className="text-orange-600">{statsInsights.tagOutliers} outlier{statsInsights.tagOutliers > 1 ? 's' : ''}</span>
            ) : (
              'Unique tags'
            )}
          </div>
        </div>

        {/* Dimension Buckets */}
        <div
          className="p-2.5 rounded-lg border border-purple-200/50"
          style={{
            background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.05) 0%, rgba(124, 58, 237, 0.08) 100%)',
          }}
        >
          <div className="flex items-center gap-1.5 mb-1">
            <Ruler className="w-3 h-3 text-purple-600" />
            <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Sizes</span>
          </div>
          <div className="text-base font-bold text-gray-900">
            {dimensionChartData.length}
          </div>
          <div className="text-[10px] text-gray-500">
            {statsInsights && statsInsights.dimensionOutliers > 0 ? (
              <span className="text-orange-600">{statsInsights.dimensionOutliers} outlier{statsInsights.dimensionOutliers > 1 ? 's' : ''}</span>
            ) : (
              'Categories'
            )}
          </div>
        </div>

        {/* Distribution Balance */}
        <div
          className="p-2.5 rounded-lg border border-orange-200/50"
          style={{
            background: 'linear-gradient(135deg, rgba(249, 115, 22, 0.05) 0%, rgba(234, 88, 12, 0.08) 100%)',
          }}
        >
          <div className="flex items-center gap-1.5 mb-1">
            <TrendingUp className="w-3 h-3 text-orange-600" />
            <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Balance</span>
          </div>
          <div className="text-base font-bold text-gray-900">
            {statsInsights ? `${((1 - statsInsights.tagStats.stdDev / statsInsights.tagStats.mean) * 100).toFixed(0)}%` : 'N/A'}
          </div>
          <div className="text-[10px] text-gray-500">Distribution score</div>
        </div>
      </motion.div>

      {/* Tag Distribution Chart - Grouped by Category */}
      {groupedTagData.length > 0 && (
        <motion.div
          initial={prefersReducedMotion ? {} : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: prefersReducedMotion ? 0.01 : 0.2, delay: prefersReducedMotion ? 0 : 0.05 }}
          className="p-3 rounded-lg border border-emerald-200/50 bg-white/80"
        >
          <div className="flex items-center gap-2 mb-2">
            <TagIcon className="w-3.5 h-3.5 text-emerald-600" />
            <h3 className="text-xs font-semibold text-gray-700">Tag Distribution</h3>
            <span className="text-[10px] text-gray-400 ml-auto">Click to filter</span>
          </div>

          {/* Custom Horizontal Grouped Bar Chart */}
          <div className="space-y-0.5 max-h-[240px] overflow-y-auto">
            {groupedTagData.map((group, groupIndex) => (
              <div key={group.category_id || 'uncategorized'}>
                {/* Tags in this category */}
                {group.tags.map((tag) => (
                  <div
                    key={tag.tag_id}
                    className="flex items-center gap-1.5 py-0.5 cursor-pointer hover:bg-emerald-50/50 transition-colors"
                    onClick={() => handleTagClick(tag)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => e.key === 'Enter' && handleTagClick(tag)}
                    aria-label={`${tag.name}: ${tag.count} images. Category: ${group.category_name}`}
                  >
                    {/* Category color indicator */}
                    <div
                      className="w-1 h-3.5 flex-shrink-0"
                      style={{ backgroundColor: group.category_color }}
                    />
                    {/* Tag name */}
                    <span className="w-20 min-w-[80px] text-[10px] text-gray-600 truncate" title={tag.name}>
                      {tag.name}
                    </span>
                    {/* Bar container */}
                    <div className="flex-1 h-3.5 bg-gray-100">
                      <div
                        className="h-full transition-all duration-300"
                        style={{
                          width: `${maxTagCount > 0 ? (tag.count / maxTagCount) * 100 : 0}%`,
                          backgroundColor: tag.color,
                        }}
                      />
                    </div>
                    {/* Count */}
                    <span className="w-8 text-[10px] text-gray-500 text-right tabular-nums">
                      {tag.count}
                    </span>
                  </div>
                ))}

                {/* Category divider with label (after each group except last) */}
                {groupIndex < groupedTagData.length - 1 && (
                  <div className="flex items-center gap-1.5 py-1 my-0.5">
                    <div className="flex-1 border-t border-dashed border-gray-300" />
                    <span
                      className="text-[9px] font-medium px-1.5"
                      style={{ color: group.category_color }}
                    >
                      {group.category_name}
                    </span>
                    <div className="flex-1 border-t border-dashed border-gray-300" />
                  </div>
                )}

                {/* Final category label at the end of the last group */}
                {groupIndex === groupedTagData.length - 1 && (
                  <div className="flex items-center gap-1.5 pt-1">
                    <div className="flex-1 border-t border-dashed border-gray-300" />
                    <span
                      className="text-[9px] font-medium px-1.5"
                      style={{ color: group.category_color }}
                    >
                      {group.category_name}
                    </span>
                    <div className="flex-1 border-t border-dashed border-gray-300" />
                  </div>
                )}
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Dimension Histogram */}
      {dimensionChartData.length > 0 && (
        <motion.div
          initial={prefersReducedMotion ? {} : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: prefersReducedMotion ? 0.01 : 0.2, delay: prefersReducedMotion ? 0 : 0.1 }}
          className="p-3 rounded-lg border border-purple-200/50 bg-white/80"
        >
          <div className="flex items-center gap-2 mb-2">
            <Ruler className="w-3.5 h-3.5 text-purple-600" />
            <h3 className="text-xs font-semibold text-gray-700">Dimension Distribution</h3>
            <span className="text-[10px] text-gray-400 ml-auto">Click to filter</span>
          </div>

          <div ref={dimensionChartRef} style={{ width: '100%', height: 160, minWidth: 1, minHeight: 1 }}>
            {chartHasValidDimensions ? (
              <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                <BarChart
                  data={dimensionChartData}
                  margin={CHART_CONFIG.marginCompact}
                >
                  <defs>
                    <linearGradient id="purpleGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#8B5CF6" stopOpacity={0.8} />
                      <stop offset="100%" stopColor="#7C3AED" stopOpacity={0.6} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid {...getGridProps()} />
                  <XAxis
                    dataKey="name"
                    angle={-30}
                    textAnchor="end"
                    height={40}
                    tick={CHART_CONFIG.axisStyle}
                  />
                  <YAxis {...getYAxisProps()} />
                  <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(139, 92, 246, 0.1)' }} />
                  <Bar
                    dataKey="count"
                    onClick={handleDimensionClick}
                    {...getBarProps(!prefersReducedMotion)}
                  >
                    {dimensionChartData.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        {...getCellProps('url(#purpleGradient)')}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full">
                <Loader2 className="w-4 h-4 text-purple-300 animate-spin" />
              </div>
            )}
          </div>
        </motion.div>
      )}
    </div>
  );
}
