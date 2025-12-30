/**
 * FilterTabs Component
 * Three-tab pill selector for filtering annotations (All / Manual / Auto)
 */

import { Sparkles } from 'lucide-react';
import type { FilterTabsProps, FilterMode } from './types';

export function FilterTabs({ filterMode, onFilterChange, counts }: FilterTabsProps) {
  const tabs: { mode: FilterMode; label: string; icon?: React.ReactNode }[] = [
    { mode: 'all', label: 'All' },
    { mode: 'manual', label: 'Manual' },
    { mode: 'auto', label: 'Auto', icon: <Sparkles className="w-3 h-3" /> },
  ];

  return (
    <div className="flex gap-1 p-1 bg-gray-100 rounded-lg">
      {tabs.map(({ mode, label, icon }) => {
        const isActive = filterMode === mode;
        const count = counts[mode];

        return (
          <button
            key={mode}
            onClick={() => onFilterChange(mode)}
            className={`
              flex-1 px-2 py-1.5 text-xs font-medium rounded-md transition-all
              flex items-center justify-center gap-1
              ${isActive
                ? 'bg-white text-emerald-700 shadow-sm'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
              }
            `}
            title={`Show ${label.toLowerCase()} annotations (${count})`}
          >
            {icon}
            <span>{label}</span>
            <span className={`
              ml-1 px-1.5 py-0.5 text-[10px] rounded-full
              ${isActive
                ? 'bg-emerald-100 text-emerald-700'
                : 'bg-gray-200 text-gray-600'
              }
            `}>
              {count}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export default FilterTabs;
