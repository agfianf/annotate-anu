/**
 * React Query hook for dimension insights analytics
 */

import { useQuery } from '@tanstack/react-query';
import { analyticsApi } from '@/lib/analytics-client';
import type { DimensionInsightsResponse } from '@/types/analytics';
import type { ExploreFilters } from '@/lib/data-management-client';

interface UseDimensionInsightsOptions {
  projectId: string;
  filters?: ExploreFilters;
  enabled?: boolean;
}

export function useDimensionInsights({
  projectId,
  filters = {},
  enabled = true,
}: UseDimensionInsightsOptions) {
  return useQuery<DimensionInsightsResponse>({
    // `filters` is sent to the server, so it must be in the key: without it a filter change reuses the previous panel's cached insights.
    queryKey: ['dimension-insights', projectId, filters],
    queryFn: ({ signal }) => analyticsApi.getDimensionInsights(projectId, filters, signal),
    enabled: enabled && !!projectId,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes (formerly cacheTime)
  });
}
