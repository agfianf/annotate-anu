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
import { filterContractToSearchParams, toFilterContract } from './explore-filter-contract';

/**
 * Build query params from explore filters.
 *
 * Serialises the full canonical contract, so a panel that is given the gallery's filters describes exactly the gallery's image set — no subset of the contract is dropped on the way, which is what used to make a filtered panel disagree with the grid beside it. Not every panel is scoped that way: `useDatasetStats`, `useAnnotationCoverage`, `useEnhancedDatasetStats` and `useAnnotationAnalysis` deliberately pass `{}` because they describe the whole dataset regardless of the gallery's filters. The contract is honest about whichever set it is handed; it does not make the two agree.
 *
 * It also emits list values as repeated keys (`tag_ids=a&tag_ids=b`), which is what FastAPI binds; axios' default array encoding (`tag_ids[]=a`) does not bind at all.
 */
function buildFilterParams(filters: ExploreFilters): URLSearchParams {
  return filterContractToSearchParams(toFilterContract(filters));
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
    filters: ExploreFilters = {},
    signal?: AbortSignal
  ): Promise<DatasetStatsResponse> {
    const params = buildFilterParams(filters);
    const response = await dataClient.get<{
      data: DatasetStatsResponse;
      message: string;
      success: boolean;
    }>(`/api/v1/projects/${projectId}/analytics/dataset-stats`, { params, signal });
    return response.data.data;
  },

  /**
   * Get annotation coverage analytics
   */
  async getAnnotationCoverage(
    projectId: string,
    filters: ExploreFilters = {},
    signal?: AbortSignal
  ): Promise<AnnotationCoverageResponse> {
    const params = buildFilterParams(filters);
    const response = await dataClient.get<{
      data: AnnotationCoverageResponse;
      message: string;
      success: boolean;
    }>(`/api/v1/projects/${projectId}/analytics/annotation-coverage`, { params, signal });
    return response.data.data;
  },

  /**
   * Get class balance analytics
   * @param category_id Optional category ID to filter by specific category
   */
  async getClassBalance(
    projectId: string,
    filters: ExploreFilters = {},
    category_id?: string | null,
    signal?: AbortSignal
  ): Promise<ClassBalanceResponse> {
    const params = buildFilterParams(filters);
    if (category_id) {
      params.append('category_id', category_id);
    }
    const response = await dataClient.get<{
      data: ClassBalanceResponse;
      message: string;
      success: boolean;
    }>(`/api/v1/projects/${projectId}/analytics/class-balance`, { params, signal });
    return response.data.data;
  },

  /**
   * Get spatial heatmap analytics
   */
  async getSpatialHeatmap(
    projectId: string,
    filters: ExploreFilters = {},
    signal?: AbortSignal
  ): Promise<SpatialHeatmapResponse> {
    const params = buildFilterParams(filters);
    const response = await dataClient.get<{
      data: SpatialHeatmapResponse;
      message: string;
      success: boolean;
    }>(`/api/v1/projects/${projectId}/analytics/spatial-heatmap`, { params, signal });
    return response.data.data;
  },

  /**
   * Get image quality analytics
   */
  async getImageQuality(
    projectId: string,
    filters: ExploreFilters = {},
    signal?: AbortSignal
  ): Promise<ImageQualityResponse> {
    const params = buildFilterParams(filters);
    const response = await dataClient.get<{
      data: ImageQualityResponse;
      message: string;
      success: boolean;
    }>(`/api/v1/projects/${projectId}/analytics/image-quality`, { params, signal });
    return response.data.data;
  },

  /**
   * Get dimension insights analytics (Roboflow-style)
   */
  async getDimensionInsights(
    projectId: string,
    filters: ExploreFilters = {},
    signal?: AbortSignal
  ): Promise<DimensionInsightsResponse> {
    const params = buildFilterParams(filters);
    const response = await dataClient.get<{
      data: DimensionInsightsResponse;
      message: string;
      success: boolean;
    }>(`/api/v1/projects/${projectId}/analytics/dimension-insights`, { params, signal });
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
    category_id?: string | null,
    signal?: AbortSignal
  ): Promise<EnhancedDatasetStatsResponse> {
    const params = buildFilterParams(filters);
    if (category_id) {
      params.append('category_id', category_id);
    }
    const response = await dataClient.get<{
      data: EnhancedDatasetStatsResponse;
      message: string;
      success: boolean;
    }>(`/api/v1/projects/${projectId}/analytics/enhanced-dataset-stats`, { params, signal });
    return response.data.data;
  },

  /**
   * Get annotation analysis (consolidated)
   * Combines: Annotation Coverage + Spatial Heatmap
   */
  async getAnnotationAnalysis(
    projectId: string,
    filters: ExploreFilters = {},
    gridSize: number = 10,
    signal?: AbortSignal
  ): Promise<AnnotationAnalysisResponse> {
    const params = buildFilterParams(filters);
    params.append('grid_size', gridSize.toString());
    const response = await dataClient.get<{
      data: AnnotationAnalysisResponse;
      message: string;
      success: boolean;
    }>(`/api/v1/projects/${projectId}/analytics/annotation-analysis`, { params, signal });
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
