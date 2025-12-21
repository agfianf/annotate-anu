import type { SizeDistribution } from '@/lib/data-management-client';

interface QuickFiltersProps {
  sizeDistribution: SizeDistribution;
  selectedSizes: ('small' | 'medium' | 'large')[];
  onToggleSize: (size: 'small' | 'medium' | 'large') => void;
}

const SIZE_CONFIG = {
  small: { label: 'Small', description: '<0.5 MP', icon: '🔸' },
  medium: { label: 'Medium', description: '0.5-2 MP', icon: '🔶' },
  large: { label: 'Large', description: '>2 MP', icon: '🟠' },
} as const;

export function QuickFilters({
  sizeDistribution,
  selectedSizes,
  onToggleSize,
}: QuickFiltersProps) {
  const total = sizeDistribution.small + sizeDistribution.medium + sizeDistribution.large;

  if (total === 0) {
    return null;
  }

  return (
    <div className="space-y-1">
      {(['small', 'medium', 'large'] as const).map((size) => {
        const config = SIZE_CONFIG[size];
        const count = sizeDistribution[size];
        const isSelected = selectedSizes.includes(size);
        const percentage = total > 0 ? ((count / total) * 100).toFixed(0) : '0';

        return (
          <button
            key={size}
            onClick={() => onToggleSize(size)}
            className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm transition-all border ${
              isSelected
                ? 'bg-emerald-100 text-emerald-900 border-emerald-200'
                : 'hover:bg-emerald-50 text-emerald-900/70 hover:text-emerald-900 border-transparent'
            }`}
          >
            <span className="text-base">{config.icon}</span>
            <span className="flex-1 text-left font-medium">{config.label}</span>
            <span className="text-xs text-emerald-900/40">{config.description}</span>
            <div className="flex items-center gap-1 min-w-[60px] justify-end">
              <div className="w-12 h-1.5 bg-emerald-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    isSelected ? 'bg-emerald-500' : 'bg-emerald-300'
                  }`}
                  style={{ width: `${percentage}%` }}
                />
              </div>
              <span className="text-xs text-emerald-900/50 w-8 text-right">{count}</span>
            </div>
          </button>
        );
      })}

      {selectedSizes.length > 0 && (
        <button
          onClick={() => selectedSizes.forEach(onToggleSize)}
          className="w-full mt-2 text-xs text-emerald-600 hover:text-emerald-500 py-1 transition-colors"
        >
          Clear size filter
        </button>
      )}
    </div>
  );
}
