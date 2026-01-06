import { useState, useRef, useCallback, useEffect } from 'react';

interface ConfidenceRangeSliderProps {
  min: number;  // 0-100
  max: number;  // 0-100
  onChange: (min: number, max: number) => void;
  disabled?: boolean;
  accentColor?: string;
}

/**
 * Compact dual-thumb slider for confidence range filtering (0-100%)
 * Designed for inline use in sidebar rows
 */
export function ConfidenceRangeSlider({
  min,
  max,
  onChange,
  disabled = false,
  accentColor = '#06B6D4', // cyan-500 default
}: ConfidenceRangeSliderProps) {
  const [localMin, setLocalMin] = useState(min);
  const [localMax, setLocalMax] = useState(max);
  const [activeThumb, setActiveThumb] = useState<'min' | 'max' | null>(null);
  const [hoverThumb, setHoverThumb] = useState<'min' | 'max' | null>(null);
  const sliderRef = useRef<HTMLDivElement>(null);

  // Sync with props when they change
  useEffect(() => {
    setLocalMin(min);
    setLocalMax(max);
  }, [min, max]);

  const commitChange = useCallback(() => {
    if (localMin !== min || localMax !== max) {
      onChange(localMin, localMax);
    }
  }, [localMin, localMax, min, max, onChange]);

  const handleMouseDown = (thumb: 'min' | 'max') => (e: React.MouseEvent) => {
    if (disabled) return;
    e.preventDefault();
    setActiveThumb(thumb);
  };

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!activeThumb || !sliderRef.current) return;

      const rect = sliderRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const percentage = Math.max(0, Math.min(100, (x / rect.width) * 100));

      if (activeThumb === 'min') {
        setLocalMin(Math.min(percentage, localMax - 1));
      } else {
        setLocalMax(Math.max(percentage, localMin + 1));
      }
    },
    [activeThumb, localMin, localMax]
  );

  const handleMouseUp = useCallback(() => {
    if (activeThumb) {
      commitChange();
      setActiveThumb(null);
    }
  }, [activeThumb, commitChange]);

  // Global mouse listeners for dragging
  useEffect(() => {
    if (activeThumb) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [activeThumb, handleMouseMove, handleMouseUp]);

  // Handle hover detection
  const handleSliderMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (activeThumb || disabled) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percentage = (x / rect.width) * 100;

    const distToMin = Math.abs(percentage - localMin);
    const distToMax = Math.abs(percentage - localMax);

    setHoverThumb(distToMin < distToMax ? 'min' : 'max');
  };

  const handleSliderMouseLeave = () => {
    setHoverThumb(null);
  };

  const getThumbZIndex = (thumb: 'min' | 'max') => {
    if (activeThumb === thumb) return 20;
    if (activeThumb && activeThumb !== thumb) return 10;
    if (hoverThumb === thumb) return 15;
    return 10;
  };

  const isFiltered = min !== 0 || max !== 100;

  return (
    <div className="flex flex-col gap-1 w-full">
      {/* Range display */}
      <div className="flex justify-between text-[10px] text-gray-500">
        <span>{Math.round(localMin)}%</span>
        <span>{Math.round(localMax)}%</span>
      </div>

      {/* Slider track */}
      <div
        ref={sliderRef}
        className={`relative h-3 rounded-sm ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
        onMouseMove={handleSliderMouseMove}
        onMouseLeave={handleSliderMouseLeave}
      >
        {/* Background track */}
        <div className="absolute top-1/2 -translate-y-1/2 left-0 right-0 h-[3px] bg-gray-200 rounded-full" />

        {/* Active segment */}
        <div
          className="absolute top-1/2 -translate-y-1/2 h-[3px] rounded-full transition-colors"
          style={{
            left: `${localMin}%`,
            right: `${100 - localMax}%`,
            backgroundColor: isFiltered ? accentColor : '#D1D5DB',
          }}
        />

        {/* Min thumb */}
        <div
          className={`absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 bg-white border-2 rounded-sm shadow-sm transition-all ${
            disabled ? '' : 'hover:scale-110'
          } ${activeThumb === 'min' ? 'scale-110 shadow-md' : ''}`}
          style={{
            left: `calc(${localMin}% - 5px)`,
            borderColor: isFiltered ? accentColor : '#9CA3AF',
            zIndex: getThumbZIndex('min'),
          }}
          onMouseDown={handleMouseDown('min')}
        />

        {/* Max thumb */}
        <div
          className={`absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 bg-white border-2 rounded-sm shadow-sm transition-all ${
            disabled ? '' : 'hover:scale-110'
          } ${activeThumb === 'max' ? 'scale-110 shadow-md' : ''}`}
          style={{
            left: `calc(${localMax}% - 5px)`,
            borderColor: isFiltered ? accentColor : '#9CA3AF',
            zIndex: getThumbZIndex('max'),
          }}
          onMouseDown={handleMouseDown('max')}
        />

        {/* Invisible range inputs for accessibility */}
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={localMin}
          onChange={(e) => {
            const value = parseInt(e.target.value);
            setLocalMin(Math.min(value, localMax - 1));
          }}
          onMouseUp={commitChange}
          onKeyUp={commitChange}
          disabled={disabled}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          style={{ zIndex: getThumbZIndex('min') }}
          aria-label="Minimum confidence"
        />
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={localMax}
          onChange={(e) => {
            const value = parseInt(e.target.value);
            setLocalMax(Math.max(value, localMin + 1));
          }}
          onMouseUp={commitChange}
          onKeyUp={commitChange}
          disabled={disabled}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          style={{ zIndex: getThumbZIndex('max') }}
          aria-label="Maximum confidence"
        />
      </div>
    </div>
  );
}
