/**
 * Dimension Insights Panel
 * Shows image dimension statistics and recommendations (Roboflow-style)
 *
 * Features:
 * - Median width, height, aspect ratio
 * - Dimension variance indicator
 * - Aspect ratio distribution pie chart
 * - Recommended resize suggestion
 */

import { Maximize2, Minimize2, RatioIcon, Target, Lightbulb } from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  LabelList,
  PieChart,
  Pie,
} from 'recharts';

import type { PanelProps } from '@/types/analytics';
import { useDimensionInsights } from '@/hooks/useDimensionInsights';
import {
  PanelContainer,
  PanelLoadingState,
  PanelErrorState,
  PanelEmptyState,
  StatsGrid3,
  StatCard,
  ChartSection,
  BarValueLabel,
  InfoBox,
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
 * Colors for aspect ratio categories
 */
const ASPECT_RATIO_COLORS = {
  'Portrait (<0.9)': '#8B5CF6',      // Purple
  'Square (0.9-1.1)': '#10B981',     // Emerald
  'Landscape (1.1-2.0)': '#3B82F6',  // Blue
  'Ultra-wide (>2.0)': '#F59E0B',    // Amber
};

/**
 * Compact tooltip for charts
 */
const InsightsTooltip = ({ active, payload }: any) => {
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
 * Dimension Insights Panel Component
 */
export default function DimensionInsightsPanel({
  projectId,
  filters,
  onFilterUpdate,
}: PanelProps) {
  const { data, isLoading, error } = useDimensionInsights({
    projectId,
    filters,
    enabled: !!projectId,
  });

  if (isLoading) return <PanelLoadingState message="Loading dimensions..." />;
  if (error) return <PanelErrorState message={(error as Error).message} />;
  if (!data || data.median_width === 0) {
    return (
      <PanelContainer>
        <PanelEmptyState icon={Maximize2} message="No dimension data" />
      </PanelContainer>
    );
  }

  const varianceLevel = data.dimension_variance < 0.3 ? 'low' : data.dimension_variance < 0.6 ? 'moderate' : 'high';
  const varianceColor = varianceLevel === 'low' ? 'text-emerald-600' : varianceLevel === 'moderate' ? 'text-amber-600' : 'text-red-600';

  // Prepare pie chart data
  const pieData = data.aspect_ratio_distribution
    .filter(d => d.count > 0)
    .map(d => ({
      name: d.bucket,
      value: d.count,
      color: ASPECT_RATIO_COLORS[d.bucket as keyof typeof ASPECT_RATIO_COLORS] || '#6B7280',
    }));

  return (
    <PanelContainer>
      {/* Median Stats */}
      <StatsGrid3>
        <StatCard
          icon={Maximize2}
          label="Median Width"
          value={`${data.median_width}px`}
          color="blue"
        />
        <StatCard
          icon={Minimize2}
          label="Median Height"
          value={`${data.median_height}px`}
          color="purple"
        />
        <StatCard
          icon={RatioIcon}
          label="Median Ratio"
          value={data.median_aspect_ratio.toFixed(2)}
          color="emerald"
        />
      </StatsGrid3>

      {/* Dimension Range */}
      <div className="mt-3 p-2 rounded-lg border border-gray-200/50 bg-gray-50/50">
        <div className="text-xs text-gray-600 flex justify-between">
          <span>Width: {data.min_width} - {data.max_width}px</span>
          <span>Height: {data.min_height} - {data.max_height}px</span>
        </div>
        <div className="mt-1 flex items-center gap-2">
          <span className="text-xs text-gray-500">Variance:</span>
          <span className={`text-xs font-medium ${varianceColor}`}>
            {varianceLevel.charAt(0).toUpperCase() + varianceLevel.slice(1)} ({(data.dimension_variance * 100).toFixed(0)}%)
          </span>
        </div>
      </div>

      {/* Aspect Ratio Distribution */}
      <ChartSection
        icon={RatioIcon}
        title="Aspect Ratio Distribution"
        height={150}
      >
        <div className="h-full flex items-center">
          {pieData.length > 0 ? (
            <>
              <ResponsiveContainer width="50%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={25}
                    outerRadius={45}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const data = payload[0].payload;
                      return (
                        <div className={CHART_TOOLTIP_CLASSNAME}>
                          <p className="font-semibold text-gray-800">{data.name}</p>
                          <p className="text-gray-600">{data.value} images</p>
                        </div>
                      );
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex-1 space-y-1">
                {data.aspect_ratio_distribution.map((item) => (
                  <div key={item.bucket} className="flex items-center gap-2 text-[10px]">
                    <div
                      className="w-2 h-2 rounded-full"
                      style={{
                        backgroundColor: ASPECT_RATIO_COLORS[item.bucket as keyof typeof ASPECT_RATIO_COLORS] || '#6B7280',
                      }}
                    />
                    <span className="text-gray-600 truncate flex-1">{item.bucket}</span>
                    <span className="text-gray-800 font-medium">{item.count}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="w-full text-center text-xs text-gray-500">No data</div>
          )}
        </div>
      </ChartSection>

      {/* Resize Recommendation */}
      <div className="mt-3 p-3 rounded-lg border border-emerald-200/50 bg-gradient-to-br from-emerald-50 to-emerald-100/50">
        <div className="flex items-center gap-2 mb-1">
          <Lightbulb className="w-4 h-4 text-emerald-600" />
          <span className="text-xs font-semibold text-emerald-800">Recommended Resize</span>
        </div>
        <p className="text-lg font-bold text-emerald-900">
          {data.recommended_resize.width} × {data.recommended_resize.height}
        </p>
        <p className="text-[10px] text-emerald-700 mt-0.5">
          {data.recommended_resize.reason}
        </p>
      </div>
    </PanelContainer>
  );
}
