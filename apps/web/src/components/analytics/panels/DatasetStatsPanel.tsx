/**
 * Dataset Statistics Panel
 * Displays tag distribution, dimension stats, and file size info
 */

import type { PanelProps } from '@/types/analytics';

export default function DatasetStatsPanel({
  projectId,
  filters,
  onFilterUpdate,
}: PanelProps) {
  return (
    <div className="flex items-center justify-center h-full p-8">
      <div className="text-center">
        <h3 className="text-lg font-medium text-gray-900">Dataset Statistics</h3>
        <p className="text-sm text-gray-500 mt-2">
          Coming in Phase 2
        </p>
        <p className="text-xs text-gray-400 mt-4">
          Will show: Tag distribution, dimension histogram, file size stats
        </p>
      </div>
    </div>
  );
}
