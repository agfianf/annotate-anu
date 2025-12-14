/**
 * Data Management API Client
 * Handles shared images, tags, and project image pool operations
 */

import type { AxiosInstance, AxiosResponse } from 'axios';
import axios from 'axios';
import { getAccessToken } from './api-client';

// ============================================================================
// Types
// ============================================================================

export interface Tag {
  id: string;
  name: string;
  description: string | null;
  color: string;
  created_by: string | null;
  created_at: string;
  usage_count?: number;
}

export interface SharedImage {
  id: string;
  file_path: string;
  filename: string;
  width: number | null;
  height: number | null;
  file_size_bytes: number | null;
  mime_type: string | null;
  checksum_sha256: string | null;
  metadata: Record<string, unknown> | null;
  registered_by: string | null;
  created_at: string;
  updated_at: string;
  thumbnail_url: string | null;
  tags: Tag[];
  annotation_summary?: AnnotationSummary;
}

/**
 * Helper to build absolute thumbnail URL from relative path
 */
export function getAbsoluteThumbnailUrl(thumbnailUrl: string | null): string | null {
  if (!thumbnailUrl) return null;

  // If already absolute, return as-is
  if (thumbnailUrl.startsWith('http://') || thumbnailUrl.startsWith('https://')) {
    return thumbnailUrl;
  }

  // Build absolute URL using API base
  const apiBase = API_BASE_URL;
  return `${apiBase}${thumbnailUrl}`;
}

/**
 * Helper to build full-size thumbnail URL (4x = 1024px) from relative path
 */
export function getFullSizeThumbnailUrl(thumbnailUrl: string | null): string | null {
  if (!thumbnailUrl) return null;

  const baseUrl = getAbsoluteThumbnailUrl(thumbnailUrl);
  if (!baseUrl) return null;

  // Add size=4x query parameter for full-size thumbnail (1024px)
  const url = new URL(baseUrl, window.location.origin);
  url.searchParams.set('size', '4x');
  return url.toString();
}

export interface BulkRegisterResponse {
  registered: SharedImage[];
  already_existed: string[];
  failed: string[];
  total_registered: number;
  total_already_existed: number;
  total_failed: number;
}

export interface BulkTagResponse {
  tags_added: number;
  images_affected: number;
}

export interface ProjectPoolResponse {
  project_id: number;
  total_images: number;
  images_added?: number;
  images_removed?: number;
}

export interface ProjectPoolListResponse {
  project_id: number;
  images: SharedImage[];
  total: number;
  page: number;
  page_size: number;
}

export interface ExploreResponse {
  images: SharedImage[];
  total: number;
  page: number;
  page_size: number;
  filters_applied: Record<string, unknown>;
}

export interface BboxPreview {
  x_min: number;
  y_min: number;
  x_max: number;
  y_max: number;
  label_color: string;
}

export interface AnnotationSummary {
  detection_count: number;
  segmentation_count: number;
  bboxes?: BboxPreview[];
}

export interface JobAssociation {
  job_id: number;
  job_status: string;
  job_sequence: number;
  job_is_archived: boolean;
  task_id: number;
  task_name: string;
  task_status: string;
  task_is_archived: boolean;
  assignee_id: string | null;
  assignee_email: string | null;
}

export interface ExploreFilters {
  search?: string;
  tag_ids?: string[];
  task_ids?: number[];
  job_id?: number;
  is_annotated?: boolean;
  include_annotations?: boolean;
}

export interface ApiResponse<T> {
  data: T;
  message: string;
  status_code: number;
  meta?: {
    total?: number;
    page?: number;
    page_size?: number;
  } | null;
}

export interface TaskCreateWithFilePaths {
  name: string;
  description?: string;
  assignee_id?: string;
  chunk_size: number;
  distribution_order: 'sequential' | 'random';
  file_paths: string[];
}

// ============================================================================
// API Client Setup
// ============================================================================

const API_BASE_URL = import.meta.env.VITE_CORE_API_URL || 'http://localhost:8001';

const dataClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor - add auth header
dataClient.interceptors.request.use(
  (config) => {
    const token = getAccessToken();
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// ============================================================================
// Shared Images API
// ============================================================================

export const sharedImagesApi = {
  /**
   * List all shared images with pagination and filtering
   */
  async list(params?: {
    page?: number;
    page_size?: number;
    search?: string;
    tag_ids?: string[];
  }): Promise<{ images: SharedImage[]; total: number; page: number; page_size: number }> {
    const queryParams = new URLSearchParams();
    if (params?.page) queryParams.append('page', params.page.toString());
    if (params?.page_size) queryParams.append('page_size', params.page_size.toString());
    if (params?.search) queryParams.append('search', params.search);
    if (params?.tag_ids) {
      params.tag_ids.forEach((id) => queryParams.append('tag_ids', id));
    }

    const response: AxiosResponse<ApiResponse<SharedImage[]>> = await dataClient.get(
      `/api/v1/shared-images?${queryParams.toString()}`
    );
    const meta = response.data.meta as { total: number; page: number; page_size: number };
    return {
      images: response.data.data,
      total: meta?.total || response.data.data.length,
      page: meta?.page || 1,
      page_size: meta?.page_size || 50,
    };
  },

  /**
   * Get a single shared image by ID
   */
  async get(imageId: string): Promise<SharedImage> {
    const response: AxiosResponse<ApiResponse<SharedImage>> = await dataClient.get(
      `/api/v1/shared-images/${imageId}`
    );
    return response.data.data;
  },

  /**
   * Register file paths as shared images
   */
  async register(filePaths: string[]): Promise<BulkRegisterResponse> {
    const response: AxiosResponse<ApiResponse<BulkRegisterResponse>> = await dataClient.post(
      '/api/v1/shared-images/register',
      { file_paths: filePaths }
    );
    return response.data.data;
  },

  /**
   * Delete (unregister) a shared image
   */
  async delete(imageId: string): Promise<void> {
    await dataClient.delete(`/api/v1/shared-images/${imageId}`);
  },

  /**
   * Add tags to a shared image
   */
  async addTags(imageId: string, tagIds: string[]): Promise<Tag[]> {
    const response: AxiosResponse<ApiResponse<Tag[]>> = await dataClient.post(
      `/api/v1/shared-images/${imageId}/tags`,
      { tag_ids: tagIds }
    );
    return response.data.data;
  },

  /**
   * Remove a tag from a shared image
   */
  async removeTag(imageId: string, tagId: string): Promise<Tag[]> {
    const response: AxiosResponse<ApiResponse<Tag[]>> = await dataClient.delete(
      `/api/v1/shared-images/${imageId}/tags/${tagId}`
    );
    return response.data.data;
  },

  /**
   * Get all jobs and tasks associated with a shared image
   */
  async getImageJobs(imageId: string): Promise<JobAssociation[]> {
    const response: AxiosResponse<ApiResponse<JobAssociation[]>> = await dataClient.get(
      `/api/v1/shared-images/${imageId}/jobs`
    );
    return response.data.data;
  },

  /**
   * Bulk add tags to multiple images
   */
  async bulkTag(imageIds: string[], tagIds: string[]): Promise<BulkTagResponse> {
    const response: AxiosResponse<ApiResponse<BulkTagResponse>> = await dataClient.post(
      '/api/v1/shared-images/bulk-tag',
      { shared_image_ids: imageIds, tag_ids: tagIds }
    );
    return response.data.data;
  },

  /**
   * Bulk remove tags from multiple images
   */
  async bulkUntag(imageIds: string[], tagIds: string[]): Promise<BulkTagResponse> {
    const response: AxiosResponse<ApiResponse<BulkTagResponse>> = await dataClient.delete(
      '/api/v1/shared-images/bulk-tag',
      { data: { shared_image_ids: imageIds, tag_ids: tagIds } }
    );
    return response.data.data;
  },
};

// ============================================================================
// Tags API
// ============================================================================

export const tagsApi = {
  /**
   * List all tags
   */
  async list(params?: { search?: string; include_usage_count?: boolean }): Promise<Tag[]> {
    const queryParams = new URLSearchParams();
    if (params?.search) queryParams.append('search', params.search);
    if (params?.include_usage_count) queryParams.append('include_usage_count', 'true');

    const response: AxiosResponse<ApiResponse<Tag[]>> = await dataClient.get(
      `/api/v1/tags?${queryParams.toString()}`
    );
    return response.data.data;
  },

  /**
   * Get a single tag by ID
   */
  async get(tagId: string): Promise<Tag> {
    const response: AxiosResponse<ApiResponse<Tag>> = await dataClient.get(
      `/api/v1/tags/${tagId}`
    );
    return response.data.data;
  },

  /**
   * Create a new tag
   */
  async create(data: { name: string; description?: string; color?: string }): Promise<Tag> {
    const response: AxiosResponse<ApiResponse<Tag>> = await dataClient.post(
      '/api/v1/tags',
      data
    );
    return response.data.data;
  },

  /**
   * Update a tag
   */
  async update(
    tagId: string,
    data: { name?: string; description?: string; color?: string }
  ): Promise<Tag> {
    const response: AxiosResponse<ApiResponse<Tag>> = await dataClient.patch(
      `/api/v1/tags/${tagId}`,
      data
    );
    return response.data.data;
  },

  /**
   * Delete a tag
   */
  async delete(tagId: string): Promise<void> {
    await dataClient.delete(`/api/v1/tags/${tagId}`);
  },
};

// ============================================================================
// Project Images API (Project Pool)
// ============================================================================

export const projectImagesApi = {
  /**
   * List images in project pool
   */
  async list(
    projectId: string,
    params?: {
      page?: number;
      page_size?: number;
      search?: string;
      tag_ids?: string[];
    }
  ): Promise<ProjectPoolListResponse> {
    const queryParams = new URLSearchParams();
    if (params?.page) queryParams.append('page', params.page.toString());
    if (params?.page_size) queryParams.append('page_size', params.page_size.toString());
    if (params?.search) queryParams.append('search', params.search);
    if (params?.tag_ids) {
      params.tag_ids.forEach((id) => queryParams.append('tag_ids', id));
    }

    const response: AxiosResponse<ApiResponse<ProjectPoolListResponse>> = await dataClient.get(
      `/api/v1/projects/${projectId}/images?${queryParams.toString()}`
    );
    return response.data.data;
  },

  /**
   * Add images to project pool
   */
  async add(projectId: string, sharedImageIds: string[]): Promise<ProjectPoolResponse> {
    const response: AxiosResponse<ApiResponse<ProjectPoolResponse>> = await dataClient.post(
      `/api/v1/projects/${projectId}/images`,
      { shared_image_ids: sharedImageIds }
    );
    return response.data.data;
  },

  /**
   * Remove images from project pool
   */
  async remove(projectId: string, sharedImageIds: string[]): Promise<ProjectPoolResponse> {
    const response: AxiosResponse<ApiResponse<ProjectPoolResponse>> = await dataClient.delete(
      `/api/v1/projects/${projectId}/images`,
      { data: { shared_image_ids: sharedImageIds } }
    );
    return response.data.data;
  },

  /**
   * Get available images for new tasks
   */
  async getAvailable(
    projectId: string,
    excludeTaskIds?: number[]
  ): Promise<SharedImage[]> {
    const queryParams = new URLSearchParams();
    if (excludeTaskIds) {
      excludeTaskIds.forEach((id) => queryParams.append('exclude_task_ids', id.toString()));
    }

    const response: AxiosResponse<ApiResponse<SharedImage[]>> = await dataClient.get(
      `/api/v1/projects/${projectId}/images/available?${queryParams.toString()}`
    );
    return response.data.data;
  },

  /**
   * Explore images with advanced filtering
   */
  async explore(
    projectId: string,
    filters?: ExploreFilters & { page?: number; page_size?: number }
  ): Promise<ExploreResponse> {
    const queryParams = new URLSearchParams();
    if (filters?.page) queryParams.append('page', filters.page.toString());
    if (filters?.page_size) queryParams.append('page_size', filters.page_size.toString());
    if (filters?.search) queryParams.append('search', filters.search);
    if (filters?.tag_ids) {
      filters.tag_ids.forEach((id) => queryParams.append('tag_ids', id));
    }
    if (filters?.task_ids && filters.task_ids.length > 0) {
      filters.task_ids.forEach((id) => queryParams.append('task_ids', id.toString()));
    }
    if (filters?.job_id !== undefined) queryParams.append('job_id', filters.job_id.toString());
    if (filters?.is_annotated !== undefined) {
      queryParams.append('is_annotated', filters.is_annotated.toString());
    }

    const response: AxiosResponse<ApiResponse<ExploreResponse>> = await dataClient.get(
      `/api/v1/projects/${projectId}/explore?${queryParams.toString()}`
    );
    return response.data.data;
  },
};

// ============================================================================
// Task Creation with File Paths
// ============================================================================

export const taskFilePathsApi = {
  /**
   * Create a task with file paths from file share
   */
  async createWithFilePaths(
    projectId: string,
    data: TaskCreateWithFilePaths
  ): Promise<{
    task: { id: number; name: string; [key: string]: unknown };
    jobs: unknown[];
    total_images: number;
    duplicate_count: number;
    duplicate_filenames: string[];
  }> {
    const response = await dataClient.post(
      `/api/v1/projects/${projectId}/tasks/create-with-file-paths`,
      data
    );
    return response.data.data;
  },
};

export default dataClient;
