/**
 * React Query hook for fetching annotation coverage analytics
 */

import { useQuery } from '@tanstack/react-query';
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
 * Automatically refetches when filters change
 */
export function useAnnotationCoverage({
  projectId,
  filters,
  enabled = true,
}: UseAnnotationCoverageOptions) {
  return useQuery<AnnotationCoverageResponse>({
    queryKey: ['annotation-coverage', projectId, filters],
    queryFn: () => analyticsApi.getAnnotationCoverage(projectId, filters),
    enabled: enabled && !!projectId,
    staleTime: 60000, // Cache for 1 minute
    gcTime: 300000, // Keep in cache for 5 minutes
  });
}
