/**
 * React Query hook for fetching dataset statistics
 */

import { useQuery } from '@tanstack/react-query';
import type { DatasetStatsResponse } from '@/types/analytics';
import type { ExploreFilters } from '@/lib/data-management-client';
import { analyticsApi } from '@/lib/analytics-client';

interface UseDatasetStatsOptions {
  projectId: string;
  filters: ExploreFilters;
  enabled?: boolean;
}

/**
 * Hook to fetch dataset statistics for analytics panel
 * Automatically refetches when filters change
 */
export function useDatasetStats({
  projectId,
  filters,
  enabled = true,
}: UseDatasetStatsOptions) {
  return useQuery({
    queryKey: ['dataset-stats', projectId, filters],
    queryFn: () => analyticsApi.getDatasetStats(projectId, filters),
    enabled: enabled && !!projectId,
    staleTime: 60000, // Cache for 1 minute
    gcTime: 300000, // Keep in cache for 5 minutes
  });
}
