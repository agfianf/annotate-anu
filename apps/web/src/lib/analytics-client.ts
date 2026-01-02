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
  DimensionInsightsResponse,
  EnhancedDatasetStatsResponse,
  AnnotationAnalysisResponse,
  ProcessQualityResponse,
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

  /**
   * Get dimension insights analytics (Roboflow-style)
   */
  async getDimensionInsights(
    projectId: string,
    filters: ExploreFilters = {}
  ): Promise<DimensionInsightsResponse> {
    const params = buildFilterParams(filters);
    const response = await dataClient.get<{
      data: DimensionInsightsResponse;
      message: string;
      success: boolean;
    }>(`/api/v1/projects/${projectId}/analytics/dimension-insights`, { params });
    return response.data.data;
  },

  // ============================================================================
  // CONSOLIDATED ENDPOINTS
  // ============================================================================

  /**
   * Get enhanced dataset statistics (consolidated)
   * Combines: Dataset Stats + Dimension Insights + Class Balance + Image Quality
   */
  async getEnhancedDatasetStats(
    projectId: string,
    filters: ExploreFilters = {},
    category_id?: string | null
  ): Promise<EnhancedDatasetStatsResponse> {
    const params = buildFilterParams(filters);
    if (category_id) {
      params.category_id = category_id;
    }
    const response = await dataClient.get<{
      data: EnhancedDatasetStatsResponse;
      message: string;
      success: boolean;
    }>(`/api/v1/projects/${projectId}/analytics/enhanced-dataset-stats`, { params });
    return response.data.data;
  },

  /**
   * Get annotation analysis (consolidated)
   * Combines: Annotation Coverage + Spatial Heatmap
   */
  async getAnnotationAnalysis(
    projectId: string,
    filters: ExploreFilters = {},
    gridSize: number = 10
  ): Promise<AnnotationAnalysisResponse> {
    const params = buildFilterParams(filters);
    params.grid_size = gridSize;
    const response = await dataClient.get<{
      data: AnnotationAnalysisResponse;
      message: string;
      success: boolean;
    }>(`/api/v1/projects/${projectId}/analytics/annotation-analysis`, { params });
    return response.data.data;
  },

  /**
   * Sync quality metrics - find untracked images and create pending records
   */
  async syncQualityMetrics(
    projectId: string
  ): Promise<{ synced: number; pending: number; completed: number; total: number }> {
    const response = await dataClient.post<{
      data: { synced: number; pending: number; completed: number; total: number };
      message: string;
      success: boolean;
    }>(`/api/v1/projects/${projectId}/analytics/sync-quality`);
    return response.data.data;
  },

  /**
   * Trigger quality metrics computation for pending images (DEPRECATED)
   * Use startQualityJob for background processing with progress tracking.
   */
  async processQualityMetrics(
    projectId: string,
    batchSize: number = 50
  ): Promise<ProcessQualityResponse> {
    const response = await dataClient.post<{
      data: ProcessQualityResponse;
      message: string;
      success: boolean;
    }>(`/api/v1/projects/${projectId}/analytics/compute-quality?batch_size=${batchSize}`);
    return response.data.data;
  },

  // ============================================================================
  // QUALITY JOB ENDPOINTS (Background Processing with Progress Tracking)
  // ============================================================================

  /**
   * Start a background quality metrics processing job
   */
  async startQualityJob(
    projectId: string,
    batchSize: number = 50
  ): Promise<StartQualityJobResponse> {
    const response = await dataClient.post<{
      data: StartQualityJobResponse;
      message: string;
      success: boolean;
    }>(`/api/v1/projects/${projectId}/analytics/start-quality-job?batch_size=${batchSize}`);
    return response.data.data;
  },

  /**
   * Get real-time quality processing progress
   * Poll this every 2 seconds while processing is active.
   */
  async getQualityProgress(projectId: string): Promise<QualityProgressResponse> {
    const response = await dataClient.get<{
      data: QualityProgressResponse;
      message: string;
      success: boolean;
    }>(`/api/v1/projects/${projectId}/analytics/quality-progress`);
    return response.data.data;
  },

  /**
   * Cancel an active quality processing job
   */
  async cancelQualityJob(projectId: string): Promise<CancelQualityJobResponse> {
    const response = await dataClient.post<{
      data: CancelQualityJobResponse;
      message: string;
      success: boolean;
    }>(`/api/v1/projects/${projectId}/analytics/cancel-quality-job`);
    return response.data.data;
  },
};

// ============================================================================
// TYPES FOR QUALITY JOB ENDPOINTS
// ============================================================================

export interface StartQualityJobResponse {
  job_id: string;
  total_images: number;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  message: string;
}

export interface QualityProgressResponse {
  job_id: string | null;
  total: number;
  processed: number;
  failed: number;
  remaining: number;
  status: 'idle' | 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  progress_pct: number;
  started_at: string | null;
}

export interface CancelQualityJobResponse {
  cancelled: boolean;
  message: string;
}
