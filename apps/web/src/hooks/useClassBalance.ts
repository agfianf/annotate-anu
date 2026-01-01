/**
 * React Query hook for fetching class balance analytics
 */

import { useQuery, keepPreviousData } from '@tanstack/react-query';
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
 * Shows FULL dataset stats (does not refetch when filters change)
 */
export function useClassBalance({
  projectId,
  filters: _filters, // Unused - analytics shows full dataset
  enabled = true,
}: UseClassBalanceOptions) {
  return useQuery<ClassBalanceResponse>({
    queryKey: ['class-balance', projectId], // No filters in key
    queryFn: () => analyticsApi.getClassBalance(projectId, {}),
    enabled: enabled && !!projectId,
    staleTime: 300000, // Cache for 5 minutes (static data)
    gcTime: 600000, // Keep in cache for 10 minutes
  });
}
