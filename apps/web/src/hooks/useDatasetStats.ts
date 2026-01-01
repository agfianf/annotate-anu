/**
 * React Query hook for fetching dataset statistics
 */

import { useQuery, keepPreviousData } from '@tanstack/react-query';
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
 * Shows FULL dataset stats (does not refetch when filters change)
 * Only the image gallery should update on filter - charts stay static
 */
export function useDatasetStats({
  projectId,
  filters: _filters, // Unused - analytics shows full dataset
  enabled = true,
}: UseDatasetStatsOptions) {
  return useQuery({
    queryKey: ['dataset-stats', projectId], // No filters in key - always show full dataset
    queryFn: () => analyticsApi.getDatasetStats(projectId, {}), // Empty filters = full dataset
    enabled: enabled && !!projectId,
    staleTime: 300000, // Cache for 5 minutes (static data)
    gcTime: 600000, // Keep in cache for 10 minutes
  });
}
