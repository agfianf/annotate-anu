/**
 * Prediction Analysis Panel
 * Displays accuracy, precision/recall curves, error distribution
 */

import type { PanelProps } from '@/types/analytics';

export default function PredictionAnalysisPanel({
  projectId,
  filters,
  onFilterUpdate,
}: PanelProps) {
  return (
    <div className="flex items-center justify-center h-full p-8">
      <div className="text-center">
        <h3 className="text-lg font-medium text-gray-900">Prediction Analysis</h3>
        <p className="text-sm text-gray-500 mt-2">
          Coming in Phase 4
        </p>
        <p className="text-xs text-gray-400 mt-4">
          Requires active job filter
        </p>
      </div>
    </div>
  );
}
