import { projectImagesApi, type SidebarAggregationResponse } from '@/lib/data-management-client';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useState } from 'react';

export interface ExploreFiltersState {
  tagFilters: Record<string, 'include' | 'exclude'>;
  includeMatchMode: 'AND' | 'OR';
  excludeMatchMode: 'AND' | 'OR';
  selectedAttributes: Record<string, string[]>; // schema_id -> selected values
  numericRanges: Record<string, { min: number; max: number }>; // schema_id -> range
  sizeFilter: ('small' | 'medium' | 'large')[];
  widthRange?: { min: number; max: number };
  heightRange?: { min: number; max: number };
  aspectRatioRange?: { min: number; max: number };
  sizeRange?: { min: number; max: number };
  filepathPattern?: string; // Deprecated - use filepathPaths
  filepathPaths?: string[]; // Filter by specific directory paths
  imageId?: string[]; // Filter by specific image UIDs
  // Quality metric filters
  quality_min?: number;
  quality_max?: number;
  sharpness_min?: number;
  sharpness_max?: number;
  brightness_min?: number;
  brightness_max?: number;
  contrast_min?: number;
  contrast_max?: number;
  uniqueness_min?: number;
  uniqueness_max?: number;
  // RGB channel filters
  red_min?: number;
  red_max?: number;
  green_min?: number;
  green_max?: number;
  blue_min?: number;
  blue_max?: number;
  // Quality issues filter
  issues?: string[];
}

const defaultFilters: ExploreFiltersState = {
  tagFilters: {},
  includeMatchMode: 'OR',
  excludeMatchMode: 'OR',
  selectedAttributes: {},
  numericRanges: {},
  sizeFilter: [],
};

export function useSidebarAggregations(projectId: string, filters: ExploreFiltersState) {
  const includedTagIds = Object.entries(filters.tagFilters)
    .filter(([_, mode]) => mode === 'include')
    .map(([id]) => id);

  const query = useQuery({
    queryKey: ['sidebar-aggregations', projectId, Object.keys(filters.tagFilters)],
    queryFn: () =>
      projectImagesApi.getSidebarAggregations(projectId, {
        tag_ids: includedTagIds.length > 0 ? includedTagIds : undefined,
      }),
    staleTime: 30000, // 30 seconds
    refetchOnWindowFocus: false,
  });

  // Extract metadata aggregations from computed
  const widthAggregation = query.data?.computed?.width_stats;
  const heightAggregation = query.data?.computed?.height_stats;
  const sizeAggregation = query.data?.computed?.file_size_stats;

  // Debug logging
  if (query.data && !widthAggregation) {
    console.log('[useSidebarAggregations] API response:', query.data);
    console.log('[useSidebarAggregations] Computed field:', query.data.computed);
  }

  return {
    ...query,
    widthAggregation,
    heightAggregation,
    sizeAggregation,
  };
}

export function useExploreFilters(initialFilters?: Partial<ExploreFiltersState>) {
  const [filters, setFilters] = useState<ExploreFiltersState>({
    ...defaultFilters,
    ...initialFilters,
  });

  const toggleTag = useCallback((tagId: string) => {
    setFilters((prev) => {
      const currentState = prev.tagFilters[tagId];
      const newFilters = { ...prev.tagFilters };

      if (!currentState) {
        newFilters[tagId] = 'include'; // Idle → Include
      } else if (currentState === 'include') {
        newFilters[tagId] = 'exclude'; // Include → Exclude
      } else {
        delete newFilters[tagId]; // Exclude → Idle
      }

      return { ...prev, tagFilters: newFilters };
    });
  }, []);

  const removeTag = useCallback((tagId: string) => {
    setFilters((prev) => {
      const newFilters = { ...prev.tagFilters };
      delete newFilters[tagId];
      return { ...prev, tagFilters: newFilters };
    });
  }, []);

  const getIncludedTagIds = useCallback(() => {
    return Object.entries(filters.tagFilters)
      .filter(([_, mode]) => mode === 'include')
      .map(([id]) => id);
  }, [filters.tagFilters]);

  const getExcludedTagIds = useCallback(() => {
    return Object.entries(filters.tagFilters)
      .filter(([_, mode]) => mode === 'exclude')
      .map(([id]) => id);
  }, [filters.tagFilters]);

  const setIncludeMatchMode = useCallback((mode: 'AND' | 'OR') => {
    setFilters((prev) => ({ ...prev, includeMatchMode: mode }));
  }, []);

  const setExcludeMatchMode = useCallback((mode: 'AND' | 'OR') => {
    setFilters((prev) => ({ ...prev, excludeMatchMode: mode }));
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

  const setAspectRatioRange = useCallback((min: number, max: number) => {
    setFilters((prev) => ({ ...prev, aspectRatioRange: { min, max } }));
  }, []);

  const setFilepathFilter = useCallback((pattern: string) => {
    setFilters((prev) => ({ ...prev, filepathPattern: pattern }));
  }, []);

  const setFilepathPaths = useCallback((paths: string[]) => {
    setFilters((prev) => ({ ...prev, filepathPaths: paths }));
  }, []);

  const setImageUids = useCallback((imageId: string[]) => {
    setFilters((prev) => ({ ...prev, imageId }));
  }, []);

  const clearFilters = useCallback(() => {
    setFilters(defaultFilters);
  }, []);

  // Check if any quality filter is active
  const hasQualityFilters =
    filters.quality_min !== undefined ||
    filters.quality_max !== undefined ||
    filters.sharpness_min !== undefined ||
    filters.sharpness_max !== undefined ||
    filters.brightness_min !== undefined ||
    filters.brightness_max !== undefined ||
    filters.contrast_min !== undefined ||
    filters.contrast_max !== undefined ||
    filters.uniqueness_min !== undefined ||
    filters.uniqueness_max !== undefined ||
    filters.red_min !== undefined ||
    filters.red_max !== undefined ||
    filters.green_min !== undefined ||
    filters.green_max !== undefined ||
    filters.blue_min !== undefined ||
    filters.blue_max !== undefined ||
    (filters.issues && filters.issues.length > 0);

  const hasActiveFilters =
    Object.keys(filters.tagFilters).length > 0 ||
    Object.values(filters.selectedAttributes).some((arr) => arr.length > 0) ||
    Object.keys(filters.numericRanges).length > 0 ||
    filters.sizeFilter.length > 0 ||
    filters.widthRange !== undefined ||
    filters.heightRange !== undefined ||
    filters.aspectRatioRange !== undefined ||
    filters.sizeRange !== undefined ||
    filters.filepathPattern !== undefined ||
    (filters.filepathPaths && filters.filepathPaths.length > 0) ||
    (filters.imageId && filters.imageId.length > 0) ||
    hasQualityFilters;

  return {
    filters,
    setFilters,
    toggleTag,
    removeTag,
    getIncludedTagIds,
    getExcludedTagIds,
    setIncludeMatchMode,
    setExcludeMatchMode,
    toggleAttributeValue,
    setNumericRange,
    toggleSizeFilter,
    clearFilters,
    hasActiveFilters,
    // New filters
    widthRange: filters.widthRange,
    heightRange: filters.heightRange,
    aspectRatioRange: filters.aspectRatioRange,
    sizeRange: filters.sizeRange,
    filepathPattern: filters.filepathPattern,
    filepathPaths: filters.filepathPaths,
    imageId: filters.imageId,
    setWidthRange,
    setHeightRange,
    setAspectRatioRange,
    setSizeRange,
    setFilepathFilter,
    setFilepathPaths,
    setImageUids,
  };
}

export type { SidebarAggregationResponse };
