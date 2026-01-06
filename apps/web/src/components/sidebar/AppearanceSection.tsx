/**
 * AppearanceSection Component
 * Collapsible section for canvas appearance settings
 */

import { useRef, useCallback } from 'react';
import { ChevronDown, Palette, RotateCcw, Sun, AlertTriangle, XCircle } from 'lucide-react';
import type { AppearanceSectionProps, DimLevel, TinyThresholdUnit } from './types';

// Dim level labels for display
const DIM_LEVEL_LABELS: Record<DimLevel, string> = {
  'none': 'None',
  'light': 'Light',
  'subtle': 'Subtle',
  'medium': 'Medium',
  'strong': 'Strong',
  'very-strong': 'Very Strong',
};

// Smooth slider component with CSS-based styling
function SmoothSlider({
  label,
  value,
  min,
  max,
  step,
  unit,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  onChange: (value: number) => void;
}) {
  const sliderRef = useRef<HTMLInputElement>(null);
  const percentage = ((value - min) / (max - min)) * 100;

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(parseFloat(e.target.value));
  }, [onChange]);

  return (
    <div>
      <label className="text-xs text-gray-600 flex justify-between mb-1">
        <span>{label}</span>
        <span className="font-medium text-gray-900 tabular-nums">
          {unit === 'px' ? value.toFixed(1) : value}{unit}
        </span>
      </label>
      <input
        ref={sliderRef}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={handleChange}
        className="appearance-slider w-full h-1.5 rounded-lg appearance-none cursor-pointer bg-gray-300"
        style={{
          '--slider-progress': `${percentage}%`,
        } as React.CSSProperties}
      />
      <style>{`
        .appearance-slider {
          background: linear-gradient(to right,
            rgb(16, 185, 129) 0%,
            rgb(16, 185, 129) var(--slider-progress),
            rgb(209, 213, 219) var(--slider-progress),
            rgb(209, 213, 219) 100%
          );
        }
        .appearance-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 14px;
          height: 14px;
          border-radius: 50%;
          background: white;
          border: 2px solid rgb(16, 185, 129);
          cursor: pointer;
          box-shadow: 0 1px 3px rgba(0,0,0,0.2);
          transition: transform 0.1s ease, box-shadow 0.1s ease;
        }
        .appearance-slider::-webkit-slider-thumb:hover {
          transform: scale(1.1);
          box-shadow: 0 2px 6px rgba(16, 185, 129, 0.4);
        }
        .appearance-slider::-webkit-slider-thumb:active {
          transform: scale(1.15);
          box-shadow: 0 2px 8px rgba(16, 185, 129, 0.5);
        }
        .appearance-slider::-moz-range-thumb {
          width: 14px;
          height: 14px;
          border-radius: 50%;
          background: white;
          border: 2px solid rgb(16, 185, 129);
          cursor: pointer;
          box-shadow: 0 1px 3px rgba(0,0,0,0.2);
          transition: transform 0.1s ease, box-shadow 0.1s ease;
        }
        .appearance-slider::-moz-range-thumb:hover {
          transform: scale(1.1);
        }
        .appearance-slider:focus {
          outline: none;
        }
        .appearance-slider:focus::-webkit-slider-thumb {
          box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.2);
        }
      `}</style>
    </div>
  );
}

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
          <SmoothSlider
            label="Fill Opacity"
            value={settings.fillOpacity}
            min={0}
            max={100}
            step={1}
            unit="%"
            onChange={(value) => onChange({ ...settings, fillOpacity: value })}
          />

          {/* Selected Opacity Slider */}
          <SmoothSlider
            label="Selected Opacity"
            value={settings.selectedOpacity}
            min={0}
            max={100}
            step={1}
            unit="%"
            onChange={(value) => onChange({ ...settings, selectedOpacity: value })}
          />

          {/* Stroke Width Slider */}
          <SmoothSlider
            label="Border Width"
            value={settings.strokeWidth}
            min={1}
            max={6}
            step={0.1}
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
            {/* Header with Unit Toggle */}
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5 text-xs font-medium text-gray-700">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                Tiny Detection
              </div>
              {/* Compact Unit Toggle */}
              <div className="flex rounded overflow-hidden border border-gray-200 text-[10px]">
                <button
                  type="button"
                  onClick={() => onChange({
                    ...settings,
                    tinyThresholdSettings: { ...settings.tinyThresholdSettings, unit: 'percentage' }
                  })}
                  className={`px-1.5 py-0.5 font-medium transition-colors ${
                    settings.tinyThresholdSettings.unit === 'percentage'
                      ? 'bg-emerald-500 text-white'
                      : 'bg-white text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  %
                </button>
                <button
                  type="button"
                  onClick={() => onChange({
                    ...settings,
                    tinyThresholdSettings: { ...settings.tinyThresholdSettings, unit: 'pixels' }
                  })}
                  className={`px-1.5 py-0.5 font-medium transition-colors ${
                    settings.tinyThresholdSettings.unit === 'pixels'
                      ? 'bg-emerald-500 text-white'
                      : 'bg-white text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  k px
                </button>
              </div>
            </div>

            {/* Warning & Critical on same row */}
            <div className="flex gap-2 mb-1.5">
              {/* Warning */}
              <div className="flex-1">
                <label className="text-[10px] text-gray-500 flex items-center gap-1 mb-0.5">
                  <AlertTriangle className="w-2.5 h-2.5 text-amber-500" />
                  Warning
                </label>
                <div className="flex items-center">
                  <input
                    type="number"
                    step={settings.tinyThresholdSettings.unit === 'percentage' ? 0.1 : 0.5}
                    min={0}
                    value={settings.tinyThresholdSettings.unit === 'percentage'
                      ? settings.tinyThresholdSettings.percentageWarning
                      : settings.tinyThresholdSettings.pixelsWarning / 1000
                    }
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      if (!isNaN(val) && val > 0) {
                        const isPercentage = settings.tinyThresholdSettings.unit === 'percentage';
                        onChange({
                          ...settings,
                          tinyThresholdSettings: {
                            ...settings.tinyThresholdSettings,
                            ...(isPercentage
                              ? { percentageWarning: val }
                              : { pixelsWarning: val * 1000 }
                            )
                          }
                        });
                      }
                    }}
                    className="w-full px-1.5 py-1 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-emerald-500 tabular-nums"
                  />
                </div>
              </div>

              {/* Critical */}
              <div className="flex-1">
                <label className="text-[10px] text-gray-500 flex items-center gap-1 mb-0.5">
                  <XCircle className="w-2.5 h-2.5 text-red-500" />
                  Critical
                </label>
                <div className="flex items-center">
                  <input
                    type="number"
                    step={settings.tinyThresholdSettings.unit === 'percentage' ? 0.1 : 0.5}
                    min={0}
                    value={settings.tinyThresholdSettings.unit === 'percentage'
                      ? settings.tinyThresholdSettings.percentageCritical
                      : settings.tinyThresholdSettings.pixelsCritical / 1000
                    }
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      if (!isNaN(val) && val > 0) {
                        const isPercentage = settings.tinyThresholdSettings.unit === 'percentage';
                        onChange({
                          ...settings,
                          tinyThresholdSettings: {
                            ...settings.tinyThresholdSettings,
                            ...(isPercentage
                              ? { percentageCritical: val }
                              : { pixelsCritical: val * 1000 }
                            )
                          }
                        });
                      }
                    }}
                    className={`w-full px-1.5 py-1 text-xs border rounded focus:outline-none focus:ring-1 focus:ring-emerald-500 tabular-nums ${
                      (settings.tinyThresholdSettings.unit === 'percentage'
                        ? settings.tinyThresholdSettings.percentageCritical >= settings.tinyThresholdSettings.percentageWarning
                        : settings.tinyThresholdSettings.pixelsCritical >= settings.tinyThresholdSettings.pixelsWarning
                      )
                        ? 'border-red-400 bg-red-50'
                        : 'border-gray-200'
                    }`}
                  />
                </div>
              </div>
            </div>

            {(settings.tinyThresholdSettings.unit === 'percentage'
              ? settings.tinyThresholdSettings.percentageCritical >= settings.tinyThresholdSettings.percentageWarning
              : settings.tinyThresholdSettings.pixelsCritical >= settings.tinyThresholdSettings.pixelsWarning
            ) && (
              <p className="text-[10px] text-red-600 mb-1">
                Critical must be &lt; Warning
              </p>
            )}

            <p className="text-[10px] text-gray-400">
              {settings.tinyThresholdSettings.unit === 'percentage'
                ? 'Threshold as % of image area'
                : 'Threshold in thousands of pixels (k px)'
              }
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
