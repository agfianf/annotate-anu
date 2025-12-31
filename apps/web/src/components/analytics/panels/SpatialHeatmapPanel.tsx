/**
 * Spatial Heatmap Panel
 * Shows spatial distribution of annotations (compact version)
 */

import { MapPin, Target, Grid3X3 } from 'lucide-react';

import type { PanelProps } from '@/types/analytics';
import { useSpatialHeatmap } from '@/hooks/useSpatialHeatmap';
import {
  PanelContainer,
  PanelLoadingState,
  PanelErrorState,
  StatsGrid3,
  StatCard,
  ComingSoonState,
} from '../shared/PanelComponents';

/**
 * Spatial Heatmap Panel Component
 */
export default function SpatialHeatmapPanel({
  projectId,
  filters,
  onFilterUpdate,
}: PanelProps) {
  const { data, isLoading, error } = useSpatialHeatmap({
    projectId,
    filters,
    enabled: !!projectId,
  });

  if (isLoading) return <PanelLoadingState message="Loading heatmap..." />;
  if (error) return <PanelErrorState message={(error as Error).message} />;

  // Check if we have actual data (not stub)
  const hasRealData = data && data.total_annotations > 0 && data.annotation_points.length > 0;

  if (!hasRealData) {
    return (
      <PanelContainer>
        <ComingSoonState
          icon={MapPin}
          title="Spatial Heatmap - Coming Soon"
          description="Visualize annotation clustering patterns"
          features={[
            '2D heatmap (normalized coordinates)',
            'Center of mass with std deviation',
            'Clustering score metric',
            'Drag-to-select region filtering',
          ]}
        />
      </PanelContainer>
    );
  }

  // Real data view
  return (
    <PanelContainer>
      {/* Stats Cards */}
      <StatsGrid3>
        <StatCard
          icon={MapPin}
          label="Annotations"
          value={data.total_annotations}
          color="blue"
        />
        <StatCard
          icon={Target}
          label="Center"
          value={`${data.center_of_mass.x.toFixed(2)}, ${data.center_of_mass.y.toFixed(2)}`}
          color="emerald"
        />
        <StatCard
          icon={Grid3X3}
          label="Clustering"
          value={data.clustering_score.toFixed(2)}
          color="purple"
        />
      </StatsGrid3>

      {/* Heatmap Placeholder */}
      <div className="p-3 rounded-lg border border-purple-200/50 bg-white/80">
        <div className="flex items-center gap-2 mb-2">
          <MapPin className="w-3.5 h-3.5 text-purple-600" />
          <h3 className="text-xs font-semibold text-gray-700">Annotation Heatmap</h3>
        </div>
        <div className="aspect-square bg-gradient-to-br from-purple-50 to-emerald-50 rounded-lg flex items-center justify-center">
          <p className="text-xs text-gray-500">Heatmap visualization</p>
        </div>
      </div>
    </PanelContainer>
  );
}
