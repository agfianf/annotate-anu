/** Client for QC review sessions. */

import apiClient from '@/lib/api-client'

export type Verdict = 'good' | 'refine' | 'bad'

export interface QCShape {
  id: string
  type: 'polygon' | 'bbox'
  polygon?: Array<[number, number]>
  bbox?: [number, number, number, number]
  label_id: string | null
  label_name: string | null
  label_color: string | null
  confidence: number | null
}

export interface QCItem {
  item_key: string
  image_id: string
  job_id: number | null
  filename: string
  s3_key: string
  width: number
  height: number
  shapes: QCShape[]
}

export interface QCStats {
  by_verdict: Record<string, number>
  reviewed: number
  settled: number
  disputed: number
  avg_agreement: number
}

export interface QCSession {
  id: string
  project_id: number
  name: string
  mode: 'instance' | 'roi'
  job_id: number | null
  config: { replicas: number; agreement_threshold: number; max_votes: number }
  created_at: string
  stats?: QCStats
  total_items?: number
}

interface ApiResponse<T> {
  data: T
  message: string
  status_code: number
}

export interface ROITile {
  item_key: string
  image_id: string
  filename: string
  label_id: string | null
  label_name: string | null
  label_color: string | null
  confidence: number | null
  crop_url: string
}

export interface ROIClass {
  label_id: string | null
  label_name: string | null
  label_color: string | null
  count: number
}

export interface StorageConnection {
  id: string
  name: string
  bucket: string
  endpoint_url: string | null
  prefix: string
  last_status: string | null
}

export const qcClient = {
  async listSessions(projectId?: number): Promise<QCSession[]> {
    const response = await apiClient.get<ApiResponse<QCSession[]>>('/api/v1/qc/sessions', {
      params: projectId ? { project_id: projectId } : undefined,
    })
    return response.data.data
  },

  async createSession(payload: {
    project_id: number
    name: string
    mode?: 'instance' | 'roi'
    job_id?: number | null
    config?: Record<string, number>
  }): Promise<QCSession> {
    const response = await apiClient.post<ApiResponse<QCSession>>('/api/v1/qc/sessions', payload)
    return response.data.data
  },

  async getSession(sessionId: string): Promise<QCSession> {
    const response = await apiClient.get<ApiResponse<QCSession>>(`/api/v1/qc/sessions/${sessionId}`)
    return response.data.data
  },

  async deleteSession(sessionId: string): Promise<void> {
    await apiClient.delete(`/api/v1/qc/sessions/${sessionId}`)
  },

  async getQueue(sessionId: string, limit = 25): Promise<{ items: QCItem[]; remaining: number; mode: string }> {
    const response = await apiClient.get<ApiResponse<{ items: QCItem[]; remaining: number; mode: string }>>(
      `/api/v1/qc/sessions/${sessionId}/queue`,
      { params: { limit } }
    )
    return response.data.data
  },

  async recordVerdict(
    sessionId: string,
    payload: { item_key: string; verdict: Verdict; image_id?: string; tag?: string; note?: string }
  ): Promise<{ stats: QCStats }> {
    const response = await apiClient.post<ApiResponse<{ stats: QCStats }>>(
      `/api/v1/qc/sessions/${sessionId}/verdict`,
      payload
    )
    return response.data.data
  },

  async undo(sessionId: string, itemKey: string): Promise<{ stats: QCStats }> {
    const response = await apiClient.post<ApiResponse<{ stats: QCStats }>>(
      `/api/v1/qc/sessions/${sessionId}/undo`,
      { item_key: itemKey }
    )
    return response.data.data
  },

  async getROITiles(
    sessionId: string,
    labelId?: string | null,
    limit = 120
  ): Promise<{ tiles: ROITile[]; remaining: number; classes: ROIClass[] }> {
    const response = await apiClient.get<ApiResponse<{ tiles: ROITile[]; remaining: number; classes: ROIClass[] }>>(
      `/api/v1/qc/sessions/${sessionId}/roi-tiles`,
      { params: { limit, ...(labelId ? { label_id: labelId } : {}) } }
    )
    return response.data.data
  },

  async recordBulk(
    sessionId: string,
    items: Array<{ item_key: string; verdict: Verdict; corrected_label_id?: string | null }>
  ): Promise<{ recorded: number; stats: QCStats }> {
    const response = await apiClient.post<ApiResponse<{ recorded: number; stats: QCStats }>>(
      `/api/v1/qc/sessions/${sessionId}/verdicts/bulk`,
      { items }
    )
    return response.data.data
  },

  async getRefineQueue(sessionId: string) {
    const response = await apiClient.get<ApiResponse<{ items: Array<Record<string, unknown>> }>>(
      `/api/v1/qc/sessions/${sessionId}/refine-queue`
    )
    return response.data.data
  },

  async listConnections(): Promise<StorageConnection[]> {
    const response = await apiClient.get<ApiResponse<StorageConnection[]>>('/api/v1/storage/connections')
    return response.data.data
  },

  async publish(sessionId: string, connectionId: string, settledOnly = false) {
    const response = await apiClient.post<ApiResponse<{ bucket: string; key: string; entries: number; counts: Record<string, number> }>>(
      `/api/v1/qc/sessions/${sessionId}/publish`,
      { connection_id: connectionId, settled_only: settledOnly }
    )
    return response.data.data
  },

  async getManifest(sessionId: string, settledOnly = false) {
    const response = await apiClient.get<ApiResponse<Record<string, unknown>>>(
      `/api/v1/qc/sessions/${sessionId}/manifest`,
      { params: { settled_only: settledOnly } }
    )
    return response.data.data
  },
}
