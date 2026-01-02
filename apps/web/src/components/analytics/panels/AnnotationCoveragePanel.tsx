/**
 * Annotation Coverage Analytics Panel
 * Shows annotation completeness and density distribution (Roboflow-style)
 *
 * Now counts actual detections/segmentations, not project-level tags.
 */

import { CheckCircle2, AlertCircle, Tag, BarChart3, Target } from 'lucide-react';
import { useAnalyticsToast } from '@/hooks/useAnalyticsToast';
import type { DensityBucket, PanelProps } from '@/types/analytics';
import { useAnnotationCoverage } from '@/hooks/useAnnotationCoverage';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import {
  PanelContainer,
  PanelLoadingState,
  PanelErrorState,
  PanelEmptyState,
  StatsGrid3,
  StatCard,
  ChartSection,
  InfoBox,
  Legend,
  LegendItem,
} from '../shared/PanelComponents';
import { useChartClick } from '../shared/useChartClick';
import { useChartMultiSelect } from '../shared/useChartMultiSelect';
import { SelectionActionBar } from '../shared/SelectionActionBar';
import { CHART_TOOLTIP_CLASSNAME } from '../shared/chartConfig';
import { HistogramChart, HISTOGRAM_THEMES, type HistogramTheme } from '../shared/HistogramChart';

/**
 * Compact tooltip for coverage charts
 */
const CoverageTooltip = ({ active, payload }: any) => {
  if (!active || !payload || payload.length === 0) return null;
  const data = payload[0].payload;

  return (
    <div className={CHART_TOOLTIP_CLASSNAME}>
      <p className="font-semibold text-gray-800">{data.bucket}</p>
      <p className="text-gray-600">{data.count} image{data.count !== 1 ? 's' : ''}</p>
    </div>
  );
};

/**
 * Get color for density bucket (Roboflow-style)
 * Buckets: 0, 1, 2-5, 6-10, 11-20, 21+
 */
function getDensityColor(bucket: string): string {
  if (bucket === '0') return '#EF4444';          // Red - no annotations
  if (bucket === '1') return '#F59E0B';          // Orange - single annotation
  if (bucket === '2-5') return '#84CC16';        // Lime - few annotations
  if (bucket === '6-10') return '#10B981';       // Emerald - moderate
  if (bucket === '11-20') return '#06B6D4';      // Cyan - many
  if (bucket === '21+') return '#8B5CF6';        // Purple - very many
  return '#10B981';                               // Default emerald
}

const densityHistogramTheme: HistogramTheme<DensityBucket> = {
  ...HISTOGRAM_THEMES.emerald,
  getFill: (entry) => getDensityColor(entry.bucket),
  cellClassName: 'transition-opacity hover:opacity-100',
};

/**
 * Annotation Coverage Panel Component
 */
export default function AnnotationCoveragePanel({
  projectId,
  filters,
  onFilterUpdate,
}: PanelProps) {
  const prefersReducedMotion = useReducedMotion();
  const { data, isLoading, error } = useAnnotationCoverage({
    projectId,
    filters,
    enabled: !!projectId,
  });

  const { showSuccess } = useAnalyticsToast();

  // Multi-select state for object count histogram
  const densityMultiSelect = useChartMultiSelect(data?.density_histogram ?? []);

  console.log('[AnnotationCoverage] Render - Selection state:', {
    selectionCount: densityMultiSelect.selectionCount,
    selectedIndices: Array.from(densityMultiSelect.selectedIndices),
    selectedData: densityMultiSelect.selectedData,
  });

  const handleUnannotatedClick = () => {
    onFilterUpdate({ is_annotated: false });
    showSuccess('Filtering to unannotated images', { icon: '⚠️' });
  };

  /**
   * Apply object count multi-select filter
   */
  const handleApplyDensityFilter = () => {
    const selected = densityMultiSelect.selectedData;
    console.log('[AnnotationCoverage] Apply filter clicked, selected data:', selected);

    if (selected.length === 0) {
      console.log('[AnnotationCoverage] No selection, returning early');
      return;
    }

    // Combine all selected ranges into a single min/max
    const minCount = Math.min(...selected.map((d: any) => d.min));
    const maxCount = Math.max(...selected.map((d: any) => d.max));

    console.log('[AnnotationCoverage] Applying filter:', {
      object_count_min: minCount,
      object_count_max: maxCount,
      selectedBuckets: selected.map((d: any) => d.bucket)
    });

    onFilterUpdate({
      object_count_min: minCount,
      object_count_max: maxCount,
    });

    showSuccess(
      `Filtering by ${selected.length} object count range${selected.length > 1 ? 's' : ''}`,
      { icon: '📊' }
    );
    densityMultiSelect.clearSelection();
  };

  /**
   * Handle density bucket click - single click or multi-select
   */
  const handleDensityClick = (bucketData: any, index: number, event?: React.MouseEvent) => {
    console.log('[AnnotationCoverage] Bar clicked:', { bucketData, index, event });
    if (!bucketData) {
      console.log('[AnnotationCoverage] No bucket data, returning');
      return;
    }
    console.log('[AnnotationCoverage] Calling handleBarClick');
    densityMultiSelect.handleBarClick(index, bucketData, event);
  };

  const densityChartClick = useChartClick(
    data?.density_histogram ?? [],
    (data, index, event) => handleDensityClick(data, index, event)
  );

  if (isLoading) return <PanelLoadingState message="Loading coverage..." />;
  if (error) return <PanelErrorState message={(error as Error).message} />;
  if (!data) return <PanelEmptyState icon={Tag} message="No coverage data" />;

  const coveragePercentage = data.coverage_percentage;
  const isHealthy = coveragePercentage >= 80;
  const isModerate = coveragePercentage >= 50 && coveragePercentage < 80;

  // Safely access new fields with defaults
  const totalObjects = data.total_objects ?? 0;
  const avgObjects = data.avg_objects_per_image ?? 0;
  const medianObjects = data.median_objects_per_image ?? 0;

  return (
    <PanelContainer>
      {/* Summary Cards - Image Coverage */}
      <StatsGrid3>
        <StatCard
          icon={CheckCircle2}
          label="Total"
          value={data.total_images}
          color="blue"
        />
        <StatCard
          icon={CheckCircle2}
          label="Annotated"
          value={data.annotated_images}
          subtitle={`${coveragePercentage.toFixed(1)}%`}
          color="emerald"
        />
        <StatCard
          icon={AlertCircle}
          label="Missing"
          value={data.unannotated_images}
          subtitle="Click to filter"
          color="red"
          onClick={handleUnannotatedClick}
        />
      </StatsGrid3>

      {/* Object Statistics */}
      <div className="mt-3 grid grid-cols-3 gap-2">
        <div className="bg-gradient-to-br from-purple-50 to-purple-100/50 rounded-lg px-3 py-2 border border-purple-200/50">
          <div className="flex items-center gap-1.5">
            <BarChart3 className="w-3 h-3 text-purple-600" />
            <span className="text-xs text-purple-700 font-medium">Total Objects</span>
          </div>
          <p className="text-lg font-bold text-purple-900 mt-0.5">{totalObjects.toLocaleString()}</p>
        </div>
        <div className="bg-gradient-to-br from-cyan-50 to-cyan-100/50 rounded-lg px-3 py-2 border border-cyan-200/50">
          <div className="flex items-center gap-1.5">
            <Target className="w-3 h-3 text-cyan-600" />
            <span className="text-xs text-cyan-700 font-medium">Avg/Image</span>
          </div>
          <p className="text-lg font-bold text-cyan-900 mt-0.5">{avgObjects.toFixed(1)}</p>
        </div>
        <div className="bg-gradient-to-br from-amber-50 to-amber-100/50 rounded-lg px-3 py-2 border border-amber-200/50">
          <div className="flex items-center gap-1.5">
            <Target className="w-3 h-3 text-amber-600" />
            <span className="text-xs text-amber-700 font-medium">Median</span>
          </div>
          <p className="text-lg font-bold text-amber-900 mt-0.5">{medianObjects}</p>
        </div>
      </div>

      {/* Density Histogram - Objects per Image */}
      <ChartSection
        icon={Tag}
        title="Objects per Image"
        hint="Click bar to select, Cmd/Ctrl+Click for multi-select"
        height={180}
      >
        <HistogramChart
          data={data.density_histogram}
          xKey="bucket"
          yKey="count"
          tooltip={<CoverageTooltip />}
          multiSelect={densityMultiSelect}
          chartClick={densityChartClick}
          theme={densityHistogramTheme}
          xAxisAngled={false}
          prefersReducedMotion={prefersReducedMotion}
        />

        <SelectionActionBar
          selectionCount={densityMultiSelect.selectionCount}
          onApply={handleApplyDensityFilter}
          onClear={densityMultiSelect.clearSelection}
          prefersReducedMotion={prefersReducedMotion}
        />
      </ChartSection>

      {/* Legend - Updated for Roboflow-style buckets */}
      <Legend>
        <LegendItem color="#EF4444" label="0" />
        <LegendItem color="#F59E0B" label="1" />
        <LegendItem color="#84CC16" label="2-5" />
        <LegendItem color="#10B981" label="6-10" />
        <LegendItem color="#06B6D4" label="11-20" />
        <LegendItem color="#8B5CF6" label="21+" />
      </Legend>

      {/* Recommendation */}
      <InfoBox type={isHealthy ? 'success' : isModerate ? 'warning' : 'error'}>
        {isHealthy
          ? `✅ ${coveragePercentage.toFixed(1)}% coverage - well labeled!`
          : isModerate
          ? `⚠️ ${coveragePercentage.toFixed(1)}% coverage - consider labeling more`
          : `❌ ${coveragePercentage.toFixed(1)}% coverage - aim for 80%+`}
      </InfoBox>
    </PanelContainer>
  );
}
