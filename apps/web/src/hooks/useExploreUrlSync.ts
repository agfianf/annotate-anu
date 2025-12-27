import { useCallback, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { ExploreFiltersState } from './useExploreFilters';
import type { FilterSnapshot } from '@/types/export';

/**
 * Convert FilterSnapshot (from export) to ExploreFiltersState.
 */
function convertFilterSnapshotToExploreFilters(
  snapshot: FilterSnapshot
): Partial<ExploreFiltersState> {
  const result: Partial<ExploreFiltersState> = {};

  // Convert tag filters
  if (snapshot.tag_ids?.length || snapshot.excluded_tag_ids?.length) {
    const tagFilters: Record<string, 'include' | 'exclude'> = {};
    snapshot.tag_ids?.forEach((id) => {
      tagFilters[id] = 'include';
    });
    snapshot.excluded_tag_ids?.forEach((id) => {
      tagFilters[id] = 'exclude';
    });
    result.tagFilters = tagFilters;
  }

  // Match modes
  if (snapshot.include_match_mode) {
    result.includeMatchMode = snapshot.include_match_mode;
  }
  if (snapshot.exclude_match_mode) {
    result.excludeMatchMode = snapshot.exclude_match_mode;
  }

  // Width range
  if (snapshot.width_min !== undefined || snapshot.width_max !== undefined) {
    result.widthRange = {
      min: snapshot.width_min || 0,
      max: snapshot.width_max || 100000,
    };
  }

  // Height range
  if (snapshot.height_min !== undefined || snapshot.height_max !== undefined) {
    result.heightRange = {
      min: snapshot.height_min || 0,
      max: snapshot.height_max || 100000,
    };
  }

  // File size range
  if (snapshot.file_size_min !== undefined || snapshot.file_size_max !== undefined) {
    result.sizeRange = {
      min: snapshot.file_size_min || 0,
      max: snapshot.file_size_max || Number.MAX_SAFE_INTEGER,
    };
  }

  // Filepath paths
  if (snapshot.filepath_paths?.length) {
    result.filepathPaths = snapshot.filepath_paths;
  }

  // Image UIDs
  if (snapshot.image_uids?.length) {
    result.imageUids = snapshot.image_uids;
  }

  return result;
}

/**
 * Hook to sync explore filter state with URL search params.
 * Enables shareable filtered views and back/forward navigation.
 * Also supports loading FilterSnapshot from `filter` URL param (base64 encoded JSON).
 */
export function useExploreUrlSync(
  filters: ExploreFiltersState,
  setFilters: (filters: ExploreFiltersState) => void
) {
  const [searchParams, setSearchParams] = useSearchParams();

  // Parse URL params into filter state
  const parseUrlToFilters = useCallback((): Partial<ExploreFiltersState> => {
    const parsed: Partial<ExploreFiltersState> = {};

    // Check for base64-encoded FilterSnapshot (from export history)
    const filterParam = searchParams.get('filter');
    if (filterParam) {
      try {
        const filterJson = atob(filterParam);
        const snapshot = JSON.parse(filterJson) as FilterSnapshot;
        return convertFilterSnapshotToExploreFilters(snapshot);
      } catch (e) {
        console.error('Failed to parse filter param:', e);
      }
    }

    // Tags (legacy format)
    const tags = searchParams.getAll('tag');
    if (tags.length > 0) {
      const tagFilters: Record<string, 'include' | 'exclude'> = {};
      tags.forEach((tag) => {
        tagFilters[tag] = 'include';
      });
      parsed.tagFilters = tagFilters;
    }

    // Categorical attributes: attr_<schemaId>=value1,value2
    const attributeFilters: Record<string, string[]> = {};
    searchParams.forEach((value, key) => {
      if (key.startsWith('attr_')) {
        const schemaId = key.replace('attr_', '');
        attributeFilters[schemaId] = value.split(',').filter(Boolean);
      }
    });
    if (Object.keys(attributeFilters).length > 0) {
      parsed.selectedAttributes = attributeFilters;
    }

    // Numeric ranges: range_<schemaId>=min,max
    const numericRanges: Record<string, { min: number; max: number }> = {};
    searchParams.forEach((value, key) => {
      if (key.startsWith('range_')) {
        const schemaId = key.replace('range_', '');
        const [min, max] = value.split(',').map(Number);
        if (!isNaN(min) && !isNaN(max)) {
          numericRanges[schemaId] = { min, max };
        }
      }
    });
    if (Object.keys(numericRanges).length > 0) {
      parsed.numericRanges = numericRanges;
    }

    // Size filter
    const sizes = searchParams.get('size');
    if (sizes) {
      parsed.sizeFilter = sizes.split(',').filter((s): s is 'small' | 'medium' | 'large' =>
        ['small', 'medium', 'large'].includes(s)
      );
    }

    return parsed;
  }, [searchParams]);

  // Serialize filter state to URL params
  const serializeFiltersToUrl = useCallback((state: ExploreFiltersState) => {
    const params = new URLSearchParams();

    // Keep the tab parameter if present
    const currentTab = searchParams.get('tab');
    if (currentTab) {
      params.set('tab', currentTab);
    }

    // Tags (using include mode only for URL serialization)
    Object.entries(state.tagFilters).forEach(([tagId, mode]) => {
      if (mode === 'include') {
        params.append('tag', tagId);
      }
    });

    // Categorical attributes
    Object.entries(state.selectedAttributes).forEach(([schemaId, values]) => {
      if (values.length > 0) {
        params.set(`attr_${schemaId}`, values.join(','));
      }
    });

    // Numeric ranges
    Object.entries(state.numericRanges).forEach(([schemaId, range]) => {
      params.set(`range_${schemaId}`, `${range.min},${range.max}`);
    });

    // Size filter
    if (state.sizeFilter.length > 0) {
      params.set('size', state.sizeFilter.join(','));
    }

    return params;
  }, [searchParams]);

  // Update URL when filters change
  useEffect(() => {
    const newParams = serializeFiltersToUrl(filters);
    const currentParams = new URLSearchParams(searchParams);

    // Only update if actually changed (avoid infinite loops)
    if (newParams.toString() !== currentParams.toString()) {
      setSearchParams(newParams, { replace: true });
    }
  }, [filters, serializeFiltersToUrl, setSearchParams, searchParams]);

  // Initialize filters from URL on mount
  useEffect(() => {
    const urlFilters = parseUrlToFilters();
    if (Object.keys(urlFilters).length > 0) {
      setFilters({
        tagFilters: urlFilters.tagFilters || {},
        includeMatchMode: urlFilters.includeMatchMode || 'OR',
        excludeMatchMode: urlFilters.excludeMatchMode || 'OR',
        selectedAttributes: urlFilters.selectedAttributes || {},
        numericRanges: urlFilters.numericRanges || {},
        sizeFilter: urlFilters.sizeFilter || [],
        widthRange: urlFilters.widthRange,
        heightRange: urlFilters.heightRange,
        sizeRange: urlFilters.sizeRange,
        filepathPaths: urlFilters.filepathPaths,
        imageUids: urlFilters.imageUids,
      });
    }
    // Only run on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Check if URL has any filter params
  const hasUrlFilters = useMemo(() => {
    return (
      searchParams.has('filter') ||
      searchParams.has('tag') ||
      Array.from(searchParams.keys()).some((k) => k.startsWith('attr_') || k.startsWith('range_')) ||
      searchParams.has('size')
    );
  }, [searchParams]);

  return {
    hasUrlFilters,
    parseUrlToFilters,
    serializeFiltersToUrl,
  };
}
