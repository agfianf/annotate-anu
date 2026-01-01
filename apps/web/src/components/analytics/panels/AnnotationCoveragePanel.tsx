/**
 * Annotation Coverage Analytics Panel
 * Shows annotation completeness and density distribution (compact version)
 */

import { CheckCircle2, AlertCircle, Tag } from 'lucide-react';
import { useAnalyticsToast } from '@/hooks/useAnalyticsToast';
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
import {
  CHART_CONFIG,
  CHART_TOOLTIP_CLASSNAME,
  getCellProps,
  getBarProps,
  getGridProps,
  getXAxisProps,
  getYAxisProps,
  getTooltipCursorProps,
} from '../shared/chartConfig';

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
 * Get color for density bucket
 */
function getDensityColor(bucket: string): string {
  if (bucket === '0') return '#EF4444';
  if (bucket === '1-5') return '#F59E0B';
  return '#10B981';
}

/**
 * Annotation Coverage Panel Component
 */
export default function AnnotationCoveragePanel({
  projectId,
  filters,
  onFilterUpdate,
}: PanelProps) {
  const { data, isLoading, error } = useAnnotationCoverage({
    projectId,
    filters,
    enabled: !!projectId,
  });

  const { showSuccess } = useAnalyticsToast();

  const handleDensityClick = (bucketData: any) => {
    if (!bucketData) return;
    const isUnannotated = bucketData.bucket === '0' || (bucketData.min === 0 && bucketData.max === 0);
    onFilterUpdate({ is_annotated: !isUnannotated });
    showSuccess(
      isUnannotated
        ? 'Filtering: unannotated images'
        : `Filtering: annotated images (${bucketData.bucket})`,
      { icon: '📊' }
    );
  };

  const handleUnannotatedClick = () => {
    onFilterUpdate({ is_annotated: false });
    showSuccess('Filtering to unannotated images', { icon: '⚠️' });
  };

  if (isLoading) return <PanelLoadingState message="Loading coverage..." />;
  if (error) return <PanelErrorState message={(error as Error).message} />;
  if (!data) return <PanelEmptyState icon={Tag} message="No coverage data" />;

  const coveragePercentage = data.coverage_percentage;
  const isHealthy = coveragePercentage >= 80;
  const isModerate = coveragePercentage >= 50 && coveragePercentage < 80;

  return (
    <PanelContainer>
      {/* Summary Cards */}
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

      {/* Density Histogram */}
      <ChartSection
        icon={Tag}
        title="Annotation Density"
        hint="Click to filter"
        height={180}
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data.density_histogram}
            margin={CHART_CONFIG.marginCompact}
          >
            <CartesianGrid {...getGridProps()} />
            <XAxis dataKey="bucket" {...getXAxisProps(false)} />
            <YAxis {...getYAxisProps()} />
            <Tooltip content={<CoverageTooltip />} cursor={getTooltipCursorProps()} />
            <Bar
              dataKey="count"
              onClick={handleDensityClick}
              {...getBarProps(true)}
            >
              {data.density_histogram.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  {...getCellProps(getDensityColor(entry.bucket))}
                  className="hover:opacity-80 transition-opacity"
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartSection>

      {/* Legend */}
      <Legend>
        <LegendItem color="#EF4444" label="None" />
        <LegendItem color="#F59E0B" label="Low (1-5)" />
        <LegendItem color="#10B981" label="Good (6+)" />
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
