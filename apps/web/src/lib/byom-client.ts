/**
 * BYOM API client for model registry operations
 */

import axios, { AxiosError } from 'axios'
import type {
  APIResponse,
  AvailableModel,
  InferenceResult,
  ClassificationResult,
  ClassificationParams,
  ModelHealthResponse,
  ModelListResponse,
  ModelRegistrationRequest,
  ModelUpdateRequest,
  RegisteredModel,
  TextPromptParams,
  BboxPromptParams,
  AutoDetectParams,
} from '../types/byom'

const CORE_API_URL = import.meta.env.VITE_CORE_API_URL !== undefined
  ? import.meta.env.VITE_CORE_API_URL
  : 'http://localhost:8001'

// Request timeout (2 minutes)
const TIMEOUT = 120000

/**
 * BYOM Client for interacting with api-core service
 */
export const byomClient = {
  /**
   * List all registered models
   */
  async listModels(includeInactive = false): Promise<ModelListResponse> {
    try {
      console.log('[byomClient] Fetching models list...')
      const response = await axios.get<APIResponse<ModelListResponse>>(
        `${CORE_API_URL}/api/v1/models`,
        {
          params: { include_inactive: includeInactive },
          timeout: TIMEOUT,
        }
      )
      console.log(`[byomClient] Retrieved ${response.data.data.total} models`)
      return response.data.data
    } catch (error) {
      console.error('[byomClient] Failed to list models:', error)
      if (axios.isAxiosError(error)) {
        if (error.code === 'ERR_NETWORK' || error.code === 'ECONNABORTED') {
          throw new Error('Cannot connect to API Core service. Is it running?')
        }
      }
      throw error
    }
  },

  /**
   * Register a new model
   */
  async registerModel(request: ModelRegistrationRequest): Promise<RegisteredModel> {
    try {
      console.log(`[byomClient] Registering model: ${request.name}`)
      const response = await axios.post<APIResponse<RegisteredModel>>(
        `${CORE_API_URL}/api/v1/models`,
        request,
        { timeout: TIMEOUT }
      )
      console.log(`[byomClient] Model registered successfully: ${response.data.data.id}`)
      return response.data.data
    } catch (error) {
      console.error('[byomClient] Failed to register model:', error)
      if (axios.isAxiosError(error)) {
        const axiosError = error as AxiosError<{ detail: string }>
        if (axiosError.response?.data?.detail) {
          throw new Error(axiosError.response.data.detail)
        }
      }
      throw error
    }
  },

  /**
   * Get model by ID
   */
  async getModel(modelId: string): Promise<RegisteredModel> {
    try {
      console.log(`[byomClient] Fetching model: ${modelId}`)
      const response = await axios.get<APIResponse<RegisteredModel>>(
        `${CORE_API_URL}/api/v1/models/${modelId}`,
        { timeout: TIMEOUT }
      )
      return response.data.data
    } catch (error) {
      console.error(`[byomClient] Failed to get model ${modelId}:`, error)
      throw error
    }
  },

  /**
   * Update existing model
   */
  async updateModel(
    modelId: string,
    updates: ModelUpdateRequest
  ): Promise<RegisteredModel> {
    try {
      console.log(`[byomClient] Updating model: ${modelId}`)
      const response = await axios.patch<APIResponse<RegisteredModel>>(
        `${CORE_API_URL}/api/v1/models/${modelId}`,
        updates,
        { timeout: TIMEOUT }
      )
      console.log(`[byomClient] Model updated successfully`)
      return response.data.data
    } catch (error) {
      console.error(`[byomClient] Failed to update model ${modelId}:`, error)
      throw error
    }
  },

  /**
   * Delete model
   */
  async deleteModel(modelId: string): Promise<void> {
    try {
      console.log(`[byomClient] Deleting model: ${modelId}`)
      await axios.delete(`${CORE_API_URL}/api/v1/models/${modelId}`, {
        timeout: TIMEOUT,
      })
      console.log(`[byomClient] Model deleted successfully`)
    } catch (error) {
      console.error(`[byomClient] Failed to delete model ${modelId}:`, error)
      throw error
    }
  },

  /**
   * Check model health
   */
  async checkHealth(modelId: string): Promise<ModelHealthResponse> {
    try {
      console.log(`[byomClient] Checking health for model: ${modelId}`)
      const response = await axios.post<APIResponse<ModelHealthResponse>>(
        `${CORE_API_URL}/api/v1/models/${modelId}/health`,
        {},
        { timeout: TIMEOUT }
      )
      console.log(
        `[byomClient] Health check complete: ${response.data.data.is_healthy ? 'healthy' : 'unhealthy'}`
      )
      return response.data.data
    } catch (error) {
      console.error(`[byomClient] Health check failed for ${modelId}:`, error)
      throw error
    }
  },

  /**
   * Call inference through api-core proxy
   * This is the preferred method - all inference goes through the proxy
   */
  async inferenceProxy(
    modelId: string,
    mode: 'text' | 'bbox' | 'auto',
    params: TextPromptParams | BboxPromptParams | AutoDetectParams
  ): Promise<InferenceResult> {
    console.log(`[byomClient] Calling proxy inference (model: ${modelId}, mode: ${mode})`)

    const formData = new FormData()
    formData.append('image', params.image)
    formData.append('model_id', modelId)

    if (params.threshold !== undefined) {
      formData.append('threshold', params.threshold.toString())
    }
    if (params.mask_threshold !== undefined) {
      formData.append('mask_threshold', params.mask_threshold.toString())
    }
    if (params.return_visualization !== undefined) {
      formData.append('return_visualization', params.return_visualization.toString())
    }
    if (params.simplify_tolerance !== undefined) {
      formData.append('simplify_tolerance', params.simplify_tolerance.toString())
    }

    // Mode-specific parameters
    if (mode === 'text' && 'text_prompt' in params) {
      formData.append('text_prompt', params.text_prompt)
    } else if (mode === 'bbox' && 'bounding_boxes' in params) {
      formData.append('bounding_boxes', JSON.stringify(params.bounding_boxes))
    } else if (mode === 'auto' && 'class_filter' in params && params.class_filter) {
      formData.append('class_filter', JSON.stringify(params.class_filter))
    }

    try {
      const endpoint = mode === 'auto' ? 'auto' : mode === 'bbox' ? 'bbox' : 'text'
      const response = await axios.post<APIResponse<InferenceResult>>(
        `${CORE_API_URL}/api/v1/inference/${endpoint}`,
        formData,
        { timeout: TIMEOUT }
      )

      console.log(`[byomClient] Proxy inference complete: ${response.data.data.num_objects} objects`)
      return response.data.data
    } catch (error) {
      console.error(`[byomClient] Proxy inference failed:`, error)
      if (axios.isAxiosError(error)) {
        if (error.code === 'ERR_NETWORK' || error.code === 'ECONNABORTED') {
          throw new Error('Cannot connect to API Core service. Is it running?')
        }
        const axiosError = error as AxiosError<{ detail: string }>
        if (axiosError.response?.data?.detail) {
          throw new Error(axiosError.response.data.detail)
        }
      }
      throw error
    }
  },

  /**
   * Call classification through api-core proxy
   * Classification produces whole-image labels, not spatial outputs
   */
  async classifyProxy(
    modelId: string,
    params: ClassificationParams
  ): Promise<ClassificationResult> {
    console.log(`[byomClient] Calling proxy classification (model: ${modelId})`)

    const formData = new FormData()
    formData.append('image', params.image)
    formData.append('model_id', modelId)

    if (params.top_k !== undefined) {
      formData.append('top_k', params.top_k.toString())
    }

    try {
      const response = await axios.post<APIResponse<ClassificationResult>>(
        `${CORE_API_URL}/api/v1/inference/classify`,
        formData,
        { timeout: TIMEOUT }
      )

      console.log(`[byomClient] Proxy classification complete: ${response.data.data.predicted_class}`)
      return response.data.data
    } catch (error) {
      console.error(`[byomClient] Proxy classification failed:`, error)
      if (axios.isAxiosError(error)) {
        if (error.code === 'ERR_NETWORK' || error.code === 'ECONNABORTED') {
          throw new Error('Cannot connect to API Core service. Is it running?')
        }
        const axiosError = error as AxiosError<{ detail: string }>
        if (axiosError.response?.data?.detail) {
          throw new Error(axiosError.response.data.detail)
        }
      }
      throw error
    }
  },

  /**
   * @deprecated Use inferenceProxy instead - direct calls bypass the proxy
   * Call inference on external BYOM model (direct call)
   */
  async inference(
    model: AvailableModel,
    mode: 'text' | 'bbox' | 'auto',
    params: TextPromptParams | BboxPromptParams | AutoDetectParams
  ): Promise<InferenceResult> {
    // Redirect to proxy
    console.warn('[byomClient] Direct inference is deprecated. Using proxy instead.')
    return this.inferenceProxy(model.id, mode, params)
  },
}
