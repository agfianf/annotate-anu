import { projectImagesApi, type SidebarAggregationResponse } from '@/lib/data-management-client';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useState } from 'react';

export interface ExploreFiltersState {
  selectedTagIds: string[];
  selectedAttributes: Record<string, string[]>; // schema_id -> selected values
  numericRanges: Record<string, { min: number; max: number }>; // schema_id -> range
  sizeFilter: ('small' | 'medium' | 'large')[];
  widthRange?: { min: number; max: number };
  heightRange?: { min: number; max: number };
  sizeRange?: { min: number; max: number };
  filepathPattern?: string;
}

const defaultFilters: ExploreFiltersState = {
  selectedTagIds: [],
  selectedAttributes: {},
  numericRanges: {},
  sizeFilter: [],
};

export function useSidebarAggregations(projectId: string, filters: ExploreFiltersState) {
  return useQuery({
    queryKey: ['sidebar-aggregations', projectId, filters.selectedTagIds], // Dependency on tags only for now?
    queryFn: () =>
      projectImagesApi.getSidebarAggregations(projectId, {
        tag_ids: filters.selectedTagIds.length > 0 ? filters.selectedTagIds : undefined,
      }),
    staleTime: 30000, // 30 seconds
    refetchOnWindowFocus: false,
  });
}

export function useExploreFilters(initialFilters?: Partial<ExploreFiltersState>) {
  const [filters, setFilters] = useState<ExploreFiltersState>({
    ...defaultFilters,
    ...initialFilters,
  });

  const toggleTag = useCallback((tagId: string) => {
    setFilters((prev) => ({
      ...prev,
      selectedTagIds: prev.selectedTagIds.includes(tagId)
        ? prev.selectedTagIds.filter((id) => id !== tagId)
        : [...prev.selectedTagIds, tagId],
    }));
  }, []);

  const setTagIds = useCallback((tagIds: string[]) => {
    setFilters((prev) => ({
      ...prev,
      selectedTagIds: tagIds,
    }));
  }, []);

  const toggleAttributeValue = useCallback((schemaId: string, value: string) => {
    setFilters((prev) => {
      const current = prev.selectedAttributes[schemaId] || [];
      const updated = current.includes(value)
        ? current.filter((v) => v !== value)
        : [...current, value];

      return {
        ...prev,
        selectedAttributes: {
          ...prev.selectedAttributes,
          [schemaId]: updated,
        },
      };
    });
  }, []);

  const setNumericRange = useCallback((schemaId: string, min: number, max: number) => {
    setFilters((prev) => ({
      ...prev,
      numericRanges: {
        ...prev.numericRanges,
        [schemaId]: { min, max },
      },
    }));
  }, []);

  const toggleSizeFilter = useCallback((size: 'small' | 'medium' | 'large') => {
    setFilters((prev) => ({
      ...prev,
      sizeFilter: prev.sizeFilter.includes(size)
        ? prev.sizeFilter.filter((s) => s !== size)
        : [...prev.sizeFilter, size],
    }));
  }, []);

  const setWidthRange = useCallback((min: number, max: number) => {
    setFilters((prev) => ({ ...prev, widthRange: { min, max } }));
  }, []);

  const setHeightRange = useCallback((min: number, max: number) => {
    setFilters((prev) => ({ ...prev, heightRange: { min, max } }));
  }, []);

  const setSizeRange = useCallback((min: number, max: number) => {
    setFilters((prev) => ({ ...prev, sizeRange: { min, max } }));
  }, []);

  const setFilepathFilter = useCallback((pattern: string) => {
    setFilters((prev) => ({ ...prev, filepathPattern: pattern }));
  }, []);

  const clearFilters = useCallback(() => {
    setFilters(defaultFilters);
  }, []);

  const hasActiveFilters =
    filters.selectedTagIds.length > 0 ||
    Object.values(filters.selectedAttributes).some((arr) => arr.length > 0) ||
    Object.keys(filters.numericRanges).length > 0 ||
    filters.sizeFilter.length > 0;

  return {
    filters,
    setFilters,
    toggleTag,
    setTagIds,
    toggleAttributeValue,
    setNumericRange,
    toggleSizeFilter,
    clearFilters,
    clearFilters,
    hasActiveFilters,
    // New filters
    widthRange: filters.widthRange,
    heightRange: filters.heightRange,
    sizeRange: filters.sizeRange,
    filepathPattern: filters.filepathPattern,
    setWidthRange,
    setHeightRange,
    setSizeRange,
    setFilepathFilter,
  };
}

export type { SidebarAggregationResponse };
