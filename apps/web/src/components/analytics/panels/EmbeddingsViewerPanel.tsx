/**
 * Embeddings Viewer Panel
 * 2D scatter plot visualization of image embeddings
 */

import type { PanelProps } from '@/types/analytics';

export default function EmbeddingsViewerPanel({
  projectId,
  filters,
  onFilterUpdate,
}: PanelProps) {
  return (
    <div className="flex items-center justify-center h-full p-8">
      <div className="text-center">
        <h3 className="text-lg font-medium text-gray-900">Embeddings Viewer</h3>
        <p className="text-sm text-gray-500 mt-2">
          Coming in Phase 4
        </p>
        <p className="text-xs text-gray-400 mt-4">
          2D scatter plot with UMAP/t-SNE reduction
        </p>
      </div>
    </div>
  );
}
