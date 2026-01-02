/**
 * React Query hook for fetching annotation analysis (consolidated)
 * Combines: Annotation Coverage + Spatial Heatmap
 */

import { useQuery } from '@tanstack/react-query';
import type { AnnotationAnalysisResponse } from '@/types/analytics';
import type { ExploreFilters } from '@/lib/data-management-client';
import { analyticsApi } from '@/lib/analytics-client';

interface UseAnnotationAnalysisOptions {
  projectId: string;
  filters: ExploreFilters;
  gridSize?: number;
  enabled?: boolean;
}

/**
 * Hook to fetch annotation analysis for the consolidated analytics panel
 * Shows full dataset stats (does not refetch when filters change)
 */
export function useAnnotationAnalysis({
  projectId,
  filters: _filters, // Unused - analytics shows full dataset
  gridSize = 10,
  enabled = true,
}: UseAnnotationAnalysisOptions) {
  return useQuery({
    queryKey: ['annotation-analysis', projectId, gridSize],
    queryFn: () => analyticsApi.getAnnotationAnalysis(projectId, {}, gridSize),
    enabled: enabled && !!projectId,
    staleTime: 300000, // Cache for 5 minutes
    gcTime: 600000, // Keep in cache for 10 minutes
  });
}
