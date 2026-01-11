/**
 * API client for batch classification endpoints
 */

const API_URL =
  import.meta.env.VITE_API_CORE_URL !== undefined
    ? import.meta.env.VITE_API_CORE_URL
    : 'http://localhost:8001'

/** Per-class config for uncategorized mode */
export interface UncategorizedClassConfig {
  action: 'create' | 'existing'
  tagName?: string
  existingTagId?: string
}

/** New category configuration */
export interface NewCategoryConfig {
  name: string
  color: string
  tagNames: Record<string, string>
}

/** Structured label mapping configuration */
export interface LabelMappingConfig {
  mode: 'uncategorized' | 'categorized'
  // For uncategorized mode
  uncategorized?: Record<string, UncategorizedClassConfig>
  // For categorized mode
  categoryMode?: 'existing' | 'create'
  existingCategoryId?: string
  existingCategoryTagMapping?: Record<string, string>
  newCategory?: NewCategoryConfig
}

export interface BatchClassifyRequest {
  projectId: number
  modelId: string
  imageIds: string[]
  createTags?: boolean
  /** Structured label mapping configuration */
  labelMappingConfig?: LabelMappingConfig
}

export interface BatchClassifyStartResponse {
  job_id: string
  status: 'started'
  total: number
}

export interface ClassificationResult {
  image_id: string
  predicted_class: string
  confidence: number
  tag_created: boolean
}

export interface BatchClassifyProgress {
  job_id: string
  status: 'pending' | 'running' | 'completed' | 'failed' | 'started'
  processed: number
  failed: number
  total: number
  error?: string | null
  results?: ClassificationResult[]
}

/**
 * Start a batch classification job
 */
export async function startBatchClassification(
  request: BatchClassifyRequest
): Promise<BatchClassifyStartResponse> {
  const formData = new FormData()
  formData.append('project_id', request.projectId.toString())
  formData.append('model_id', request.modelId)
  formData.append('image_ids', JSON.stringify(request.imageIds))
  formData.append('create_tags', (request.createTags ?? true).toString())
  if (request.labelMappingConfig) {
    formData.append('label_mapping_config', JSON.stringify(request.labelMappingConfig))
  }

  const response = await fetch(`${API_URL}/api/v1/inference/batch-classify/start`, {
    method: 'POST',
    body: formData,
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Unknown error' }))
    throw new Error(error.detail || `Failed to start batch classification: ${response.status}`)
  }

  return response.json()
}

/**
 * Get batch classification job progress
 */
export async function getBatchClassificationProgress(
  jobId: string
): Promise<BatchClassifyProgress> {
  const response = await fetch(`${API_URL}/api/v1/inference/batch-classify/progress/${jobId}`)

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Unknown error' }))
    throw new Error(error.detail || `Failed to get progress: ${response.status}`)
  }

  return response.json()
}

/**
 * Classification API client
 */
export const classificationApi = {
  startBatchJob: startBatchClassification,
  getProgress: getBatchClassificationProgress,
}
