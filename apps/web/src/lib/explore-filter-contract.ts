/**
 * Canonical client-side image filter contract.
 *
 * One definition of which images a filter set selects, shared by the gallery query, the export snapshot, the saved-view URL, and the analytics panels. Before this existed each caller assembled its own subset of `ExploreFilters`, so an export or an analytics panel could describe a different image set from the one on screen.
 *
 * Membership fields only: paging (`page`, `page_size`) and display-only fields (`include_annotations`, and the `include_bboxes` / `include_polygons` geometry flags on `ExploreQueryOptions`) are deliberately outside the contract, because changing them must never change which images match.
 */

import type { ExploreFilters } from './data-management-client';
import type { ExploreFiltersState } from '@/hooks/useExploreFilters';
import type { FilterSnapshot } from '@/types/export';

/** Filter fields that define which images match — excludes paging and display-only fields. */
export type ImageFilterContract = Omit<ExploreFilters, 'page' | 'page_size' | 'include_annotations'>;

/** Membership filters that live on the Explore toolbar rather than in the sidebar's `ExploreFiltersState`. */
export interface ToolbarFilterState {
  search?: string;
  taskIds?: number[];
  jobId?: number;
  isAnnotated?: boolean;
}

/**
 * Exhaustive map of the contract's fields. Typing it as `Record<keyof ImageFilterContract, true>` makes the compiler reject any field added to `ExploreFilters` until it is listed here, so the contract cannot silently fall behind the gallery query.
 */
const IMAGE_FILTER_FIELD_MAP: Record<keyof ImageFilterContract, true> = {
  search: true,
  tag_ids: true,
  excluded_tag_ids: true,
  include_match_mode: true,
  exclude_match_mode: true,
  task_ids: true,
  job_id: true,
  is_annotated: true,
  width_min: true,
  width_max: true,
  height_min: true,
  height_max: true,
  aspect_ratio_min: true,
  aspect_ratio_max: true,
  file_size_min: true,
  file_size_max: true,
  object_count_min: true,
  object_count_max: true,
  bbox_count_min: true,
  bbox_count_max: true,
  polygon_count_min: true,
  polygon_count_max: true,
  filepath_pattern: true,
  filepath_paths: true,
  image_uids: true,
  quality_min: true,
  quality_max: true,
  sharpness_min: true,
  sharpness_max: true,
  brightness_min: true,
  brightness_max: true,
  contrast_min: true,
  contrast_max: true,
  uniqueness_min: true,
  uniqueness_max: true,
  red_min: true,
  red_max: true,
  green_min: true,
  green_max: true,
  blue_min: true,
  blue_max: true,
  issues: true,
};

/** Every membership field, in a stable alphabetical order so serialisations and query keys are deterministic. */
export const IMAGE_FILTER_FIELDS = (
  Object.keys(IMAGE_FILTER_FIELD_MAP) as (keyof ImageFilterContract)[]
).sort();

/** Fields the API declares as integers; float values from sliders are rounded before they are sent. */
const INTEGER_FIELDS = new Set<keyof ImageFilterContract>([
  'width_min',
  'width_max',
  'height_min',
  'height_max',
  'file_size_min',
  'file_size_max',
  'object_count_min',
  'object_count_max',
  'bbox_count_min',
  'bbox_count_max',
  'polygon_count_min',
  'polygon_count_max',
  'job_id',
]);

function isEmptyValue(value: unknown): boolean {
  if (value === undefined || value === null || value === '') return true;
  if (Array.isArray(value)) return value.length === 0;
  return typeof value === 'number' && Number.isNaN(value);
}

/** Strip paging/display fields so gallery, export, and analytics describe the same image set. */
export function toFilterContract(filters: ExploreFilters): ImageFilterContract {
  const source = filters as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  for (const field of IMAGE_FILTER_FIELDS) {
    const value = source[field];
    if (isEmptyValue(value)) continue;
    result[field] = value;
  }
  return result as ImageFilterContract;
}

/** Serialise the contract for an analytics or export request body. */
export function filterContractToQuery(filters: ImageFilterContract): Record<string, unknown> {
  const source = toFilterContract(filters) as Record<string, unknown>;
  const query: Record<string, unknown> = {};
  for (const field of IMAGE_FILTER_FIELDS) {
    const value = source[field];
    if (isEmptyValue(value)) continue;
    query[field] =
      typeof value === 'number' && INTEGER_FIELDS.has(field) ? Math.round(value) : value;
  }
  return query;
}

/**
 * Serialise the contract as a query string with repeated keys (`tag_ids=a&tag_ids=b`), which is what FastAPI binds list parameters from. Axios' default array serialisation (`tag_ids[]=a`) does not bind, so every GET that carries filters builds its params through this helper.
 */
export function filterContractToSearchParams(filters: ImageFilterContract): URLSearchParams {
  const params = new URLSearchParams();
  const query = filterContractToQuery(filters);
  for (const field of IMAGE_FILTER_FIELDS) {
    const value = query[field];
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      value.forEach((item) => params.append(field, String(item)));
    } else {
      params.append(field, String(value));
    }
  }
  return params;
}

/** Stable query-key fragment: deterministic ordering, undefined/empty fields dropped. */
export function filterContractKey(filters: ImageFilterContract): string {
  const source = toFilterContract(filters) as Record<string, unknown>;
  const normalised: Record<string, unknown> = {};
  for (const field of IMAGE_FILTER_FIELDS) {
    const value = source[field];
    if (isEmptyValue(value)) continue;
    // Order within a list does not change which images match, so sort it: a re-ordered tag list must reuse the cached result rather than refetch.
    normalised[field] = Array.isArray(value) ? [...value].map(String).sort() : value;
  }
  return JSON.stringify(normalised);
}

/** True when the contract selects a strict subset of the project, i.e. at least one filter is applied. */
export function hasAnyFilter(filters: ImageFilterContract): boolean {
  return Object.keys(toFilterContract(filters)).some(
    (field) => field !== 'include_match_mode' && field !== 'exclude_match_mode'
  );
}

/**
 * Build the canonical contract from the Explore UI's two pieces of filter state. This is the single place gallery queries, the export snapshot, saved views, and analytics requests are derived from.
 *
 * A numeric range is applied or absent, never widened: `widthRange === undefined` emits neither `width_min` nor `width_max`, so clearing a slider removes the constraint from every surface at once. Sentinel bounds (`{ min: 0, max: 10000 }`) are not a removal — `isEmptyValue` keeps `0` because a zero bound is a genuine constraint elsewhere in the contract, so such a range is emitted in full and keeps excluding wider images from exports and saved views. Use the `clear*Range` actions on `useExploreFilters`, which set the range to `undefined`.
 */
export function buildImageFilterContract(
  state: ExploreFiltersState,
  toolbar: ToolbarFilterState = {}
): ImageFilterContract {
  const includedTagIds = Object.entries(state.tagFilters)
    .filter(([, mode]) => mode === 'include')
    .map(([id]) => id);
  const excludedTagIds = Object.entries(state.tagFilters)
    .filter(([, mode]) => mode === 'exclude')
    .map(([id]) => id);

  return toFilterContract({
    search: toolbar.search || undefined,
    tag_ids: includedTagIds,
    excluded_tag_ids: excludedTagIds,
    include_match_mode: state.includeMatchMode,
    exclude_match_mode: state.excludeMatchMode,
    task_ids: toolbar.taskIds,
    job_id: toolbar.jobId,
    is_annotated: toolbar.isAnnotated,
    width_min: state.widthRange?.min,
    width_max: state.widthRange?.max,
    height_min: state.heightRange?.min,
    height_max: state.heightRange?.max,
    aspect_ratio_min: state.aspectRatioRange?.min,
    aspect_ratio_max: state.aspectRatioRange?.max,
    file_size_min: state.sizeRange?.min,
    file_size_max: state.sizeRange?.max,
    filepath_pattern: state.filepathPattern,
    filepath_paths: state.filepathPaths,
    image_uids: state.imageId,
    quality_min: state.quality_min,
    quality_max: state.quality_max,
    sharpness_min: state.sharpness_min,
    sharpness_max: state.sharpness_max,
    brightness_min: state.brightness_min,
    brightness_max: state.brightness_max,
    contrast_min: state.contrast_min,
    contrast_max: state.contrast_max,
    uniqueness_min: state.uniqueness_min,
    uniqueness_max: state.uniqueness_max,
    red_min: state.red_min,
    red_max: state.red_max,
    green_min: state.green_min,
    green_max: state.green_max,
    blue_min: state.blue_min,
    blue_max: state.blue_max,
    issues: state.issues,
    object_count_min: state.object_count_min,
    object_count_max: state.object_count_max,
    bbox_count_min: state.bbox_count_min,
    bbox_count_max: state.bbox_count_max,
    polygon_count_min: state.polygon_count_min,
    polygon_count_max: state.polygon_count_max,
  });
}

/**
 * The export snapshot is the contract. Assigning one to the other here is also the compile-time parity check between `ImageFilterContract` and `FilterSnapshot`: if either side gains a field the other lacks, this stops compiling.
 */
export function filterContractToSnapshot(filters: ImageFilterContract): FilterSnapshot {
  return toFilterContract(filters);
}

/** Read an export/saved-filter snapshot back as the contract. */
export function filterSnapshotToContract(snapshot: FilterSnapshot): ImageFilterContract {
  return toFilterContract(snapshot);
}

/** Restore the sidebar's filter state from a contract (a saved view, a shared URL, an export snapshot). */
export function contractToExploreFiltersState(
  filters: ImageFilterContract
): Partial<ExploreFiltersState> {
  const tagFilters: Record<string, 'include' | 'exclude'> = {};
  filters.tag_ids?.forEach((id) => {
    tagFilters[id] = 'include';
  });
  filters.excluded_tag_ids?.forEach((id) => {
    tagFilters[id] = 'exclude';
  });

  const range = (min?: number, max?: number, fallbackMax = Number.MAX_SAFE_INTEGER) =>
    min === undefined && max === undefined ? undefined : { min: min ?? 0, max: max ?? fallbackMax };

  return {
    tagFilters,
    includeMatchMode: filters.include_match_mode ?? 'OR',
    excludeMatchMode: filters.exclude_match_mode ?? 'OR',
    widthRange: range(filters.width_min, filters.width_max, 100000),
    heightRange: range(filters.height_min, filters.height_max, 100000),
    aspectRatioRange: range(filters.aspect_ratio_min, filters.aspect_ratio_max, 100),
    sizeRange: range(filters.file_size_min, filters.file_size_max),
    filepathPattern: filters.filepath_pattern,
    filepathPaths: filters.filepath_paths,
    imageId: filters.image_uids,
    quality_min: filters.quality_min,
    quality_max: filters.quality_max,
    sharpness_min: filters.sharpness_min,
    sharpness_max: filters.sharpness_max,
    brightness_min: filters.brightness_min,
    brightness_max: filters.brightness_max,
    contrast_min: filters.contrast_min,
    contrast_max: filters.contrast_max,
    uniqueness_min: filters.uniqueness_min,
    uniqueness_max: filters.uniqueness_max,
    red_min: filters.red_min,
    red_max: filters.red_max,
    green_min: filters.green_min,
    green_max: filters.green_max,
    blue_min: filters.blue_min,
    blue_max: filters.blue_max,
    issues: filters.issues,
    object_count_min: filters.object_count_min,
    object_count_max: filters.object_count_max,
    bbox_count_min: filters.bbox_count_min,
    bbox_count_max: filters.bbox_count_max,
    polygon_count_min: filters.polygon_count_min,
    polygon_count_max: filters.polygon_count_max,
  };
}

/** Restore the toolbar-held half of the membership filters from a contract. */
export function contractToToolbarFilters(filters: ImageFilterContract): ToolbarFilterState {
  return {
    search: filters.search,
    taskIds: filters.task_ids,
    jobId: filters.job_id,
    isAnnotated: filters.is_annotated,
  };
}
