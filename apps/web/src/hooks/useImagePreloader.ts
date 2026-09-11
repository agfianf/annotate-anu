import { useCallback, useEffect, useState } from 'react'
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
  // Stable Map instances created once per hook instance. Held in state rather
  // than refs so `cache` can be returned from the hook without reading a ref
  // during render; mutating them never triggers a re-render.
  const [cache] = useState(() => new Map<string, HTMLImageElement>())
  const [inFlight] = useState(() => new Map<string, Promise<HTMLImageElement>>())

  /**
   * Preload a single image and cache it
   */
  const preloadImage = useCallback(
    (imageData: ImageData): Promise<HTMLImageElement> => {
      // Check cache first
      const cached = cache.get(imageData.id)
      if (cached) {
        return Promise.resolve(cached)
      }

      // Share the in-flight load instead of polling for it
      const existing = inFlight.get(imageData.id)
      if (existing) {
        return existing
      }

      const load = new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new window.Image()

        img.onload = () => {
          cache.set(imageData.id, img)
          resolve(img)
        }

        img.onerror = (err) => {
          console.error('[useImagePreloader] Failed to load image:', imageData.id, err)
          reject(err)
        }

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
          reject(new Error('No image source available'))
        }
      }).finally(() => {
        inFlight.delete(imageData.id)
      })

      inFlight.set(imageData.id, load)
      return load
    },
    [cache, inFlight]
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
    return cache.get(imageId) || null
  }, [cache])

  // Cleanup blob URLs on unmount
  useEffect(() => {
    return () => {
      cache.forEach((img) => {
        if (img.src.startsWith('blob:')) {
          URL.revokeObjectURL(img.src)
        }
      })
      cache.clear()
      inFlight.clear()
    }
  }, [cache, inFlight])

  return {
    loading,
    cache,
    preloadImage,
    preloadWindow,
    getCachedImage,
  }
}
