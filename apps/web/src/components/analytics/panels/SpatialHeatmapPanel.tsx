/**
 * Spatial Heatmap Panel
 * Shows spatial distribution of annotations with Canvas-based heatmap
 *
 * Features:
 * - Canvas-based 2D grid rendering
 * - Color gradient: transparent -> blue -> yellow -> red
 * - Hover to show cell count
 * - Click cell to filter (future: drag-to-select)
 */

import { useRef, useEffect, useState, useCallback } from 'react';
import { MapPin, Target, Grid3X3 } from 'lucide-react';

import type { PanelProps } from '@/types/analytics';
import { useSpatialHeatmap } from '@/hooks/useSpatialHeatmap';
import {
  PanelContainer,
  PanelLoadingState,
  PanelErrorState,
  PanelEmptyState,
  StatsGrid3,
  StatCard,
} from '../shared/PanelComponents';

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
 * Spatial Heatmap Panel Component
 */
export default function SpatialHeatmapPanel({
  projectId,
  filters,
  onFilterUpdate,
}: PanelProps) {
  const { data, isLoading, error } = useSpatialHeatmap({
    projectId,
    filters,
    enabled: !!projectId,
  });

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoveredCell, setHoveredCell] = useState<{ x: number; y: number; count: number } | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);

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

  if (isLoading) return <PanelLoadingState message="Loading heatmap..." />;
  if (error) return <PanelErrorState message={(error as Error).message} />;

  // Check if we have actual data
  const hasRealData = data && data.total_annotations > 0;

  if (!hasRealData) {
    return (
      <PanelContainer>
        <PanelEmptyState
          icon={MapPin}
          message="No annotation data for heatmap"
        />
      </PanelContainer>
    );
  }

  return (
    <PanelContainer>
      {/* Stats Cards */}
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
          value={`${data.center_of_mass.x.toFixed(2)}, ${data.center_of_mass.y.toFixed(2)}`}
          color="emerald"
        />
        <StatCard
          icon={Grid3X3}
          label="Clustering"
          value={(data.clustering_score * 100).toFixed(0) + '%'}
          color="purple"
        />
      </StatsGrid3>

      {/* Heatmap Canvas */}
      <div className="mt-3 p-3 rounded-lg border border-purple-200/50 bg-white/80">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <MapPin className="w-3.5 h-3.5 text-purple-600" />
            <h3 className="text-xs font-semibold text-gray-700">Annotation Heatmap</h3>
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
      </div>

      {/* Spread Info */}
      <div className="mt-2 text-xs text-gray-500 text-center">
        Spread: σx={data.spread.x_std.toFixed(3)}, σy={data.spread.y_std.toFixed(3)}
      </div>
    </PanelContainer>
  );
}
