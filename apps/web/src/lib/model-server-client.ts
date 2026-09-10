/** Client for the local model server that hosts Ultralytics/YOLO .pt weights. */

import type { AxiosProgressEvent } from 'axios'
import apiClient from '@/lib/api-client'

// The model server has no authentication and unpickles uploaded weights, so it is
// not published on the host. Every browser call goes through api-core's proxy.
const BASE_URL = '/api/v1/model-server'

// api-core proxies inference server-side, so it needs the docker network address
const MODEL_SERVER_INTERNAL_URL = import.meta.env.VITE_MODEL_SERVER_INTERNAL_URL !== undefined
  ? import.meta.env.VITE_MODEL_SERVER_INTERNAL_URL
  : 'http://model-server:8002'

interface ApiResponse<T> {
  data: T
  message: string
  status_code: number
}

export interface ServerModel {
  name: string
  size_bytes: number
  loaded: boolean
  task?: string
  classes?: string[]
}

export interface UploadedModel {
  name: string
  size_bytes: number
  task: string
  classes: string[]
  endpoint_url: string
}

/** Where the weights are served from. Reachable from api-core, not from the browser. */
export const modelServerUrl = MODEL_SERVER_INTERNAL_URL

/** URL to register as a BYOM endpoint. Must resolve from api-core, not the browser. */
export function modelEndpointUrl(name: string): string {
  return `${MODEL_SERVER_INTERNAL_URL.replace(/\/$/, '')}/models/${name}`
}

export const modelServerClient = {
  async health(): Promise<{ status: string; models: number }> {
    const response = await apiClient.get<ApiResponse<{ status: string; models: number }>>(
      `${BASE_URL}/health`,
      { timeout: 5000 }
    )
    return response.data.data
  },

  async listModels(): Promise<ServerModel[]> {
    const response = await apiClient.get<ApiResponse<{ models: ServerModel[] }>>(
      `${BASE_URL}/models`,
      { timeout: 10000 }
    )
    return response.data.data.models
  },

  async uploadModel(file: File, onProgress?: (percent: number) => void): Promise<UploadedModel> {
    const form = new FormData()
    form.append('file', file)
    const response = await apiClient.post<ApiResponse<UploadedModel>>(
      `${BASE_URL}/models/upload`,
      form,
      {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 0,
        onUploadProgress: (e: AxiosProgressEvent) => {
          if (onProgress && e.total) onProgress(Math.round((e.loaded / e.total) * 100))
        },
      }
    )
    return response.data.data
  },

  async info(name: string): Promise<{ name: string; task: string; classes: string[] }> {
    const response = await apiClient.get<ApiResponse<{ name: string; task: string; classes: string[] }>>(
      `${BASE_URL}/models/${name}/info`,
      { timeout: 10000 }
    )
    return response.data.data
  },

  async deleteModel(name: string): Promise<void> {
    await apiClient.delete(`${BASE_URL}/models/${name}`, { timeout: 10000 })
  },
}
