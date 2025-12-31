/**
 * Model Comparison Panel
 * Side-by-side comparison of multiple models
 */

import type { PanelProps } from '@/types/analytics';

export default function ModelComparisonPanel({
  projectId,
  filters,
  onFilterUpdate,
}: PanelProps) {
  return (
    <div className="flex items-center justify-center h-full p-8">
      <div className="text-center">
        <h3 className="text-lg font-medium text-gray-900">Model Comparison</h3>
        <p className="text-sm text-gray-500 mt-2">
          Coming in Future Phase
        </p>
        <p className="text-xs text-gray-400 mt-4">
          Compare multiple models side-by-side
        </p>
      </div>
    </div>
  );
}
