/**
 * Annotation Analysis Panel (Consolidated)
 * Combines: Annotation Coverage + Spatial Heatmap
 *
 * Features:
 * - Coverage stats (Total/Annotated/Missing)
 * - Object statistics (Total/Avg/Median)
 * - Density histogram with multi-select filtering
 * - Canvas-based spatial heatmap
 * - Center of mass and clustering metrics
 */

import { useRef, useEffect, useState, useCallback } from 'react';
import {
  CheckCircle2,
  AlertCircle,
  Tag,
  BarChart3,
  Target,
  MapPin,
  Grid3X3,
} from 'lucide-react';
import { useAnalyticsToast } from '@/hooks/useAnalyticsToast';
import type { DensityBucket, PanelProps } from '@/types/analytics';
import { useAnnotationAnalysis } from '@/hooks/useAnnotationAnalysis';
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
 * Color interpolation for heatmap cells
 * transparent -> blue -> cyan -> yellow -> red
 */
function getHeatmapColor(value: number, maxValue: number): string {
  if (maxValue === 0 || value === 0) return 'rgba(0, 0, 0, 0)';

  const ratio = Math.min(value / maxValue, 1);

  // Color stops: 0=blue, 0.25=cyan, 0.5=green, 0.75=yellow, 1=red
  if (ratio <= 0.25) {
    const t = ratio / 0.25;
    return `rgba(${Math.round(0 + t * 0)}, ${Math.round(100 + t * 155)}, ${Math.round(200 + t * 55)}, ${0.3 + ratio * 0.7})`;
  } else if (ratio <= 0.5) {
    const t = (ratio - 0.25) / 0.25;
    return `rgba(${Math.round(0 + t * 50)}, ${Math.round(255 - t * 55)}, ${Math.round(255 - t * 155)}, ${0.6 + ratio * 0.4})`;
  } else if (ratio <= 0.75) {
    const t = (ratio - 0.5) / 0.25;
    return `rgba(${Math.round(50 + t * 205)}, ${Math.round(200 - t * 50)}, ${Math.round(100 - t * 100)}, ${0.8 + ratio * 0.2})`;
  } else {
    const t = (ratio - 0.75) / 0.25;
    return `rgba(${Math.round(255)}, ${Math.round(150 - t * 100)}, ${Math.round(0)}, 1)`;
  }
}

/**
 * Annotation Analysis Panel Component (Consolidated)
 */
export default function AnnotationAnalysisPanel({
  projectId,
  filters,
  onFilterUpdate,
}: PanelProps) {
  const prefersReducedMotion = useReducedMotion();
  const { data, isLoading, error } = useAnnotationAnalysis({
    projectId,
    filters,
    enabled: !!projectId,
  });

  const { showSuccess } = useAnalyticsToast();

  // Canvas refs for heatmap
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoveredCell, setHoveredCell] = useState<{ x: number; y: number; count: number } | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);

  // Multi-select state for object count histogram
  const densityMultiSelect = useChartMultiSelect(data?.density_histogram ?? []);

  const handleUnannotatedClick = () => {
    onFilterUpdate({ is_annotated: false });
    showSuccess('Filtering to unannotated images', { icon: '⚠️' });
  };

  /**
   * Apply object count multi-select filter
   */
  const handleApplyDensityFilter = () => {
    const selected = densityMultiSelect.selectedData;

    if (selected.length === 0) {
      return;
    }

    // Combine all selected ranges into a single min/max
    const minCount = Math.min(...selected.map((d: any) => d.min));
    const maxCount = Math.max(...selected.map((d: any) => d.max));

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
    if (!bucketData) {
      return;
    }
    densityMultiSelect.handleBarClick(index, bucketData, event);
  };

  const densityChartClick = useChartClick(
    data?.density_histogram ?? [],
    (data, index, event) => handleDensityClick(data, index, event)
  );

  // Render heatmap on canvas
  const renderHeatmap = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container || !data?.grid_density) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Get container size
    const rect = container.getBoundingClientRect();
    const size = Math.min(rect.width, rect.height);

    // Set canvas size (with device pixel ratio for sharpness)
    const dpr = window.devicePixelRatio || 1;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;
    ctx.scale(dpr, dpr);

    // Clear canvas
    ctx.clearRect(0, 0, size, size);

    const gridSize = data.grid_size || 10;
    const cellSize = size / gridSize;
    const maxCount = data.max_cell_count || 1;

    // Draw grid cells
    for (let row = 0; row < gridSize; row++) {
      for (let col = 0; col < gridSize; col++) {
        const count = data.grid_density[row]?.[col] ?? 0;
        const color = getHeatmapColor(count, maxCount);

        ctx.fillStyle = color;
        ctx.fillRect(col * cellSize, row * cellSize, cellSize - 1, cellSize - 1);
      }
    }

    // Draw grid lines (subtle)
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.1)';
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= gridSize; i++) {
      ctx.beginPath();
      ctx.moveTo(i * cellSize, 0);
      ctx.lineTo(i * cellSize, size);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i * cellSize);
      ctx.lineTo(size, i * cellSize);
      ctx.stroke();
    }

    // Draw center of mass marker
    if (data.center_of_mass) {
      const cx = data.center_of_mass.x * size;
      const cy = data.center_of_mass.y * size;

      ctx.beginPath();
      ctx.arc(cx, cy, 4, 0, Math.PI * 2);
      ctx.fillStyle = '#10B981';
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }, [data]);

  // Handle mouse move for hover effect
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || !data?.grid_density) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const gridSize = data.grid_size || 10;
    const cellSize = rect.width / gridSize;

    const col = Math.floor(x / cellSize);
    const row = Math.floor(y / cellSize);

    if (row >= 0 && row < gridSize && col >= 0 && col < gridSize) {
      const count = data.grid_density[row]?.[col] ?? 0;
      setHoveredCell({ x: col, y: row, count });
      setTooltipPos({ x: e.clientX - rect.left + 10, y: e.clientY - rect.top - 30 });
    }
  }, [data]);

  const handleMouseLeave = useCallback(() => {
    setHoveredCell(null);
    setTooltipPos(null);
  }, []);

  // Re-render when data changes or on resize
  useEffect(() => {
    renderHeatmap();

    const handleResize = () => renderHeatmap();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [renderHeatmap]);

  if (isLoading) return <PanelLoadingState message="Loading annotation analysis..." />;
  if (error) return <PanelErrorState message={(error as Error).message} />;
  if (!data) return <PanelEmptyState icon={Tag} message="No annotation data" />;

  const coveragePercentage = data.coverage_percentage;
  const isHealthy = coveragePercentage >= 80;
  const isModerate = coveragePercentage >= 50 && coveragePercentage < 80;

  // Safely access fields with defaults
  const totalObjects = data.total_objects ?? 0;
  const avgObjects = data.avg_objects_per_image ?? 0;
  const medianObjects = data.median_objects_per_image ?? 0;
  const hasHeatmapData = data.total_annotations > 0;

  return (
    <PanelContainer>
      {/* ===== COVERAGE SECTION ===== */}
      <div className="space-y-3">
        {/* Image Coverage Stats */}
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
        <div className="grid grid-cols-3 gap-2">
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
          height={160}
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

        {/* Density Legend */}
        <Legend>
          <LegendItem color="#EF4444" label="0" />
          <LegendItem color="#F59E0B" label="1" />
          <LegendItem color="#84CC16" label="2-5" />
          <LegendItem color="#10B981" label="6-10" />
          <LegendItem color="#06B6D4" label="11-20" />
          <LegendItem color="#8B5CF6" label="21+" />
        </Legend>

        {/* Coverage Recommendation */}
        <InfoBox type={isHealthy ? 'success' : isModerate ? 'warning' : 'error'}>
          {isHealthy
            ? `✅ ${coveragePercentage.toFixed(1)}% coverage - well labeled!`
            : isModerate
            ? `⚠️ ${coveragePercentage.toFixed(1)}% coverage - consider labeling more`
            : `❌ ${coveragePercentage.toFixed(1)}% coverage - aim for 80%+`}
        </InfoBox>
      </div>

      {/* ===== SPATIAL HEATMAP SECTION ===== */}
      <div className="mt-4 pt-4 border-t border-gray-200/50">
        {/* Heatmap Stats */}
        <StatsGrid3>
          <StatCard
            icon={MapPin}
            label="Annotations"
            value={data.total_annotations}
            color="blue"
          />
          <StatCard
            icon={Target}
            label="Center"
            value={hasHeatmapData ? `${data.center_of_mass.x.toFixed(2)}, ${data.center_of_mass.y.toFixed(2)}` : '-'}
            color="emerald"
          />
          <StatCard
            icon={Grid3X3}
            label="Clustering"
            value={hasHeatmapData ? `${(data.clustering_score * 100).toFixed(0)}%` : '-'}
            color="purple"
          />
        </StatsGrid3>

        {/* Heatmap Canvas */}
        {hasHeatmapData ? (
          <div className="mt-3 p-3 rounded-lg border border-purple-200/50 bg-white/80">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <MapPin className="w-3.5 h-3.5 text-purple-600" />
                <h3 className="text-xs font-semibold text-gray-700">Spatial Distribution</h3>
              </div>
              <span className="text-[10px] text-gray-500">
                {data.grid_size}×{data.grid_size} grid
              </span>
            </div>

            <div
              ref={containerRef}
              className="relative aspect-square bg-gray-50 rounded-lg overflow-hidden"
            >
              <canvas
                ref={canvasRef}
                className="w-full h-full cursor-crosshair"
                onMouseMove={handleMouseMove}
                onMouseLeave={handleMouseLeave}
              />

              {/* Tooltip */}
              {hoveredCell && tooltipPos && (
                <div
                  className="absolute pointer-events-none bg-gray-900/90 text-white text-xs px-2 py-1 rounded shadow-lg z-10"
                  style={{
                    left: tooltipPos.x,
                    top: tooltipPos.y,
                  }}
                >
                  Cell ({hoveredCell.x}, {hoveredCell.y}): {hoveredCell.count} annotation{hoveredCell.count !== 1 ? 's' : ''}
                </div>
              )}
            </div>

            {/* Color Legend */}
            <div className="mt-2 flex items-center justify-between text-[10px] text-gray-500">
              <span>Low</span>
              <div className="flex-1 mx-2 h-2 rounded bg-gradient-to-r from-blue-400 via-yellow-400 to-red-500" />
              <span>High</span>
            </div>

            {/* Spread Info */}
            <div className="mt-2 text-xs text-gray-500 text-center">
              Spread: σx={data.spread.x_std.toFixed(3)}, σy={data.spread.y_std.toFixed(3)}
            </div>
          </div>
        ) : (
          <div className="mt-3 p-6 rounded-lg border border-gray-200/50 bg-gray-50/50 text-center">
            <MapPin className="w-8 h-8 text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-500">No spatial data available</p>
            <p className="text-xs text-gray-400 mt-1">Add annotations to see the heatmap</p>
          </div>
        )}
      </div>
    </PanelContainer>
  );
}
