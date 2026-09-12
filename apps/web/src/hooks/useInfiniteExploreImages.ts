/**
 * Infinite query hook for exploring project images
 * Uses TanStack Query's useInfiniteQuery for smooth infinite scroll
 */

import { useInfiniteQuery, keepPreviousData } from '@tanstack/react-query';
import { useEffect, useMemo, useRef } from 'react';
import {
  projectImagesApi,
  type ExploreFilters,
  type SharedImage,
  type ExploreResponse,
} from '../lib/data-management-client';
import { filterContractKey, toFilterContract } from '../lib/explore-filter-contract';

interface UseInfiniteExploreImagesOptions {
  projectId: string;
  filters: ExploreFilters;
  pageSize?: number;
  enabled?: boolean;
  /**
   * Request bbox geometry for the overlay. Counts are returned either way, so turning this off with overlays hidden shrinks the response without changing any badge. Defaults to true, matching the endpoint's default. Display-only: it is read at fetch time but is not part of the query key, so toggling it never discards loaded pages.
   */
  includeBboxes?: boolean;
  /** Request polygon geometry for the overlay. See `includeBboxes`. */
  includePolygons?: boolean;
}

interface UseInfiniteExploreImagesResult {
  /** Flattened array of all loaded images */
  images: SharedImage[];
  /** Total count of images matching filters */
  total: number;
  /** Whether initial data is loading */
  isLoading: boolean;
  /** Whether data is being fetched (including refetches) */
  isFetching: boolean;
  /** Whether more pages are being fetched */
  isFetchingNextPage: boolean;
  /** Whether there are more pages to fetch */
  hasNextPage: boolean;
  /** Fetch the next page of images */
  fetchNextPage: () => void;
  /** Refetch all pages */
  refetch: () => void;
  /** The last error the query saw, whichever fetch produced it. When `nextPageError` is set this holds the same error. */
  error: Error | null;
  /** Whether the query is in an error state. With loaded images present, check `nextPageError` before showing a gallery-level failure. */
  isError: boolean;
  /**
   * The error from a failed `fetchNextPage`, null otherwise. Distinct from `error` so the UI can tell "the gallery could not load" from "this page could not load": already-loaded pages are retained either way, so a next-page failure must not replace the grid with an error screen.
   */
  nextPageError: Error | null;
}

export function useInfiniteExploreImages({
  projectId,
  filters,
  pageSize = 100,
  enabled = true,
  includeBboxes = true,
  includePolygons = true,
}: UseInfiniteExploreImagesOptions): UseInfiniteExploreImagesResult {
  // Membership filters are keyed through the canonical contract, so paging and
  // display fields cannot leak into the key and a re-ordered tag list reuses
  // its cached result.
  //
  // The geometry flags are deliberately **not** in the key. They are a display preference, and a
  // preference must not reset pagination: keying on them started a fresh cache entry at page 1, so
  // a reviewer 30 pages deep who hid the boxes lost 2,900 loaded images and their scroll position.
  // Keeping them out costs nothing for C10's purpose — the flags are still read at fetch time, so
  // every page fetched while overlays are hidden is still fetched without geometry. What is given
  // up is only the ability to *shed* geometry already downloaded, which was never the saving C10
  // was after. The opposite direction does need work: turning overlays back on refetches the pages
  // already loaded (see the effect below) so their annotations actually appear, and a refetch keeps
  // the page count and the scroll position that a key change would have thrown away.
  const filterKey = filterContractKey(toFilterContract(filters));

  const query = useInfiniteQuery({
    queryKey: ['project-explore-infinite', projectId, filterKey, pageSize],
    queryFn: async ({ pageParam, signal }): Promise<ExploreResponse> => {
      const response = await projectImagesApi.explore(
        projectId,
        {
          ...filters,
          page: pageParam,
          page_size: pageSize,
          include_bboxes: includeBboxes,
          include_polygons: includePolygons,
        },
        signal
      );
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
    placeholderData: keepPreviousData, // Keep showing old images while filtering
  });

  // Geometry demand only ever grows within one cache entry: when a flag flips off, loaded pages keep
  // the geometry they already carry and later pages are fetched without it; when one flips on, the
  // loaded pages have to be re-read or the overlay would draw nothing for them.
  const { refetch } = query;
  const geometryRef = useRef({ includeBboxes, includePolygons });
  useEffect(() => {
    const previous = geometryRef.current;
    const expanded =
      (includeBboxes && !previous.includeBboxes) || (includePolygons && !previous.includePolygons);
    geometryRef.current = { includeBboxes, includePolygons };
    if (expanded) void refetch();
  }, [includeBboxes, includePolygons, refetch]);

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
    isFetching: query.isFetching,
    isFetchingNextPage: query.isFetchingNextPage,
    hasNextPage: query.hasNextPage ?? false,
    fetchNextPage: query.fetchNextPage,
    refetch: query.refetch,
    error: query.error,
    isError: query.isError,
    nextPageError: query.isFetchNextPageError ? query.error : null,
  };
}
