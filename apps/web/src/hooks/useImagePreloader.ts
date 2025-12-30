import { useCallback, useEffect, useRef, useState } from 'react'
import { imagesApi } from '../lib/api-client'
import type { ImageData } from '../types/annotations'

interface PreloadOptions {
  /**
   * How many images before/after to preload
   * @default 2
   */
  windowSize?: number

  /**
   * Load target image first before preloading window
   * @default true
   */
  priorityLoad?: boolean
}

interface PreloadState {
  /**
   * Whether preloading is in progress
   */
  loading: boolean

  /**
   * Cached image elements (Map of imageId -> HTMLImageElement)
   */
  cache: Map<string, HTMLImageElement>

  /**
   * Preload a single image and cache it
   */
  preloadImage: (imageData: ImageData) => Promise<HTMLImageElement>

  /**
   * Preload a window of images around the current index
   */
  preloadWindow: (currentIndex: number, images: ImageData[]) => Promise<void>

  /**
   * Get cached image element by ID
   */
  getCachedImage: (imageId: string) => HTMLImageElement | null
}

/**
 * useImagePreloader Hook
 *
 * Manages image preloading and caching for smooth navigation.
 * Features:
 * - Preloads images in a window around the current image (±2 by default)
 * - Caches HTMLImageElement objects to avoid re-fetching
 * - Prevents duplicate loads
 * - Handles both blob URLs (local mode) and API URLs (job mode)
 * - Cleans up blob URLs on unmount
 *
 * @example
 * const imagePreloader = useImagePreloader(images, {
 *   windowSize: 2,
 *   priorityLoad: true
 * })
 *
 * // Preload window around current image
 * useEffect(() => {
 *   const currentIndex = images.findIndex(img => img.id === currentImageId)
 *   if (currentIndex !== -1) {
 *     imagePreloader.preloadWindow(currentIndex, images)
 *   }
 * }, [currentImageId, images])
 *
 * // Get cached image
 * const cachedImage = imagePreloader.getCachedImage(imageId)
 */
export function useImagePreloader(
  images: ImageData[],
  options: PreloadOptions = {}
): PreloadState {
  const { windowSize = 2, priorityLoad = true } = options

  const [loading, setLoading] = useState(false)
  const cacheRef = useRef<Map<string, HTMLImageElement>>(new Map())
  const loadingRef = useRef<Set<string>>(new Set()) // Prevent duplicate loads

  /**
   * Preload a single image and cache it
   */
  const preloadImage = useCallback(
    async (imageData: ImageData): Promise<HTMLImageElement> => {
      // Check cache first
      if (cacheRef.current.has(imageData.id)) {
        return cacheRef.current.get(imageData.id)!
      }

      // Prevent duplicate loads
      if (loadingRef.current.has(imageData.id)) {
        // Wait for existing load
        return new Promise((resolve) => {
          const interval = setInterval(() => {
            const cached = cacheRef.current.get(imageData.id)
            if (cached) {
              clearInterval(interval)
              resolve(cached)
            }
          }, 50)
        })
      }

      loadingRef.current.add(imageData.id)

      return new Promise((resolve, reject) => {
        const img = new window.Image()

        // For job mode, use API URL
        if (imageData.s3Key && imageData.jobId && imageData.jobImageId) {
          img.src = imagesApi.getFullImageUrl(
            imageData.s3Key,
            imageData.jobId.toString(),
            imageData.jobImageId
          )
        } else if (imageData.blob && imageData.blob.size > 0) {
          // For local mode, use blob URL
          img.src = URL.createObjectURL(imageData.blob)
        } else {
          loadingRef.current.delete(imageData.id)
          reject(new Error('No image source available'))
          return
        }

        img.onload = () => {
          cacheRef.current.set(imageData.id, img)
          loadingRef.current.delete(imageData.id)
          resolve(img)
        }

        img.onerror = (err) => {
          loadingRef.current.delete(imageData.id)
          console.error('[useImagePreloader] Failed to load image:', imageData.id, err)
          reject(err)
        }
      })
    },
    []
  )

  /**
   * Preload a window of images around the current index
   */
  const preloadWindow = useCallback(
    async (currentIndex: number, imagesToPreload: ImageData[]) => {
      if (imagesToPreload.length === 0) return

      setLoading(true)

      try {
        const currentImage = imagesToPreload[currentIndex]

        // Priority: Load current image first
        if (priorityLoad && currentImage) {
          await preloadImage(currentImage)
        }

        // Then preload window around current
        const startIndex = Math.max(0, currentIndex - windowSize)
        const endIndex = Math.min(imagesToPreload.length - 1, currentIndex + windowSize)

        const preloadPromises: Promise<HTMLImageElement>[] = []

        for (let i = startIndex; i <= endIndex; i++) {
          if (i !== currentIndex || !priorityLoad) {
            preloadPromises.push(preloadImage(imagesToPreload[i]))
          }
        }

        // Load in parallel
        await Promise.allSettled(preloadPromises)
      } finally {
        setLoading(false)
      }
    },
    [windowSize, priorityLoad, preloadImage]
  )

  /**
   * Get cached image element
   */
  const getCachedImage = useCallback((imageId: string): HTMLImageElement | null => {
    return cacheRef.current.get(imageId) || null
  }, [])

  // Cleanup blob URLs on unmount
  useEffect(() => {
    return () => {
      cacheRef.current.forEach((img) => {
        if (img.src.startsWith('blob:')) {
          URL.revokeObjectURL(img.src)
        }
      })
      cacheRef.current.clear()
    }
  }, [])

  return {
    loading,
    cache: cacheRef.current,
    preloadImage,
    preloadWindow,
    getCachedImage,
  }
}
