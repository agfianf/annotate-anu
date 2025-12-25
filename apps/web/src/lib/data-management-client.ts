/**
 * Data Management API Client
 * Handles shared images, tags, and project image pool operations
 */

import type { AxiosInstance, AxiosResponse, AxiosError, InternalAxiosRequestConfig } from 'axios';
import axios from 'axios';
import { getAccessToken, getRefreshToken, setTokens, clearTokens, getStoredUser } from './api-client';
import type { ApiResponse as AuthApiResponse, TokenOnlyResponse } from './api-client';

// ============================================================================
// Types
// ============================================================================

export interface TagCategory {
  id: string | null;  // null for virtual "uncategorized" category
  project_id: number;
  name: string;
  display_name: string | null;
  color: string;
  sidebar_order: number;
  created_by: string | null;
  created_at: string | null;  // null for virtual categories
  tag_count?: number;
  tags?: Tag[];
}

export interface Tag {
  id: string;
  project_id: number;
  category_id: string | null;
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
  page?: number;
  page_size?: number;
  search?: string;
  tag_ids?: string[];
  excluded_tag_ids?: string[];
  include_match_mode?: 'AND' | 'OR';
  exclude_match_mode?: 'AND' | 'OR';
  task_ids?: number[];
  job_id?: number;
  is_annotated?: boolean;
  width_min?: number;
  width_max?: number;
  height_min?: number;
  height_max?: number;
  file_size_min?: number;
  file_size_max?: number;
  filepath_pattern?: string;
  filepath_paths?: string[]; // Filter by specific directory paths (checkbox-based)
  include_annotations?: boolean;
  image_uids?: string[]; // Filter by specific image UIDs
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

// Response interceptor - handle 401 and refresh token
let isRefreshing = false;
let failedQueue: Array<{
  resolve: (token: string) => void;
  reject: (error: unknown) => void;
}> = [];

const processQueue = (error: unknown, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else if (token) {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

dataClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((token) => {
            if (originalRequest.headers) {
              originalRequest.headers.Authorization = `Bearer ${token}`;
            }
            return dataClient(originalRequest);
          })
          .catch((err) => Promise.reject(err));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      const refreshToken = getRefreshToken();
      if (!refreshToken) {
        clearTokens();
        window.location.href = '/login';
        return Promise.reject(error);
      }

      try {
        const formData = new FormData();
        formData.append('refresh_token', refreshToken);

        const response = await axios.post<AuthApiResponse<TokenOnlyResponse>>(
          `${API_BASE_URL}/api/v1/auth/refresh`,
          formData,
          { headers: { 'Content-Type': 'multipart/form-data' } }
        );

        const { access_token, expires_in } = response.data.data;
        const user = getStoredUser();
        if (user) {
          setTokens(access_token, refreshToken, user, expires_in);
        }

        processQueue(null, access_token);

        if (originalRequest.headers) {
          originalRequest.headers.Authorization = `Bearer ${access_token}`;
        }
        return dataClient(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError, null);
        clearTokens();
        window.location.href = '/login';
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
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
   * Get all jobs and tasks associated with a shared image
   */
  async getImageJobs(imageId: string): Promise<JobAssociation[]> {
    const response: AxiosResponse<ApiResponse<JobAssociation[]>> = await dataClient.get(
      `/api/v1/shared-images/${imageId}/jobs`
    );
    return response.data.data;
  },
};

// ============================================================================
// Tags API (Project-Scoped)
// ============================================================================

export const tagsApi = {
  /**
   * List all tags for a project
   */
  async list(
    projectId: number,
    params?: { search?: string; include_usage_count?: boolean }
  ): Promise<Tag[]> {
    const queryParams = new URLSearchParams();
    if (params?.search) queryParams.append('search', params.search);
    if (params?.include_usage_count) queryParams.append('include_usage_count', 'true');

    const response: AxiosResponse<ApiResponse<Tag[]>> = await dataClient.get(
      `/api/v1/projects/${projectId}/tags?${queryParams.toString()}`
    );
    return response.data.data;
  },

  /**
   * Get a single tag by ID within a project
   */
  async get(projectId: number, tagId: string): Promise<Tag> {
    const response: AxiosResponse<ApiResponse<Tag>> = await dataClient.get(
      `/api/v1/projects/${projectId}/tags/${tagId}`
    );
    return response.data.data;
  },

  /**
   * Create a new tag in a project
   */
  async create(
    projectId: number,
    data: { name: string; description?: string; color?: string; category_id?: string }
  ): Promise<Tag> {
    const response: AxiosResponse<ApiResponse<Tag>> = await dataClient.post(
      `/api/v1/projects/${projectId}/tags`,
      data
    );
    return response.data.data;
  },

  /**
   * Update a tag in a project
   */
  async update(
    projectId: number,
    tagId: string,
    data: { name?: string; description?: string; color?: string; category_id?: string }
  ): Promise<Tag> {
    const response: AxiosResponse<ApiResponse<Tag>> = await dataClient.patch(
      `/api/v1/projects/${projectId}/tags/${tagId}`,
      data
    );
    return response.data.data;
  },

  /**
   * Delete a tag from a project
   */
  async delete(projectId: number, tagId: string): Promise<void> {
    await dataClient.delete(`/api/v1/projects/${projectId}/tags/${tagId}`);
  },

  /**
   * List only uncategorized tags (tags in the "Uncategorized" category)
   */
  async listUncategorized(projectId: number): Promise<Tag[]> {
    const allTags = await this.list(projectId, { include_usage_count: true });

    // Get the uncategorized category
    const categories = await tagCategoriesApi.listWithTags(projectId);
    const uncategorizedCategory = categories.find((cat) => cat.name === 'uncategorized');

    if (!uncategorizedCategory) return [];

    return allTags.filter((tag) => tag.category_id === uncategorizedCategory.id);
  },
};

// ============================================================================
// Tag Categories API (Project-Scoped Hierarchical Tags)
// ============================================================================

export const tagCategoriesApi = {
  /**
   * List all tag categories for a project
   */
  async list(
    projectId: number,
    params?: { include_tags?: boolean; include_tag_count?: boolean }
  ): Promise<TagCategory[]> {
    const queryParams = new URLSearchParams();
    if (params?.include_tags) queryParams.append('include_tags', 'true');
    if (params?.include_tag_count) queryParams.append('include_tag_count', 'true');

    const response: AxiosResponse<ApiResponse<TagCategory[]>> = await dataClient.get(
      `/api/v1/projects/${projectId}/tag-categories?${queryParams.toString()}`
    );
    return response.data.data;
  },

  /**
   * Get a single tag category by ID within a project
   */
  async get(projectId: number, categoryId: string): Promise<TagCategory> {
    const response: AxiosResponse<ApiResponse<TagCategory>> = await dataClient.get(
      `/api/v1/projects/${projectId}/tag-categories/${categoryId}`
    );
    return response.data.data;
  },

  /**
   * Create a new tag category in a project
   */
  async create(
    projectId: number,
    data: {
      name: string;
      display_name?: string;
      color?: string;
      sidebar_order?: number;
    }
  ): Promise<TagCategory> {
    const response: AxiosResponse<ApiResponse<TagCategory>> = await dataClient.post(
      `/api/v1/projects/${projectId}/tag-categories`,
      data
    );
    return response.data.data;
  },

  /**
   * Update a tag category in a project
   */
  async update(
    projectId: number,
    categoryId: string,
    data: {
      name?: string;
      display_name?: string;
      color?: string;
      sidebar_order?: number;
    }
  ): Promise<TagCategory> {
    const response: AxiosResponse<ApiResponse<TagCategory>> = await dataClient.patch(
      `/api/v1/projects/${projectId}/tag-categories/${categoryId}`,
      data
    );
    return response.data.data;
  },

  /**
   * Delete a tag category from a project
   */
  async delete(projectId: number, categoryId: string): Promise<void> {
    await dataClient.delete(`/api/v1/projects/${projectId}/tag-categories/${categoryId}`);
  },

  /**
   * Reorder tag categories in sidebar
   */
  async reorder(
    projectId: number,
    categoryOrders: Array<{ id: string; sidebar_order: number }>
  ): Promise<TagCategory[]> {
    const response: AxiosResponse<ApiResponse<TagCategory[]>> = await dataClient.post(
      `/api/v1/projects/${projectId}/tag-categories/reorder`,
      { category_orders: categoryOrders }
    );
    return response.data.data;
  },

  /**
   * List categories with nested tags included
   */
  async listWithTags(projectId: number): Promise<TagCategory[]> {
    return this.list(projectId, { include_tags: true });
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
    if (filters?.excluded_tag_ids) {
      filters.excluded_tag_ids.forEach((id) => queryParams.append('excluded_tag_ids', id));
    }
    if (filters?.include_match_mode) {
      queryParams.append('include_match_mode', filters.include_match_mode);
    }
    if (filters?.exclude_match_mode) {
      queryParams.append('exclude_match_mode', filters.exclude_match_mode);
    }
    if (filters?.task_ids && filters.task_ids.length > 0) {
      filters.task_ids.forEach((id) => queryParams.append('task_ids', id.toString()));
    }
    if (filters?.job_id !== undefined) queryParams.append('job_id', filters.job_id.toString());
    if (filters?.is_annotated !== undefined) {
      queryParams.append('is_annotated', filters.is_annotated.toString());
    }
    // Metadata filters - round width/height to integers as backend expects int
    if (filters?.width_min !== undefined) queryParams.append('width_min', Math.round(filters.width_min).toString());
    if (filters?.width_max !== undefined) queryParams.append('width_max', Math.round(filters.width_max).toString());
    if (filters?.height_min !== undefined) queryParams.append('height_min', Math.round(filters.height_min).toString());
    if (filters?.height_max !== undefined) queryParams.append('height_max', Math.round(filters.height_max).toString());
    if (filters?.file_size_min !== undefined) queryParams.append('file_size_min', Math.round(filters.file_size_min).toString());
    if (filters?.file_size_max !== undefined) queryParams.append('file_size_max', Math.round(filters.file_size_max).toString());
    if (filters?.filepath_pattern) queryParams.append('filepath_pattern', filters.filepath_pattern);
    if (filters?.filepath_paths && filters.filepath_paths.length > 0) {
      filters.filepath_paths.forEach((path) => queryParams.append('filepath_paths', path));
    }
    if (filters?.image_uids && filters.image_uids.length > 0) {
      filters.image_uids.forEach((id) => queryParams.append('image_uids', id));
    }

    const response: AxiosResponse<ApiResponse<ExploreResponse>> = await dataClient.get(
      `/api/v1/projects/${projectId}/explore?${queryParams.toString()}`
    );
    return response.data.data;
  },

  /**
   * Add tags to an image in the project
   */
  async addTags(projectId: number, imageId: string, tagIds: string[]): Promise<Tag[]> {
    const response: AxiosResponse<ApiResponse<Tag[]>> = await dataClient.post(
      `/api/v1/projects/${projectId}/images/${imageId}/tags`,
      { tag_ids: tagIds }
    );
    return response.data.data;
  },

  /**
   * Remove a tag from an image in the project
   */
  async removeTag(projectId: number, imageId: string, tagId: string): Promise<Tag[]> {
    const response: AxiosResponse<ApiResponse<Tag[]>> = await dataClient.delete(
      `/api/v1/projects/${projectId}/images/${imageId}/tags/${tagId}`
    );
    return response.data.data;
  },

  /**
   * Bulk add tags to multiple images in the project
   */
  async bulkTag(projectId: number, imageIds: string[], tagIds: string[]): Promise<BulkTagResponse> {
    const response: AxiosResponse<ApiResponse<BulkTagResponse>> = await dataClient.post(
      `/api/v1/projects/${projectId}/images/bulk-tag`,
      { shared_image_ids: imageIds, tag_ids: tagIds }
    );
    return response.data.data;
  },

  /**
   * Bulk remove tags from multiple images in the project
   */
  async bulkUntag(projectId: number, imageIds: string[], tagIds: string[]): Promise<BulkTagResponse> {
    const response: AxiosResponse<ApiResponse<BulkTagResponse>> = await dataClient.delete(
      `/api/v1/projects/${projectId}/images/bulk-tag`,
      { data: { shared_image_ids: imageIds, tag_ids: tagIds } }
    );
    return response.data.data;
  },

  /**
   * Get sidebar aggregations for FiftyOne-style filtering
   */
  async getSidebarAggregations(
    projectId: string,
    filters?: { tag_ids?: string[] }
  ): Promise<SidebarAggregationResponse> {
    const queryParams = new URLSearchParams();
    if (filters?.tag_ids) {
      filters.tag_ids.forEach((id) => queryParams.append('tag_ids', id));
    }

    const response: AxiosResponse<ApiResponse<SidebarAggregationResponse>> = await dataClient.get(
      `/api/v1/projects/${projectId}/explore/sidebar?${queryParams.toString()}`
    );
    return response.data.data;
  },
};

// ============================================================================
// Sidebar Aggregation Types
// ============================================================================

export interface TagCount {
  id: string;
  name: string;
  color: string;
  count: number;
}

export interface CategoricalValueCount {
  value: string;
  count: number;
}

export interface CategoricalAggregation {
  schema_id: string;
  name: string;
  display_name: string | null;
  color: string;
  values: CategoricalValueCount[];
}

export interface HistogramBucket {
  bucket_start: number;
  bucket_end: number;
  count: number;
}

export interface NumericAggregation {
  schema_id: string;
  name: string;
  display_name: string | null;
  min_value: number;
  max_value: number;
  mean: number;
  histogram: HistogramBucket[];
}

export interface SizeDistribution {
  small: number;
  medium: number;
  large: number;
}

export interface ComputedFieldsAggregation {
  size_distribution: SizeDistribution;
  width_stats?: NumericAggregation;
  height_stats?: NumericAggregation;
  file_size_stats?: NumericAggregation;
}

export interface SidebarAggregationResponse {
  total_images: number;
  filtered_images: number;
  tags: TagCount[];
  categorical_attributes: CategoricalAggregation[];
  numeric_attributes: NumericAggregation[];
  computed: ComputedFieldsAggregation;
}

// ============================================================================
// Attribute Schemas Types
// ============================================================================

export interface AttributeSchema {
  id: string;
  project_id: number;
  name: string;
  display_name: string | null;
  field_type: 'categorical' | 'numeric' | 'boolean' | 'string';
  allowed_values: string[] | null;
  default_value: string | null;
  min_value: number | null;
  max_value: number | null;
  unit: string | null;
  color: string;
  icon: string | null;
  sidebar_order: number;
  is_filterable: boolean;
  is_visible: boolean;
  created_by: string | null;
  created_at: string;
}

export interface AttributeSchemaCreate {
  name: string;
  display_name?: string;
  field_type: 'categorical' | 'numeric' | 'boolean' | 'string';
  allowed_values?: string[];
  default_value?: string;
  min_value?: number;
  max_value?: number;
  unit?: string;
  color?: string;
  icon?: string;
  sidebar_order?: number;
  is_filterable?: boolean;
  is_visible?: boolean;
}

// ============================================================================
// Attribute Schemas API
// ============================================================================

export const attributeSchemasApi = {
  /**
   * List all attribute schemas for a project
   */
  async list(projectId: string | number): Promise<AttributeSchema[]> {
    const response: AxiosResponse<ApiResponse<AttributeSchema[]>> = await dataClient.get(
      `/api/v1/projects/${projectId}/attributes/schemas`
    );
    return response.data.data;
  },

  /**
   * Get a single attribute schema by ID
   */
  async get(projectId: string | number, schemaId: string): Promise<AttributeSchema> {
    const response: AxiosResponse<ApiResponse<AttributeSchema>> = await dataClient.get(
      `/api/v1/projects/${projectId}/attributes/schemas/${schemaId}`
    );
    return response.data.data;
  },

  /**
   * Create a new attribute schema
   */
  async create(
    projectId: string | number,
    data: AttributeSchemaCreate
  ): Promise<AttributeSchema> {
    const response: AxiosResponse<ApiResponse<AttributeSchema>> = await dataClient.post(
      `/api/v1/projects/${projectId}/attributes/schemas`,
      data
    );
    return response.data.data;
  },

  /**
   * Update an attribute schema
   */
  async update(
    projectId: string | number,
    schemaId: string,
    data: Partial<AttributeSchemaCreate>
  ): Promise<AttributeSchema> {
    const response: AxiosResponse<ApiResponse<AttributeSchema>> = await dataClient.patch(
      `/api/v1/projects/${projectId}/attributes/schemas/${schemaId}`,
      data
    );
    return response.data.data;
  },

  /**
   * Delete an attribute schema
   */
  async delete(projectId: string | number, schemaId: string): Promise<void> {
    await dataClient.delete(`/api/v1/projects/${projectId}/attributes/schemas/${schemaId}`);
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
