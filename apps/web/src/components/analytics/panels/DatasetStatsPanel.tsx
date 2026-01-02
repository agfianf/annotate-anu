/**
 * Dataset Statistics Panel
 * Interactive charts showing tag distribution and dimension histograms
 * Features emerald glass morphism design with click-to-filter interactions
 */

import { useMemo, useState, useRef, useEffect } from 'react';
import {
  Loader2,
  BarChart3,
  Ruler,
  HardDrive,
  Tag as TagIcon,
  TrendingUp,
  AlertTriangle,
  ChevronDown,
  Check,
  Ratio,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { PanelProps } from '@/types/analytics';
import { useAnalyticsToast } from '@/hooks/useAnalyticsToast';
import { useDatasetStats } from '@/hooks/useDatasetStats';
import { useClassBalance } from '@/hooks/useClassBalance';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useChartClick } from '../shared/useChartClick';
import { useChartMultiSelect } from '../shared/useChartMultiSelect';
import { SelectionActionBar } from '../shared/SelectionActionBar';
import { CHART_TOOLTIP_CLASSNAME } from '../shared/chartConfig';
import { ChartSection } from '../shared/PanelComponents';
import { HistogramChart, HISTOGRAM_THEMES } from '../shared/HistogramChart';

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
 * Category Dropdown Component
 */
interface CategoryDropdownProps {
  categories: GroupedCategory[];
  selectedCategoryId: string | null;
  onSelect: (categoryId: string | null) => void;
  prefersReducedMotion: boolean;
}

function CategoryDropdown({
  categories,
  selectedCategoryId,
  onSelect,
  prefersReducedMotion,
}: CategoryDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [focusedIndex, setFocusedIndex] = useState(-1);

  const allOptions = [
    { id: null, name: 'All Categories', color: null },
    ...categories.map(c => ({ id: c.category_id, name: c.category_name, color: c.category_color })),
  ];

  const selectedOption = allOptions.find(opt => opt.id === selectedCategoryId) || allOptions[0];

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        buttonRef.current?.focus();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        setIsOpen(true);
        setFocusedIndex(allOptions.findIndex(opt => opt.id === selectedCategoryId));
      }
      return;
    }

    switch (e.key) {
      case 'Escape':
        e.preventDefault();
        setIsOpen(false);
        buttonRef.current?.focus();
        break;
      case 'ArrowDown':
        e.preventDefault();
        setFocusedIndex(prev => (prev + 1) % allOptions.length);
        break;
      case 'ArrowUp':
        e.preventDefault();
        setFocusedIndex(prev => (prev - 1 + allOptions.length) % allOptions.length);
        break;
      case 'Home':
        e.preventDefault();
        setFocusedIndex(0);
        break;
      case 'End':
        e.preventDefault();
        setFocusedIndex(allOptions.length - 1);
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        if (focusedIndex >= 0) {
          onSelect(allOptions[focusedIndex].id);
          setIsOpen(false);
          buttonRef.current?.focus();
        }
        break;
    }
  };

  const handleSelect = (id: string | null) => {
    onSelect(id);
    setIsOpen(false);
    buttonRef.current?.focus();
  };

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
        role="combobox"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-controls="category-listbox"
        aria-label="Filter by category"
        onClick={() => setIsOpen(!isOpen)}
        onKeyDown={handleKeyDown}
        className="w-full h-8 px-3 py-1.5 text-xs text-gray-700 bg-white/80 border border-emerald-200/50 rounded-lg
                   hover:bg-emerald-50/50 transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2
                   flex items-center justify-between"
      >
        <span className="flex items-center gap-1.5 truncate">
          {selectedOption.color && (
            <div className="w-1 h-3.5 flex-shrink-0" style={{ backgroundColor: selectedOption.color }} />
          )}
          {selectedOption.name}
        </span>
        <ChevronDown className={`w-3.5 h-3.5 text-gray-400 flex-shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            id="category-listbox"
            role="listbox"
            aria-label="Select category"
            initial={prefersReducedMotion ? {} : { opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={prefersReducedMotion ? {} : { opacity: 0, y: -8 }}
            transition={{ duration: prefersReducedMotion ? 0.01 : 0.15 }}
            className="absolute top-full left-0 right-0 mt-1 max-h-60 overflow-y-auto z-50
                       bg-white/95 backdrop-blur-sm border border-emerald-200/50 rounded-lg shadow-xl"
          >
            {allOptions.map((option, index) => {
              const isSelected = option.id === selectedCategoryId;
              const isFocused = index === focusedIndex;

              return (
                <div
                  key={option.id || 'all'}
                  role="option"
                  aria-selected={isSelected}
                  aria-label={`${option.name}${option.id ? ` category` : ''}`}
                  tabIndex={-1}
                  onClick={() => handleSelect(option.id)}
                  className={`px-3 py-2 text-xs cursor-pointer flex items-center justify-between gap-2
                             ${isSelected ? 'bg-emerald-100/50 font-semibold' : ''}
                             ${isFocused ? 'ring-inset ring-2 ring-emerald-500' : ''}
                             ${!isSelected && !isFocused ? 'hover:bg-emerald-50/50' : ''}`}
                >
                  <div className="flex items-center gap-1.5 truncate">
                    {option.color && (
                      <div className="w-1 h-3.5 flex-shrink-0" style={{ backgroundColor: option.color }} />
                    )}
                    <span>{option.name}</span>
                  </div>
                  {isSelected && <Check className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />}
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
 * Balance Score Badge Component
 */
interface BalanceScoreBadgeProps {
  balanceScore: number;
  imbalanceLevel: 'balanced' | 'moderate' | 'severe';
  prefersReducedMotion: boolean;
  isLoading?: boolean;
}

function BalanceScoreBadge({ balanceScore, imbalanceLevel, prefersReducedMotion, isLoading }: BalanceScoreBadgeProps) {
  const colors = {
    balanced: {
      bg: 'bg-emerald-50/80',
      border: 'border-emerald-200/50',
      text: 'text-emerald-700',
      circle: '#10B981',
    },
    moderate: {
      bg: 'bg-yellow-50/80',
      border: 'border-yellow-200/50',
      text: 'text-yellow-700',
      circle: '#F59E0B',
    },
    severe: {
      bg: 'bg-red-50/80',
      border: 'border-red-200/50',
      text: 'text-red-700',
      circle: '#EF4444',
    },
  };

  const colorScheme = colors[imbalanceLevel];

  return (
    <div>
      <div className="mb-1">
        <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">
          Balance Score:
        </label>
      </div>
      <motion.div
        key={`${balanceScore}-${imbalanceLevel}`}
        initial={prefersReducedMotion ? {} : { scale: 0.95, opacity: 0.8 }}
        animate={{ scale: 1, opacity: isLoading ? 0.6 : 1 }}
        transition={{ duration: prefersReducedMotion ? 0.01 : 0.2 }}
        role="status"
        aria-live="polite"
        aria-label={`Class balance: ${balanceScore}% ${imbalanceLevel}`}
        className={`h-8 px-2.5 py-1.5 border rounded-lg flex items-center gap-1.5 ${colorScheme.bg} ${colorScheme.border} ${isLoading ? 'animate-pulse' : ''}`}
      >
        <div
          className="w-2 h-2 rounded-full flex-shrink-0"
          style={{ backgroundColor: colorScheme.circle }}
          aria-hidden="true"
        />
        <span className={`text-xs font-medium truncate ${colorScheme.text}`}>
          {balanceScore}% {imbalanceLevel}
        </span>
      </motion.div>
    </div>
  );
}

/**
 * Imbalance Insights Panel Component
 * Enhanced with visual severity gauge and percentage bars
 */
interface ImbalanceInsightsPanelProps {
  classBalance: any; // ClassBalanceResponse
  imbalanceLevel: 'balanced' | 'moderate' | 'severe';
  prefersReducedMotion: boolean;
}

function ImbalanceInsightsPanel({ classBalance, imbalanceLevel, prefersReducedMotion }: ImbalanceInsightsPanelProps) {
  if (imbalanceLevel === 'balanced') return null;

  const colors = {
    moderate: {
      bg: 'bg-yellow-50/30',
      border: 'border-yellow-200/50',
      icon: 'text-yellow-600',
      barBg: 'bg-yellow-100',
      barFill: 'bg-yellow-500',
      gaugeFill: '#F59E0B',
    },
    severe: {
      bg: 'bg-red-50/30',
      border: 'border-red-200/50',
      icon: 'text-red-600',
      barBg: 'bg-red-100',
      barFill: 'bg-red-500',
      gaugeFill: '#EF4444',
    },
  };

  const colorScheme = colors[imbalanceLevel] || colors.moderate;

  const underrepresentedTags = classBalance.class_distribution
    .filter((c: any) => c.status !== 'healthy')
    .slice(0, 5); // Top 5 most underrepresented

  // Calculate distribution ratio (largest vs smallest class)
  const sortedByCount = [...classBalance.class_distribution].sort(
    (a: any, b: any) => b.image_count - a.image_count
  );
  const largestClass = sortedByCount[0];
  const smallestClass = sortedByCount[sortedByCount.length - 1];
  const distributionRatio = smallestClass?.image_count > 0
    ? Math.round(largestClass?.image_count / smallestClass?.image_count)
    : 0;

  // Calculate max count for percentage bars
  const maxCount = largestClass?.image_count || 1;

  // Imbalance score as percentage (0 = balanced, 100 = severe)
  const imbalancePercent = Math.round(classBalance.imbalance_score * 100);

  return (
    <motion.div
      initial={prefersReducedMotion ? {} : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: prefersReducedMotion ? 0.01 : 0.2 }}
      role="region"
      aria-label="Class imbalance analysis"
      className={`mt-2 p-2.5 rounded-lg border ${colorScheme.bg} ${colorScheme.border}`}
    >
      {/* Header with severity gauge */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <AlertTriangle className={`w-3.5 h-3.5 ${colorScheme.icon}`} />
          <span className="text-xs font-semibold text-gray-700">
            {imbalanceLevel === 'severe' ? 'Severe' : 'Moderate'} Imbalance
          </span>
        </div>
        {/* Severity gauge bar */}
        <div className="flex items-center gap-1.5">
          <div className="w-16 h-1.5 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{
                width: `${imbalancePercent}%`,
                backgroundColor: colorScheme.gaugeFill,
              }}
            />
          </div>
          <span className="text-[10px] text-gray-500 tabular-nums">{imbalancePercent}%</span>
        </div>
      </div>

      {/* Distribution ratio insight */}
      {distributionRatio > 1 && (
        <div className="mb-2 p-1.5 bg-white/50 rounded text-[10px] text-gray-600">
          <span className="font-medium">{largestClass?.tag_name}</span> has{' '}
          <span className="font-semibold text-gray-800">{distributionRatio}x</span> more images than{' '}
          <span className="font-medium">{smallestClass?.tag_name}</span>
        </div>
      )}

      {/* Underrepresented tags with percentage bars */}
      {underrepresentedTags.length > 0 && (
        <div className="mb-2">
          <p className="text-[10px] font-medium text-gray-600 mb-1.5">
            Underrepresented Classes ({underrepresentedTags.length}):
          </p>
          <div className="space-y-1">
            {underrepresentedTags.map((tag: any) => {
              const percentage = Math.round((tag.image_count / maxCount) * 100);

              return (
                <div key={tag.tag_id} className="flex items-center gap-1.5">
                  <span className="w-16 text-[10px] text-gray-600 truncate" title={tag.tag_name}>
                    {tag.tag_name}
                  </span>
                  <div className={`flex-1 h-2 ${colorScheme.barBg} rounded-sm overflow-hidden`}>
                    <div
                      className={`h-full ${colorScheme.barFill} rounded-sm transition-all duration-300`}
                      style={{ width: `${Math.max(percentage, 2)}%` }}
                    />
                  </div>
                  <span className="w-8 text-[10px] text-gray-500 text-right tabular-nums">
                    {tag.image_count}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Recommendations */}
      {classBalance.recommendations && classBalance.recommendations.length > 0 && (
        <div className="pt-1.5 border-t border-gray-200/50">
          <p className="text-[10px] font-medium text-gray-600 mb-1">Recommendations:</p>
          <ul className="space-y-0.5">
            {classBalance.recommendations.slice(0, 2).map((rec: string, idx: number) => (
              <li key={idx} className="text-[10px] text-gray-600 leading-tight">
                {rec}
              </li>
            ))}
          </ul>
        </div>
      )}
    </motion.div>
  );
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
    <div className={CHART_TOOLTIP_CLASSNAME}>
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

  // Category filtering state
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);

  // Fetch class balance with category filter
  const { data: classBalance, isFetching: isClassBalanceFetching } = useClassBalance({
    projectId,
    categoryId: selectedCategoryId,
    enabled: !!projectId,
  });

  // Handle category selection with toast notification
  const handleCategorySelect = (categoryId: string | null) => {
    setSelectedCategoryId(categoryId);
    const categoryName = categoryId
      ? allCategories.find(c => c.category_id === categoryId)?.category_name || 'Unknown'
      : 'All Categories';
    showSuccess(`Filtered to ${categoryName}`, { icon: '🏷️' });
  };

  // Group tags by category for horizontal grouped bar chart
  const { groupedTagData, maxTagCount, allCategories } = useMemo(() => {
    if (!data?.tag_distribution) return { groupedTagData: [], maxTagCount: 0, allCategories: [] };

    const groups: Map<string, GroupedCategory> = new Map();
    let maxCount = 0;

    // Filter by category if selected, otherwise show all
    const filteredTags = selectedCategoryId
      ? data.tag_distribution.filter(tag => tag.category_id === selectedCategoryId)
      : data.tag_distribution;

    // Limit to top 20 tags and group by category
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

    // Extract all unique categories for dropdown
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

  // Transform aspect ratio histogram for chart with outlier detection
  const aspectRatioChartData = useMemo(() => {
    if (!data?.aspect_ratio_histogram) return [];

    // Identify outliers in aspect ratio distribution
    const counts = data.aspect_ratio_histogram.map((bucket) => bucket.count);
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

  // Multi-select state for Dimension Distribution
  const dimensionMultiSelect = useChartMultiSelect(dimensionChartData);

  // Multi-select state for Aspect Ratio Distribution
  const aspectRatioMultiSelect = useChartMultiSelect(aspectRatioChartData);

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
   * Apply dimension multi-select filter
   */
  const handleDimensionApplyFilter = () => {
    const selected = dimensionMultiSelect.selectedData;
    if (selected.length === 0) return;

    // Combine all selected ranges into a single min/max
    const minDimension = Math.min(...selected.map((d: any) => d.min));
    const maxDimension = Math.max(...selected.map((d: any) => d.max));

    onFilterUpdate({
      width_min: minDimension,
      width_max: maxDimension,
      height_min: minDimension,
      height_max: maxDimension,
    });

    showSuccess(
      `Filtering by ${selected.length} size range${selected.length > 1 ? 's' : ''}`,
      { icon: '📐' }
    );
    dimensionMultiSelect.clearSelection();
  };

  /**
   * Apply aspect ratio multi-select filter
   */
  const handleAspectRatioApplyFilter = () => {
    const selected = aspectRatioMultiSelect.selectedData;
    if (selected.length === 0) return;

    // Combine all selected ranges into a single min/max
    const minRatio = Math.min(...selected.map((d: any) => d.min));
    const maxRatio = Math.max(...selected.map((d: any) => d.max));

    onFilterUpdate({
      aspect_ratio_min: minRatio,
      aspect_ratio_max: maxRatio,
    });

    showSuccess(
      `Filtering by ${selected.length} aspect ratio range${selected.length > 1 ? 's' : ''}`,
      { icon: '📐' }
    );
    aspectRatioMultiSelect.clearSelection();
  };

  /**
   * Handle dimension bucket click - single click or multi-select
   */
  const handleDimensionClick = (bucketData: any, index: number, event?: React.MouseEvent) => {
    if (!bucketData) return;
    dimensionMultiSelect.handleBarClick(index, bucketData, event);
  };

  const dimensionChartClick = useChartClick(
    dimensionChartData,
    (data, index, event) => handleDimensionClick(data, index, event)
  );

  /**
   * Handle aspect ratio bucket click - single click or multi-select
   */
  const handleAspectRatioClick = (bucketData: any, index: number, event?: React.MouseEvent) => {
    if (!bucketData) return;
    aspectRatioMultiSelect.handleBarClick(index, bucketData, event);
  };

  const aspectRatioChartClick = useChartClick(
    aspectRatioChartData,
    (data, index, event) => handleAspectRatioClick(data, index, event)
  );

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
        >
          <div className="p-3 rounded-lg border border-emerald-200/50 bg-white/80">
            <div className="flex items-center gap-2 mb-2">
              <TagIcon className="w-3.5 h-3.5 text-emerald-600" />
              <h3 className="text-xs font-semibold text-gray-700">Tag Distribution</h3>
              <span className="text-[10px] text-gray-400 ml-auto">Click to filter</span>
            </div>

            {/* Filter Controls Row */}
            <div className="flex flex-col sm:flex-row gap-2 mb-2">
              <div className="flex-1 min-w-[160px]">
                <CategoryDropdown
                  categories={allCategories}
                  selectedCategoryId={selectedCategoryId}
                  onSelect={handleCategorySelect}
                  prefersReducedMotion={prefersReducedMotion}
                />
              </div>
              <div className="flex-shrink-0 sm:w-[180px]">
                {classBalance && (
                  <BalanceScoreBadge
                    balanceScore={Math.round((1 - classBalance.imbalance_score) * 100)}
                    imbalanceLevel={classBalance.imbalance_level}
                    prefersReducedMotion={prefersReducedMotion}
                    isLoading={isClassBalanceFetching}
                  />
                )}
              </div>
            </div>

            {/* Custom Horizontal Grouped Bar Chart - Dynamic height based on content */}
            <div className="max-h-60 overflow-y-auto space-y-0.5">
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

            {/* Imbalance Insights Panel */}
            {classBalance && (
              <ImbalanceInsightsPanel
                classBalance={classBalance}
                imbalanceLevel={classBalance.imbalance_level}
                prefersReducedMotion={prefersReducedMotion}
              />
            )}
          </div>
        </motion.div>
      )}

      {/* Dimension Histogram */}
      {dimensionChartData.length > 0 && (
        <motion.div
          initial={prefersReducedMotion ? {} : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: prefersReducedMotion ? 0.01 : 0.2, delay: prefersReducedMotion ? 0 : 0.1 }}
        >
          <ChartSection
            icon={Ruler}
            title="Dimension Distribution"
            hint="Click bars to select · Click Apply to filter"
            color="purple"
            height={160}
          >
            <HistogramChart
              data={dimensionChartData}
              xKey="name"
              yKey="count"
              tooltip={<CustomTooltip />}
              multiSelect={dimensionMultiSelect}
              chartClick={dimensionChartClick}
              theme={HISTOGRAM_THEMES.purple}
              prefersReducedMotion={prefersReducedMotion}
            />

            <SelectionActionBar
              selectionCount={dimensionMultiSelect.selectionCount}
              onApply={handleDimensionApplyFilter}
              onClear={dimensionMultiSelect.clearSelection}
              prefersReducedMotion={prefersReducedMotion}
            />
          </ChartSection>
        </motion.div>
      )}

      {/* Aspect Ratio Histogram */}
      {aspectRatioChartData.length > 0 && (
        <motion.div
          initial={prefersReducedMotion ? {} : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: prefersReducedMotion ? 0.01 : 0.2, delay: prefersReducedMotion ? 0 : 0.15 }}
        >
          <ChartSection
            icon={Ratio}
            title="Aspect Ratio Distribution"
            hint="Click bars to select · Click Apply to filter"
            color="orange"
            height={160}
          >
            <HistogramChart
              data={aspectRatioChartData}
              xKey="name"
              yKey="count"
              tooltip={<CustomTooltip />}
              multiSelect={aspectRatioMultiSelect}
              chartClick={aspectRatioChartClick}
              theme={HISTOGRAM_THEMES.orange}
              prefersReducedMotion={prefersReducedMotion}
            />

            <SelectionActionBar
              selectionCount={aspectRatioMultiSelect.selectionCount}
              onApply={handleAspectRatioApplyFilter}
              onClear={aspectRatioMultiSelect.clearSelection}
              prefersReducedMotion={prefersReducedMotion}
            />
          </ChartSection>
        </motion.div>
      )}
    </div>
  );
}
