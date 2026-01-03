/**
 * AppearanceSection Component
 * Collapsible section for canvas appearance settings
 */

import { ChevronDown, Palette, RotateCcw, Sun, AlertTriangle } from 'lucide-react';
import type { AppearanceSectionProps, DimLevel } from './types';

// Dim level labels for display
const DIM_LEVEL_LABELS: Record<DimLevel, string> = {
  'none': 'None',
  'light': 'Light',
  'subtle': 'Subtle',
  'medium': 'Medium',
  'strong': 'Strong',
  'very-strong': 'Very Strong',
};

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
        <div className="px-3 pb-3 space-y-3 max-h-80 overflow-y-auto">
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

          {/* Divider */}
          <div className="border-t border-gray-200 pt-3">
            <div className="flex items-center gap-1.5 text-xs font-medium text-gray-700 mb-2">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
              Tiny Annotation Detection
            </div>

            {/* Tiny Threshold Input */}
            <div>
              <label className="text-xs text-gray-600 flex justify-between mb-1">
                <span>Tiny Threshold</span>
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step={0.1}
                  value={settings.tinyThreshold}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value)
                    if (!isNaN(val) && val > 0) {
                      onChange({ ...settings, tinyThreshold: val })
                    }
                  }}
                  className={`w-20 px-2 py-1 text-xs border rounded focus:outline-none focus:ring-1 focus:ring-emerald-500 ${
                    settings.tinyThreshold < 0.1 || settings.tinyThreshold > 10
                      ? 'border-amber-400 bg-amber-50'
                      : 'border-gray-200'
                  }`}
                />
                <span className="text-xs text-gray-600">%</span>
              </div>
              {(settings.tinyThreshold < 0.1 || settings.tinyThreshold > 10) && (
                <p className="text-[10px] text-amber-600 mt-1">
                  Recommended range: 0.1% - 10%
                </p>
              )}
            </div>
            <p className="text-[10px] text-gray-500 mt-1">
              Annotations smaller than this % of image area are flagged
            </p>
          </div>

          {/* Highlight Mode Section */}
          <div className="border-t border-gray-200 pt-3">
            <div className="flex items-center gap-1.5 text-xs font-medium text-gray-700 mb-2">
              <Sun className="w-3.5 h-3.5 text-amber-500" />
              Highlight Mode
            </div>

            <Toggle
              label="Enable Highlight Mode"
              checked={settings.highlightMode}
              onToggle={() => onChange({ ...settings, highlightMode: !settings.highlightMode })}
            />

            {/* Dim Level Selector - only shown when highlight mode is enabled */}
            {settings.highlightMode && (
              <div className="mt-2 space-y-1.5">
                <span className="text-xs text-gray-600">Dim Level</span>
                <div className="flex flex-wrap gap-1">
                  {(['light', 'subtle', 'medium', 'strong', 'very-strong'] as const).map((level) => (
                    <button
                      key={level}
                      type="button"
                      onClick={() => onChange({ ...settings, dimLevel: level })}
                      className={`
                        px-2 py-1 text-[10px] rounded transition-colors
                        ${settings.dimLevel === level
                          ? 'bg-emerald-500 text-white'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }
                      `}
                    >
                      {DIM_LEVEL_LABELS[level]}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-gray-500">
                  Dims non-annotated areas to highlight annotations
                </p>
              </div>
            )}
          </div>

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
