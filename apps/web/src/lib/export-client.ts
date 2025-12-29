/**
 * Export API Client for Team Mode versioned export feature.
 */

import type {
  ClassificationOptionsResponse,
  Export,
  ExportCreate,
  ExportListParams,
  ExportListResponse,
  ExportPreview,
  SavedFilter,
  SavedFilterCreate,
  SavedFilterUpdate,
} from '@/types/export';
import { apiClient } from './api-client';

interface ApiResponse<T> {
  data: T;
  message: string;
  status_code: number;
  meta: unknown | null;
}

// ============================================================================
// Saved Filters API
// ============================================================================
export const savedFiltersApi = {
  /**
   * List all saved filters for a project.
   */
  async list(projectId: string | number): Promise<SavedFilter[]> {
    const response = await apiClient.get<ApiResponse<SavedFilter[]>>(
      `/api/v1/projects/${projectId}/saved-filters`
    );
    return response.data.data;
  },

  /**
   * Create a new saved filter.
   */
  async create(projectId: string | number, data: SavedFilterCreate): Promise<SavedFilter> {
    const response = await apiClient.post<ApiResponse<SavedFilter>>(
      `/api/v1/projects/${projectId}/saved-filters`,
      data
    );
    return response.data.data;
  },

  /**
   * Get a saved filter by ID.
   */
  async get(projectId: string | number, filterId: string): Promise<SavedFilter> {
    const response = await apiClient.get<ApiResponse<SavedFilter>>(
      `/api/v1/projects/${projectId}/saved-filters/${filterId}`
    );
    return response.data.data;
  },

  /**
   * Update a saved filter.
   */
  async update(
    projectId: string | number,
    filterId: string,
    data: SavedFilterUpdate
  ): Promise<SavedFilter> {
    const response = await apiClient.patch<ApiResponse<SavedFilter>>(
      `/api/v1/projects/${projectId}/saved-filters/${filterId}`,
      data
    );
    return response.data.data;
  },

  /**
   * Delete a saved filter.
   */
  async delete(projectId: string | number, filterId: string): Promise<void> {
    await apiClient.delete(`/api/v1/projects/${projectId}/saved-filters/${filterId}`);
  },
};

// ============================================================================
// Exports API
// ============================================================================
export const exportsApi = {
  /**
   * Preview export counts without creating the export.
   */
  async preview(projectId: string | number, config: ExportCreate): Promise<ExportPreview> {
    const response = await apiClient.post<ApiResponse<ExportPreview>>(
      `/api/v1/projects/${projectId}/exports/preview`,
      config
    );
    return response.data.data;
  },

  /**
   * Create a new export job.
   */
  async create(projectId: string | number, config: ExportCreate): Promise<Export> {
    const response = await apiClient.post<ApiResponse<Export>>(
      `/api/v1/projects/${projectId}/exports`,
      config
    );
    return response.data.data;
  },

  /**
   * List export history for a project with optional filtering and sorting.
   */
  async list(
    projectId: string | number,
    options?: ExportListParams
  ): Promise<ExportListResponse> {
    const params = new URLSearchParams();
    if (options?.page) params.append('page', String(options.page));
    if (options?.pageSize) params.append('page_size', String(options.pageSize));
    if (options?.status) params.append('status', options.status);
    if (options?.exportMode) params.append('export_mode', options.exportMode);
    if (options?.sortBy) params.append('sort_by', options.sortBy);
    if (options?.sortOrder) params.append('sort_order', options.sortOrder);

    const response = await apiClient.get<ApiResponse<ExportListResponse>>(
      `/api/v1/projects/${projectId}/exports?${params.toString()}`
    );
    return response.data.data;
  },

  /**
   * Get an export by ID.
   */
  async get(projectId: string | number, exportId: string): Promise<Export> {
    const response = await apiClient.get<ApiResponse<Export>>(
      `/api/v1/projects/${projectId}/exports/${exportId}`
    );
    return response.data.data;
  },

  /**
   * Download export artifact.
   * Returns a blob that can be used to create a download link.
   */
  async download(projectId: string | number, exportId: string): Promise<Blob> {
    const response = await apiClient.get(
      `/api/v1/projects/${projectId}/exports/${exportId}/download`,
      { responseType: 'blob' }
    );
    return response.data;
  },

  /**
   * Delete an export and its artifact.
   */
  async delete(projectId: string | number, exportId: string): Promise<void> {
    await apiClient.delete(`/api/v1/projects/${projectId}/exports/${exportId}`);
  },

  /**
   * Get classification options for export wizard.
   */
  async getClassificationOptions(
    projectId: string | number
  ): Promise<ClassificationOptionsResponse> {
    const response = await apiClient.get<ApiResponse<ClassificationOptionsResponse>>(
      `/api/v1/projects/${projectId}/exports/classification-options`
    );
    return response.data.data;
  },
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Trigger a download for an export artifact.
 */
export async function downloadExportArtifact(
  projectId: string | number,
  exportId: string,
  filename?: string
): Promise<void> {
  const blob = await exportsApi.download(projectId, exportId);
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename || `export_${exportId}.zip`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
}

/**
 * Poll for export completion.
 * @param projectId Project ID
 * @param exportId Export ID
 * @param intervalMs Polling interval in milliseconds (default: 2000)
 * @param maxAttempts Maximum polling attempts (default: 150 = 5 minutes with 2s interval)
 */
export async function pollExportStatus(
  projectId: string | number,
  exportId: string,
  intervalMs = 2000,
  maxAttempts = 150
): Promise<Export> {
  let attempts = 0;

  while (attempts < maxAttempts) {
    const exportData = await exportsApi.get(projectId, exportId);

    if (exportData.status === 'completed' || exportData.status === 'failed') {
      return exportData;
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
    attempts++;
  }

  throw new Error('Export polling timeout');
}

/**
 * Format file size for display.
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

/**
 * Get status badge color for export status.
 */
export function getExportStatusColor(status: string): string {
  switch (status) {
    case 'pending':
      return 'bg-yellow-100 text-yellow-800';
    case 'processing':
      return 'bg-blue-100 text-blue-800';
    case 'completed':
      return 'bg-green-100 text-green-800';
    case 'failed':
      return 'bg-red-100 text-red-800';
    default:
      return 'bg-gray-100 text-gray-800';
  }
}

/**
 * Get mode icon/label for display.
 */
export function getExportModeLabel(mode: string): string {
  switch (mode) {
    case 'classification':
      return 'Classification';
    case 'detection':
      return 'Detection';
    case 'segmentation':
      return 'Segmentation';
    default:
      return mode;
  }
}

/**
 * Get output format label for display.
 */
export function getOutputFormatLabel(format: string): string {
  switch (format) {
    case 'coco_json':
      return 'COCO JSON';
    case 'manifest_csv':
      return 'CSV Manifest';
    case 'image_folder':
      return 'Image Folder';
    default:
      return format;
  }
}

/**
 * Get download URL for an export artifact.
 * This URL requires authentication to access.
 */
export function getExportDownloadUrl(projectId: string | number, exportId: string): string {
  const baseUrl = import.meta.env.VITE_CORE_API_URL !== undefined
    ? import.meta.env.VITE_CORE_API_URL
    : '';
  return `${baseUrl}/api/v1/projects/${projectId}/exports/${exportId}/download`;
}

/**
 * Generate a human-readable filter summary from filter snapshot.
 */
export function getFilterSummary(filterSnapshot: Record<string, unknown>): string {
  const parts: string[] = [];

  const tagIds = filterSnapshot.tag_ids as string[] | undefined;
  const excludedTagIds = filterSnapshot.excluded_tag_ids as string[] | undefined;
  const taskIds = filterSnapshot.task_ids as number[] | undefined;
  const jobId = filterSnapshot.job_id as number | undefined;
  const isAnnotated = filterSnapshot.is_annotated as boolean | undefined;
  const filepathPaths = filterSnapshot.filepath_paths as string[] | undefined;
  const includeMode = filterSnapshot.include_match_mode as string | undefined;

  if (tagIds && tagIds.length > 0) {
    const mode = includeMode === 'AND' ? 'AND' : 'OR';
    parts.push(`${tagIds.length} tag${tagIds.length > 1 ? 's' : ''} (${mode})`);
  }

  if (excludedTagIds && excludedTagIds.length > 0) {
    parts.push(`${excludedTagIds.length} excluded`);
  }

  if (taskIds && taskIds.length > 0) {
    parts.push(`${taskIds.length} task${taskIds.length > 1 ? 's' : ''}`);
  }

  if (jobId) {
    parts.push(`1 job`);
  }

  if (isAnnotated === true) {
    parts.push('annotated only');
  } else if (isAnnotated === false) {
    parts.push('not annotated');
  }

  if (filepathPaths && filepathPaths.length > 0) {
    parts.push(`${filepathPaths.length} path${filepathPaths.length > 1 ? 's' : ''}`);
  }

  if (parts.length === 0) {
    return 'No filters';
  }

  return parts.join(', ');
}
