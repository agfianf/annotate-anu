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
    return_visualization?: boolean
  }): Promise<SAM3Response> {
    const formData = new FormData()
    formData.append('image', params.image)
    formData.append('text_prompt', params.text_prompt)
    if (params.threshold !== undefined) {
      formData.append('threshold', params.threshold.toString())
    }
    if (params.return_visualization !== undefined) {
      formData.append('return_visualization', params.return_visualization.toString())
    }

    const response = await axios.post<SAM3Response>(
      `${API_BASE_URL}/api/v1/sam3/inference/text`,
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      }
    )

    return response.data
  },

  /**
   * Send bounding box prompt to SAM3 for segmentation
   */
  async bboxPrompt(params: {
    image: File
    bounding_boxes: Array<[number, number, number, number, number]>
    threshold?: number
    return_visualization?: boolean
  }): Promise<SAM3Response> {
    const formData = new FormData()
    formData.append('image', params.image)
    formData.append('bounding_boxes', JSON.stringify(params.bounding_boxes))
    if (params.threshold !== undefined) {
      formData.append('threshold', params.threshold.toString())
    }
    if (params.return_visualization !== undefined) {
      formData.append('return_visualization', params.return_visualization.toString())
    }

    const response = await axios.post<SAM3Response>(
      `${API_BASE_URL}/api/v1/sam3/inference/bbox`,
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      }
    )

    return response.data
  },

  /**
   * Health check
   */
  async health(): Promise<{ status: string }> {
    const response = await axios.get(`${API_BASE_URL}/api/v1/sam3/health`)
    return response.data
  },
}
