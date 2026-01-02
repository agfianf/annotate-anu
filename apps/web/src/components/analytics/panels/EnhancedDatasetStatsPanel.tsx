/**
 * Enhanced Dataset Statistics Panel
 * Consolidated panel combining: Overview + Dimensions + Class Balance + Image Quality
 * Uses tabbed interface for organized display
 *
 * PRESERVES all original charts and interactive features from DatasetStatsPanel
 */

import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import {
  Loader2,
  BarChart3,
  Ruler,
  Scale,
  Sparkles,
  AlertTriangle,
  CheckCircle,
  Clock,
  XCircle,
  AlertCircle,
  RefreshCw,
  HardDrive,
  Tag as TagIcon,
  TrendingUp,
  ChevronDown,
  Check,
  Ratio,
  Play,
  Square,
  Zap,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { PanelProps } from '@/types/analytics';
import { useEnhancedDatasetStats } from '@/hooks/useEnhancedDatasetStats';
import { useQualityProgress } from '@/hooks/useQualityProgress';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useAnalyticsToast } from '@/hooks/useAnalyticsToast';
import { useChartClick } from '../shared/useChartClick';
import { useChartMultiSelect } from '../shared/useChartMultiSelect';
import { SelectionActionBar } from '../shared/SelectionActionBar';
import { CHART_TOOLTIP_CLASSNAME } from '../shared/chartConfig';
import { ChartSection } from '../shared/PanelComponents';
import { HistogramChart, HISTOGRAM_THEMES } from '../shared/HistogramChart';
import { analyticsApi } from '@/lib/analytics-client';
import { cn } from '@/lib/utils';

type TabId = 'overview' | 'dimensions' | 'balance' | 'quality';

interface TabConfig {
  id: TabId;
  label: string;
  icon: typeof BarChart3;
}

const TABS: TabConfig[] = [
  { id: 'overview', label: 'Overview', icon: BarChart3 },
  { id: 'dimensions', label: 'Dimensions', icon: Ruler },
  { id: 'balance', label: 'Class Balance', icon: Scale },
  { id: 'quality', label: 'Quality', icon: Sparkles },
];

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
 * Calculate mean and standard deviation
 */
function calculateStats(values: number[]): { mean: number; stdDev: number } {
  if (values.length === 0) return { mean: 0, stdDev: 0 };
  const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
  const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
  return { mean, stdDev: Math.sqrt(variance) };
}

/**
 * Identify outliers using IQR method
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
 * Custom tooltip for charts
 */
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload || !payload.length) return null;
  const dataPoint = payload.find((p: any) => p.payload)?.payload || payload[0].payload;
  const isOutlier = dataPoint.isOutlier;
  const percentOfMean = dataPoint.percentOfMean;
  const count = dataPoint.count;

  return (
    <div className={CHART_TOOLTIP_CLASSNAME}>
      <p className="text-sm font-semibold text-gray-900 mb-1">{label}</p>
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

/**
 * Category Dropdown Component
 */
function CategoryDropdown({
  categories,
  selectedCategoryId,
  onSelect,
  prefersReducedMotion,
}: {
  categories: GroupedCategory[];
  selectedCategoryId: string | null;
  onSelect: (categoryId: string | null) => void;
  prefersReducedMotion: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const allOptions = [
    { id: null, name: 'All Categories', color: null },
    ...categories.map(c => ({ id: c.category_id, name: c.category_name, color: c.category_color })),
  ];

  const selectedOption = allOptions.find(opt => opt.id === selectedCategoryId) || allOptions[0];

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  return (
    <div className="relative" ref={dropdownRef}>
      <div className="mb-1">
        <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">
          Category:
        </label>
      </div>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full h-8 px-3 py-1.5 text-xs text-gray-700 bg-white/80 border border-emerald-200/50 rounded-lg
                   hover:bg-emerald-50/50 transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500
                   flex items-center justify-between"
      >
        <span className="flex items-center gap-1.5 truncate">
          {selectedOption.color && (
            <div className="w-1 h-3.5 flex-shrink-0" style={{ backgroundColor: selectedOption.color }} />
          )}
          {selectedOption.name}
        </span>
        <ChevronDown className={`w-3.5 h-3.5 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={prefersReducedMotion ? {} : { opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={prefersReducedMotion ? {} : { opacity: 0, y: -8 }}
            transition={{ duration: prefersReducedMotion ? 0.01 : 0.15 }}
            className="absolute top-full left-0 right-0 mt-1 max-h-60 overflow-y-auto z-50
                       bg-white/95 backdrop-blur-sm border border-emerald-200/50 rounded-lg shadow-xl"
          >
            {allOptions.map((option) => {
              const isSelected = option.id === selectedCategoryId;
              return (
                <div
                  key={option.id || 'all'}
                  onClick={() => { onSelect(option.id); setIsOpen(false); }}
                  className={`px-3 py-2 text-xs cursor-pointer flex items-center justify-between gap-2
                             ${isSelected ? 'bg-emerald-100/50 font-semibold' : 'hover:bg-emerald-50/50'}`}
                >
                  <div className="flex items-center gap-1.5 truncate">
                    {option.color && (
                      <div className="w-1 h-3.5 flex-shrink-0" style={{ backgroundColor: option.color }} />
                    )}
                    <span>{option.name}</span>
                  </div>
                  {isSelected && <Check className="w-3.5 h-3.5 text-emerald-600" />}
                </div>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * Balance Score Badge
 */
function BalanceScoreBadge({
  balanceScore,
  imbalanceLevel,
}: {
  balanceScore: number;
  imbalanceLevel: 'balanced' | 'moderate' | 'severe';
}) {
  const colors = {
    balanced: { bg: 'bg-emerald-50/80', border: 'border-emerald-200/50', text: 'text-emerald-700', circle: '#10B981' },
    moderate: { bg: 'bg-yellow-50/80', border: 'border-yellow-200/50', text: 'text-yellow-700', circle: '#F59E0B' },
    severe: { bg: 'bg-red-50/80', border: 'border-red-200/50', text: 'text-red-700', circle: '#EF4444' },
  };
  const colorScheme = colors[imbalanceLevel];

  return (
    <div>
      <div className="mb-1">
        <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Balance Score:</label>
      </div>
      <div className={`h-8 px-2.5 py-1.5 border rounded-lg flex items-center gap-1.5 ${colorScheme.bg} ${colorScheme.border}`}>
        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: colorScheme.circle }} />
        <span className={`text-xs font-medium truncate ${colorScheme.text}`}>
          {balanceScore}% {imbalanceLevel}
        </span>
      </div>
    </div>
  );
}

/**
 * Compact Stat Row Component - Readable fonts
 */
function StatRow({ label, value, subValue }: { label: string; value: string | number; subValue?: string }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-gray-100 last:border-0">
      <span className="text-xs text-gray-500">{label}</span>
      <div className="text-right">
        <span className="text-sm font-semibold text-gray-800">{value}</span>
        {subValue && <span className="text-xs text-gray-400 ml-1">{subValue}</span>}
      </div>
    </div>
  );
}

/**
 * Overview Tab Content - Compact with more stats
 */
function OverviewTab({
  data,
  prefersReducedMotion,
}: {
  data: NonNullable<ReturnType<typeof useEnhancedDatasetStats>['data']>;
  prefersReducedMotion: boolean;
}) {
  const tagCounts = data.tag_distribution.map(t => t.count);
  const tagStats = calculateStats(tagCounts);
  const tagOutliers = identifyOutliers(tagCounts).size;
  const totalTagUsage = tagCounts.reduce((a, b) => a + b, 0);
  const balanceScore = tagStats.mean > 0 ? ((1 - tagStats.stdDev / tagStats.mean) * 100) : 0;

  return (
    <div className="space-y-2.5">
      {/* Primary Stats - 3 column compact grid */}
      <motion.div
        initial={prefersReducedMotion ? {} : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="grid grid-cols-3 gap-2"
      >
        <div className="p-2.5 rounded-lg border border-emerald-200/50 bg-emerald-50/30 text-center">
          <div className="text-[10px] text-gray-500 uppercase font-medium">Images</div>
          <div className="text-base font-bold text-gray-900">{data.total_images?.toLocaleString() || '-'}</div>
        </div>
        <div className="p-2.5 rounded-lg border border-blue-200/50 bg-blue-50/30 text-center">
          <div className="text-[10px] text-gray-500 uppercase font-medium">Tags</div>
          <div className="text-base font-bold text-gray-900">{data.tag_distribution.length}</div>
        </div>
        <div className="p-2.5 rounded-lg border border-purple-200/50 bg-purple-50/30 text-center">
          <div className="text-[10px] text-gray-500 uppercase font-medium">Balance</div>
          <div className={cn('text-base font-bold', balanceScore >= 70 ? 'text-emerald-600' : balanceScore >= 40 ? 'text-amber-600' : 'text-red-600')}>
            {balanceScore.toFixed(0)}%
          </div>
        </div>
      </motion.div>

      {/* File Size Section */}
      <div className="p-2.5 rounded-lg border border-gray-200/50 bg-white/50">
        <div className="flex items-center gap-1.5 mb-2">
          <HardDrive className="w-3.5 h-3.5 text-emerald-600" />
          <span className="text-xs font-semibold text-gray-600 uppercase">Storage</span>
        </div>
        <StatRow label="Average" value={formatFileSize(data.file_size_stats.avg)} />
        <StatRow label="Range" value={`${formatFileSize(data.file_size_stats.min)} - ${formatFileSize(data.file_size_stats.max)}`} />
        {data.file_size_stats.median && <StatRow label="Median" value={formatFileSize(data.file_size_stats.median)} />}
        <StatRow label="Total" value={formatFileSize(data.file_size_stats.total || data.file_size_stats.avg * (data.total_images || 1))} />
      </div>

      {/* Dimensions Section */}
      <div className="p-2.5 rounded-lg border border-gray-200/50 bg-white/50">
        <div className="flex items-center gap-1.5 mb-2">
          <Ruler className="w-3.5 h-3.5 text-purple-600" />
          <span className="text-xs font-semibold text-gray-600 uppercase">Dimensions</span>
        </div>
        <StatRow label="Median Size" value={`${data.median_width} × ${data.median_height}`} subValue="px" />
        <StatRow label="Aspect Ratio" value={data.median_aspect_ratio.toFixed(2)} />
        <StatRow label="Width Range" value={`${data.min_width} - ${data.max_width}`} subValue="px" />
        <StatRow label="Height Range" value={`${data.min_height} - ${data.max_height}`} subValue="px" />
        <StatRow label="Size Buckets" value={data.dimension_histogram.length} />
      </div>

      {/* Tags Section */}
      <div className="p-2.5 rounded-lg border border-gray-200/50 bg-white/50">
        <div className="flex items-center gap-1.5 mb-2">
          <TagIcon className="w-3.5 h-3.5 text-blue-600" />
          <span className="text-xs font-semibold text-gray-600 uppercase">Tags & Labels</span>
        </div>
        <StatRow label="Unique Tags" value={data.tag_distribution.length} />
        <StatRow label="Total Usage" value={totalTagUsage.toLocaleString()} />
        <StatRow label="Avg per Tag" value={tagStats.mean.toFixed(1)} />
        {tagOutliers > 0 && <StatRow label="Outliers" value={tagOutliers} />}
        <StatRow
          label="Imbalance"
          value={data.imbalance_level.charAt(0).toUpperCase() + data.imbalance_level.slice(1)}
          subValue={`(${(data.imbalance_score * 100).toFixed(0)}%)`}
        />
      </div>
    </div>
  );
}

/**
 * Dimensions Tab Content - With interactive histograms
 */
function DimensionsTab({
  data,
  onFilterUpdate,
  prefersReducedMotion,
}: {
  data: NonNullable<ReturnType<typeof useEnhancedDatasetStats>['data']>;
  onFilterUpdate: (filters: any) => void;
  prefersReducedMotion: boolean;
}) {
  const { showSuccess } = useAnalyticsToast();

  // Transform dimension histogram with outlier detection
  const dimensionChartData = useMemo(() => {
    if (!data?.dimension_histogram) return [];
    const counts = data.dimension_histogram.map(b => b.count);
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

  // Transform aspect ratio histogram
  const aspectRatioChartData = useMemo(() => {
    if (!data?.aspect_ratio_histogram) return [];
    const counts = data.aspect_ratio_histogram.map(b => b.count);
    const outlierIndices = identifyOutliers(counts);
    const { mean } = calculateStats(counts);

    return data.aspect_ratio_histogram.map((bucket, index) => ({
      name: bucket.bucket,
      count: bucket.count,
      min: bucket.min,
      max: bucket.max,
      isOutlier: outlierIndices.has(index),
      percentOfMean: mean > 0 ? (bucket.count / mean) * 100 : 0,
    }));
  }, [data]);

  // Multi-select state
  const dimensionMultiSelect = useChartMultiSelect(dimensionChartData);
  const aspectRatioMultiSelect = useChartMultiSelect(aspectRatioChartData);

  // Handlers
  const handleDimensionApplyFilter = () => {
    const selected = dimensionMultiSelect.selectedData;
    if (selected.length === 0) return;
    const minDim = Math.min(...selected.map((d: any) => d.min));
    const maxDim = Math.max(...selected.map((d: any) => d.max));
    onFilterUpdate({ width_min: minDim, width_max: maxDim, height_min: minDim, height_max: maxDim });
    showSuccess(`Filtering by ${selected.length} size range${selected.length > 1 ? 's' : ''}`, { icon: '📐' });
    dimensionMultiSelect.clearSelection();
  };

  const handleAspectRatioApplyFilter = () => {
    const selected = aspectRatioMultiSelect.selectedData;
    if (selected.length === 0) return;
    const minRatio = Math.min(...selected.map((d: any) => d.min));
    const maxRatio = Math.max(...selected.map((d: any) => d.max));
    onFilterUpdate({ aspect_ratio_min: minRatio, aspect_ratio_max: maxRatio });
    showSuccess(`Filtering by ${selected.length} aspect ratio range${selected.length > 1 ? 's' : ''}`, { icon: '📐' });
    aspectRatioMultiSelect.clearSelection();
  };

  const dimensionChartClick = useChartClick(dimensionChartData, (d, i, e) => dimensionMultiSelect.handleBarClick(i, d, e));
  const aspectRatioChartClick = useChartClick(aspectRatioChartData, (d, i, e) => aspectRatioMultiSelect.handleBarClick(i, d, e));

  return (
    <div className="space-y-2">
      {/* Compact Dimensions Summary - Single row */}
      <div className="grid grid-cols-4 gap-1 p-1.5 rounded-lg border border-gray-200/50 bg-white/50">
        <div className="text-center">
          <div className="text-[8px] text-gray-400 uppercase">Width</div>
          <div className="text-xs font-bold text-gray-800">{data.median_width}px</div>
        </div>
        <div className="text-center">
          <div className="text-[8px] text-gray-400 uppercase">Height</div>
          <div className="text-xs font-bold text-gray-800">{data.median_height}px</div>
        </div>
        <div className="text-center">
          <div className="text-[8px] text-gray-400 uppercase">Ratio</div>
          <div className="text-xs font-bold text-gray-800">{data.median_aspect_ratio.toFixed(2)}</div>
        </div>
        <div className="text-center">
          <div className="text-[8px] text-gray-400 uppercase">Variance</div>
          <div className={cn('text-xs font-bold', data.dimension_variance < 0.3 ? 'text-emerald-600' : data.dimension_variance < 0.6 ? 'text-amber-600' : 'text-red-600')}>
            {data.dimension_variance < 0.3 ? 'Low' : data.dimension_variance < 0.6 ? 'Med' : 'High'}
          </div>
        </div>
      </div>

      {/* Dimension Histogram - Taller with horizontal labels */}
      {dimensionChartData.length > 0 && (
        <ChartSection icon={Ruler} title="Size" hint="Click to filter" color="purple" height={200}>
          <HistogramChart
            data={dimensionChartData}
            xKey="name"
            yKey="count"
            tooltip={<CustomTooltip />}
            multiSelect={dimensionMultiSelect}
            chartClick={dimensionChartClick}
            theme={HISTOGRAM_THEMES.purple}
            xAxisAngled={false}
            prefersReducedMotion={prefersReducedMotion}
          />
          <SelectionActionBar
            selectionCount={dimensionMultiSelect.selectionCount}
            onApply={handleDimensionApplyFilter}
            onClear={dimensionMultiSelect.clearSelection}
            prefersReducedMotion={prefersReducedMotion}
          />
        </ChartSection>
      )}

      {/* Aspect Ratio Histogram - Taller with horizontal labels */}
      {aspectRatioChartData.length > 0 && (
        <ChartSection icon={Ratio} title="Aspect Ratio" hint="Click to filter" color="orange" height={200}>
          <HistogramChart
            data={aspectRatioChartData}
            xKey="name"
            yKey="count"
            tooltip={<CustomTooltip />}
            multiSelect={aspectRatioMultiSelect}
            chartClick={aspectRatioChartClick}
            theme={HISTOGRAM_THEMES.orange}
            xAxisAngled={false}
            prefersReducedMotion={prefersReducedMotion}
          />
          <SelectionActionBar
            selectionCount={aspectRatioMultiSelect.selectionCount}
            onApply={handleAspectRatioApplyFilter}
            onClear={aspectRatioMultiSelect.clearSelection}
            prefersReducedMotion={prefersReducedMotion}
          />
        </ChartSection>
      )}

      {/* Recommendation - Compact */}
      {data.recommended_resize && (
        <div className="p-2 rounded-lg border border-emerald-200/50 bg-emerald-50/30 flex items-center justify-between">
          <span className="text-[10px] text-emerald-700 font-medium">Recommended:</span>
          <span className="text-xs font-bold text-gray-900">{data.recommended_resize.width}×{data.recommended_resize.height}px</span>
        </div>
      )}
    </div>
  );
}

/**
 * Class Balance Tab Content - With interactive tag distribution chart
 */
function ClassBalanceTab({
  data,
  onFilterUpdate,
  prefersReducedMotion,
}: {
  data: NonNullable<ReturnType<typeof useEnhancedDatasetStats>['data']>;
  onFilterUpdate: (filters: any) => void;
  prefersReducedMotion: boolean;
}) {
  const { showSuccess } = useAnalyticsToast();
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);

  // Group tags by category
  const { groupedTagData, maxTagCount, allCategories } = useMemo(() => {
    if (!data?.tag_distribution) return { groupedTagData: [], maxTagCount: 0, allCategories: [] };

    const groups: Map<string, GroupedCategory> = new Map();
    let maxCount = 0;

    const filteredTags = selectedCategoryId
      ? data.tag_distribution.filter(tag => tag.category_id === selectedCategoryId)
      : data.tag_distribution;

    filteredTags.slice(0, 20).forEach((tag) => {
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

    const allCategoriesMap: Map<string, GroupedCategory> = new Map();
    data.tag_distribution.forEach((tag) => {
      const categoryKey = tag.category_id || 'uncategorized';
      if (!allCategoriesMap.has(categoryKey)) {
        allCategoriesMap.set(categoryKey, {
          category_id: tag.category_id || null,
          category_name: tag.category_name || 'Uncategorized',
          category_color: tag.category_color || '#6B7280',
          tags: [],
        });
      }
    });

    return {
      groupedTagData: Array.from(groups.values()),
      maxTagCount: maxCount,
      allCategories: Array.from(allCategoriesMap.values()),
    };
  }, [data, selectedCategoryId]);

  const handleCategorySelect = (categoryId: string | null) => {
    setSelectedCategoryId(categoryId);
    const categoryName = categoryId
      ? allCategories.find(c => c.category_id === categoryId)?.category_name || 'Unknown'
      : 'All Categories';
    showSuccess(`Filtered to ${categoryName}`, { icon: '🏷️' });
  };

  const handleTagClick = (tag: TagItem) => {
    if (!tag?.tag_id) return;
    onFilterUpdate({ tag_ids: [tag.tag_id] });
    showSuccess(`Filtering by tag: ${tag.name}`, { icon: '🏷️' });
  };

  const balanceScore = Math.round((1 - data.imbalance_score) * 100);

  return (
    <div className="space-y-3">
      {/* Filter Controls */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="flex-1 min-w-[160px]">
          <CategoryDropdown
            categories={allCategories}
            selectedCategoryId={selectedCategoryId}
            onSelect={handleCategorySelect}
            prefersReducedMotion={prefersReducedMotion}
          />
        </div>
        <div className="flex-shrink-0 sm:w-[180px]">
          <BalanceScoreBadge balanceScore={balanceScore} imbalanceLevel={data.imbalance_level} />
        </div>
      </div>

      {/* Tag Distribution Chart - Taller with bigger text */}
      <div className="p-2.5 rounded-lg border border-emerald-200/50 bg-white/80">
        <div className="flex items-center gap-2 mb-2">
          <TagIcon className="w-3.5 h-3.5 text-emerald-600" />
          <h3 className="text-xs font-semibold text-gray-700">Tag Distribution</h3>
          <span className="text-[10px] text-gray-400 ml-auto">Click to filter</span>
        </div>

        <div className="max-h-80 overflow-y-auto space-y-1">
          {groupedTagData.map((group, groupIndex) => (
            <div key={group.category_id || 'uncategorized'}>
              {group.tags.map((tag) => (
                <div
                  key={tag.tag_id}
                  className="flex items-center gap-1.5 py-1 cursor-pointer hover:bg-emerald-50/50 transition-colors rounded px-1"
                  onClick={() => handleTagClick(tag)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === 'Enter' && handleTagClick(tag)}
                >
                  <div className="w-1 h-4 flex-shrink-0 rounded-sm" style={{ backgroundColor: group.category_color }} />
                  <span className="w-20 min-w-[80px] text-[11px] text-gray-700 truncate font-medium" title={tag.name}>{tag.name}</span>
                  <div className="flex-1 h-4 bg-gray-100 rounded">
                    <div
                      className="h-full rounded transition-all duration-300"
                      style={{ width: `${maxTagCount > 0 ? (tag.count / maxTagCount) * 100 : 0}%`, backgroundColor: tag.color }}
                    />
                  </div>
                  <span className="w-8 text-[11px] text-gray-600 text-right tabular-nums font-medium">{tag.count}</span>
                </div>
              ))}
              {groupIndex < groupedTagData.length - 1 && (
                <div className="flex items-center gap-1.5 py-1 my-0.5">
                  <div className="flex-1 border-t border-dashed border-gray-300" />
                  <span className="text-[10px] font-semibold px-1.5" style={{ color: group.category_color }}>{group.category_name}</span>
                  <div className="flex-1 border-t border-dashed border-gray-300" />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Imbalance Insights */}
      {data.imbalance_level !== 'balanced' && (
        <div className={cn(
          'p-2.5 rounded-lg border',
          data.imbalance_level === 'severe' ? 'bg-red-50/30 border-red-200/50' : 'bg-yellow-50/30 border-yellow-200/50'
        )}>
          <div className="flex items-center gap-1.5 mb-2">
            <AlertTriangle className={cn('w-3.5 h-3.5', data.imbalance_level === 'severe' ? 'text-red-600' : 'text-yellow-600')} />
            <span className="text-xs font-semibold text-gray-700">
              {data.imbalance_level === 'severe' ? 'Severe' : 'Moderate'} Imbalance Detected
            </span>
          </div>
          {data.class_recommendations.length > 0 && (
            <ul className="space-y-1">
              {data.class_recommendations.slice(0, 3).map((rec, i) => (
                <li key={i} className="text-[10px] text-gray-600">{rec}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Quality Tab Content with Process Button and Progress Animation
 */
function QualityTab({
  data,
  projectId,
  onRefresh,
  prefersReducedMotion,
}: {
  data: NonNullable<ReturnType<typeof useEnhancedDatasetStats>['data']>;
  projectId: string;
  onRefresh: () => void;
  prefersReducedMotion: boolean;
}) {
  // Use the new quality progress hook for background job management
  const {
    progress: jobProgress,
    isProcessing,
    isComplete,
    isFailed,
    isCancelled,
    isIdle,
    startJob,
    cancelJob,
    isStarting,
    isCancelling,
    startError,
    cancelError,
    processed,
    failed,
    total,
    progressPct,
    status,
  } = useQualityProgress({ projectId, enabled: true });

  // Local state for sync functionality
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncResult, setSyncResult] = useState<{ synced: number; pending: number } | null>(null);
  const [dismissedError, setDismissedError] = useState(false);

  // Reset dismissed error when job state changes
  useEffect(() => {
    setDismissedError(false);
  }, [status]);

  const statusIcons = { pending: Clock, processing: RefreshCw, completed: CheckCircle, failed: XCircle };
  const statusColors = { pending: 'text-gray-400', processing: 'text-blue-400', completed: 'text-emerald-400', failed: 'text-red-400' };

  const totalImages = Object.values(data.quality_status_counts).reduce((a, b) => a + b, 0);
  const completedPercent = totalImages > 0 ? (data.quality_status_counts.completed / totalImages) * 100 : 0;
  const pendingCount = data.quality_status_counts.pending || 0;

  // Check if there might be untracked images (total dataset images > tracked quality images)
  const untrackedCount = Math.max(0, (data.total_images || 0) - totalImages);

  // Show process button if: pending images exist OR untracked images exist (and not already processing)
  const needsProcessing = (pendingCount > 0 || untrackedCount > 0) && isIdle;

  // Derive error from hook or local sync error (can be dismissed)
  const processingError = dismissedError
    ? null
    : startError?.message || cancelError?.message || syncError || (isFailed ? 'Processing failed' : null);

  // Refresh when job completes
  useEffect(() => {
    if (isComplete || isCancelled) {
      onRefresh();
    }
  }, [isComplete, isCancelled, onRefresh]);

  // Sync function - finds untracked images and creates pending records
  const handleSync = useCallback(async () => {
    if (isSyncing || isProcessing) return;
    setIsSyncing(true);
    setSyncError(null);
    setSyncResult(null);

    try {
      const result = await analyticsApi.syncQualityMetrics(projectId);
      setSyncResult({ synced: result.synced, pending: result.pending });
      // Refresh to update counts
      await onRefresh();
    } catch (error) {
      console.error('Sync error:', error);
      setSyncError(error instanceof Error ? error.message : 'Sync failed');
    } finally {
      setIsSyncing(false);
    }
  }, [projectId, isSyncing, isProcessing, onRefresh]);

  // Start quality processing job (background, via Celery)
  const handleProcessQuality = useCallback(() => {
    if (isProcessing || isStarting) return;
    setSyncError(null);
    startJob(50); // batch size of 50
  }, [isProcessing, isStarting, startJob]);

  // Cancel running job
  const handleCancelJob = useCallback(() => {
    if (!isProcessing || isCancelling) return;
    cancelJob();
  }, [isProcessing, isCancelling, cancelJob]);

  return (
    <div className="space-y-4">
      {/* Sync & Process Buttons Section */}
      {!isProcessing && !isSyncing && (
        <motion.div
          initial={prefersReducedMotion ? {} : { opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <Zap className="w-4 h-4 text-emerald-400 flex-shrink-0" />
              <div className="min-w-0">
                <div className="text-sm font-medium text-emerald-300">
                  {untrackedCount > 0
                    ? `${untrackedCount} untracked images`
                    : pendingCount > 0
                    ? `${pendingCount} images pending analysis`
                    : 'Quality metrics ready'}
                </div>
                <div className="text-xs text-gray-400 truncate">
                  {untrackedCount > 0
                    ? 'Click Sync to discover, then Process'
                    : 'Compute sharpness, brightness, contrast & uniqueness'}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {/* Sync Button - always visible */}
              <button
                onClick={handleSync}
                disabled={isSyncing}
                className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-500
                           text-white text-sm font-medium rounded-lg transition-colors
                           focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-900
                           disabled:opacity-50 disabled:cursor-not-allowed"
                title="Find untracked images and prepare them for processing"
              >
                <RefreshCw className="w-4 h-4" />
                Sync
              </button>
              {/* Process Button - enabled when there are pending images */}
              <button
                onClick={handleProcessQuality}
                disabled={!needsProcessing}
                className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-500
                           text-white text-sm font-medium rounded-lg transition-colors
                           focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 focus:ring-offset-gray-900
                           disabled:opacity-50 disabled:cursor-not-allowed"
                title="Process pending quality metrics"
              >
                <Play className="w-4 h-4" />
                Process
              </button>
            </div>
          </div>
        </motion.div>
      )}

      {/* Syncing State */}
      {isSyncing && (
        <motion.div
          initial={prefersReducedMotion ? {} : { opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="p-4 rounded-lg border border-blue-500/30 bg-blue-500/10"
        >
          <div className="flex items-center gap-3">
            <motion.div
              animate={prefersReducedMotion ? {} : { rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
            >
              <RefreshCw className="w-5 h-5 text-blue-400" />
            </motion.div>
            <div>
              <div className="text-sm font-medium text-blue-300">Syncing...</div>
              <div className="text-xs text-gray-400">
                Finding untracked images and creating pending records
              </div>
            </div>
          </div>
        </motion.div>
      )}

      {/* Sync Result */}
      {syncResult && !isSyncing && !isProcessing && (
        <motion.div
          initial={prefersReducedMotion ? {} : { opacity: 0 }}
          animate={{ opacity: 1 }}
          className="p-3 rounded-lg border border-blue-500/30 bg-blue-500/10 flex items-center justify-between"
        >
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-blue-400 flex-shrink-0" />
            <div className="text-sm text-blue-300">
              {syncResult.synced > 0
                ? `Found ${syncResult.synced} new images. ${syncResult.pending} pending.`
                : 'All images are already tracked.'}
            </div>
          </div>
          <button
            onClick={() => setSyncResult(null)}
            className="text-xs text-gray-400 hover:text-white"
          >
            Dismiss
          </button>
        </motion.div>
      )}

      {/* Processing Progress */}
      {isProcessing && (
        <motion.div
          initial={prefersReducedMotion ? {} : { opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="p-4 rounded-lg border border-blue-500/30 bg-blue-500/10"
        >
          <div className="flex items-center gap-3 mb-3">
            <motion.div
              animate={prefersReducedMotion ? {} : { rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
            >
              <RefreshCw className="w-5 h-5 text-blue-400" />
            </motion.div>
            <div className="flex-1">
              <div className="text-sm font-medium text-blue-300">Processing Quality Metrics</div>
              <div className="text-xs text-gray-400">
                {processed} / {total} images processed
                {failed > 0 && <span className="text-red-400 ml-2">({failed} failed)</span>}
              </div>
            </div>
            <div className="text-2xl font-bold text-blue-400 tabular-nums">
              {Math.round(progressPct)}%
            </div>
            {/* Cancel Button */}
            <button
              onClick={handleCancelJob}
              disabled={isCancelling}
              className="flex items-center gap-1 px-2 py-1 bg-red-600/20 hover:bg-red-600/40
                         text-red-400 text-xs font-medium rounded transition-colors
                         focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 focus:ring-offset-gray-900
                         disabled:opacity-50 disabled:cursor-not-allowed"
              title="Cancel processing"
            >
              <Square className="w-3 h-3" />
              {isCancelling ? 'Cancelling...' : 'Cancel'}
            </button>
          </div>

          {/* Animated Progress Bar */}
          <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-gradient-to-r from-blue-500 to-emerald-500 rounded-full"
              initial={{ width: 0 }}
              animate={{ width: `${progressPct}%` }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
            />
          </div>

          {/* Progress Steps */}
          <div className="flex justify-between mt-2 text-[10px] text-gray-500">
            {[0, 25, 50, 75, 100].map((step) => (
              <span
                key={step}
                className={cn(
                  'transition-colors',
                  progressPct >= step ? 'text-blue-400' : 'text-gray-600'
                )}
              >
                {step}%
              </span>
            ))}
          </div>
        </motion.div>
      )}

      {/* Processing Error */}
      {processingError && (
        <motion.div
          initial={prefersReducedMotion ? {} : { opacity: 0 }}
          animate={{ opacity: 1 }}
          className="p-3 rounded-lg border border-red-500/30 bg-red-500/10 flex items-center gap-2"
        >
          <XCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
          <div className="text-sm text-red-300">{processingError}</div>
          <button
            onClick={() => {
              setDismissedError(true);
              setSyncError(null);
            }}
            className="ml-auto text-xs text-gray-400 hover:text-white"
          >
            Dismiss
          </button>
        </motion.div>
      )}

      {/* Status Overview */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-sm font-medium text-emerald-300">Processing Status</h4>
          <span className={cn(
            'px-2 py-0.5 rounded text-xs font-medium',
            data.quality_status === 'complete' ? 'bg-emerald-500/20 text-emerald-400' :
            data.quality_status === 'partial' ? 'bg-amber-500/20 text-amber-400' : 'bg-gray-500/20 text-gray-400'
          )}>
            {completedPercent.toFixed(0)}% Complete
          </span>
        </div>
        <div className="grid grid-cols-4 gap-2">
          {(Object.entries(data.quality_status_counts) as [keyof typeof statusIcons, number][]).map(([status, count]) => {
            const Icon = statusIcons[status];
            return (
              <div key={status} className="bg-white/5 rounded-lg p-2 text-center">
                <Icon className={cn('h-4 w-4 mx-auto mb-1', statusColors[status])} />
                <div className="text-lg font-semibold text-white">{count}</div>
                <div className="text-xs text-gray-500 capitalize">{status}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Quality Averages */}
      {data.quality_averages && data.quality_status_counts.completed > 0 && (
        <div>
          <h4 className="text-sm font-medium text-emerald-300 mb-2">Average Metrics</h4>
          <div className="grid grid-cols-2 gap-2">
            {data.quality_averages.sharpness != null && (
              <div className="bg-white/5 rounded-lg p-2 border border-emerald-500/20">
                <div className="text-xs text-gray-400">Sharpness</div>
                <div className="text-lg font-semibold text-white">{((data.quality_averages.sharpness || 0) * 100).toFixed(0)}%</div>
              </div>
            )}
            {data.quality_averages.brightness != null && (
              <div className="bg-white/5 rounded-lg p-2 border border-amber-500/20">
                <div className="text-xs text-gray-400">Brightness</div>
                <div className="text-lg font-semibold text-white">{((data.quality_averages.brightness || 0) * 100).toFixed(0)}%</div>
              </div>
            )}
            {data.quality_averages.contrast != null && (
              <div className="bg-white/5 rounded-lg p-2 border border-blue-500/20">
                <div className="text-xs text-gray-400">Contrast</div>
                <div className="text-lg font-semibold text-white">{((data.quality_averages.contrast || 0) * 100).toFixed(0)}%</div>
              </div>
            )}
            {data.quality_averages.uniqueness != null && (
              <div className="bg-white/5 rounded-lg p-2 border border-purple-500/20">
                <div className="text-xs text-gray-400">Uniqueness</div>
                <div className="text-lg font-semibold text-white">{((data.quality_averages.uniqueness || 0) * 100).toFixed(0)}%</div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Issue Breakdown */}
      {data.quality_status_counts.completed > 0 && (
        <div>
          <h4 className="text-sm font-medium text-emerald-300 mb-2">Detected Issues</h4>
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(data.issue_breakdown).map(([issue, count]) => (
              <div key={issue} className="flex items-center justify-between bg-white/5 rounded-lg p-2">
                <div className="flex items-center gap-2">
                  <AlertCircle className={cn('h-3.5 w-3.5', count > 0 ? 'text-amber-400' : 'text-gray-600')} />
                  <span className="text-xs text-gray-400 capitalize">{issue.replace('_', ' ')}</span>
                </div>
                <span className={cn('text-sm font-medium', count > 0 ? 'text-amber-400' : 'text-gray-600')}>{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Flagged Images */}
      {data.flagged_images.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-emerald-300 mb-2">Flagged Images</h4>
          <div className="space-y-1.5 max-h-32 overflow-y-auto">
            {data.flagged_images.slice(0, 5).map((img) => (
              <div key={img.shared_image_id} className="flex items-center justify-between bg-white/5 rounded p-2">
                <span className="text-xs text-gray-300 truncate flex-1">{img.filename}</span>
                <div className="flex items-center gap-1.5">
                  {img.issues.slice(0, 2).map((issue) => (
                    <span key={issue} className="px-1.5 py-0.5 bg-red-500/20 text-red-400 text-xs rounded">{issue}</span>
                  ))}
                  <span className="text-xs text-gray-500 ml-1">{(img.overall_quality * 100).toFixed(0)}%</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* No data state - only show when no images at all */}
      {totalImages === 0 && (
        <div className="text-center py-4 text-gray-500">
          <Clock className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <div className="text-sm">No images in dataset</div>
          <div className="text-xs mt-1">Upload images to compute quality metrics</div>
        </div>
      )}

      {/* All processed state */}
      {data.quality_status === 'complete' && pendingCount === 0 && !isProcessing && totalImages > 0 && (
        <motion.div
          initial={prefersReducedMotion ? {} : { opacity: 0 }}
          animate={{ opacity: 1 }}
          className="p-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 flex items-center gap-2"
        >
          <CheckCircle className="w-4 h-4 text-emerald-400 flex-shrink-0" />
          <div className="text-sm text-emerald-300">All images have been analyzed</div>
        </motion.div>
      )}
    </div>
  );
}

/**
 * Enhanced Dataset Statistics Panel
 */
export default function EnhancedDatasetStatsPanel({
  projectId,
  filters,
  onFilterUpdate,
}: PanelProps) {
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const prefersReducedMotion = useReducedMotion();

  const { data, isLoading, error, refetch } = useEnhancedDatasetStats({
    projectId,
    filters,
    enabled: !!projectId,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-48">
        <Loader2 className="h-6 w-6 animate-spin text-emerald-400" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-48 text-red-400">
        <AlertTriangle className="h-6 w-6 mb-2" />
        <span className="text-sm">Failed to load statistics</span>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center h-48 text-gray-500">
        <span className="text-sm">No data available</span>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Tab Navigation */}
      <div className="flex border-b border-emerald-500/20 mb-4">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-2 text-sm transition-colors',
              'border-b-2 -mb-px',
              activeTab === tab.id
                ? 'border-emerald-400 text-emerald-300'
                : 'border-transparent text-gray-500 hover:text-gray-300 hover:border-gray-600'
            )}
          >
            <tab.icon className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'overview' && <OverviewTab data={data} prefersReducedMotion={prefersReducedMotion} />}
        {activeTab === 'dimensions' && <DimensionsTab data={data} onFilterUpdate={onFilterUpdate} prefersReducedMotion={prefersReducedMotion} />}
        {activeTab === 'balance' && <ClassBalanceTab data={data} onFilterUpdate={onFilterUpdate} prefersReducedMotion={prefersReducedMotion} />}
        {activeTab === 'quality' && (
          <QualityTab
            data={data}
            projectId={projectId}
            onRefresh={refetch}
            prefersReducedMotion={prefersReducedMotion}
          />
        )}
      </div>
    </div>
  );
}
