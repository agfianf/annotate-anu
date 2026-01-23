/**
 * Hook for managing model registry state
 */

import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { byomClient } from '../lib/byom-client'
import type { AvailableModel, RegisteredModel } from '../types/byom'

const STORAGE_KEY = 'selected_model_id'
const API_URL = import.meta.env.VITE_SAM3_API_URL !== undefined
  ? import.meta.env.VITE_SAM3_API_URL
  : 'http://localhost:8000'

/**
 * SAM3 built-in model definition
 */
const SAM3_BUILTIN: AvailableModel = {
  id: 'sam3',
  name: 'SAM3 (Built-in)',
  type: 'builtin',
  provider: 'sam3',
  endpoint_url: API_URL,
  capabilities: {
    supports_text_prompt: true,
    supports_bbox_prompt: true,
    supports_auto_detect: false,
    supports_class_filter: false,
    supports_classification: false,
    output_types: ['polygon'],
    classes: undefined,
  },
  is_healthy: true,
  description: 'Segment Anything Model 3 - General purpose segmentation',
}

/**
 * Detect provider type from model configuration
 */
function detectProvider(model: RegisteredModel): 'sam3' | 'byom' | 'moondream' {
  // Check for Moondream by endpoint URL pattern
  if (model.endpoint_url.includes('moondream.ai') ||
      model.endpoint_url.includes('moondream')) {
    return 'moondream'
  }

  // Check for Moondream-specific capabilities
  const caps = model.capabilities
  if (caps && (caps.supports_query || caps.supports_detect || caps.supports_segment ||
      caps.supports_ocr || caps.supports_caption || caps.supports_point)) {
    return 'moondream'
  }

  // Default to BYOM for external models
  return 'byom'
}

// Note: Mock Classifier is no longer built-in. Users must register it via Model Configuration
// with custom classes. This allows more flexibility in defining classification categories.

/**
 * @param allowedModelIds - Model IDs allowed for this project
 *   - undefined: Solo mode, show all models (no restrictions)
 *   - null: Job mode but no models configured, show nothing
 *   - string[]: Job mode with specific models allowed
 */
export function useModelRegistry(allowedModelIds?: string[] | null) {
  const [registeredModels, setRegisteredModels] = useState<RegisteredModel[]>([])
  const [selectedModelId, setSelectedModelId] = useState<string>(() => {
    // Load from localStorage
    return localStorage.getItem(STORAGE_KEY) || 'sam3'
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Check if models are not configured (null means job mode with no config)
  const isNotConfigured = allowedModelIds === null

  /**
   * Load registered models from API
   */
  const loadModels = async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await byomClient.listModels(false) // Only active models
      setRegisteredModels(response.models)
      console.log(`[useModelRegistry] Loaded ${response.models.length} registered models`)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load models'
      setError(errorMessage)
      console.error('[useModelRegistry] Error loading models:', err)
      // Don't show toast on initial load failure (API might not be running)
      if (registeredModels.length > 0) {
        toast.error(errorMessage)
      }
    } finally {
      setLoading(false)
    }
  }

  /**
   * Compute all available models (SAM3 + BYOM + Moondream), filtered by project if applicable
   */
  const allModels: AvailableModel[] = useMemo(() => {
    const externalModels: AvailableModel[] = registeredModels
      .filter((m) => m.is_active)
      .map((m) => {
        const provider = detectProvider(m)
        return {
          id: m.id,
          name: m.name,
          type: 'byom' as const,
          provider,
          endpoint_url: m.endpoint_url,
          auth_token: undefined, // Auth token not exposed in response
          capabilities: m.capabilities || {
            supports_text_prompt: false,
            supports_bbox_prompt: false,
            supports_auto_detect: true,
            supports_class_filter: false,
            supports_classification: false,
            output_types: ['bbox'],
          },
          is_healthy: m.is_healthy,
          description: m.description || undefined,
        }
      })

    // Combine SAM3 + external models (BYOM and Moondream)
    const allAvailable = [SAM3_BUILTIN, ...externalModels]

    // Job mode with no models configured - return empty array
    if (allowedModelIds === null) {
      return []
    }

    // Job mode with specific models allowed - filter
    if (allowedModelIds && allowedModelIds.length > 0) {
      return allAvailable.filter((m) => allowedModelIds.includes(m.id))
    }

    // Solo mode (undefined) or empty array - show all models
    return allAvailable
  }, [registeredModels, allowedModelIds])

  /**
   * Get currently selected model
   */
  const selectedModel = useMemo(() => {
    const found = allModels.find((m) => m.id === selectedModelId)
    return found || allModels[0] // Fallback to SAM3
  }, [allModels, selectedModelId])

  /**
   * Select a model
   */
  const selectModel = (id: string) => {
    const model = allModels.find((m) => m.id === id)
    if (!model) {
      console.warn(`[useModelRegistry] Model ${id} not found`)
      return
    }

    console.log(`[useModelRegistry] Selecting model: ${model.name}`)
    setSelectedModelId(id)
    localStorage.setItem(STORAGE_KEY, id)
    toast.success(`Switched to ${model.name}`)
  }

  /**
   * Refresh models list
   */
  const refreshModels = async () => {
    await loadModels()
  }

  // Load models on mount
  useEffect(() => {
    loadModels()
  }, [])

  return {
    allModels,
    selectedModel,
    selectModel,
    registeredModels,
    refreshModels,
    loading,
    error,
    isNotConfigured, // True when job mode has no models configured
  }
}
