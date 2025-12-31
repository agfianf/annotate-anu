/**
 * React Query hook for fetching spatial heatmap analytics
 */

import { useQuery } from '@tanstack/react-query';
import type { SpatialHeatmapResponse } from '@/types/analytics';
import type { ExploreFilters } from '@/lib/data-management-client';
import { analyticsApi } from '@/lib/analytics-client';

interface UseSpatialHeatmapOptions {
  projectId: string;
  filters: ExploreFilters;
  enabled?: boolean;
}

/**
 * Hook to fetch spatial heatmap analytics
 * Automatically refetches when filters change
 */
export function useSpatialHeatmap({
  projectId,
  filters,
  enabled = true,
}: UseSpatialHeatmapOptions) {
  return useQuery<SpatialHeatmapResponse>({
    queryKey: ['spatial-heatmap', projectId, filters],
    queryFn: () => analyticsApi.getSpatialHeatmap(projectId, filters),
    enabled: enabled && !!projectId,
    staleTime: 60000, // Cache for 1 minute
    gcTime: 300000, // Keep in cache for 5 minutes
  });
}
