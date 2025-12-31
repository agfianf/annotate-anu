/**
 * Annotation Coverage Analytics Panel
 * Shows annotation completeness and density distribution (compact version)
 */

import { CheckCircle2, AlertCircle, Tag } from 'lucide-react';
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

/**
 * Compact tooltip for coverage charts
 */
const CoverageTooltip = ({ active, payload }: any) => {
  if (!active || !payload || payload.length === 0) return null;
  const data = payload[0].payload;

  return (
    <div className="bg-white/95 backdrop-blur-sm rounded-lg shadow-lg px-3 py-2 border border-emerald-200/50 text-xs">
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

  const handleDensityClick = (bucketData: any) => {
    if (!bucketData) return;
    toast.success(`Filtering: ${bucketData.bucket} annotations`, {
      icon: '📊',
      duration: 2000,
    });
  };

  const handleUnannotatedClick = () => {
    toast.success('Filtering to unannotated images', {
      icon: '⚠️',
      duration: 2000,
    });
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
            margin={{ top: 5, right: 10, left: -10, bottom: 20 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis
              dataKey="bucket"
              tick={{ fill: '#6b7280', fontSize: 9 }}
              tickLine={{ stroke: '#9ca3af' }}
            />
            <YAxis
              tick={{ fill: '#6b7280', fontSize: 9 }}
              width={30}
            />
            <Tooltip content={<CoverageTooltip />} />
            <Bar
              dataKey="count"
              onClick={handleDensityClick}
              radius={[4, 4, 0, 0]}
              cursor="pointer"
              animationDuration={500}
            >
              {data.density_histogram.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={getDensityColor(entry.bucket)}
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
