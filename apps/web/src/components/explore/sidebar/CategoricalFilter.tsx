import type { CategoricalAggregation } from '@/lib/data-management-client';
import { List } from 'lucide-react';
import { SidebarSection } from './SidebarSection';

interface CategoricalFilterProps {
  aggregation: CategoricalAggregation;
  selectedValues: string[];
  onToggleValue: (value: string) => void;
}

export function CategoricalFilter({
  aggregation,
  selectedValues,
  onToggleValue,
}: CategoricalFilterProps) {
  if (aggregation.values.length === 0) {
    return null;
  }

  const title = aggregation.display_name || aggregation.name;
  const totalCount = aggregation.values.reduce((sum, v) => sum + v.count, 0);

  return (
    <SidebarSection
      title={title}
      icon={<List className="h-4 w-4" />}
      count={totalCount}
    >
      <div className="space-y-1 max-h-48 overflow-y-auto">
        {aggregation.values.map((item) => {
          const isSelected = selectedValues.includes(item.value);
          return (
            <label
              key={item.value}
              className="flex items-center gap-2 cursor-pointer hover:bg-white/5 px-2 py-1 rounded text-sm group"
            >
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => onToggleValue(item.value)}
                className="rounded border-white/30 bg-white/10 text-emerald-500 focus:ring-emerald-500/50"
              />
              <span
                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: aggregation.color }}
              />
              <span className="flex-1 truncate text-white/80 group-hover:text-white">
                {item.value}
              </span>
              <span className="text-xs text-white/50">{item.count}</span>
            </label>
          );
        })}
      </div>
    </SidebarSection>
  );
}
