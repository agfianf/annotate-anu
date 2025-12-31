/**
 * React Query hook for fetching class balance analytics
 */

import { useQuery } from '@tanstack/react-query';
import type { ClassBalanceResponse } from '@/types/analytics';
import type { ExploreFilters } from '@/lib/data-management-client';
import { analyticsApi } from '@/lib/analytics-client';

interface UseClassBalanceOptions {
  projectId: string;
  filters: ExploreFilters;
  enabled?: boolean;
}

/**
 * Hook to fetch class balance analytics
 * Automatically refetches when filters change
 */
export function useClassBalance({
  projectId,
  filters,
  enabled = true,
}: UseClassBalanceOptions) {
  return useQuery<ClassBalanceResponse>({
    queryKey: ['class-balance', projectId, filters],
    queryFn: () => analyticsApi.getClassBalance(projectId, filters),
    enabled: enabled && !!projectId,
    staleTime: 60000, // Cache for 1 minute
    gcTime: 300000, // Keep in cache for 5 minutes
  });
}
