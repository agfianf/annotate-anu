/**
 * React Query hook for fetching enhanced dataset statistics (consolidated)
 * Combines: Dataset Stats + Dimension Insights + Class Balance + Image Quality
 */

import { useQuery } from '@tanstack/react-query';
import type { EnhancedDatasetStatsResponse } from '@/types/analytics';
import type { ExploreFilters } from '@/lib/data-management-client';
import { analyticsApi } from '@/lib/analytics-client';

interface UseEnhancedDatasetStatsOptions {
  projectId: string;
  filters: ExploreFilters;
  categoryId?: string | null;
  enabled?: boolean;
}

/**
 * Hook to fetch enhanced dataset statistics for the consolidated analytics panel
 * Shows full dataset stats (does not refetch when filters change)
 */
export function useEnhancedDatasetStats({
  projectId,
  filters: _filters, // Unused - analytics shows full dataset
  categoryId,
  enabled = true,
}: UseEnhancedDatasetStatsOptions) {
  return useQuery({
    queryKey: ['enhanced-dataset-stats', projectId, categoryId],
    queryFn: () => analyticsApi.getEnhancedDatasetStats(projectId, {}, categoryId),
    enabled: enabled && !!projectId,
    staleTime: 300000, // Cache for 5 minutes
    gcTime: 600000, // Keep in cache for 10 minutes
  });
}
