/**
 * API Client for backend communication
 * Handles authentication, token refresh, and typed API calls
 */

import type { AxiosError, AxiosInstance, InternalAxiosRequestConfig } from 'axios';
import axios from 'axios';

// Types
export interface User {
  id: string;
  email: string;
  username: string;
  full_name: string | null;
  role: 'admin' | 'member' | 'annotator';
  is_active: boolean;
  created_at: string;
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  user: User;
}

export interface TokenOnlyResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

export interface ApiResponse<T> {
  data: T;
  message: string;
  status_code: number;
  meta: unknown | null;
}

export interface Project {
  id: number;
  name: string;
  description: string | null;
  readme: string | null;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
}

export interface ProjectDetail extends Project {
  labels: Label[];
  task_count: number;
  member_count: number;
  annotation_types: string[];
  user_role: 'owner' | 'maintainer' | 'annotator' | 'viewer';
}


export interface Label {
  id: string;
  name: string;
  color: string;
  project_id: number;
  created_at?: string;
}


export interface Task {
  id: number;
  name: string;
  description: string | null;
  status: string;
  is_archived: boolean;
  assignee_id: string | null;
  assignee?: MemberUserInfo | null;
  project_id: number;
  split: 'train' | 'val' | 'test' | null;
  created_at: string;
  updated_at: string;
}

export interface TaskDetail extends Task {
  job_count: number;
}

export interface Job {
  id: string;
  name: string | null;
  status: string;
  is_archived: boolean;
  assignee_id: string | null;
  assignee?: MemberUserInfo | null;
  task_id: string;
  total_images: number;
  annotated_images: number;
  created_at: string;
  updated_at: string;
}

export interface JobDetail extends Job {
  image_count: number;
  project_id: number | null;
  labels: Label[];
}


// Types for Task Creation Flow
export interface MockImage {
  filename: string;
  width?: number;
  height?: number;
  file_size_bytes?: number;
  checksum_sha256?: string;
}

export interface TaskCreateWithImages {
  name: string;
  description?: string;
  assignee_id?: string;
  split?: 'train' | 'val' | 'test' | null;
  chunk_size: number;
  distribution_order: 'sequential' | 'random';
  images: MockImage[];
}

export interface JobPreview {
  sequence_number: number;
  image_count: number;
}

export interface TaskCreationPreview {
  task_name: string;
  total_images: number;
  chunk_size: number;
  distribution_order: string;
  jobs: JobPreview[];
}

export interface TaskWithJobsResponse {
  task: Task;
  jobs: Job[];
  total_images: number;
  duplicate_count: number;
  duplicate_filenames: string[];
}

export interface ProjectMember {
  id: string;
  user_id: string;
  project_id: number;
  role: string;
  allowed_task_ids: number[] | null;
  allowed_job_ids: number[] | null;
  created_at: string;
  updated_at: string;
  user?: User;
}

export interface MemberUserInfo {
  id: string;
  username: string;
  full_name: string | null;
}

export interface ProjectActivity {
  id: string;
  project_id: number;
  entity_type: 'task' | 'job' | 'label' | 'member' | 'project';
  entity_id: string;
  assignee_id: string | null;
  status: 'pending' | 'assigned' | 'in_progress' | 'completed' | 'review' | 'approved' | 'rejected';
  action: 'created' | 'updated' | 'deleted' | 'status_changed' | 'assigned';
  actor_id: string | null;
  actor_name: string | null;
  previous_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  created_at: string;
}

// Storage keys
const ACCESS_TOKEN_KEY = 'access_token';
const REFRESH_TOKEN_KEY = 'refresh_token';
const USER_KEY = 'user';
const TOKEN_EXPIRY_KEY = 'token_expiry';

// Token management
export const getAccessToken = (): string | null => localStorage.getItem(ACCESS_TOKEN_KEY);
export const getRefreshToken = (): string | null => localStorage.getItem(REFRESH_TOKEN_KEY);
export const getStoredUser = (): User | null => {
  const user = localStorage.getItem(USER_KEY);
  return user ? JSON.parse(user) : null;
};

export const getTokenExpiry = (): number | null => {
  const expiry = localStorage.getItem(TOKEN_EXPIRY_KEY);
  return expiry ? parseInt(expiry, 10) : null;
};

export const isTokenExpired = (): boolean => {
  const expiry = getTokenExpiry();
  if (!expiry) return true;
  // Add 30 second buffer to refresh before actual expiration
  return Date.now() >= expiry - 30000;
};

export const setTokens = (accessToken: string, refreshToken: string, user: User, expiresIn?: number): void => {
  localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
  localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
  localStorage.setItem(USER_KEY, JSON.stringify(user));

  if (expiresIn) {
    const expiryTime = Date.now() + expiresIn * 1000;
    localStorage.setItem(TOKEN_EXPIRY_KEY, expiryTime.toString());
  }
};

export const clearTokens = (): void => {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem(TOKEN_EXPIRY_KEY);
};

/**
 * Proactively refresh the access token if it's expired
 * Returns true if token was refreshed, false if no refresh was needed
 */
export const refreshTokenIfNeeded = async (): Promise<boolean> => {
  if (!isTokenExpired()) {
    return false; // Token is still valid
  }

  const refreshToken = getRefreshToken();
  if (!refreshToken) {
    clearTokens();
    throw new Error('No refresh token available');
  }

  try {
    const formData = new FormData();
    formData.append('refresh_token', refreshToken);

    const response = await axios.post<ApiResponse<TokenOnlyResponse>>(
      `${import.meta.env.VITE_CORE_API_URL || 'http://localhost:8001'}/api/v1/auth/refresh`,
      formData,
      { headers: { 'Content-Type': 'multipart/form-data' } }
    );

    const { access_token, expires_in } = response.data.data;
    const user = getStoredUser();
    if (user) {
      setTokens(access_token, refreshToken, user, expires_in);
    }

    return true;
  } catch (error) {
    clearTokens();
    throw error;
  }
};

// API Base URL - Uses VITE_CORE_API_URL for management APIs (auth, projects, admin, etc.)
const API_BASE_URL = import.meta.env.VITE_CORE_API_URL || 'http://localhost:8001';

// Create axios instance
export const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor - add auth header
apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
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

apiClient.interceptors.response.use(
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
            return apiClient(originalRequest);
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

        const response = await axios.post<ApiResponse<TokenOnlyResponse>>(
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
        return apiClient(originalRequest);
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
// Auth API
// ============================================================================

export const authApi = {
  async login(email: string, password: string): Promise<TokenResponse> {
    const formData = new URLSearchParams();
    formData.append('username', email); // OAuth2 uses 'username' field
    formData.append('password', password);

    const response = await apiClient.post<ApiResponse<TokenResponse>>(
      '/api/v1/auth/login',
      formData,
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
    return response.data.data;
  },

  async register(data: {
    email: string;
    username: string;
    password: string;
    confirm_password: string;
    full_name: string;
    role?: string;
  }): Promise<TokenResponse> {
    const response = await apiClient.post<ApiResponse<TokenResponse>>(
      '/api/v1/auth/register',
      data
    );
    return response.data.data;
  },

  async checkFirstUser(): Promise<{ is_first_user: boolean }> {
    const response = await apiClient.get<ApiResponse<{ is_first_user: boolean }>>(
      '/api/v1/auth/first-user-check'
    );
    return response.data.data;
  },

  async logout(refreshToken: string): Promise<void> {
    const formData = new FormData();
    formData.append('refresh_token', refreshToken);
    await apiClient.post('/api/v1/auth/logout', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },

  async getMe(): Promise<User> {
    const response = await apiClient.get<ApiResponse<User>>('/api/v1/auth/me');
    return response.data.data;
  },

  async updateProfile(data: {
    full_name?: string;
    current_password?: string;
    new_password?: string;
    confirm_new_password?: string;
  }): Promise<User> {
    const formData = new FormData();
    if (data.full_name) formData.append('full_name', data.full_name);
    if (data.current_password) formData.append('current_password', data.current_password);
    if (data.new_password) formData.append('new_password', data.new_password);
    if (data.confirm_new_password) formData.append('confirm_new_password', data.confirm_new_password);

    const response = await apiClient.patch<ApiResponse<User>>('/api/v1/auth/me', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data.data;
  },
};

// ============================================================================
// Admin API
// ============================================================================

export const adminApi = {
  async listUsers(): Promise<User[]> {
    const response = await apiClient.get<ApiResponse<User[]>>('/api/v1/admin/users');
    return response.data.data;
  },

  async updateUserRole(userId: string, role: string): Promise<User> {
    const response = await apiClient.patch<ApiResponse<User>>(`/api/v1/admin/users/${userId}/role`, { role });
    return response.data.data;
  },

  async toggleUserActive(userId: string, isActive: boolean): Promise<User> {
    const response = await apiClient.patch<ApiResponse<User>>(`/api/v1/admin/users/${userId}/active`, { is_active: isActive });
    return response.data.data;
  },

  async deleteUser(userId: string): Promise<void> {
    await apiClient.delete(`/api/v1/admin/users/${userId}`);
  },
};

// ============================================================================
// Projects API
// ============================================================================

export const projectsApi = {
  async list(includeArchived = false): Promise<Project[]> {
    const response = await apiClient.get<ApiResponse<Project[]>>('/api/v1/projects', {
      params: { include_archived: includeArchived },
    });
    return response.data.data;
  },

  async get(projectId: number): Promise<ProjectDetail> {
    const response = await apiClient.get<ApiResponse<ProjectDetail>>(`/api/v1/projects/${projectId}`);
    return response.data.data;
  },

  async create(data: { name: string; description?: string }): Promise<Project> {
    // Auto-generate slug from name: lowercase, replace spaces/special chars with hyphens
    const slug = data.name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    const response = await apiClient.post<ApiResponse<Project>>('/api/v1/projects', {
      ...data,
      slug,
    });
    return response.data.data;
  },

  async update(projectId: number, data: { name?: string; description?: string; readme?: string }): Promise<Project> {
    const response = await apiClient.patch<ApiResponse<Project>>(`/api/v1/projects/${projectId}`, data);
    return response.data.data;
  },

  async archive(projectId: number): Promise<Project> {
    const response = await apiClient.post<ApiResponse<Project>>(`/api/v1/projects/${projectId}/archive`);
    return response.data.data;
  },

  async unarchive(projectId: number): Promise<Project> {
    const response = await apiClient.post<ApiResponse<Project>>(`/api/v1/projects/${projectId}/unarchive`);
    return response.data.data;
  },

  async delete(projectId: number): Promise<void> {
    await apiClient.delete(`/api/v1/projects/${projectId}`);
  },

  async getActivity(projectId: number, limit = 100, offset = 0): Promise<{
    data: ProjectActivity[];
    total: number;
  }> {
    const response = await apiClient.get<ApiResponse<ProjectActivity[]>>(
      `/api/v1/projects/${projectId}/activity`,
      { params: { limit, offset } }
    );
    return {
      data: response.data.data,
      total: (response.data.meta as { total: number })?.total || 0,
    };
  },

  async logActivity(projectId: number, data: {
    entity_type: 'task' | 'job' | 'label' | 'member' | 'project';
    entity_id: string;
    entity_name?: string;
    action: 'created' | 'updated' | 'deleted' | 'status_changed' | 'assigned';
    previous_data?: Record<string, unknown>;
    new_data?: Record<string, unknown>;
  }): Promise<ProjectActivity> {
    const response = await apiClient.post<ApiResponse<ProjectActivity>>(
      `/api/v1/projects/${projectId}/activity`,
      data
    );
    return response.data.data;
  },
};

// ============================================================================
// Labels API (Project Labels)
// ============================================================================

export const labelsApi = {
  async create(projectId: number, data: { name: string; color: string }): Promise<Label> {
    const response = await apiClient.post<ApiResponse<Label>>(
      `/api/v1/projects/${projectId}/labels`,
      data
    );
    return response.data.data;
  },

  async update(projectId: number, labelId: string, data: { name?: string; color?: string }): Promise<Label> {
    const response = await apiClient.patch<ApiResponse<Label>>(
      `/api/v1/projects/${projectId}/labels/${labelId}`,
      data
    );
    return response.data.data;
  },

  async delete(projectId: number, labelId: string): Promise<void> {
    await apiClient.delete(`/api/v1/projects/${projectId}/labels/${labelId}`);
  },
};

// ============================================================================
// Tasks API
// ============================================================================

export const tasksApi = {
  async list(projectId: number, status?: string, includeArchived = false): Promise<Task[]> {
    const response = await apiClient.get<ApiResponse<Task[]>>(`/api/v1/projects/${projectId}/tasks`, {
      params: {
        task_status: status || undefined,
        include_archived: includeArchived
      },
    });
    return response.data.data;
  },

  async get(taskId: string): Promise<TaskDetail> {
    const response = await apiClient.get<ApiResponse<TaskDetail>>(`/api/v1/tasks/${taskId}`);
    return response.data.data;
  },

  async create(projectId: number, data: { name: string; description?: string }): Promise<Task> {
    const response = await apiClient.post<ApiResponse<Task>>(`/api/v1/projects/${projectId}/tasks`, data);
    return response.data.data;
  },

  async assign(taskId: number, assigneeId: string | null): Promise<Task> {
    const response = await apiClient.post<ApiResponse<Task>>(`/api/v1/tasks/${taskId}/assign`, { assignee_id: assigneeId });
    return response.data.data;
  },

  async archive(taskId: number): Promise<Task> {
    const response = await apiClient.post<ApiResponse<Task>>(`/api/v1/tasks/${taskId}/archive`);
    return response.data.data;
  },

  async unarchive(taskId: number): Promise<Task> {
    const response = await apiClient.post<ApiResponse<Task>>(`/api/v1/tasks/${taskId}/unarchive`);
    return response.data.data;
  },

  async delete(taskId: number): Promise<void> {
    await apiClient.delete(`/api/v1/tasks/${taskId}`);
  },

  async update(taskId: number, data: Partial<{ name: string; description: string; split: 'train' | 'val' | 'test' | null }>): Promise<Task> {
    const response = await apiClient.patch<ApiResponse<Task>>(`/api/v1/tasks/${taskId}`, data);
    return response.data.data;
  },

  async preview(projectId: number, data: TaskCreateWithImages): Promise<TaskCreationPreview> {
    const response = await apiClient.post<ApiResponse<TaskCreationPreview>>(
      `/api/v1/projects/${projectId}/tasks/preview`,
      data
    );
    return response.data.data;
  },

  async createWithImages(projectId: number, data: TaskCreateWithImages): Promise<TaskWithJobsResponse> {
    const response = await apiClient.post<ApiResponse<TaskWithJobsResponse>>(
      `/api/v1/projects/${projectId}/tasks/create-with-images`,
      data
    );
    return response.data.data;
  },
};

// ============================================================================
// Jobs API
// ============================================================================

export const jobsApi = {
  async list(taskId: string, status?: string, includeArchived = false): Promise<Job[]> {
    const response = await apiClient.get<ApiResponse<Job[]>>(`/api/v1/tasks/${taskId}/jobs`, {
      params: { 
        job_status: status || undefined,
        include_archived: includeArchived 
      },
    });
    return response.data.data;
  },

  async get(jobId: string): Promise<JobDetail> {
    const response = await apiClient.get<ApiResponse<JobDetail>>(`/api/v1/jobs/${jobId}`);
    return response.data.data;
  },

  async assign(jobId: string, assigneeId: string): Promise<Job> {
    const response = await apiClient.post<ApiResponse<Job>>(`/api/v1/jobs/${jobId}/assign`, {
      assignee_id: assigneeId,
    });
    return response.data.data;
  },

  async unassign(jobId: string): Promise<Job> {
    const response = await apiClient.post<ApiResponse<Job>>(`/api/v1/jobs/${jobId}/unassign`);
    return response.data.data;
  },

  /**
   * Sync annotations for a job
   */
  async syncAnnotations(jobId: string, payload: { images: Record<string, any> }): Promise<{ synced_images: string[], total_operations: number }> {
    const response = await apiClient.post<ApiResponse<{ synced_images: string[], total_operations: number }>>(
      `/api/v1/jobs/${jobId}/annotations/sync`,
      payload
    );
    return response.data.data;
  },

  async start(jobId: string): Promise<Job> {
    const response = await apiClient.post<ApiResponse<Job>>(`/api/v1/jobs/${jobId}/start`);
    return response.data.data;
  },

  async complete(jobId: string): Promise<Job> {
    const response = await apiClient.post<ApiResponse<Job>>(`/api/v1/jobs/${jobId}/complete`);
    return response.data.data;
  },

  async archive(jobId: string): Promise<Job> {
    const response = await apiClient.post<ApiResponse<Job>>(`/api/v1/jobs/${jobId}/archive`);
    return response.data.data;
  },

  async unarchive(jobId: string): Promise<Job> {
    const response = await apiClient.post<ApiResponse<Job>>(`/api/v1/jobs/${jobId}/unarchive`);
    return response.data.data;
  },

  async delete(jobId: string): Promise<void> {
    await apiClient.delete(`/api/v1/jobs/${jobId}`);
  },
};

// ============================================================================
// Project Members API
// ============================================================================

export interface AvailableUser {
  id: string;
  email: string;
  username: string;
  full_name: string | null;
}

export const membersApi = {
  async list(projectId: number): Promise<ProjectMember[]> {
    const response = await apiClient.get<ApiResponse<ProjectMember[]>>(`/api/v1/projects/${projectId}/members`);
    return response.data.data;
  },

  async listAvailable(projectId: number): Promise<AvailableUser[]> {
    const response = await apiClient.get<ApiResponse<AvailableUser[]>>(`/api/v1/projects/${projectId}/available-users`);
    return response.data.data;
  },

  async add(projectId: number, data: { user_id: string; role: string }): Promise<ProjectMember> {
    const response = await apiClient.post<ApiResponse<ProjectMember>>(`/api/v1/projects/${projectId}/members`, data);
    return response.data.data;
  },

  async remove(projectId: number, memberId: string): Promise<void> {
    await apiClient.delete(`/api/v1/projects/${projectId}/members/${memberId}`);
  },
};

// ============================================================================
// Images API (Job Images)
// ============================================================================

export interface ImageResponse {
  id: string;
  job_id: number;
  filename: string;
  s3_key: string;
  s3_bucket: string;
  width: number;
  height: number;
  thumbnail_s3_key: string | null;
  file_size_bytes: number | null;
  mime_type: string | null;
  checksum_sha256: string | null;
  metadata: Record<string, unknown> | null;
  sequence_number: number;
  is_annotated: boolean;
  shared_image_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ImageListResponse {
  images: ImageResponse[];
  total: number;
  page: number;
  page_size: number;
}

export const imagesApi = {
  /**
   * List images for a job with pagination
   */
  async listForJob(jobId: string, page = 1, pageSize = 50): Promise<ImageListResponse> {
    const response = await apiClient.get<ApiResponse<ImageListResponse>>(
      `/api/v1/jobs/${jobId}/images`,
      { params: { page, page_size: pageSize } }
    );
    return response.data.data;
  },

  /**
   * Get a single image by ID
   */
  async get(imageId: string): Promise<ImageResponse> {
    const response = await apiClient.get<ApiResponse<ImageResponse>>(`/api/v1/images/${imageId}`);
    return response.data.data;
  },

  /**
   * Construct the full image URL for display
   * For job images, uses the public job image endpoint (no auth required)
   * For other images, uses the share thumbnail endpoint (requires auth)
   */
  getImageUrl(s3Key: string, jobId?: string, imageId?: string): string {
    // If we have jobId and imageId, use the public job image endpoint
    if (jobId && imageId) {
      return `${API_BASE_URL}/api/v1/jobs/${jobId}/images/${imageId}/thumbnail`;
    }
    // Fallback to share endpoint (requires auth)
    return `${API_BASE_URL}/api/v1/share/thumbnail/${encodeURIComponent(s3Key)}`;
  },

  /**
   * Construct the full-size image URL for canvas rendering
   * Uses the /file endpoint which returns the original image
   */
  getFullImageUrl(s3Key: string, jobId?: string, imageId?: string): string {
    // If we have jobId and imageId, use the public job image file endpoint
    if (jobId && imageId) {
      return `${API_BASE_URL}/api/v1/jobs/${jobId}/images/${imageId}/file`;
    }
    // Fallback to share endpoint (requires auth)
    return `${API_BASE_URL}/api/v1/share/thumbnail/${encodeURIComponent(s3Key)}`;
  },
};


// ============================================================================
// Annotations API (Detections, Segmentations)
// ============================================================================

// Detection (Bounding Box) types
export interface DetectionCreate {
  label_id: string;
  x_min: number;  // Normalized 0-1
  y_min: number;
  x_max: number;
  y_max: number;
  rotation?: number;
  confidence?: number;
  attributes?: Record<string, unknown>;
}

export interface DetectionUpdate {
  label_id?: string;
  x_min?: number;
  y_min?: number;
  x_max?: number;
  y_max?: number;
  rotation?: number;
  confidence?: number;
  attributes?: Record<string, unknown>;
}

export interface DetectionResponse {
  id: string;
  image_id: string;
  label_id: string;
  x_min: number;
  y_min: number;
  x_max: number;
  y_max: number;
  rotation: number | null;
  confidence: number | null;
  attributes: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

// Segmentation (Polygon) types
export interface SegmentationCreate {
  label_id: string;
  format?: string;  // 'polygon' | 'rle' | 'bitmap'
  polygon?: number[][];  // [[x1,y1], [x2,y2], ...] normalized 0-1
  rle?: Record<string, unknown>;
  area?: number;
  confidence?: number;
  attributes?: Record<string, unknown>;
}

export interface SegmentationUpdate {
  label_id?: string;
  polygon?: number[][];
  rle?: Record<string, unknown>;
  area?: number;
  confidence?: number;
  attributes?: Record<string, unknown>;
}

export interface SegmentationResponse {
  id: string;
  image_id: string;
  label_id: string;
  format: string;
  polygon: number[][] | null;
  rle: Record<string, unknown> | null;
  area: number | null;
  confidence: number | null;
  attributes: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

// Combined annotations response
export interface ImageAnnotationsResponse {
  image_id: string;
  tags: unknown[];
  detections: DetectionResponse[];
  segmentations: SegmentationResponse[];
  keypoints: unknown[];
}

export const annotationsApi = {
  /**
   * Get all annotations for an image
   */
  async getForImage(imageId: string): Promise<ImageAnnotationsResponse> {
    const response = await apiClient.get<ApiResponse<ImageAnnotationsResponse>>(
      `/api/v1/images/${imageId}/annotations`
    );
    return response.data.data;
  },

  // ---- Detections (Bounding Boxes) ----

  /**
   * Create a single detection
   */
  async createDetection(imageId: string, data: DetectionCreate): Promise<DetectionResponse> {
    const response = await apiClient.post<ApiResponse<DetectionResponse>>(
      `/api/v1/images/${imageId}/annotations/detections`,
      data
    );
    return response.data.data;
  },

  /**
   * Create multiple detections in bulk
   */
  async createDetectionBulk(imageId: string, detections: DetectionCreate[]): Promise<DetectionResponse[]> {
    const response = await apiClient.post<ApiResponse<DetectionResponse[]>>(
      `/api/v1/images/${imageId}/annotations/detections/bulk`,
      { detections }
    );
    return response.data.data;
  },

  /**
   * Update a detection
   */
  async updateDetection(imageId: string, detectionId: string, data: DetectionUpdate): Promise<DetectionResponse> {
    const response = await apiClient.patch<ApiResponse<DetectionResponse>>(
      `/api/v1/images/${imageId}/annotations/detections/${detectionId}`,
      data
    );
    return response.data.data;
  },

  /**
   * Delete a detection
   */
  async deleteDetection(imageId: string, detectionId: string): Promise<void> {
    await apiClient.delete(`/api/v1/images/${imageId}/annotations/detections/${detectionId}`);
  },

  /**
   * Delete multiple detections in bulk
   */
  async deleteDetectionBulk(imageId: string, ids: string[]): Promise<{ deleted: number }> {
    const response = await apiClient.delete<ApiResponse<{ deleted: number }>>(
      `/api/v1/images/${imageId}/annotations/detections/bulk`,
      { data: { ids } }
    );
    return response.data.data;
  },

  // ---- Segmentations (Polygons) ----

  /**
   * Create a single segmentation
   */
  async createSegmentation(imageId: string, data: SegmentationCreate): Promise<SegmentationResponse> {
    const response = await apiClient.post<ApiResponse<SegmentationResponse>>(
      `/api/v1/images/${imageId}/annotations/segmentations`,
      data
    );
    return response.data.data;
  },

  /**
   * Create multiple segmentations in bulk
   */
  async createSegmentationBulk(imageId: string, segmentations: SegmentationCreate[]): Promise<SegmentationResponse[]> {
    const response = await apiClient.post<ApiResponse<SegmentationResponse[]>>(
      `/api/v1/images/${imageId}/annotations/segmentations/bulk`,
      { segmentations }
    );
    return response.data.data;
  },

  /**
   * Update a segmentation
   */
  async updateSegmentation(imageId: string, segId: string, data: SegmentationUpdate): Promise<SegmentationResponse> {
    const response = await apiClient.patch<ApiResponse<SegmentationResponse>>(
      `/api/v1/images/${imageId}/annotations/segmentations/${segId}`,
      data
    );
    return response.data.data;
  },

  /**
   * Delete a segmentation
   */
  async deleteSegmentation(imageId: string, segId: string): Promise<void> {
    await apiClient.delete(`/api/v1/images/${imageId}/annotations/segmentations/${segId}`);
  },
};

export default apiClient;
