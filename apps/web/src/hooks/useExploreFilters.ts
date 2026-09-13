import { projectImagesApi, type SidebarAggregationResponse } from '@/lib/data-management-client';
import {
  buildImageFilterContract,
  filterContractKey,
  type ImageFilterContract,
  type ToolbarFilterState,
} from '@/lib/explore-filter-contract';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';

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
  // Annotation count filters (objects per image)
  object_count_min?: number;
  object_count_max?: number;
  // BBox and Polygon count filters (annotation type specific)
  bbox_count_min?: number;
  bbox_count_max?: number;
  polygon_count_min?: number;
  polygon_count_max?: number;
}

const defaultFilters: ExploreFiltersState = {
  tagFilters: {},
  includeMatchMode: 'OR',
  excludeMatchMode: 'OR',
  selectedAttributes: {},
  numericRanges: {},
  sizeFilter: [],
};

/**
 * Facet semantics for the sidebar, decided once and applied consistently (G11).
 *
 * Every categorical facet — tags, attributes, size buckets — counts **current results**: it answers "how many of the images you are looking at have this value", so its numbers always add up to the gallery's matching count.
 *
 * A numeric range facet is the one exception: it is computed with **its own constraint removed**, the standard faceted-search rule. Its `min_value`/`max_value` are the slider's *track*, not a count, and a track derived from the field's own filter collapses onto the selection — drag width to 800-1200 and the track becomes 800-1200, so the range can only ever be narrowed and there is no way back short of Clear All. Removing only that field's own bounds keeps the track at the range of everything else that matches, which is what lets a user widen again.
 *
 * This needs no server change: `/explore/sidebar` takes an arbitrary contract, so the facet request is simply the same contract minus two fields. When the field carries no constraint the stripped contract is identical to the gallery's, the query key is identical too, and TanStack serves it from the same cache entry — so the extra request exists only while that slider is actually constrained.
 */
const NUMERIC_FACET_FIELDS: Record<'width' | 'height' | 'fileSize', readonly (keyof ImageFilterContract)[]> = {
  width: ['width_min', 'width_max'],
  height: ['height_min', 'height_max'],
  fileSize: ['file_size_min', 'file_size_max'],
};

function omitContractFields(
  contract: ImageFilterContract,
  fields: readonly (keyof ImageFilterContract)[]
): ImageFilterContract {
  const next = { ...contract };
  fields.forEach((field) => {
    delete next[field];
  });
  return next;
}

function useSidebarFacet(
  projectId: string,
  contract: ImageFilterContract,
  fields: readonly (keyof ImageFilterContract)[]
) {
  const facetContract = useMemo(() => omitContractFields(contract, fields), [contract, fields]);

  return useQuery({
    // Keyed on the facet's own contract, so a width-relaxed request is a different entry from the
    // gallery's — and the same entry whenever width is unconstrained.
    queryKey: ['sidebar-aggregations', projectId, filterContractKey(facetContract)],
    queryFn: ({ signal }) =>
      projectImagesApi.getSidebarAggregations(projectId, facetContract, signal),
    staleTime: 30000, // 30 seconds
    refetchOnWindowFocus: false,
  });
}

/**
 * Facet counts for the sidebar, scoped to the same filters as the gallery.
 *
 * The request is the canonical filter contract, and the query key is that contract's serialisation rather than a list of tag ids: keying on ids alone made flipping a tag from include to exclude reuse the previous entry, so the sidebar kept showing counts for a filter that was no longer applied.
 *
 * The three numeric aggregations come from facet queries that drop their own field's bounds; see `NUMERIC_FACET_FIELDS`.
 */
export function useSidebarAggregations(
  projectId: string,
  filters: ExploreFiltersState,
  toolbarFilters?: ToolbarFilterState
) {
  const contract = useMemo(
    () => buildImageFilterContract(filters, toolbarFilters),
    [filters, toolbarFilters]
  );

  const query = useQuery({
    queryKey: ['sidebar-aggregations', projectId, filterContractKey(contract)],
    queryFn: ({ signal }) => projectImagesApi.getSidebarAggregations(projectId, contract, signal),
    staleTime: 30000, // 30 seconds
    refetchOnWindowFocus: false,
  });

  const widthFacet = useSidebarFacet(projectId, contract, NUMERIC_FACET_FIELDS.width);
  const heightFacet = useSidebarFacet(projectId, contract, NUMERIC_FACET_FIELDS.height);
  const fileSizeFacet = useSidebarFacet(projectId, contract, NUMERIC_FACET_FIELDS.fileSize);

  // Track from the facet query; fall back to the gallery-scoped response until it arrives, so a
  // slider never renders without a track.
  const widthAggregation = widthFacet.data?.computed?.width_stats ?? query.data?.computed?.width_stats;
  const heightAggregation =
    heightFacet.data?.computed?.height_stats ?? query.data?.computed?.height_stats;
  const sizeAggregation =
    fileSizeFacet.data?.computed?.file_size_stats ?? query.data?.computed?.file_size_stats;

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

  /*
   * Removing a numeric range means setting it to `undefined`, never widening it to sentinel bounds.
   * A widened range is still a range: it reaches `/explore`, `/explore/sidebar`, the saved-view URL
   * and the export snapshot as a real `width_min`/`width_max` pair, so an image outside the sentinel
   * stays excluded from an export the user believes is unfiltered.
   */
  const clearWidthRange = useCallback(() => {
    setFilters((prev) => ({ ...prev, widthRange: undefined }));
  }, []);

  const clearHeightRange = useCallback(() => {
    setFilters((prev) => ({ ...prev, heightRange: undefined }));
  }, []);

  const clearAspectRatioRange = useCallback(() => {
    setFilters((prev) => ({ ...prev, aspectRatioRange: undefined }));
  }, []);

  /** Clears `sizeRange`, the file-size constraint in bytes. */
  const clearFileSizeRange = useCallback(() => {
    setFilters((prev) => ({ ...prev, sizeRange: undefined }));
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
    hasQualityFilters ||
    filters.object_count_min !== undefined ||
    filters.object_count_max !== undefined ||
    filters.bbox_count_min !== undefined ||
    filters.bbox_count_max !== undefined ||
    filters.polygon_count_min !== undefined ||
    filters.polygon_count_max !== undefined;

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
    clearWidthRange,
    clearHeightRange,
    clearAspectRatioRange,
    clearFileSizeRange,
    setFilepathFilter,
    setFilepathPaths,
    setImageUids,
  };
}

export type { SidebarAggregationResponse };
