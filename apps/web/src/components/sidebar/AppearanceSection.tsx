/**
 * AppearanceSection Component
 * Collapsible section for canvas appearance settings
 */

import { ChevronDown, Palette, RotateCcw } from 'lucide-react';
import type { AppearanceSectionProps } from './types';

export function AppearanceSection({
  settings,
  defaults,
  onChange,
  isExpanded,
  onToggle,
}: AppearanceSectionProps) {
  // Toggle control helper
  const Toggle = ({
    label,
    checked,
    onToggle: handleToggle,
  }: {
    label: string;
    checked: boolean;
    onToggle: () => void;
  }) => (
    <div className="flex items-center justify-between">
      <span className="text-xs text-gray-600">{label}</span>
      <button
        type="button"
        onClick={handleToggle}
        className={`
          w-9 h-5 rounded-full transition-colors relative
          ${checked ? 'bg-emerald-500' : 'bg-gray-300'}
        `}
      >
        <div
          className={`
            absolute top-0.5 w-4 h-4 rounded-full bg-white shadow
            transform transition-transform
            ${checked ? 'left-4' : 'left-0.5'}
          `}
        />
      </button>
    </div>
  );

  // Slider control helper
  const Slider = ({
    label,
    value,
    min,
    max,
    step,
    unit,
    onChange: handleChange,
  }: {
    label: string;
    value: number;
    min: number;
    max: number;
    step: number;
    unit: string;
    onChange: (value: number) => void;
  }) => {
    const percentage = ((value - min) / (max - min)) * 100;

    return (
      <div>
        <label className="text-xs text-gray-600 flex justify-between mb-1">
          <span>{label}</span>
          <span className="font-medium text-gray-900">
            {value}{unit}
          </span>
        </label>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => handleChange(parseFloat(e.target.value))}
          className="w-full h-1.5 rounded-lg appearance-none cursor-pointer"
          style={{
            background: `linear-gradient(to right, rgb(16, 185, 129) 0%, rgb(16, 185, 129) ${percentage}%, rgb(209, 213, 219) ${percentage}%, rgb(209, 213, 219) 100%)`,
          }}
        />
      </div>
    );
  };

  return (
    <div className="border-t border-gray-200">
      {/* Section Header */}
      <button
        onClick={onToggle}
        className="w-full px-3 py-2.5 flex items-center justify-between hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
          <Palette className="w-4 h-4" />
          Appearance
        </div>
        <ChevronDown
          className={`w-4 h-4 text-gray-500 transition-transform ${
            isExpanded ? '' : '-rotate-90'
          }`}
        />
      </button>

      {/* Section Content */}
      {isExpanded && (
        <div className="px-3 pb-3 space-y-3">
          {/* Fill Opacity Slider */}
          <Slider
            label="Fill Opacity"
            value={settings.fillOpacity}
            min={0}
            max={100}
            step={5}
            unit="%"
            onChange={(value) => onChange({ ...settings, fillOpacity: value })}
          />

          {/* Selected Opacity Slider */}
          <Slider
            label="Selected Opacity"
            value={settings.selectedOpacity}
            min={0}
            max={100}
            step={5}
            unit="%"
            onChange={(value) => onChange({ ...settings, selectedOpacity: value })}
          />

          {/* Stroke Width Slider */}
          <Slider
            label="Border Width"
            value={settings.strokeWidth}
            min={1}
            max={6}
            step={0.5}
            unit="px"
            onChange={(value) => onChange({ ...settings, strokeWidth: value })}
          />

          {/* Toggles */}
          <Toggle
            label="Show Labels"
            checked={settings.showLabels}
            onToggle={() => onChange({ ...settings, showLabels: !settings.showLabels })}
          />

          <Toggle
            label="Show Polygons"
            checked={settings.showPolygons}
            onToggle={() => onChange({ ...settings, showPolygons: !settings.showPolygons })}
          />

          <Toggle
            label="Show Boxes"
            checked={settings.showRectangles}
            onToggle={() => onChange({ ...settings, showRectangles: !settings.showRectangles })}
          />

          <Toggle
            label="Hover Tooltip"
            checked={settings.showHoverTooltips}
            onToggle={() => onChange({ ...settings, showHoverTooltips: !settings.showHoverTooltips })}
          />

          {/* Reset Button */}
          <button
            type="button"
            onClick={() => onChange({ ...defaults })}
            className="
              w-full py-1.5 text-xs font-medium rounded transition-colors
              text-gray-700 hover:text-gray-900 hover:bg-gray-100
              flex items-center justify-center gap-1.5
            "
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset to defaults
          </button>
        </div>
      )}
    </div>
  );
}

export default AppearanceSection;
