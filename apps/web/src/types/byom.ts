/**
 * BYOM (Bring Your Own Model) type definitions
 */

export type OutputType = 'bbox' | 'polygon' | 'mask'
export type ModelType = 'detection' | 'segmentation' | 'hybrid'

export interface ModelCapabilities {
  supports_text_prompt: boolean
  supports_bbox_prompt: boolean
  supports_auto_detect: boolean
  supports_class_filter: boolean
  supports_classification: boolean
  output_types: OutputType[]
  classes?: string[]
  model_type?: ModelType  // For easy UI logic
  is_mock?: boolean  // Indicates locally-mocked model (no external API)
}

export interface ResponseMapping {
  boxes_field: string
  scores_field: string
  masks_field?: string | null
  labels_field?: string | null
  num_objects_field?: string | null
}

export interface EndpointConfig {
  inference_path: string
  response_mapping?: ResponseMapping | null
}

export interface RegisteredModel {
  id: string
  name: string
  endpoint_url: string
  capabilities: ModelCapabilities | null
  endpoint_config?: EndpointConfig | null
  description: string | null
  is_active: boolean
  is_healthy: boolean
  last_health_check: string | null
  created_at: string
  updated_at: string
}

export interface ModelRegistrationRequest {
  name: string
  endpoint_url: string
  auth_token?: string
  description?: string
  capabilities?: ModelCapabilities
  endpoint_config?: EndpointConfig | null
}

export interface ModelUpdateRequest {
  name?: string
  endpoint_url?: string
  auth_token?: string
  description?: string
  capabilities?: ModelCapabilities
  endpoint_config?: EndpointConfig | null
  is_active?: boolean
}

export interface ModelHealthResponse {
  model_id: string
  is_healthy: boolean
  status_message: string
  response_time_ms: number | null
  checked_at: string
}

export interface ModelListResponse {
  models: RegisteredModel[]
  total: number
}

/**
 * Unified model interface for runtime use (includes SAM3 built-in)
 */
export interface AvailableModel {
  id: string
  name: string
  type: 'builtin' | 'byom'
  endpoint_url: string
  auth_token?: string  // Only for BYOM models
  capabilities: ModelCapabilities
  is_healthy: boolean
  description?: string
}

/**
 * Inference parameters for different modes
 */
export interface BaseInferenceParams {
  image: File
  threshold?: number
  mask_threshold?: number
  return_visualization?: boolean
  simplify_tolerance?: number
}

export interface TextPromptParams extends BaseInferenceParams {
  text_prompt: string
}

export interface BboxPromptParams extends BaseInferenceParams {
  /** Bounding boxes: [x1, y1, x2, y2, label] where label is 1=positive, 0=negative */
  bounding_boxes: Array<[number, number, number, number, number]>
}

export interface AutoDetectParams extends BaseInferenceParams {
  class_filter?: string[]
}

/**
 * Inference result structure (compatible with SAM3 and detection models)
 */
export interface InferenceResult {
  num_objects: number
  boxes: Array<[number, number, number, number]>
  scores: number[]
  masks: Array<{
    polygons: Array<Array<[number, number]>>
    area: number
  }>
  labels?: string[]  // Class labels from detection models
  processing_time_ms: number
  visualization_base64?: string
}

/**
 * Standard API response wrapper
 */
export interface APIResponse<T> {
  data: T
  message: string
  status_code: number
}

/**
 * Classification types
 */
export interface ClassPrediction {
  class_name: string
  probability: number
}

export interface ClassificationResult {
  predicted_class: string
  confidence: number
  top_k_predictions: ClassPrediction[]
  class_probabilities?: Record<string, number>
  processing_time_ms: number
  model_id: string
}

export interface ClassificationParams extends BaseInferenceParams {
  top_k?: number
}
