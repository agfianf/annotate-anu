import type { NumericAggregation } from '@/lib/data-management-client';
import { SlidersHorizontal } from 'lucide-react';
import { useMemo, useState } from 'react';
import { SidebarSection } from './SidebarSection';

interface NumericRangeFilterProps {
  aggregation: NumericAggregation;
  currentRange: { min: number; max: number } | null;
  onRangeChange: (min: number, max: number) => void;
}

export function NumericRangeFilter({
  aggregation,
  currentRange,
  onRangeChange,
  unit = '',
}: NumericRangeFilterProps & { unit?: string }) {
  const { min_value, max_value, mean, histogram } = aggregation;

  // Local state for dragging and inputs
  const [localMin, setLocalMin] = useState(currentRange?.min ?? min_value);
  const [localMax, setLocalMax] = useState(currentRange?.max ?? max_value);
  const [isDragging, setIsDragging] = useState(false);

  // Update local state when props change (unless dragging)
  // useMemo/useEffect to sync if needed, but simplistic approach first

  // Calculate max count for normalization
  const maxCount = useMemo(() => {
    return Math.max(...histogram.map((b) => b.count), 1);
  }, [histogram]);

  const handleMinChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseFloat(e.target.value);
    if (!isNaN(value)) setLocalMin(Math.min(value, localMax));
  };

  const handleMaxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseFloat(e.target.value);
    if (!isNaN(value)) setLocalMax(Math.max(value, localMin));
  };

  const commitChange = () => {
    if (localMin !== currentRange?.min || localMax !== currentRange?.max) {
      onRangeChange(localMin, localMax);
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    commitChange();
  };

  const isFiltered = currentRange !== null;
  const title = aggregation.display_name || aggregation.name;

  return (
    <SidebarSection
      title={title}
      icon={<SlidersHorizontal className="h-4 w-4" />}
      count={histogram.reduce((sum, b) => sum + b.count, 0)}
    >
      <div className="space-y-3 font-mono text-xs">
        {/* Statistics Header */}
        <div className="flex justify-between text-[10px] text-emerald-900/50 tracking-tighter">
          <span>Range: {min_value.toFixed(0)} - {max_value.toFixed(0)}{unit}</span>
          <span>Avg: {mean.toFixed(1)}{unit}</span>
        </div>

        {/* Histogram Visualization */}
        <div className="h-16 flex items-end gap-[1px] border-b border-emerald-200 pb-1">
          {histogram.map((bucket, i) => {
            const height = (bucket.count / maxCount) * 100;
            const inRange =
              bucket.bucket_start >= localMin && bucket.bucket_end <= localMax;

            return (
              <div
                key={i}
                className="flex-1 transition-all duration-150 relative group"
                style={{
                  height: `${Math.max(height, 5)}%`,
                  backgroundColor: inRange
                    ? '#10B981' // Emerald-500
                    : '#D1FAE5', // Emerald-100
                }}
              >
                 {/* Tooltip */}
                 <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block bg-white border border-emerald-100 shadow-lg text-emerald-900 text-[9px] px-1.5 py-0.5 rounded whitespace-nowrap z-10">
                   {bucket.bucket_start.toFixed(0)}-{bucket.bucket_end.toFixed(0)}{unit}: {bucket.count}
                 </div>
              </div>
            );
          })}
        </div>

        {/* Range Slider (dual thumb) - Custom Style */}
        <div className="relative h-6 select-none">
          {/* Track */}
          <div className="absolute top-1/2 -translate-y-1/2 left-0 right-0 h-[2px] bg-emerald-100" />
          
          {/* Active Segment */}
          <div
            className="absolute top-1/2 -translate-y-1/2 h-[2px] bg-emerald-500"
            style={{
              left: `${((localMin - min_value) / (max_value - min_value)) * 100}%`,
              right: `${100 - ((localMax - min_value) / (max_value - min_value)) * 100}%`,
            }}
          />

          {/* Invisible Inputs for Interaction */}
          <input
            type="range"
            min={min_value}
            max={max_value}
            step={(max_value - min_value) / 100}
            value={localMin}
            onChange={(e) => setLocalMin(parseFloat(e.target.value))}
            onMouseUp={handleMouseUp}
            onTouchEnd={handleMouseUp}
            className="absolute w-full h-full opacity-0 cursor-pointer z-10"
          />
          <input
            type="range"
            min={min_value}
            max={max_value}
            step={(max_value - min_value) / 100}
            value={localMax}
            onChange={(e) => setLocalMax(parseFloat(e.target.value))}
            onMouseUp={handleMouseUp}
            onTouchEnd={handleMouseUp}
            className="absolute w-full h-full opacity-0 cursor-pointer z-10"
          />

          {/* Visible Thumbs (Pixelated Square Style) */}
          <div
            className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-white border border-emerald-500 shadow-sm pointer-events-none"
            style={{
              left: `calc(${((localMin - min_value) / (max_value - min_value)) * 100}% - 6px)`,
            }}
          />
          <div
            className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-white border border-emerald-500 shadow-sm pointer-events-none"
            style={{
              left: `calc(${((localMax - min_value) / (max_value - min_value)) * 100}% - 6px)`,
            }}
          />
        </div>

        {/* Manual Input Fields */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
             <input
               type="number"
               value={localMin}
               onChange={handleMinChange}
               onBlur={commitChange}
               className="w-full bg-white border border-emerald-200 px-2 py-1 text-[10px] text-emerald-900 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500/50 transition-all font-mono"
             />
             <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[9px] text-emerald-900/30">{unit}</span>
          </div>
          <span className="text-emerald-900/30">-</span>
          <div className="relative flex-1">
             <input
               type="number"
               value={localMax}
               onChange={handleMaxChange}
               onBlur={commitChange}
               className="w-full bg-white border border-emerald-200 px-2 py-1 text-[10px] text-emerald-900 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500/50 transition-all font-mono"
             />
             <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[9px] text-emerald-900/30">{unit}</span>
          </div>
        </div>

        {/* Reset Action */}
        {isFiltered && (
          <button
            onClick={() => {
              setLocalMin(min_value);
              setLocalMax(max_value);
              onRangeChange(min_value, max_value);
            }}
            className="w-full text-[10px] text-emerald-600 hover:text-emerald-500 py-1 transition-colors border border-dashed border-emerald-500/30 hover:border-emerald-500/50 mt-1"
          >
            Reset Range
          </button>
        )}
      </div>
    </SidebarSection>
  );
}
