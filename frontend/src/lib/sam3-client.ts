import axios from 'axios'
import type { SAM3Response } from '@/types/annotations'

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

export const sam3Client = {
  /**
   * Send text prompt to SAM3 for segmentation
   */
  async textPrompt(params: {
    image: File
    text_prompt: string
    threshold?: number
    mask_threshold?: number
    return_visualization?: boolean
  }): Promise<SAM3Response> {
    console.log('[sam3Client] Text prompt request:', {
      imageName: params.image.name,
      imageSize: params.image.size,
      textPrompt: params.text_prompt,
      threshold: params.threshold,
      apiUrl: `${API_BASE_URL}/api/v1/sam3/inference/text`
    })

    const formData = new FormData()
    formData.append('image', params.image)
    formData.append('text_prompt', params.text_prompt)
    if (params.threshold !== undefined) {
      formData.append('threshold', params.threshold.toString())
    }
    if (params.mask_threshold !== undefined) {
      formData.append('mask_threshold', params.mask_threshold.toString())
    }
    if (params.return_visualization !== undefined) {
      formData.append('return_visualization', params.return_visualization.toString())
    }

    console.log('[sam3Client] Sending request...')
    try {
      const response = await axios.post<SAM3Response>(
        `${API_BASE_URL}/api/v1/sam3/inference/text`,
        formData,
        {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
          timeout: 120000, // 2 minutes timeout
        }
      )
      console.log('[sam3Client] Response received:', response.data)
      return response.data
    } catch (error) {
      console.error('[sam3Client] Request failed:', error)
      if (axios.isAxiosError(error)) {
        console.error('[sam3Client] Axios error details:', {
          message: error.message,
          code: error.code,
          response: error.response?.data,
          status: error.response?.status,
          url: error.config?.url,
          method: error.config?.method
        })

        // More specific error messages
        if (error.code === 'ERR_NETWORK') {
          console.error('[sam3Client] Network error - cannot reach backend. Check if backend is running and accessible.')
        } else if (error.code === 'ECONNABORTED') {
          console.error('[sam3Client] Request timeout - backend took too long to respond')
        } else if (!error.response) {
          console.error('[sam3Client] No response received - network issue or CORS problem')
        }
      }
      throw error
    }
  },

  /**
   * Send bounding box prompt to SAM3 for segmentation
   */
  async bboxPrompt(params: {
    image: File
    bounding_boxes: Array<[number, number, number, number, number]>
    threshold?: number
    mask_threshold?: number
    return_visualization?: boolean
  }): Promise<SAM3Response> {
    console.log('[sam3Client] Bbox prompt request:', {
      imageName: params.image.name,
      imageSize: params.image.size,
      numBoxes: params.bounding_boxes.length,
      threshold: params.threshold,
      apiUrl: `${API_BASE_URL}/api/v1/sam3/inference/bbox`
    })

    const formData = new FormData()
    formData.append('image', params.image)
    formData.append('bounding_boxes', JSON.stringify(params.bounding_boxes))
    if (params.threshold !== undefined) {
      formData.append('threshold', params.threshold.toString())
    }
    if (params.mask_threshold !== undefined) {
      formData.append('mask_threshold', params.mask_threshold.toString())
    }
    if (params.return_visualization !== undefined) {
      formData.append('return_visualization', params.return_visualization.toString())
    }

    console.log('[sam3Client] Sending bbox request...')
    try {
      const response = await axios.post<SAM3Response>(
        `${API_BASE_URL}/api/v1/sam3/inference/bbox`,
        formData,
        {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
          timeout: 120000, // 2 minutes timeout
        }
      )
      console.log('[sam3Client] Bbox response received:', response.data)
      return response.data
    } catch (error) {
      console.error('[sam3Client] Bbox request failed:', error)
      if (axios.isAxiosError(error)) {
        console.error('[sam3Client] Axios error details:', {
          message: error.message,
          code: error.code,
          response: error.response?.data,
          status: error.response?.status,
          url: error.config?.url,
          method: error.config?.method
        })

        // More specific error messages
        if (error.code === 'ERR_NETWORK') {
          console.error('[sam3Client] Network error - cannot reach backend. Check if backend is running and accessible.')
        } else if (error.code === 'ECONNABORTED') {
          console.error('[sam3Client] Request timeout - backend took too long to respond')
        } else if (!error.response) {
          console.error('[sam3Client] No response received - network issue or CORS problem')
        }
      }
      throw error
    }
  },

  /**
   * Health check
   */
  async health(): Promise<{ status: string }> {
    const response = await axios.get(`${API_BASE_URL}/api/v1/sam3/health`)
    return response.data
  },
}
