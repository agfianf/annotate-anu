/**
 * Image Quality Panel
 * Detects blurry, dark, corrupted images (compact version)
 */

import { Eye, AlertCircle, Camera } from 'lucide-react';

import type { PanelProps } from '@/types/analytics';
import { useImageQuality } from '@/hooks/useImageQuality';
import {
  PanelContainer,
  PanelLoadingState,
  PanelErrorState,
  StatsGrid,
  StatCard,
  ComingSoonState,
} from '../shared/PanelComponents';

/**
 * Image Quality Panel Component
 */
export default function ImageQualityPanel({
  projectId,
  filters,
  onFilterUpdate,
}: PanelProps) {
  const { data, isLoading, error } = useImageQuality({
    projectId,
    filters,
    enabled: !!projectId,
  });

  if (isLoading) return <PanelLoadingState message="Analyzing quality..." />;
  if (error) return <PanelErrorState message={(error as Error).message} />;

  // Check if we have actual data (not stub)
  const hasRealData = data && data.quality_distribution.length > 0 && data.flagged_images.length > 0;

  if (!hasRealData) {
    return (
      <PanelContainer>
        <ComingSoonState
          icon={Eye}
          title="Image Quality - Coming Soon"
          description="Auto-detect quality issues in your dataset"
          features={[
            'Blur detection (Laplacian variance)',
            'Brightness analysis (dark/overexposed)',
            'Corruption detection',
            'Duplicate detection (pHash)',
            'Quality score (0-100)',
          ]}
        />
      </PanelContainer>
    );
  }

  // Real data view
  return (
    <PanelContainer>
      {/* Quality Issue Cards */}
      <StatsGrid>
        <StatCard
          icon={Camera}
          label="Blurry"
          value={data.issue_breakdown.blur_detected}
          color="red"
        />
        <StatCard
          icon={Eye}
          label="Dark"
          value={data.issue_breakdown.low_brightness}
          color="orange"
        />
        <StatCard
          icon={Eye}
          label="Overexposed"
          value={data.issue_breakdown.high_brightness}
          color="yellow"
        />
        <StatCard
          icon={AlertCircle}
          label="Corrupted"
          value={data.issue_breakdown.corrupted}
          color="purple"
        />
      </StatsGrid>

      {/* Flagged Images List */}
      <div className="p-3 rounded-lg border border-gray-200/50 bg-white/80">
        <div className="flex items-center gap-2 mb-2">
          <AlertCircle className="w-3.5 h-3.5 text-red-500" />
          <h3 className="text-xs font-semibold text-gray-700">
            Flagged ({data.flagged_images.length})
          </h3>
        </div>
        <div className="space-y-1 max-h-[200px] overflow-y-auto">
          {data.flagged_images.slice(0, 10).map((image) => (
            <div
              key={image.image_id}
              className="flex items-center justify-between p-2 bg-gray-50 rounded hover:bg-gray-100 transition-colors cursor-pointer text-xs"
            >
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-700 truncate">{image.filename}</p>
                <p className="text-[10px] text-gray-500">{image.issues.join(', ')}</p>
              </div>
              <span className={`ml-2 font-semibold ${
                image.quality_score < 0.3 ? 'text-red-600' :
                image.quality_score < 0.6 ? 'text-orange-600' : 'text-green-600'
              }`}>
                {(image.quality_score * 100).toFixed(0)}%
              </span>
            </div>
          ))}
        </div>
      </div>
    </PanelContainer>
  );
}
