/**
 * React Query hook for fetching class balance analytics
 */

import { useQuery, keepPreviousData } from '@tanstack/react-query';
import type { ClassBalanceResponse } from '@/types/analytics';
import type { ExploreFilters } from '@/lib/data-management-client';
import { analyticsApi } from '@/lib/analytics-client';

interface UseClassBalanceOptions {
  projectId: string;
  filters?: ExploreFilters;
  categoryId?: string | null;
  enabled?: boolean;
}

/**
 * Hook to fetch class balance analytics
 * Supports per-category analysis via categoryId parameter
 * Shows FULL dataset stats when categoryId is null/undefined
 */
export function useClassBalance({
  projectId,
  filters = {},
  categoryId = null,
  enabled = true,
}: UseClassBalanceOptions) {
  return useQuery<ClassBalanceResponse>({
    queryKey: ['class-balance', projectId, categoryId], // Category in key for caching
    queryFn: () => analyticsApi.getClassBalance(projectId, filters, categoryId),
    enabled: enabled && !!projectId,
    staleTime: 300000, // Cache for 5 minutes (static data)
    gcTime: 600000, // Keep in cache for 10 minutes
    placeholderData: keepPreviousData, // Show previous data while fetching new category
  });
}
