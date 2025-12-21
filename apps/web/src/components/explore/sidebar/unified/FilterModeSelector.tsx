import { Settings, ChevronDown, ChevronRight } from 'lucide-react';
import React, { useState } from 'react';

interface FilterModeSelectorProps {
  includeMode: 'AND' | 'OR';
  excludeMode: 'AND' | 'OR';
  onIncludeModeChange: (mode: 'AND' | 'OR') => void;
  onExcludeModeChange: (mode: 'AND' | 'OR') => void;
  hasIncludedTags: boolean;
  hasExcludedTags: boolean;
}

export function FilterModeSelector({
  includeMode,
  excludeMode,
  onIncludeModeChange,
  onExcludeModeChange,
  hasIncludedTags,
  hasExcludedTags,
}: FilterModeSelectorProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const color = '#6B7280'; // gray-500

  return (
    <div
      className="border-b border-gray-100 group transition-colors"
      style={{ borderLeftWidth: '3px', borderLeftColor: color }}
    >
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex flex-1 w-full items-center justify-between px-3 py-2.5 text-xs font-mono text-gray-900/80 hover:bg-gray-50 transition-colors uppercase tracking-wider"
      >
        <div className="flex items-center gap-2">
          <span className="opacity-70 group-hover:opacity-100 transition-opacity">
            <Settings className="h-3.5 w-3.5" />
          </span>
          <span className="font-bold">Configuration</span>
        </div>
        {isExpanded ? (
          <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-gray-400" />
        )}
      </button>

      {/* Content */}
      {isExpanded && (
        <div className="px-3 pb-3 pt-1 bg-gray-50/20 animate-in slide-in-from-top-1 duration-200 space-y-2">
          {/* Include Match Mode */}
          {hasIncludedTags && (
            <div className="flex items-center justify-between text-xs">
              <span className="text-orange-600 font-medium">Include Mode:</span>
              <div className="flex gap-1">
                <button
                  onClick={() => onIncludeModeChange('OR')}
                  className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${
                    includeMode === 'OR'
                      ? 'bg-orange-500 text-white'
                      : 'bg-orange-50 text-orange-600 hover:bg-orange-100'
                  }`}
                >
                  ANY
                </button>
                <button
                  onClick={() => onIncludeModeChange('AND')}
                  className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${
                    includeMode === 'AND'
                      ? 'bg-orange-500 text-white'
                      : 'bg-orange-50 text-orange-600 hover:bg-orange-100'
                  }`}
                >
                  ALL
                </button>
              </div>
            </div>
          )}

          {/* Exclude Match Mode */}
          {hasExcludedTags && (
            <div className="flex items-center justify-between text-xs">
              <span className="text-red-600 font-medium">Exclude Mode:</span>
              <div className="flex gap-1">
                <button
                  onClick={() => onExcludeModeChange('OR')}
                  className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${
                    excludeMode === 'OR'
                      ? 'bg-red-500 text-white'
                      : 'bg-red-50 text-red-600 hover:bg-red-100'
                  }`}
                >
                  ANY
                </button>
                <button
                  onClick={() => onExcludeModeChange('AND')}
                  className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${
                    excludeMode === 'AND'
                      ? 'bg-red-500 text-white'
                      : 'bg-red-50 text-red-600 hover:bg-red-100'
                  }`}
                >
                  ALL
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
