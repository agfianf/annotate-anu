import type { AxiosProgressEvent } from 'axios'
import apiClient from '@/lib/api-client'
import type { DirectoryListResponse, UploadResponse, ImageInfo } from '../types'

const BASE_URL = '/api/v1/share'

/**
 * Transform snake_case keys to camelCase recursively
 */
function snakeToCamel(str: string): string {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase())
}

function transformKeys<T>(obj: unknown): T {
  if (Array.isArray(obj)) {
    return obj.map(transformKeys) as T
  }
  if (obj !== null && typeof obj === 'object') {
    return Object.keys(obj as Record<string, unknown>).reduce(
      (acc, key) => {
        const camelKey = snakeToCamel(key)
        acc[camelKey] = transformKeys((obj as Record<string, unknown>)[key])
        return acc
      },
      {} as Record<string, unknown>
    ) as T
  }
  return obj as T
}

interface ApiResponse<T> {
  data: T
  message: string
  status_code: number
}

export const shareApi = {
  /**
   * List directory contents
   */
  listDirectory: async (
    path: string = '',
    includeHidden: boolean = false
  ): Promise<DirectoryListResponse> => {
    const params = new URLSearchParams()
    params.set('path', path)
    if (includeHidden) params.set('include_hidden', 'true')

    const response = await apiClient.get<ApiResponse<unknown>>(
      `${BASE_URL}?${params}`
    )
    // Transform snake_case keys to camelCase
    return transformKeys<DirectoryListResponse>(response.data.data)
  },

  /**
   * Create a new directory
   */
  createDirectory: async (
    path: string,
    name: string
  ): Promise<{ path: string; created: boolean }> => {
    const response = await apiClient.post<
      ApiResponse<{ path: string; created: boolean }>
    >(`${BASE_URL}/mkdir`, { path, name })
    return response.data.data
  },

  /**
   * Upload files to a directory
   */
  uploadFiles: async (
    destination: string,
    files: File[],
    onProgress?: (progress: number) => void
  ): Promise<UploadResponse> => {
    const formData = new FormData()
    files.forEach((file) => {
      formData.append('files', file)
    })

    const response = await apiClient.post<ApiResponse<UploadResponse>>(
      `${BASE_URL}/upload?destination=${encodeURIComponent(destination)}`,
      formData,
      {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (event: AxiosProgressEvent) => {
          if (onProgress && event.total) {
            onProgress(Math.round((event.loaded / event.total) * 100))
          }
        },
      }
    )
    return response.data.data
  },

  /**
   * Get thumbnail URL for an image
   */
  getThumbnailUrl: (path: string): string => {
    const baseUrl = import.meta.env.VITE_CORE_API_URL !== undefined
      ? import.meta.env.VITE_CORE_API_URL
      : 'http://localhost:8001'
    return `${baseUrl}${BASE_URL}/thumbnail/${encodeURIComponent(path)}`
  },

  /**
   * Get batch image info
   */
  getBatchImageInfo: async (paths: string[]): Promise<ImageInfo[]> => {
    const response = await apiClient.post<
      ApiResponse<{ images: ImageInfo[]; errors: unknown[] }>
    >(`${BASE_URL}/batch-info`, paths)
    return response.data.data.images
  },

  /**
   * Resolve selection (expand folders to files)
   */
  resolveSelection: async (
    paths: string[],
    recursive: boolean = true
  ): Promise<string[]> => {
    const response = await apiClient.post<
      ApiResponse<{ files: string[]; totalCount: number }>
    >(`${BASE_URL}/resolve-selection`, {
      paths,
      recursive,
    })
    return response.data.data.files
  },

  /**
   * Create nested directories in a single API call
   */
  createNestedDirectories: async (
    basePath: string,
    nestedPath: string
  ): Promise<{ created: string[]; skipped: string[] }> => {
    const response = await apiClient.post<
      ApiResponse<{ created: string[]; skipped: string[] }>
    >(`${BASE_URL}/mkdir-nested`, {
      base_path: basePath,
      nested_path: nestedPath,
    })
    return response.data.data
  },
}
