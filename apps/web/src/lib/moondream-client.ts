/**
 * Moondream API Client
 *
 * Client for communicating with Moondream Cloud or self-hosted instances.
 * Supports all Moondream endpoints: detect, segment, query, caption, point.
 */

import type {
  MoondreamCaptionParams,
  MoondreamCaptionResult,
  MoondreamConfig,
  MoondreamDetectParams,
  MoondreamDetectResult,
  MoondreamPointParams,
  MoondreamPointResult,
  MoondreamQueryParams,
  MoondreamQueryResult,
  MoondreamSegmentParams,
  MoondreamSegmentResult,
} from '@/types/byom'

const MOONDREAM_CLOUD_URL = 'https://api.moondream.ai/v1'
const DEFAULT_TIMEOUT = 120000 // 2 minutes

interface MoondreamClientConfig {
  baseUrl?: string
  apiKey?: string
  timeout?: number
}

/**
 * Convert File to base64 data URI
 */
async function fileToBase64DataUri(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      resolve(result)
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

/**
 * Create Moondream client from config
 */
export function createMoondreamClient(config: MoondreamConfig): MoondreamClient {
  const baseUrl = config.hostingType === 'cloud'
    ? MOONDREAM_CLOUD_URL
    : config.baseUrl || 'http://localhost:8080'

  return new MoondreamClient({
    baseUrl,
    apiKey: config.apiKey,
  })
}

export class MoondreamClient {
  private baseUrl: string
  private apiKey?: string
  private timeout: number

  constructor(config: MoondreamClientConfig) {
    this.baseUrl = config.baseUrl?.replace(/\/$/, '') || MOONDREAM_CLOUD_URL
    this.apiKey = config.apiKey
    this.timeout = config.timeout || DEFAULT_TIMEOUT
  }

  private async request<T>(endpoint: string, body: Record<string, unknown>): Promise<T> {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), this.timeout)

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      }

      if (this.apiKey) {
        headers['X-Moondream-Auth'] = this.apiKey
      }

      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Moondream API error (${response.status}): ${errorText}`)
      }

      return await response.json()
    } finally {
      clearTimeout(timeoutId)
    }
  }

  /**
   * Detect objects in an image
   *
   * @param params - Detection parameters
   * @returns Array of bounding boxes for detected objects
   */
  async detect(params: MoondreamDetectParams): Promise<MoondreamDetectResult> {
    const imageDataUri = await fileToBase64DataUri(params.image)

    return this.request<MoondreamDetectResult>('/detect', {
      image_url: imageDataUri,
      object: params.object,
    })
  }

  /**
   * Segment an object in an image
   *
   * @param params - Segmentation parameters
   * @returns SVG path and bounding box for the segmented object
   */
  async segment(params: MoondreamSegmentParams): Promise<MoondreamSegmentResult> {
    const imageDataUri = await fileToBase64DataUri(params.image)

    return this.request<MoondreamSegmentResult>('/segment', {
      image_url: imageDataUri,
      object: params.object,
    })
  }

  /**
   * Query the image with a question (visual question answering)
   *
   * @param params - Query parameters
   * @returns Answer to the question
   */
  async query(params: MoondreamQueryParams): Promise<MoondreamQueryResult> {
    const imageDataUri = await fileToBase64DataUri(params.image)

    return this.request<MoondreamQueryResult>('/query', {
      image_url: imageDataUri,
      question: params.question,
    })
  }

  /**
   * Generate a caption for the image
   *
   * @param params - Caption parameters
   * @returns Generated caption
   */
  async caption(params: MoondreamCaptionParams): Promise<MoondreamCaptionResult> {
    const imageDataUri = await fileToBase64DataUri(params.image)

    return this.request<MoondreamCaptionResult>('/caption', {
      image_url: imageDataUri,
      length: params.length || 'short',
    })
  }

  /**
   * Get center points for objects in an image
   *
   * @param params - Point parameters
   * @returns Array of center coordinates for detected objects
   */
  async point(params: MoondreamPointParams): Promise<MoondreamPointResult> {
    const imageDataUri = await fileToBase64DataUri(params.image)

    return this.request<MoondreamPointResult>('/point', {
      image_url: imageDataUri,
      object: params.object,
    })
  }

  /**
   * Auto-tag an image by extracting objects, features, and characteristics
   *
   * @param image - Image file to analyze
   * @returns Array of tags
   */
  async autoTag(image: File): Promise<string[]> {
    const result = await this.query({
      image,
      question: 'List all visible objects, features, and characteristics of this image. Return the result as a JSON array of strings.',
    })

    try {
      // Try to parse as JSON array
      const parsed = JSON.parse(result.answer)
      if (Array.isArray(parsed)) {
        return parsed.map(String)
      }
      // If it's a string, try to extract tags from it
      return result.answer.split(',').map(s => s.trim()).filter(Boolean)
    } catch {
      // If parsing fails, split by common delimiters
      return result.answer
        .replace(/[\[\]"']/g, '')
        .split(/[,\n]/)
        .map(s => s.trim())
        .filter(Boolean)
    }
  }

  /**
   * Extract text from an image (OCR)
   *
   * @param image - Image file to analyze
   * @param mode - OCR mode: 'all' (default), 'reading' (natural reading order), 'table'
   * @returns Extracted text
   */
  async ocr(image: File, mode: 'all' | 'reading' | 'table' = 'all'): Promise<string> {
    const prompts: Record<typeof mode, string> = {
      all: 'Transcribe all text visible in this image.',
      reading: 'Transcribe the text in natural reading order.',
      table: 'Transcribe the table content, preserving structure.',
    }

    const result = await this.query({
      image,
      question: prompts[mode],
    })

    return result.answer
  }

  /**
   * Test connection to Moondream API
   *
   * @returns Connection status and model info
   */
  async testConnection(): Promise<{
    success: boolean
    message: string
    modelInfo?: string
    latencyMs?: number
  }> {
    const startTime = Date.now()

    try {
      // Create a tiny test image (1x1 pixel transparent PNG)
      const testImageBase64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

      const response = await fetch(`${this.baseUrl}/query`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.apiKey ? { 'X-Moondream-Auth': this.apiKey } : {}),
        },
        body: JSON.stringify({
          image_url: testImageBase64,
          question: 'What do you see?',
        }),
      })

      const latencyMs = Date.now() - startTime

      if (response.ok) {
        return {
          success: true,
          message: 'Connection successful',
          modelInfo: 'moondream-2b',
          latencyMs,
        }
      }

      const errorText = await response.text()
      return {
        success: false,
        message: `API error (${response.status}): ${errorText}`,
        latencyMs,
      }
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Connection failed',
        latencyMs: Date.now() - startTime,
      }
    }
  }
}

/**
 * Default Moondream client instance (cloud API)
 * Note: Requires API key to be set via createMoondreamClient or direct instantiation
 */
export const moondreamClient = new MoondreamClient({
  baseUrl: MOONDREAM_CLOUD_URL,
})
