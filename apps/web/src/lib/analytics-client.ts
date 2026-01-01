/**
 * Analytics API Client
 * API calls for analytics endpoints
 */

import type {
  DatasetStatsResponse,
  AnnotationCoverageResponse,
  ClassBalanceResponse,
  SpatialHeatmapResponse,
  ImageQualityResponse,
} from '@/types/analytics';
import type { ExploreFilters } from './data-management-client';
import dataClient from './data-management-client';

/**
 * Build query params from explore filters
 */
function buildFilterParams(filters: ExploreFilters): Record<string, any> {
  const params: Record<string, any> = {};

  if (filters.search) params.search = filters.search;
  if (filters.tag_ids) params.tag_ids = filters.tag_ids;
  if (filters.excluded_tag_ids) params.excluded_tag_ids = filters.excluded_tag_ids;
  if (filters.include_match_mode) params.include_match_mode = filters.include_match_mode;
  if (filters.exclude_match_mode) params.exclude_match_mode = filters.exclude_match_mode;
  if (filters.task_ids) params.task_ids = filters.task_ids;
  if (filters.job_id !== undefined) params.job_id = filters.job_id;
  if (filters.is_annotated !== undefined) params.is_annotated = filters.is_annotated;
  if (filters.width_min !== undefined) params.width_min = filters.width_min;
  if (filters.width_max !== undefined) params.width_max = filters.width_max;
  if (filters.height_min !== undefined) params.height_min = filters.height_min;
  if (filters.height_max !== undefined) params.height_max = filters.height_max;
  if (filters.file_size_min !== undefined) params.file_size_min = filters.file_size_min;
  if (filters.file_size_max !== undefined) params.file_size_max = filters.file_size_max;
  if (filters.filepath_pattern) params.filepath_pattern = filters.filepath_pattern;
  if (filters.filepath_paths) params.filepath_paths = filters.filepath_paths;
  if (filters.image_uids) params.image_uids = filters.image_uids;

  return params;
}

/**
 * Analytics API client
 */
export const analyticsApi = {
  /**
   * Get dataset statistics for analytics panel
   */
  async getDatasetStats(
    projectId: string,
    filters: ExploreFilters = {}
  ): Promise<DatasetStatsResponse> {
    const params = buildFilterParams(filters);
    const response = await dataClient.get<{
      data: DatasetStatsResponse;
      message: string;
      success: boolean;
    }>(`/api/v1/projects/${projectId}/analytics/dataset-stats`, { params });
    return response.data.data;
  },

  /**
   * Get annotation coverage analytics
   */
  async getAnnotationCoverage(
    projectId: string,
    filters: ExploreFilters = {}
  ): Promise<AnnotationCoverageResponse> {
    const params = buildFilterParams(filters);
    const response = await dataClient.get<{
      data: AnnotationCoverageResponse;
      message: string;
      success: boolean;
    }>(`/api/v1/projects/${projectId}/analytics/annotation-coverage`, { params });
    return response.data.data;
  },

  /**
   * Get class balance analytics
   * @param category_id Optional category ID to filter by specific category
   */
  async getClassBalance(
    projectId: string,
    filters: ExploreFilters = {},
    category_id?: string | null
  ): Promise<ClassBalanceResponse> {
    const params = buildFilterParams(filters);
    if (category_id) {
      params.category_id = category_id;
    }
    const response = await dataClient.get<{
      data: ClassBalanceResponse;
      message: string;
      success: boolean;
    }>(`/api/v1/projects/${projectId}/analytics/class-balance`, { params });
    return response.data.data;
  },

  /**
   * Get spatial heatmap analytics
   */
  async getSpatialHeatmap(
    projectId: string,
    filters: ExploreFilters = {}
  ): Promise<SpatialHeatmapResponse> {
    const params = buildFilterParams(filters);
    const response = await dataClient.get<{
      data: SpatialHeatmapResponse;
      message: string;
      success: boolean;
    }>(`/api/v1/projects/${projectId}/analytics/spatial-heatmap`, { params });
    return response.data.data;
  },

  /**
   * Get image quality analytics
   */
  async getImageQuality(
    projectId: string,
    filters: ExploreFilters = {}
  ): Promise<ImageQualityResponse> {
    const params = buildFilterParams(filters);
    const response = await dataClient.get<{
      data: ImageQualityResponse;
      message: string;
      success: boolean;
    }>(`/api/v1/projects/${projectId}/analytics/image-quality`, { params });
    return response.data.data;
  },
};
