/** Client for S3 / MinIO storage connections. */

import apiClient from '@/lib/api-client'

export interface StorageConnection {
  id: string
  project_id: number | null
  name: string
  bucket: string
  endpoint_url: string | null
  region: string | null
  prefix: string
  use_ssl: boolean
  is_active: boolean
  last_checked_at: string | null
  last_status: string | null
  healthy?: boolean
}

export interface BucketListing {
  path: string
  prefixes: string[]
  objects: Array<{ key: string; size: number; last_modified: string }>
}

interface ApiResponse<T> {
  data: T
  message: string
  status_code: number
}

export const storageClient = {
  async list(projectId?: number): Promise<StorageConnection[]> {
    const response = await apiClient.get<ApiResponse<StorageConnection[]>>(
      '/api/v1/storage/connections',
      { params: projectId ? { project_id: projectId } : undefined }
    )
    return response.data.data
  },

  async create(payload: {
    name: string
    bucket: string
    access_key: string
    secret_key: string
    endpoint_url?: string | null
    region?: string | null
    prefix?: string
    use_ssl?: boolean
    project_id?: number | null
  }): Promise<StorageConnection> {
    const response = await apiClient.post<ApiResponse<StorageConnection>>(
      '/api/v1/storage/connections',
      payload
    )
    return response.data.data
  },

  async check(id: string): Promise<{ healthy: boolean; status: string }> {
    const response = await apiClient.post<ApiResponse<{ healthy: boolean; status: string }>>(
      `/api/v1/storage/connections/${id}/check`
    )
    return response.data.data
  },

  async remove(id: string): Promise<void> {
    await apiClient.delete(`/api/v1/storage/connections/${id}`)
  },

  async browse(id: string, path = ''): Promise<BucketListing> {
    const response = await apiClient.get<ApiResponse<BucketListing>>(
      `/api/v1/storage/connections/${id}/browse`,
      { params: { path } }
    )
    return response.data.data
  },
}
