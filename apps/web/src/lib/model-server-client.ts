/** Client for the local model server that hosts Ultralytics/YOLO .pt weights. */

import axios from 'axios'

// Browser reaches the server on the published port
const MODEL_SERVER_URL = import.meta.env.VITE_MODEL_SERVER_URL !== undefined
  ? import.meta.env.VITE_MODEL_SERVER_URL
  : 'http://localhost:8002'

// api-core proxies inference server-side, so it needs the docker network address
const MODEL_SERVER_INTERNAL_URL = import.meta.env.VITE_MODEL_SERVER_INTERNAL_URL !== undefined
  ? import.meta.env.VITE_MODEL_SERVER_INTERNAL_URL
  : 'http://model-server:8002'

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

export const modelServerUrl = MODEL_SERVER_URL

/** URL to register as a BYOM endpoint. Must resolve from api-core, not the browser. */
export function modelEndpointUrl(name: string): string {
  return `${MODEL_SERVER_INTERNAL_URL.replace(/\/$/, '')}/models/${name}`
}

export const modelServerClient = {
  async health(): Promise<{ status: string; models: number }> {
    const response = await axios.get(`${MODEL_SERVER_URL}/health`, { timeout: 5000 })
    return response.data
  },

  async listModels(): Promise<ServerModel[]> {
    const response = await axios.get<{ models: ServerModel[] }>(`${MODEL_SERVER_URL}/models`, { timeout: 10000 })
    return response.data.models
  },

  async uploadModel(file: File, onProgress?: (percent: number) => void): Promise<UploadedModel> {
    const form = new FormData()
    form.append('file', file)
    const response = await axios.post<UploadedModel>(`${MODEL_SERVER_URL}/models/upload`, form, {
      timeout: 0,
      onUploadProgress: (e) => {
        if (onProgress && e.total) onProgress(Math.round((e.loaded / e.total) * 100))
      },
    })
    return response.data
  },

  async info(name: string): Promise<{ name: string; task: string; classes: string[] }> {
    const response = await axios.get(`${MODEL_SERVER_URL}/models/${name}/info`, { timeout: 10000 })
    return response.data
  },

  async deleteModel(name: string): Promise<void> {
    await axios.delete(`${MODEL_SERVER_URL}/models/${name}`, { timeout: 10000 })
  },
}
