import { useCallback, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { ExploreFiltersState } from './useExploreFilters';

/**
 * Hook to sync explore filter state with URL search params.
 * Enables shareable filtered views and back/forward navigation.
 */
export function useExploreUrlSync(
  filters: ExploreFiltersState,
  setFilters: (filters: ExploreFiltersState) => void
) {
  const [searchParams, setSearchParams] = useSearchParams();

  // Parse URL params into filter state
  const parseUrlToFilters = useCallback((): Partial<ExploreFiltersState> => {
    const parsed: Partial<ExploreFiltersState> = {};

    // Tags
    const tags = searchParams.getAll('tag');
    if (tags.length > 0) {
      parsed.selectedTagIds = tags;
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

    // Tags
    state.selectedTagIds.forEach((tag) => {
      params.append('tag', tag);
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
  }, []);

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
        selectedTagIds: urlFilters.selectedTagIds || [],
        selectedAttributes: urlFilters.selectedAttributes || {},
        numericRanges: urlFilters.numericRanges || {},
        sizeFilter: urlFilters.sizeFilter || [],
      });
    }
    // Only run on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Check if URL has any filter params
  const hasUrlFilters = useMemo(() => {
    return (
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
