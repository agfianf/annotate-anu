/**
 * React Query hook for fetching image quality analytics
 */

import { useQuery } from '@tanstack/react-query';
import type { ImageQualityResponse } from '@/types/analytics';
import type { ExploreFilters } from '@/lib/data-management-client';
import { analyticsApi } from '@/lib/analytics-client';

interface UseImageQualityOptions {
  projectId: string;
  filters: ExploreFilters;
  enabled?: boolean;
}

/**
 * Hook to fetch image quality analytics
 * Automatically refetches when filters change
 */
export function useImageQuality({
  projectId,
  filters,
  enabled = true,
}: UseImageQualityOptions) {
  return useQuery<ImageQualityResponse>({
    queryKey: ['image-quality', projectId, filters],
    queryFn: () => analyticsApi.getImageQuality(projectId, filters),
    enabled: enabled && !!projectId,
    staleTime: 60000, // Cache for 1 minute
    gcTime: 300000, // Keep in cache for 5 minutes
  });
}
