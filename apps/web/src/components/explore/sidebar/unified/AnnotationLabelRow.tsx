import { useState, useRef } from 'react';
import { VisibilityToggleButton } from '@/components/ui/VisibilityToggleButton';
import { ColorPickerPopup } from '@/components/ui/ColorPickerPopup';
import { ConfidenceRangeSlider } from './ConfidenceRangeSlider';
import type { LabelConfidenceFilter } from '@/hooks/useAnnotationFilters';
import type { Label } from '@/types/annotations';

interface AnnotationLabelRowProps {
  label: Label;
  filter: LabelConfidenceFilter | undefined;
  onConfidenceRangeChange: (min: number, max: number) => void;
  onToggleVisibility: () => void;
  onColorChange?: (color: string) => void;
}

/**
 * Row component for annotation labels with confidence range slider
 */
export function AnnotationLabelRow({
  label,
  filter,
  onConfidenceRangeChange,
  onToggleVisibility,
  onColorChange,
}: AnnotationLabelRowProps) {
  const [isBorderHovered, setIsBorderHovered] = useState(false);
  const [isColorPickerOpen, setIsColorPickerOpen] = useState(false);
  const borderRef = useRef<HTMLDivElement>(null);

  const isVisible = filter?.isVisible ?? true;
  const minConfidence = filter?.minConfidence ?? 0;
  const maxConfidence = filter?.maxConfidence ?? 100;
  const isFiltered = minConfidence !== 0 || maxConfidence !== 100;

  const handleBorderClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onColorChange) {
      setIsColorPickerOpen(true);
    }
  };

  return (
    <div className="relative flex flex-col">
      {/* Main row */}
      <div className="flex items-center gap-2 py-1.5 px-2 hover:bg-gray-50 transition-colors">
        {/* Color border indicator */}
        <div
          ref={borderRef}
          className="relative flex-shrink-0 h-8 cursor-pointer transition-all duration-150"
          style={{
            width: isBorderHovered || isColorPickerOpen ? '8px' : '3px',
            backgroundColor: label.color,
            borderRadius: '2px',
          }}
          onMouseEnter={() => setIsBorderHovered(true)}
          onMouseLeave={() => setIsBorderHovered(false)}
          onClick={handleBorderClick}
          title={onColorChange ? 'Click to change color' : undefined}
        />

        {/* Label name and confidence slider */}
        <div className="flex-1 min-w-0 flex flex-col gap-1">
          <div className="flex items-center justify-between gap-2">
            <span
              className={`text-xs font-medium truncate ${
                isVisible ? 'text-gray-700' : 'text-gray-400'
              }`}
              title={label.name}
            >
              {label.name}
            </span>

            {/* Filter indicator */}
            {isFiltered && (
              <span className="text-[10px] text-cyan-600 font-medium flex-shrink-0">
                {minConfidence}-{maxConfidence}%
              </span>
            )}
          </div>

          {/* Confidence range slider */}
          <ConfidenceRangeSlider
            min={minConfidence}
            max={maxConfidence}
            onChange={onConfidenceRangeChange}
            disabled={!isVisible}
            accentColor={label.color}
          />
        </div>

        {/* Visibility toggle */}
        <div className="flex-shrink-0">
          <VisibilityToggleButton
            isVisible={isVisible}
            onToggle={onToggleVisibility}
            size="sm"
            colorTheme="cyan"
          />
        </div>
      </div>

      {/* Color picker popup */}
      {onColorChange && (
        <ColorPickerPopup
          selectedColor={label.color}
          onColorChange={(newColor) => {
            onColorChange(newColor);
            setIsColorPickerOpen(false);
          }}
          isOpen={isColorPickerOpen}
          onClose={() => setIsColorPickerOpen(false)}
          anchorEl={borderRef.current}
        />
      )}
    </div>
  );
}
