/**
 * Unified inference client - ALL requests go through api-core proxy
 *
 * This client routes all inference requests through the api-core proxy service,
 * which handles routing to SAM3 or external BYOM models.
 */

import { byomClient } from './byom-client'
import type {
  AvailableModel,
  InferenceResult,
  TextPromptParams,
  BboxPromptParams,
  AutoDetectParams,
} from '../types/byom'

/**
 * Unified inference client - all requests go through api-core proxy
 */
export const inferenceClient = {
  /**
   * Text prompt inference (via proxy)
   */
  async textPrompt(
    model: AvailableModel,
    params: TextPromptParams
  ): Promise<InferenceResult> {
    console.log(`[inferenceClient] Text prompt via proxy: ${model.name}`)

    // Check if model supports text prompts
    if (!model.capabilities.supports_text_prompt) {
      throw new Error(`Model ${model.name} does not support text prompts`)
    }

    // All requests go through the proxy
    return await byomClient.inferenceProxy(model.id, 'text', params)
  },

  /**
   * Bounding box prompt inference (via proxy)
   */
  async bboxPrompt(
    model: AvailableModel,
    params: BboxPromptParams
  ): Promise<InferenceResult> {
    console.log(`[inferenceClient] Bbox prompt via proxy: ${model.name}`)

    // Check if model supports bbox prompts
    if (!model.capabilities.supports_bbox_prompt) {
      throw new Error(`Model ${model.name} does not support bounding box prompts`)
    }

    // All requests go through the proxy
    return await byomClient.inferenceProxy(model.id, 'bbox', params)
  },

  /**
   * Auto-detect inference (via proxy)
   */
  async autoDetect(
    model: AvailableModel,
    params: AutoDetectParams
  ): Promise<InferenceResult> {
    console.log(`[inferenceClient] Auto-detect via proxy: ${model.name}`)

    // Check if model supports auto-detect
    if (!model.capabilities.supports_auto_detect) {
      throw new Error(`Model ${model.name} does not support auto-detection`)
    }

    // All requests go through the proxy
    return await byomClient.inferenceProxy(model.id, 'auto', params)
  },

  /**
   * Get available inference modes for a model
   */
  getAvailableModes(model: AvailableModel): Array<'text' | 'bbox' | 'auto'> {
    const modes: Array<'text' | 'bbox' | 'auto'> = []

    if (model.capabilities.supports_text_prompt) {
      modes.push('text')
    }
    if (model.capabilities.supports_bbox_prompt) {
      modes.push('bbox')
    }
    if (model.capabilities.supports_auto_detect) {
      modes.push('auto')
    }

    return modes
  },

  /**
   * Check if a model supports a specific mode
   */
  supportsMode(model: AvailableModel, mode: 'text' | 'bbox' | 'auto'): boolean {
    switch (mode) {
      case 'text':
        return model.capabilities.supports_text_prompt
      case 'bbox':
        return model.capabilities.supports_bbox_prompt
      case 'auto':
        return model.capabilities.supports_auto_detect
      default:
        return false
    }
  },
}
