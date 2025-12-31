/**
 * Class Balance Analytics Panel
 * Shows class distribution, imbalance detection (compact version)
 */

import { Scale, AlertTriangle, Tag, CheckCircle, Download } from 'lucide-react';
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
import { useClassBalance } from '@/hooks/useClassBalance';
import {
  PanelContainer,
  PanelLoadingState,
  PanelErrorState,
  PanelEmptyState,
  StatsGrid,
  StatsGrid3,
  StatCard,
  ChartSection,
  InfoBox,
  Legend,
  LegendItem,
} from '../shared/PanelComponents';

/**
 * Compact tooltip for class distribution chart
 */
const ClassTooltip = ({ active, payload }: any) => {
  if (!active || !payload || payload.length === 0) return null;
  const data = payload[0].payload;

  return (
    <div className="bg-white/95 backdrop-blur-sm rounded-lg shadow-lg px-3 py-2 border border-emerald-200/50 text-xs">
      <p className="font-semibold text-gray-800 truncate max-w-[150px]">{data.tag_name}</p>
      <p className="text-gray-600">{data.annotation_count.toLocaleString()} ({data.percentage.toFixed(1)}%)</p>
      <p className={`font-medium ${
        data.status === 'healthy' ? 'text-emerald-600' :
        data.status === 'underrepresented' ? 'text-yellow-600' : 'text-red-600'
      }`}>
        {data.status === 'healthy' ? '✓ OK' : data.status === 'underrepresented' ? '⚠ Low' : '❌ Very Low'}
      </p>
    </div>
  );
};

/**
 * Get bar color based on class health status
 */
function getStatusColor(status: string): string {
  switch (status) {
    case 'severely_underrepresented': return '#EF4444';
    case 'underrepresented': return '#F59E0B';
    case 'healthy': return '#10B981';
    default: return '#6B7280';
  }
}

/**
 * Class Balance Panel Component
 */
export default function ClassBalancePanel({
  projectId,
  filters,
  onFilterUpdate,
}: PanelProps) {
  const { data, isLoading, error } = useClassBalance({
    projectId,
    filters,
    enabled: !!projectId,
  });

  const handleClassClick = (classData: any) => {
    if (!classData || !classData.tag_id) return;
    onFilterUpdate({ tag_ids: [classData.tag_id] });
    toast.success(`Filtering: ${classData.tag_name}`, { icon: '🏷️', duration: 2000 });
  };

  const handleExport = () => {
    if (!data) return;
    const csv = [
      ['Class', 'Count', 'Images', '%', 'Status'].join(','),
      ...data.class_distribution.map(c =>
        [c.tag_name, c.annotation_count, c.image_count, c.percentage.toFixed(2), c.status].join(',')
      ),
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `class-balance-${projectId}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Exported!', { icon: '💾', duration: 2000 });
  };

  if (isLoading) return <PanelLoadingState message="Loading balance..." />;
  if (error) return <PanelErrorState message={(error as Error).message} />;
  if (!data || data.class_distribution.length === 0) {
    return <PanelEmptyState icon={Tag} title="No classes" message="Add tags to see balance" />;
  }

  const { imbalance_score, imbalance_level, class_distribution } = data;
  const chartData = class_distribution.slice(0, 15);
  const healthyCount = class_distribution.filter(c => c.status === 'healthy').length;
  const needsAttention = class_distribution.filter(c => c.status !== 'healthy').length;

  return (
    <PanelContainer>
      {/* Imbalance Score + Export */}
      <div className="flex items-center justify-between gap-2">
        <div className={`flex-1 p-2.5 rounded-lg border ${
          imbalance_level === 'balanced' ? 'border-emerald-200/50 bg-emerald-50/50' :
          imbalance_level === 'moderate' ? 'border-yellow-200/50 bg-yellow-50/50' :
          'border-red-200/50 bg-red-50/50'
        }`}>
          <div className="flex items-center gap-2">
            {imbalance_level === 'balanced' ? (
              <CheckCircle className="w-4 h-4 text-emerald-600" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-yellow-600" />
            )}
            <div>
              <span className="text-xs text-gray-500">Gini: </span>
              <span className={`text-sm font-bold ${
                imbalance_level === 'balanced' ? 'text-emerald-700' :
                imbalance_level === 'moderate' ? 'text-yellow-700' : 'text-red-700'
              }`}>
                {imbalance_score.toFixed(3)}
              </span>
              <span className="text-[10px] text-gray-400 ml-1">
                ({imbalance_level === 'balanced' ? 'balanced' : imbalance_level === 'moderate' ? 'moderate' : 'severe'})
              </span>
            </div>
          </div>
        </div>
        <button
          onClick={handleExport}
          className="p-2 rounded-lg bg-gray-50 hover:bg-gray-100 text-gray-600 transition-colors"
          title="Export CSV"
        >
          <Download className="w-4 h-4" />
        </button>
      </div>

      {/* Stats Cards */}
      <StatsGrid3>
        <StatCard
          icon={Scale}
          label="Classes"
          value={class_distribution.length}
          color="blue"
        />
        <StatCard
          icon={CheckCircle}
          label="Healthy"
          value={healthyCount}
          color="emerald"
        />
        <StatCard
          icon={AlertTriangle}
          label="Needs Work"
          value={needsAttention}
          color="red"
        />
      </StatsGrid3>

      {/* Distribution Chart */}
      <ChartSection
        icon={Scale}
        title="Class Distribution"
        hint="Click to filter"
        height={200}
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartData}
            margin={{ top: 5, right: 10, left: -10, bottom: 60 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis
              dataKey="tag_name"
              angle={-45}
              textAnchor="end"
              height={60}
              tick={{ fill: '#6b7280', fontSize: 9 }}
              interval={0}
            />
            <YAxis tick={{ fill: '#6b7280', fontSize: 9 }} width={35} />
            <Tooltip content={<ClassTooltip />} />
            <Bar
              dataKey="annotation_count"
              onClick={handleClassClick}
              radius={[4, 4, 0, 0]}
              cursor="pointer"
              animationDuration={500}
            >
              {chartData.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={getStatusColor(entry.status)}
                  className="hover:opacity-80 transition-opacity"
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartSection>

      {/* Legend */}
      <Legend>
        <LegendItem color="#10B981" label="Healthy (≥15%)" />
        <LegendItem color="#F59E0B" label="Low (5-15%)" />
        <LegendItem color="#EF4444" label="Very Low (<5%)" />
      </Legend>

      {/* Recommendations */}
      {data.recommendations.length > 0 && (
        <InfoBox type={imbalance_level === 'balanced' ? 'success' : imbalance_level === 'moderate' ? 'warning' : 'error'}>
          <div className="space-y-1">
            {data.recommendations.slice(0, 2).map((rec, i) => (
              <p key={i}>{rec}</p>
            ))}
          </div>
        </InfoBox>
      )}
    </PanelContainer>
  );
}
