import type { NumericAggregation } from '@/lib/data-management-client';
import { SlidersHorizontal } from 'lucide-react';
import { useMemo, useState, useRef, useCallback, useEffect } from 'react';
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
  const [hoveredBarIndex, setHoveredBarIndex] = useState<number | null>(null);
  const [activeThumb, setActiveThumb] = useState<'min' | 'max' | null>(null);
  const [hoverThumb, setHoverThumb] = useState<'min' | 'max' | null>(null);

  // Histogram drag selection state
  const [histogramDragStart, setHistogramDragStart] = useState<number | null>(null);
  const [histogramDragCurrent, setHistogramDragCurrent] = useState<number | null>(null);
  const histogramRef = useRef<HTMLDivElement>(null);
  const dragTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

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
    setActiveThumb(null);
    commitChange();
  };

  const isFiltered = currentRange !== null && (
    currentRange.min !== min_value || currentRange.max !== max_value
  );
  const title = aggregation.display_name || aggregation.name;

  // Handle mouse movement to detect which thumb is closer
  const handleSliderMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (activeThumb) return; // Don't change hover state while dragging

    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percentage = x / rect.width;
    const mouseValue = min_value + percentage * (max_value - min_value);

    // Calculate distance to each thumb
    const distToMin = Math.abs(mouseValue - localMin);
    const distToMax = Math.abs(mouseValue - localMax);

    // Set hover state based on which thumb is closer
    setHoverThumb(distToMin < distToMax ? 'min' : 'max');
  };

  const handleSliderMouseLeave = () => {
    setHoverThumb(null);
  };

  // Calculate z-index for sliders to prevent overlap issues
  const getSliderZIndex = (slider: 'min' | 'max') => {
    // If actively dragging a specific thumb, give it priority
    if (activeThumb === slider) return 20;
    if (activeThumb && activeThumb !== slider) return 10;

    // If hovering, prioritize the thumb closest to mouse
    if (hoverThumb === slider) return 15;
    if (hoverThumb && hoverThumb !== slider) return 10;

    // Default: both at same level (DOM order makes max on top)
    return 10;
  };

  // Debounced filter application
  const applyHistogramSelection = useCallback(
    (min: number, max: number) => {
      if (dragTimeoutRef.current) {
        clearTimeout(dragTimeoutRef.current);
      }
      dragTimeoutRef.current = setTimeout(() => {
        setLocalMin(min);
        setLocalMax(max);
        onRangeChange(min, max);
      }, 100);
    },
    [onRangeChange]
  );

  // Clean up timeout on unmount
  useEffect(() => {
    return () => {
      if (dragTimeoutRef.current) {
        clearTimeout(dragTimeoutRef.current);
      }
    };
  }, []);

  // Get bin index from mouse position
  const getBinIndexFromMouse = (e: React.MouseEvent<HTMLDivElement>): number | null => {
    if (!histogramRef.current) return null;
    const rect = histogramRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const binIndex = Math.floor((x / rect.width) * histogram.length);
    return Math.max(0, Math.min(histogram.length - 1, binIndex));
  };

  // Handle histogram bar click - select single bin
  const handleBarClick = (index: number) => {
    const bin = histogram[index];
    if (!bin) return;
    applyHistogramSelection(bin.bucket_start, bin.bucket_end);
  };

  // Handle histogram drag start
  const handleHistogramMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    const binIndex = getBinIndexFromMouse(e);
    if (binIndex === null) return;
    setHistogramDragStart(binIndex);
    setHistogramDragCurrent(binIndex);
    setIsDragging(true);
  };

  // Handle histogram drag move
  const handleHistogramMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (histogramDragStart === null) return;
    const binIndex = getBinIndexFromMouse(e);
    if (binIndex === null) return;
    setHistogramDragCurrent(binIndex);
  };

  // Handle histogram drag end
  const handleHistogramMouseUp = useCallback(() => {
    if (histogramDragStart === null || histogramDragCurrent === null) {
      setIsDragging(false);
      setHistogramDragStart(null);
      setHistogramDragCurrent(null);
      return;
    }

    const startIndex = Math.min(histogramDragStart, histogramDragCurrent);
    const endIndex = Math.max(histogramDragStart, histogramDragCurrent);
    const startBin = histogram[startIndex];
    const endBin = histogram[endIndex];

    if (startBin && endBin) {
      applyHistogramSelection(startBin.bucket_start, endBin.bucket_end);
    }

    setIsDragging(false);
    setHistogramDragStart(null);
    setHistogramDragCurrent(null);
  }, [histogramDragStart, histogramDragCurrent, histogram, applyHistogramSelection]);

  // Calculate selection overlay position
  const selectionOverlay = useMemo(() => {
    if (histogramDragStart === null || histogramDragCurrent === null) return null;
    const startIndex = Math.min(histogramDragStart, histogramDragCurrent);
    const endIndex = Math.max(histogramDragStart, histogramDragCurrent);
    const left = (startIndex / histogram.length) * 100;
    const width = ((endIndex - startIndex + 1) / histogram.length) * 100;
    return { left, width };
  }, [histogramDragStart, histogramDragCurrent, histogram.length]);

  // Handle global mouse up (in case mouse leaves component)
  useEffect(() => {
    if (!isDragging) return;
    window.addEventListener('mouseup', handleHistogramMouseUp);
    return () => window.removeEventListener('mouseup', handleHistogramMouseUp);
  }, [isDragging, handleHistogramMouseUp]);

  return (
    <SidebarSection
      title={title}
      icon={<SlidersHorizontal className="h-4 w-4" />}
      count={histogram.reduce((sum, b) => sum + b.count, 0)}
    >
      <div className="space-y-3 font-mono text-xs">
        {/* Statistics Header */}
        <div className="flex justify-between text-[10px] text-emerald-900/50 tracking-tighter">
          <span>Range: {min_value.toFixed(1)} - {max_value.toFixed(1)}{unit}</span>
          <span>Avg: {mean.toFixed(1)}{unit}</span>
        </div>

        {/* Histogram Visualization - Interactive 1D Range Selector */}
        <div
          ref={histogramRef}
          className="h-16 relative border-b border-emerald-200 pb-1 select-none"
          onMouseDown={handleHistogramMouseDown}
          onMouseMove={handleHistogramMouseMove}
          onMouseUp={handleHistogramMouseUp}
          style={{ cursor: isDragging ? 'ew-resize' : 'pointer' }}
        >
          {/* Histogram Bars Container */}
          <div className="h-full flex items-end gap-[1px]">
            {histogram.map((bucket, i) => {
              const height = (bucket.count / maxCount) * 100;
              const inRange =
                bucket.bucket_start >= localMin && bucket.bucket_end <= localMax;

              // Check if bin is in drag selection
              const inDragSelection =
                histogramDragStart !== null &&
                histogramDragCurrent !== null &&
                i >= Math.min(histogramDragStart, histogramDragCurrent) &&
                i <= Math.max(histogramDragStart, histogramDragCurrent);

              const isHovered = hoveredBarIndex === i;

              return (
                <div
                  key={i}
                  className="flex-1 relative transition-all duration-200 ease-in-out"
                  style={{
                    height: `${Math.max(height, 5)}%`,
                    backgroundColor: inDragSelection
                      ? '#059669' // Emerald-600 (active drag)
                      : inRange
                      ? '#10B981' // Emerald-500 (in current range)
                      : isHovered
                      ? '#A7F3D0' // Emerald-200 (hovered)
                      : '#D1FAE5', // Emerald-100 (default)
                    opacity: inDragSelection || inRange || isHovered ? 1 : 0.6,
                    transform: isHovered ? 'scaleY(1.05)' : 'scaleY(1)',
                    transformOrigin: 'bottom',
                  }}
                  onMouseEnter={() => setHoveredBarIndex(i)}
                  onMouseLeave={() => setHoveredBarIndex(null)}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleBarClick(i);
                  }}
                >
                  {/* Tooltip - only show for hovered bar when not dragging */}
                  {isHovered && !isDragging && (
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 bg-white border border-emerald-100 shadow-lg text-emerald-900 text-[9px] px-1.5 py-0.5 rounded whitespace-nowrap z-10 pointer-events-none animate-in fade-in-0 slide-in-from-bottom-1 duration-150">
                      {bucket.bucket_start.toFixed(1)}-{bucket.bucket_end.toFixed(1)}{unit}: {bucket.count}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Selection Overlay - shown during drag */}
          {selectionOverlay && (
            <div
              className="absolute inset-y-0 bg-emerald-500/20 border-x-2 border-emerald-500 pointer-events-none transition-all duration-100 ease-out"
              style={{
                left: `${selectionOverlay.left}%`,
                width: `${selectionOverlay.width}%`,
              }}
            >
              <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/10 via-emerald-500/20 to-emerald-500/10 animate-pulse" />
            </div>
          )}
        </div>

        {/* Range Slider (dual thumb) - Custom Style */}
        <div
          className="relative h-6 select-none"
          onMouseMove={handleSliderMouseMove}
          onMouseLeave={handleSliderMouseLeave}
        >
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
            onMouseDown={() => setActiveThumb('min')}
            onMouseUp={handleMouseUp}
            onTouchEnd={handleMouseUp}
            className="absolute w-full h-full opacity-0 cursor-pointer"
            style={{ zIndex: getSliderZIndex('min') }}
          />
          <input
            type="range"
            min={min_value}
            max={max_value}
            step={(max_value - min_value) / 100}
            value={localMax}
            onChange={(e) => setLocalMax(parseFloat(e.target.value))}
            onMouseDown={() => setActiveThumb('max')}
            onMouseUp={handleMouseUp}
            onTouchEnd={handleMouseUp}
            className="absolute w-full h-full opacity-0 cursor-pointer"
            style={{ zIndex: getSliderZIndex('max') }}
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
