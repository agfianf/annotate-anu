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
  Focus,
  Sun,
  Contrast,
  Fingerprint,
  ExternalLink,
  Palette,
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

// Quality metric explanations for tooltips
const METRIC_EXPLANATIONS = {
  overall_quality: 'Combined quality score from all metrics. Higher = better quality image, Lower = potential issues detected.',
  sharpness: 'Measures image clarity and focus. Higher = sharper, more detailed image. Lower = blurry or out-of-focus.',
  brightness: 'Average light intensity of the image. Higher = brighter image. Lower = darker image. Optimal: 0.3-0.7.',
  contrast: 'Difference between light and dark areas. Higher = more vivid, punchy image. Lower = flat, washed-out look.',
  uniqueness: 'How distinct this image is from others. Higher = unique image. Lower = similar/duplicate of another image.',
  red_channel: 'Average red color intensity. Higher = more red tones. Lower = less red, cooler tones.',
  green_channel: 'Average green color intensity. Higher = more green tones. Lower = less green, magenta shift.',
  blue_channel: 'Average blue color intensity. Higher = more blue, cooler tones. Lower = less blue, warmer tones.',
} as const;

// X-axis hints for quality histograms
const XAXIS_HINTS = {
  overall_quality: '0.0 = Poor quality → 1.0 = Excellent quality',
  sharpness: '0.0 = Very blurry → 1.0 = Very sharp',
  brightness: '0.0 = Very dark → 1.0 = Very bright (optimal: 0.3-0.7)',
  contrast: '0.0 = Flat/washed out → 1.0 = High contrast',
  uniqueness: '0.0 = Duplicate detected → 1.0 = Completely unique',
  red_channel: '0.0 = No red → 1.0 = Maximum red intensity',
  green_channel: '0.0 = No green → 1.0 = Maximum green intensity',
  blue_channel: '0.0 = No blue → 1.0 = Maximum blue intensity',
} as const;

// Shared styles for consistent tab content
const TAB_CONTENT_CLASS = 'space-y-2.5 px-0.5';
const SECTION_CARD_CLASS = 'p-2.5 rounded-lg border border-white/20 bg-white/10 backdrop-blur-sm';

/**
 * Reusable Section Card Component - White liquid glass
 */
function SectionCard({
  title,
  icon: Icon,
  iconColor = 'text-emerald-600',
  badge,
  children,
}: {
  title: string;
  icon?: typeof BarChart3;
  iconColor?: string;
  badge?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className={SECTION_CARD_CLASS}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          {Icon && <Icon className={cn('w-3.5 h-3.5', iconColor)} />}
          <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wide">{title}</h4>
        </div>
        {badge}
      </div>
      {children}
    </div>
  );
}

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
    <div className={TAB_CONTENT_CLASS}>
      {/* Primary Stats - 3 column compact grid */}
      <motion.div
        initial={prefersReducedMotion ? {} : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="grid grid-cols-3 gap-2"
      >
        <div className="p-2.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-center">
          <div className="text-[10px] text-gray-500 uppercase font-medium">Images</div>
          <div className="text-base font-bold text-emerald-600">{data.total_images?.toLocaleString() || '-'}</div>
        </div>
        <div className="p-2.5 rounded-lg border border-blue-500/30 bg-blue-500/10 text-center">
          <div className="text-[10px] text-gray-500 uppercase font-medium">Tags</div>
          <div className="text-base font-bold text-blue-600">{data.tag_distribution.length}</div>
        </div>
        <div className="p-2.5 rounded-lg border border-purple-500/30 bg-purple-500/10 text-center">
          <div className="text-[10px] text-gray-500 uppercase font-medium">Balance</div>
          <div className={cn('text-base font-bold', balanceScore >= 70 ? 'text-emerald-600' : balanceScore >= 40 ? 'text-amber-600' : 'text-red-600')}>
            {balanceScore.toFixed(0)}%
          </div>
        </div>
      </motion.div>

      {/* File Size Section */}
      <SectionCard title="Storage" icon={HardDrive} iconColor="text-emerald-400">
        <StatRow label="Average" value={formatFileSize(data.file_size_stats.avg)} />
        <StatRow label="Range" value={`${formatFileSize(data.file_size_stats.min)} - ${formatFileSize(data.file_size_stats.max)}`} />
        {data.file_size_stats.median && <StatRow label="Median" value={formatFileSize(data.file_size_stats.median)} />}
        <StatRow label="Total" value={formatFileSize(data.file_size_stats.total || data.file_size_stats.avg * (data.total_images || 1))} />
      </SectionCard>

      {/* Dimensions Section */}
      <SectionCard title="Dimensions" icon={Ruler} iconColor="text-purple-400">
        <StatRow label="Median Size" value={`${data.median_width} × ${data.median_height}`} subValue="px" />
        <StatRow label="Aspect Ratio" value={data.median_aspect_ratio.toFixed(2)} />
        <StatRow label="Width Range" value={`${data.min_width} - ${data.max_width}`} subValue="px" />
        <StatRow label="Height Range" value={`${data.min_height} - ${data.max_height}`} subValue="px" />
        <StatRow label="Size Buckets" value={data.dimension_histogram.length} />
      </SectionCard>

      {/* Tags Section */}
      <SectionCard title="Tags & Labels" icon={TagIcon} iconColor="text-blue-400">
        <StatRow label="Unique Tags" value={data.tag_distribution.length} />
        <StatRow label="Total Usage" value={totalTagUsage.toLocaleString()} />
        <StatRow label="Avg per Tag" value={tagStats.mean.toFixed(1)} />
        {tagOutliers > 0 && <StatRow label="Outliers" value={tagOutliers} />}
        <StatRow
          label="Imbalance"
          value={data.imbalance_level.charAt(0).toUpperCase() + data.imbalance_level.slice(1)}
          subValue={`(${(data.imbalance_score * 100).toFixed(0)}%)`}
        />
      </SectionCard>
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
    <div className={TAB_CONTENT_CLASS}>
      {/* Compact Dimensions Summary - Single row */}
      <div className={cn(SECTION_CARD_CLASS, 'grid grid-cols-4 gap-1 p-1.5')}>
        <div className="text-center">
          <div className="text-[8px] text-gray-500 uppercase">Width</div>
          <div className="text-xs font-bold text-gray-800">{data.median_width}px</div>
        </div>
        <div className="text-center">
          <div className="text-[8px] text-gray-500 uppercase">Height</div>
          <div className="text-xs font-bold text-gray-800">{data.median_height}px</div>
        </div>
        <div className="text-center">
          <div className="text-[8px] text-gray-500 uppercase">Ratio</div>
          <div className="text-xs font-bold text-gray-800">{data.median_aspect_ratio.toFixed(2)}</div>
        </div>
        <div className="text-center">
          <div className="text-[8px] text-gray-500 uppercase">Variance</div>
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
        <div className={cn(SECTION_CARD_CLASS, 'flex items-center justify-between p-2')}>
          <span className="text-[10px] text-emerald-600 font-medium">Recommended:</span>
          <span className="text-xs font-bold text-gray-800">{data.recommended_resize.width}×{data.recommended_resize.height}px</span>
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
    <div className={TAB_CONTENT_CLASS}>
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

      {/* Tag Distribution Chart */}
      <SectionCard
        title="Tag Distribution"
        icon={TagIcon}
        iconColor="text-emerald-400"
        badge={<span className="text-[10px] text-gray-500">Click to filter</span>}
      >
        <div className="max-h-80 overflow-y-auto space-y-1">
          {groupedTagData.map((group, groupIndex) => (
            <div key={group.category_id || 'uncategorized'}>
              {group.tags.map((tag) => (
                <div
                  key={tag.tag_id}
                  className="flex items-center gap-1.5 py-1 cursor-pointer hover:bg-white/10 transition-colors rounded px-1"
                  onClick={() => handleTagClick(tag)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === 'Enter' && handleTagClick(tag)}
                >
                  <div className="w-1 h-4 flex-shrink-0 rounded-sm" style={{ backgroundColor: group.category_color }} />
                  <span className="w-20 min-w-[80px] text-[11px] text-gray-300 truncate font-medium" title={tag.name}>{tag.name}</span>
                  <div className="flex-1 h-4 bg-white/10 rounded">
                    <div
                      className="h-full rounded transition-all duration-300"
                      style={{ width: `${maxTagCount > 0 ? (tag.count / maxTagCount) * 100 : 0}%`, backgroundColor: tag.color }}
                    />
                  </div>
                  <span className="w-8 text-[11px] text-gray-400 text-right tabular-nums font-medium">{tag.count}</span>
                </div>
              ))}
              {groupIndex < groupedTagData.length - 1 && (
                <div className="flex items-center gap-1.5 py-1 my-0.5">
                  <div className="flex-1 border-t border-dashed border-white/20" />
                  <span className="text-[10px] font-semibold px-1.5" style={{ color: group.category_color }}>{group.category_name}</span>
                  <div className="flex-1 border-t border-dashed border-white/20" />
                </div>
              )}
            </div>
          ))}
        </div>
      </SectionCard>

      {/* Imbalance Insights */}
      {data.imbalance_level !== 'balanced' && (
        <div className={cn(
          SECTION_CARD_CLASS,
          data.imbalance_level === 'severe' ? 'border-red-500/30' : 'border-yellow-500/30'
        )}>
          <div className="flex items-center gap-1.5 mb-2">
            <AlertTriangle className={cn('w-3.5 h-3.5', data.imbalance_level === 'severe' ? 'text-red-400' : 'text-yellow-400')} />
            <span className="text-xs font-semibold text-gray-300">
              {data.imbalance_level === 'severe' ? 'Severe' : 'Moderate'} Imbalance Detected
            </span>
          </div>
          {data.class_recommendations.length > 0 && (
            <ul className="space-y-1">
              {data.class_recommendations.slice(0, 3).map((rec, i) => (
                <li key={i} className="text-[10px] text-gray-400">{rec}</li>
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
  onFilterUpdate,
  prefersReducedMotion,
}: {
  data: NonNullable<ReturnType<typeof useEnhancedDatasetStats>['data']>;
  projectId: string;
  onRefresh: () => void;
  onFilterUpdate: (filters: any) => void;
  prefersReducedMotion: boolean;
}) {
  const { showSuccess } = useAnalyticsToast();

  // Transform quality histograms for HistogramChart
  const overallQualityData = useMemo(() => {
    if (!data?.quality_distribution) return [];
    return data.quality_distribution.map((bucket) => ({
      name: bucket.bucket,
      count: bucket.count,
      min: bucket.min,
      max: bucket.max,
    }));
  }, [data?.quality_distribution]);

  const sharpnessData = useMemo(() => {
    if (!data?.sharpness_histogram) return [];
    return data.sharpness_histogram.map((bucket) => ({
      name: bucket.bucket,
      count: bucket.count,
      min: bucket.min,
      max: bucket.max,
    }));
  }, [data?.sharpness_histogram]);

  const brightnessData = useMemo(() => {
    if (!data?.brightness_histogram) return [];
    return data.brightness_histogram.map((bucket) => ({
      name: bucket.bucket,
      count: bucket.count,
      min: bucket.min,
      max: bucket.max,
    }));
  }, [data?.brightness_histogram]);

  const contrastData = useMemo(() => {
    if (!data?.contrast_histogram) return [];
    return data.contrast_histogram.map((bucket) => ({
      name: bucket.bucket,
      count: bucket.count,
      min: bucket.min,
      max: bucket.max,
    }));
  }, [data?.contrast_histogram]);

  const uniquenessData = useMemo(() => {
    if (!data?.uniqueness_histogram) return [];
    return data.uniqueness_histogram.map((bucket) => ({
      name: bucket.bucket,
      count: bucket.count,
      min: bucket.min,
      max: bucket.max,
    }));
  }, [data?.uniqueness_histogram]);

  // Multi-select state for each metric
  const overallQualityMultiSelect = useChartMultiSelect(overallQualityData);
  const sharpnessMultiSelect = useChartMultiSelect(sharpnessData);
  const brightnessMultiSelect = useChartMultiSelect(brightnessData);
  const contrastMultiSelect = useChartMultiSelect(contrastData);
  const uniquenessMultiSelect = useChartMultiSelect(uniquenessData);

  // Filter apply handlers
  const handleOverallQualityApply = useCallback(() => {
    const selected = overallQualityMultiSelect.selectedData;
    if (selected.length === 0) return;
    const minVal = Math.min(...selected.map((d: any) => d.min));
    const maxVal = Math.max(...selected.map((d: any) => d.max));
    onFilterUpdate({ quality_min: minVal, quality_max: maxVal });
    showSuccess(`Filtering by ${selected.length} quality range${selected.length > 1 ? 's' : ''}`, { icon: '✨' });
    overallQualityMultiSelect.clearSelection();
  }, [overallQualityMultiSelect, onFilterUpdate, showSuccess]);

  const handleSharpnessApply = useCallback(() => {
    const selected = sharpnessMultiSelect.selectedData;
    if (selected.length === 0) return;
    const minVal = Math.min(...selected.map((d: any) => d.min));
    const maxVal = Math.max(...selected.map((d: any) => d.max));
    onFilterUpdate({ sharpness_min: minVal, sharpness_max: maxVal });
    showSuccess(`Filtering by ${selected.length} sharpness range${selected.length > 1 ? 's' : ''}`, { icon: '🔍' });
    sharpnessMultiSelect.clearSelection();
  }, [sharpnessMultiSelect, onFilterUpdate, showSuccess]);

  const handleBrightnessApply = useCallback(() => {
    const selected = brightnessMultiSelect.selectedData;
    if (selected.length === 0) return;
    const minVal = Math.min(...selected.map((d: any) => d.min));
    const maxVal = Math.max(...selected.map((d: any) => d.max));
    onFilterUpdate({ brightness_min: minVal, brightness_max: maxVal });
    showSuccess(`Filtering by ${selected.length} brightness range${selected.length > 1 ? 's' : ''}`, { icon: '☀️' });
    brightnessMultiSelect.clearSelection();
  }, [brightnessMultiSelect, onFilterUpdate, showSuccess]);

  const handleContrastApply = useCallback(() => {
    const selected = contrastMultiSelect.selectedData;
    if (selected.length === 0) return;
    const minVal = Math.min(...selected.map((d: any) => d.min));
    const maxVal = Math.max(...selected.map((d: any) => d.max));
    onFilterUpdate({ contrast_min: minVal, contrast_max: maxVal });
    showSuccess(`Filtering by ${selected.length} contrast range${selected.length > 1 ? 's' : ''}`, { icon: '🎨' });
    contrastMultiSelect.clearSelection();
  }, [contrastMultiSelect, onFilterUpdate, showSuccess]);

  const handleUniquenessApply = useCallback(() => {
    const selected = uniquenessMultiSelect.selectedData;
    if (selected.length === 0) return;
    const minVal = Math.min(...selected.map((d: any) => d.min));
    const maxVal = Math.max(...selected.map((d: any) => d.max));
    onFilterUpdate({ uniqueness_min: minVal, uniqueness_max: maxVal });
    showSuccess(`Filtering by ${selected.length} uniqueness range${selected.length > 1 ? 's' : ''}`, { icon: '🔬' });
    uniquenessMultiSelect.clearSelection();
  }, [uniquenessMultiSelect, onFilterUpdate, showSuccess]);

  // RGB histogram data
  const redData = useMemo(() => {
    if (!data?.red_histogram) return [];
    return data.red_histogram.map((bucket) => ({
      name: bucket.bucket,
      count: bucket.count,
      min: bucket.min,
      max: bucket.max,
    }));
  }, [data?.red_histogram]);

  const greenData = useMemo(() => {
    if (!data?.green_histogram) return [];
    return data.green_histogram.map((bucket) => ({
      name: bucket.bucket,
      count: bucket.count,
      min: bucket.min,
      max: bucket.max,
    }));
  }, [data?.green_histogram]);

  const blueData = useMemo(() => {
    if (!data?.blue_histogram) return [];
    return data.blue_histogram.map((bucket) => ({
      name: bucket.bucket,
      count: bucket.count,
      min: bucket.min,
      max: bucket.max,
    }));
  }, [data?.blue_histogram]);

  // RGB multi-select hooks
  const redMultiSelect = useChartMultiSelect(redData);
  const greenMultiSelect = useChartMultiSelect(greenData);
  const blueMultiSelect = useChartMultiSelect(blueData);

  // RGB apply handlers
  const handleRedApply = useCallback(() => {
    const selected = redMultiSelect.selectedData;
    if (selected.length === 0) return;
    const minVal = Math.min(...selected.map((d: any) => d.min));
    const maxVal = Math.max(...selected.map((d: any) => d.max));
    onFilterUpdate({ red_min: minVal, red_max: maxVal });
    showSuccess(`Filtering by ${selected.length} red range${selected.length > 1 ? 's' : ''}`, { icon: '🔴' });
    redMultiSelect.clearSelection();
  }, [redMultiSelect, onFilterUpdate, showSuccess]);

  const handleGreenApply = useCallback(() => {
    const selected = greenMultiSelect.selectedData;
    if (selected.length === 0) return;
    const minVal = Math.min(...selected.map((d: any) => d.min));
    const maxVal = Math.max(...selected.map((d: any) => d.max));
    onFilterUpdate({ green_min: minVal, green_max: maxVal });
    showSuccess(`Filtering by ${selected.length} green range${selected.length > 1 ? 's' : ''}`, { icon: '🟢' });
    greenMultiSelect.clearSelection();
  }, [greenMultiSelect, onFilterUpdate, showSuccess]);

  const handleBlueApply = useCallback(() => {
    const selected = blueMultiSelect.selectedData;
    if (selected.length === 0) return;
    const minVal = Math.min(...selected.map((d: any) => d.min));
    const maxVal = Math.max(...selected.map((d: any) => d.max));
    onFilterUpdate({ blue_min: minVal, blue_max: maxVal });
    showSuccess(`Filtering by ${selected.length} blue range${selected.length > 1 ? 's' : ''}`, { icon: '🔵' });
    blueMultiSelect.clearSelection();
  }, [blueMultiSelect, onFilterUpdate, showSuccess]);

  // Chart click handlers
  const overallQualityChartClick = useChartClick(overallQualityData, (d, i, e) => overallQualityMultiSelect.handleBarClick(i, d, e));
  const sharpnessChartClick = useChartClick(sharpnessData, (d, i, e) => sharpnessMultiSelect.handleBarClick(i, d, e));
  const brightnessChartClick = useChartClick(brightnessData, (d, i, e) => brightnessMultiSelect.handleBarClick(i, d, e));
  const contrastChartClick = useChartClick(contrastData, (d, i, e) => contrastMultiSelect.handleBarClick(i, d, e));
  const uniquenessChartClick = useChartClick(uniquenessData, (d, i, e) => uniquenessMultiSelect.handleBarClick(i, d, e));
  const redChartClick = useChartClick(redData, (d, i, e) => redMultiSelect.handleBarClick(i, d, e));
  const greenChartClick = useChartClick(greenData, (d, i, e) => greenMultiSelect.handleBarClick(i, d, e));
  const blueChartClick = useChartClick(blueData, (d, i, e) => blueMultiSelect.handleBarClick(i, d, e));
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
    <div className={TAB_CONTENT_CLASS}>
      {/* Sync & Process Buttons Section - Compact */}
      {!isProcessing && !isSyncing && (
        <motion.div
          initial={prefersReducedMotion ? {} : { opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-2.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <Zap className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
              <div className="min-w-0">
                <div className="text-xs font-medium text-emerald-300">
                  {untrackedCount > 0
                    ? `${untrackedCount} untracked`
                    : pendingCount > 0
                    ? `${pendingCount} pending`
                    : 'Ready'}
                </div>
                <div className="text-[10px] text-gray-400 truncate">
                  {untrackedCount > 0
                    ? 'Sync to discover'
                    : 'Analyze quality metrics'}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <button
                onClick={handleSync}
                disabled={isSyncing}
                className="flex items-center gap-1 px-2 py-1.5 bg-blue-600 hover:bg-blue-500
                           text-white text-xs font-medium rounded transition-colors
                           focus:outline-none focus:ring-2 focus:ring-blue-500
                           disabled:opacity-50 disabled:cursor-not-allowed"
                title="Find untracked images"
              >
                <RefreshCw className="w-3 h-3" />
                Sync
              </button>
              <button
                onClick={handleProcessQuality}
                disabled={!needsProcessing}
                className="flex items-center gap-1 px-2 py-1.5 bg-emerald-600 hover:bg-emerald-500
                           text-white text-xs font-medium rounded transition-colors
                           focus:outline-none focus:ring-2 focus:ring-emerald-500
                           disabled:opacity-50 disabled:cursor-not-allowed"
                title="Process pending quality metrics"
              >
                <Play className="w-3 h-3" />
                Process
              </button>
            </div>
          </div>
        </motion.div>
      )}

      {/* Syncing State - Compact */}
      {isSyncing && (
        <motion.div
          initial={prefersReducedMotion ? {} : { opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="p-2.5 rounded-lg border border-blue-500/30 bg-blue-500/10"
        >
          <div className="flex items-center gap-2">
            <motion.div
              animate={prefersReducedMotion ? {} : { rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
            >
              <RefreshCw className="w-4 h-4 text-blue-400" />
            </motion.div>
            <div>
              <div className="text-xs font-medium text-blue-300">Syncing...</div>
              <div className="text-[10px] text-gray-400">Finding untracked images</div>
            </div>
          </div>
        </motion.div>
      )}

      {/* Sync Result - Compact */}
      {syncResult && !isSyncing && !isProcessing && (
        <motion.div
          initial={prefersReducedMotion ? {} : { opacity: 0 }}
          animate={{ opacity: 1 }}
          className="p-2 rounded-lg border border-blue-500/30 bg-blue-500/10 flex items-center justify-between"
        >
          <div className="flex items-center gap-1.5">
            <CheckCircle className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
            <span className="text-xs text-blue-300">
              {syncResult.synced > 0
                ? `Found ${syncResult.synced} new. ${syncResult.pending} pending.`
                : 'All tracked.'}
            </span>
          </div>
          <button onClick={() => setSyncResult(null)} className="text-[10px] text-gray-400 hover:text-white">
            Dismiss
          </button>
        </motion.div>
      )}

      {/* Processing Progress - Compact */}
      {isProcessing && (
        <motion.div
          initial={prefersReducedMotion ? {} : { opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="p-2.5 rounded-lg border border-blue-500/30 bg-blue-500/10"
        >
          <div className="flex items-center gap-2 mb-2">
            <motion.div
              animate={prefersReducedMotion ? {} : { rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
            >
              <RefreshCw className="w-3.5 h-3.5 text-blue-400" />
            </motion.div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium text-blue-300">Processing</div>
              <div className="text-[10px] text-gray-400">
                {processed}/{total}{failed > 0 && <span className="text-red-400 ml-1">({failed} err)</span>}
              </div>
            </div>
            <div className="text-lg font-bold text-blue-400 tabular-nums">{Math.round(progressPct)}%</div>
            <button
              onClick={handleCancelJob}
              disabled={isCancelling}
              className="flex items-center gap-0.5 px-1.5 py-1 bg-red-600/20 hover:bg-red-600/40
                         text-red-400 text-[10px] font-medium rounded transition-colors
                         disabled:opacity-50 disabled:cursor-not-allowed"
              title="Cancel"
            >
              <Square className="w-2.5 h-2.5" />
              {isCancelling ? '...' : 'Stop'}
            </button>
          </div>
          <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-gradient-to-r from-blue-500 to-emerald-500 rounded-full"
              initial={{ width: 0 }}
              animate={{ width: `${progressPct}%` }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
            />
          </div>
        </motion.div>
      )}

      {/* Processing Error - Compact */}
      {processingError && (
        <motion.div
          initial={prefersReducedMotion ? {} : { opacity: 0 }}
          animate={{ opacity: 1 }}
          className="p-2 rounded-lg border border-red-500/30 bg-red-500/10 flex items-center gap-1.5"
        >
          <XCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
          <span className="text-xs text-red-300 flex-1 truncate">{processingError}</span>
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
      <SectionCard
        title="Processing Status"
        icon={RefreshCw}
        iconColor="text-emerald-400"
        badge={
          <span className={cn(
            'px-2 py-0.5 rounded text-[10px] font-medium',
            data.quality_status === 'complete' ? 'bg-emerald-500/20 text-emerald-400' :
            data.quality_status === 'partial' ? 'bg-amber-500/20 text-amber-400' : 'bg-gray-500/20 text-gray-400'
          )}>
            {completedPercent.toFixed(0)}% Complete
          </span>
        }
      >
        <div className="grid grid-cols-4 gap-1.5">
          {(Object.entries(data.quality_status_counts) as [keyof typeof statusIcons, number][]).map(([status, count]) => {
            const Icon = statusIcons[status];
            const textColors = { pending: 'text-gray-700', processing: 'text-blue-600', completed: 'text-emerald-600', failed: 'text-red-600' };
            return (
              <div key={status} className="bg-gray-100/50 rounded p-1.5 text-center">
                <Icon className={cn('h-3.5 w-3.5 mx-auto mb-0.5', statusColors[status])} />
                <div className={cn('text-sm font-semibold', textColors[status])}>{count}</div>
                <div className="text-[10px] text-gray-500 capitalize">{status}</div>
              </div>
            );
          })}
        </div>
      </SectionCard>

      {/* Quality Averages */}
      {data.quality_averages && data.quality_status_counts.completed > 0 && (
        <SectionCard title="Average Metrics" icon={TrendingUp} iconColor="text-emerald-400">
          <div className="grid grid-cols-4 gap-1.5">
            {data.quality_averages.sharpness != null && (
              <div className="bg-cyan-500/10 rounded p-1.5 text-center border-l-2 border-cyan-500/50">
                <div className="text-[10px] text-gray-500">Sharp</div>
                <div className="text-sm font-semibold text-cyan-600">{((data.quality_averages.sharpness || 0) * 100).toFixed(0)}%</div>
              </div>
            )}
            {data.quality_averages.brightness != null && (
              <div className="bg-amber-500/10 rounded p-1.5 text-center border-l-2 border-amber-500/50">
                <div className="text-[10px] text-gray-500">Bright</div>
                <div className="text-sm font-semibold text-amber-600">{((data.quality_averages.brightness || 0) * 100).toFixed(0)}%</div>
              </div>
            )}
            {data.quality_averages.contrast != null && (
              <div className="bg-blue-500/10 rounded p-1.5 text-center border-l-2 border-blue-500/50">
                <div className="text-[10px] text-gray-500">Contrast</div>
                <div className="text-sm font-semibold text-blue-600">{((data.quality_averages.contrast || 0) * 100).toFixed(0)}%</div>
              </div>
            )}
            {data.quality_averages.uniqueness != null && (
              <div className="bg-purple-500/10 rounded p-1.5 text-center border-l-2 border-purple-500/50">
                <div className="text-[10px] text-gray-500">Unique</div>
                <div className="text-sm font-semibold text-purple-600">{((data.quality_averages.uniqueness || 0) * 100).toFixed(0)}%</div>
              </div>
            )}
          </div>
        </SectionCard>
      )}

      {/* Quality Distribution Charts - Interactive with Multi-Select */}
      {data.quality_status_counts.completed > 0 && (
        <div className="space-y-2">
          {/* Overall Quality Distribution */}
          {overallQualityData.length > 0 && (
            <ChartSection icon={Sparkles} title="Overall Quality" hint="Click to filter" color="emerald" height={180} tooltip={METRIC_EXPLANATIONS.overall_quality} xAxisHint={XAXIS_HINTS.overall_quality}>
              <HistogramChart
                data={overallQualityData}
                xKey="name"
                yKey="count"
                tooltip={<CustomTooltip />}
                multiSelect={overallQualityMultiSelect}
                chartClick={overallQualityChartClick}
                theme={HISTOGRAM_THEMES.emerald}
                xAxisAngled={false}
                prefersReducedMotion={prefersReducedMotion}
              />
              <SelectionActionBar
                selectionCount={overallQualityMultiSelect.selectionCount}
                onApply={handleOverallQualityApply}
                onClear={overallQualityMultiSelect.clearSelection}
                prefersReducedMotion={prefersReducedMotion}
              />
            </ChartSection>
          )}

          {/* Sharpness Distribution */}
          {sharpnessData.length > 0 && (
            <ChartSection icon={Focus} title="Sharpness" hint="Click to filter" color="cyan" height={180} tooltip={METRIC_EXPLANATIONS.sharpness} xAxisHint={XAXIS_HINTS.sharpness}>
              <HistogramChart
                data={sharpnessData}
                xKey="name"
                yKey="count"
                tooltip={<CustomTooltip />}
                multiSelect={sharpnessMultiSelect}
                chartClick={sharpnessChartClick}
                theme={HISTOGRAM_THEMES.cyan}
                xAxisAngled={false}
                prefersReducedMotion={prefersReducedMotion}
              />
              <SelectionActionBar
                selectionCount={sharpnessMultiSelect.selectionCount}
                onApply={handleSharpnessApply}
                onClear={sharpnessMultiSelect.clearSelection}
                prefersReducedMotion={prefersReducedMotion}
              />
            </ChartSection>
          )}

          {/* Brightness Distribution */}
          {brightnessData.length > 0 && (
            <ChartSection icon={Sun} title="Brightness" hint="Click to filter" color="amber" height={180} tooltip={METRIC_EXPLANATIONS.brightness} xAxisHint={XAXIS_HINTS.brightness}>
              <HistogramChart
                data={brightnessData}
                xKey="name"
                yKey="count"
                tooltip={<CustomTooltip />}
                multiSelect={brightnessMultiSelect}
                chartClick={brightnessChartClick}
                theme={HISTOGRAM_THEMES.amber}
                xAxisAngled={false}
                prefersReducedMotion={prefersReducedMotion}
              />
              <SelectionActionBar
                selectionCount={brightnessMultiSelect.selectionCount}
                onApply={handleBrightnessApply}
                onClear={brightnessMultiSelect.clearSelection}
                prefersReducedMotion={prefersReducedMotion}
              />
            </ChartSection>
          )}

          {/* Contrast Distribution */}
          {contrastData.length > 0 && (
            <ChartSection icon={Contrast} title="Contrast" hint="Click to filter" color="blue" height={180} tooltip={METRIC_EXPLANATIONS.contrast} xAxisHint={XAXIS_HINTS.contrast}>
              <HistogramChart
                data={contrastData}
                xKey="name"
                yKey="count"
                tooltip={<CustomTooltip />}
                multiSelect={contrastMultiSelect}
                chartClick={contrastChartClick}
                theme={HISTOGRAM_THEMES.blue}
                xAxisAngled={false}
                prefersReducedMotion={prefersReducedMotion}
              />
              <SelectionActionBar
                selectionCount={contrastMultiSelect.selectionCount}
                onApply={handleContrastApply}
                onClear={contrastMultiSelect.clearSelection}
                prefersReducedMotion={prefersReducedMotion}
              />
            </ChartSection>
          )}

          {/* Uniqueness Distribution */}
          {uniquenessData.length > 0 && (
            <ChartSection icon={Fingerprint} title="Uniqueness" hint="Click to filter" color="purple" height={180} tooltip={METRIC_EXPLANATIONS.uniqueness} xAxisHint={XAXIS_HINTS.uniqueness}>
              <HistogramChart
                data={uniquenessData}
                xKey="name"
                yKey="count"
                tooltip={<CustomTooltip />}
                multiSelect={uniquenessMultiSelect}
                chartClick={uniquenessChartClick}
                theme={HISTOGRAM_THEMES.purple}
                xAxisAngled={false}
                prefersReducedMotion={prefersReducedMotion}
              />
              <SelectionActionBar
                selectionCount={uniquenessMultiSelect.selectionCount}
                onApply={handleUniquenessApply}
                onClear={uniquenessMultiSelect.clearSelection}
                prefersReducedMotion={prefersReducedMotion}
              />
            </ChartSection>
          )}

          {/* Red Channel Distribution */}
          {redData.length > 0 && (
            <ChartSection icon={Palette} title="Red Channel" hint="Click to filter" color="red" height={180} tooltip={METRIC_EXPLANATIONS.red_channel} xAxisHint={XAXIS_HINTS.red_channel}>
              <HistogramChart
                data={redData}
                xKey="name"
                yKey="count"
                tooltip={<CustomTooltip />}
                multiSelect={redMultiSelect}
                chartClick={redChartClick}
                theme={HISTOGRAM_THEMES.red}
                xAxisAngled={false}
                prefersReducedMotion={prefersReducedMotion}
              />
              <SelectionActionBar
                selectionCount={redMultiSelect.selectionCount}
                onApply={handleRedApply}
                onClear={redMultiSelect.clearSelection}
                prefersReducedMotion={prefersReducedMotion}
              />
            </ChartSection>
          )}

          {/* Green Channel Distribution */}
          {greenData.length > 0 && (
            <ChartSection icon={Palette} title="Green Channel" hint="Click to filter" color="green" height={180} tooltip={METRIC_EXPLANATIONS.green_channel} xAxisHint={XAXIS_HINTS.green_channel}>
              <HistogramChart
                data={greenData}
                xKey="name"
                yKey="count"
                tooltip={<CustomTooltip />}
                multiSelect={greenMultiSelect}
                chartClick={greenChartClick}
                theme={HISTOGRAM_THEMES.green}
                xAxisAngled={false}
                prefersReducedMotion={prefersReducedMotion}
              />
              <SelectionActionBar
                selectionCount={greenMultiSelect.selectionCount}
                onApply={handleGreenApply}
                onClear={greenMultiSelect.clearSelection}
                prefersReducedMotion={prefersReducedMotion}
              />
            </ChartSection>
          )}

          {/* Blue Channel Distribution */}
          {blueData.length > 0 && (
            <ChartSection icon={Palette} title="Blue Channel" hint="Click to filter" color="blue" height={180} tooltip={METRIC_EXPLANATIONS.blue_channel} xAxisHint={XAXIS_HINTS.blue_channel}>
              <HistogramChart
                data={blueData}
                xKey="name"
                yKey="count"
                tooltip={<CustomTooltip />}
                multiSelect={blueMultiSelect}
                chartClick={blueChartClick}
                theme={HISTOGRAM_THEMES.blue}
                xAxisAngled={false}
                prefersReducedMotion={prefersReducedMotion}
              />
              <SelectionActionBar
                selectionCount={blueMultiSelect.selectionCount}
                onApply={handleBlueApply}
                onClear={blueMultiSelect.clearSelection}
                prefersReducedMotion={prefersReducedMotion}
              />
            </ChartSection>
          )}
        </div>
      )}

      {/* Issue Breakdown */}
      {data.quality_status_counts.completed > 0 && (
        <SectionCard title="Detected Issues" icon={AlertCircle} iconColor="text-amber-500" badge={<span className="text-[10px] text-gray-500">Click to filter</span>}>
          <div className="grid grid-cols-2 gap-1.5">
            {Object.entries(data.issue_breakdown).map(([issue, count]) => (
              <div
                key={issue}
                className={cn(
                  'flex items-center justify-between bg-gray-100/50 rounded p-1.5 transition-colors',
                  count > 0 && 'cursor-pointer hover:bg-amber-100/50'
                )}
                onClick={() => {
                  if (count > 0) {
                    onFilterUpdate({ issues: [issue] });
                    showSuccess(`Filtering by: ${issue.replace(/_/g, ' ')}`, { icon: '⚠️' });
                  }
                }}
                role={count > 0 ? 'button' : undefined}
                tabIndex={count > 0 ? 0 : undefined}
                onKeyDown={(e) => {
                  if (count > 0 && e.key === 'Enter') {
                    onFilterUpdate({ issues: [issue] });
                    showSuccess(`Filtering by: ${issue.replace(/_/g, ' ')}`, { icon: '⚠️' });
                  }
                }}
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  <AlertCircle className={cn('h-3 w-3 flex-shrink-0', count > 0 ? 'text-amber-500' : 'text-gray-400')} />
                  <span className="text-[10px] text-gray-600 capitalize truncate">{issue.replace(/_/g, ' ')}</span>
                </div>
                <span className={cn('text-xs font-semibold ml-1', count > 0 ? 'text-amber-600' : 'text-gray-400')}>{count}</span>
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {/* Flagged Images */}
      {data.flagged_images.length > 0 && (
        <SectionCard
          title="Flagged Images"
          icon={AlertTriangle}
          iconColor="text-red-400"
          badge={<span className="text-[10px] text-gray-500">Click to view</span>}
        >
          <div className="space-y-1 max-h-32 overflow-y-auto">
            {data.flagged_images.slice(0, 10).map((img) => (
              <div
                key={img.shared_image_id}
                className="flex items-center justify-between bg-gray-100/50 rounded p-1.5 cursor-pointer hover:bg-gray-200/50 transition-colors group"
                onClick={() => {
                  onFilterUpdate({ image_uids: [img.shared_image_id] });
                  showSuccess(`Showing: ${img.filename}`, { icon: '🖼️' });
                }}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    onFilterUpdate({ image_uids: [img.shared_image_id] });
                    showSuccess(`Showing: ${img.filename}`, { icon: '🖼️' });
                  }
                }}
              >
                <span className="text-[11px] text-gray-700 truncate flex-1 mr-2 group-hover:text-gray-900">{img.filename}</span>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {img.issues.slice(0, 2).map((issue) => (
                    <span key={issue} className="px-1 py-0.5 bg-red-100 text-red-600 text-[9px] rounded">{issue}</span>
                  ))}
                  <span className="text-[10px] text-gray-500 tabular-nums">{(img.overall_quality * 100).toFixed(0)}%</span>
                  <ExternalLink className="w-2.5 h-2.5 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
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
            onFilterUpdate={onFilterUpdate}
            prefersReducedMotion={prefersReducedMotion}
          />
        )}
      </div>
    </div>
  );
}
