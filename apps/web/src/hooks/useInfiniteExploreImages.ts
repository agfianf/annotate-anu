/**
 * Infinite query hook for exploring project images
 * Uses TanStack Query's useInfiniteQuery for smooth infinite scroll
 */

import { useInfiniteQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import {
  projectImagesApi,
  type ExploreFilters,
  type SharedImage,
  type ExploreResponse,
} from '../lib/data-management-client';

interface UseInfiniteExploreImagesOptions {
  projectId: string;
  filters: ExploreFilters;
  pageSize?: number;
  enabled?: boolean;
}

interface UseInfiniteExploreImagesResult {
  /** Flattened array of all loaded images */
  images: SharedImage[];
  /** Total count of images matching filters */
  total: number;
  /** Whether initial data is loading */
  isLoading: boolean;
  /** Whether more pages are being fetched */
  isFetchingNextPage: boolean;
  /** Whether there are more pages to fetch */
  hasNextPage: boolean;
  /** Fetch the next page of images */
  fetchNextPage: () => void;
  /** Refetch all pages */
  refetch: () => void;
  /** Error if any occurred */
  error: Error | null;
}

export function useInfiniteExploreImages({
  projectId,
  filters,
  pageSize = 100,
  enabled = true,
}: UseInfiniteExploreImagesOptions): UseInfiniteExploreImagesResult {
  const query = useInfiniteQuery({
    queryKey: ['project-explore-infinite', projectId, filters],
    queryFn: async ({ pageParam }): Promise<ExploreResponse> => {
      const response = await projectImagesApi.explore(projectId, {
        ...filters,
        page: pageParam,
        page_size: pageSize,
      });
      return response;
    },
    getNextPageParam: (lastPage) => {
      const { page, page_size, total } = lastPage;
      const hasMore = page * page_size < total;
      return hasMore ? page + 1 : undefined;
    },
    initialPageParam: 1,
    enabled: enabled && !!projectId,
    staleTime: 30000, // 30 seconds before refetch
    gcTime: 5 * 60 * 1000, // 5 minutes garbage collection
  });

  // Flatten all pages into a single array
  const images = useMemo(() => {
    if (!query.data?.pages) return [];
    return query.data.pages.flatMap((page) => page.images);
  }, [query.data?.pages]);

  // Get total from first page
  const total = query.data?.pages[0]?.total ?? 0;

  return {
    images,
    total,
    isLoading: query.isLoading,
    isFetchingNextPage: query.isFetchingNextPage,
    hasNextPage: query.hasNextPage ?? false,
    fetchNextPage: query.fetchNextPage,
    refetch: query.refetch,
    error: query.error,
  };
}
