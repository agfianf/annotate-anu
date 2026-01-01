/**
 * React Query hook for fetching annotation coverage analytics
 */

import { useQuery, keepPreviousData } from '@tanstack/react-query';
import type { AnnotationCoverageResponse } from '@/types/analytics';
import type { ExploreFilters } from '@/lib/data-management-client';
import { analyticsApi } from '@/lib/analytics-client';

interface UseAnnotationCoverageOptions {
  projectId: string;
  filters: ExploreFilters;
  enabled?: boolean;
}

/**
 * Hook to fetch annotation coverage analytics
 * Shows FULL dataset stats (does not refetch when filters change)
 */
export function useAnnotationCoverage({
  projectId,
  filters: _filters, // Unused - analytics shows full dataset
  enabled = true,
}: UseAnnotationCoverageOptions) {
  return useQuery<AnnotationCoverageResponse>({
    queryKey: ['annotation-coverage', projectId], // No filters in key
    queryFn: () => analyticsApi.getAnnotationCoverage(projectId, {}),
    enabled: enabled && !!projectId,
    staleTime: 300000, // Cache for 5 minutes (static data)
    gcTime: 600000, // Keep in cache for 10 minutes
  });
}
