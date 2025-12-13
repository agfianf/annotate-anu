/**
 * Job Context Hook
 * Manages job state when annotating a job, including auto-start and image loading
 */

import { useCallback, useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import type { ImageResponse, JobDetail } from '../lib/api-client'
import { imagesApi, jobsApi } from '../lib/api-client'

export interface JobContext {
  job: JobDetail | null
  images: ImageResponse[]
  loading: boolean
  error: string | null
  refreshJob: () => Promise<void>
  refreshImages: () => Promise<void>
}

/**
 * Hook to manage job context when annotating a job
 *
 * @param jobId - The job ID from URL query params (null if not in job mode)
 * @returns Job context with job details, images, and loading state
 */
export function useJobContext(jobId: string | null): JobContext {
  const [job, setJob] = useState<JobDetail | null>(null)
  const [images, setImages] = useState<ImageResponse[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /**
   * Fetch job details
   */
  const fetchJob = useCallback(async () => {
    if (!jobId) return null

    try {
      const jobData = await jobsApi.get(jobId)
      setJob(jobData)
      return jobData
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch job'
      setError(message)
      toast.error(message)
      return null
    }
  }, [jobId])

  /**
   * Fetch all images for the job
   */
  const fetchImages = useCallback(async () => {
    if (!jobId) return

    try {
      // Fetch all images (up to 1000 for now)
      const response = await imagesApi.listForJob(jobId, 1, 1000)
      setImages(response.images)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch images'
      setError(message)
      toast.error(message)
    }
  }, [jobId])

  /**
   * Auto-start job if it's in pending or assigned state
   */
  const autoStartJob = useCallback(async (currentJob: JobDetail) => {
    const canStart = ['pending', 'assigned'].includes(currentJob.status)
    if (!canStart) return

    try {
      await jobsApi.start(currentJob.id)
      // Refetch job details to get updated status with image_count
      const updatedJob = await jobsApi.get(currentJob.id)
      setJob(updatedJob)
      toast.success('Job started')
    } catch (err) {
      // Don't fail the whole flow if auto-start fails
      console.error('Failed to auto-start job:', err)
    }
  }, [])

  /**
   * Initialize job context
   */
  useEffect(() => {
    if (!jobId) {
      // Reset state when no job ID
      setJob(null)
      setImages([])
      setLoading(false)
      setError(null)
      return
    }

    let cancelled = false

    const initJob = async () => {
      setLoading(true)
      setError(null)

      try {
        // Fetch job details
        const jobData = await fetchJob()
        if (cancelled || !jobData) return

        // Auto-start job if needed
        await autoStartJob(jobData)
        if (cancelled) return

        // Fetch images
        await fetchImages()
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    initJob()

    return () => {
      cancelled = true
    }
  }, [jobId, fetchJob, fetchImages, autoStartJob])

  /**
   * Manual refresh functions
   */
  const refreshJob = useCallback(async () => {
    if (!jobId) return
    await fetchJob()
  }, [jobId, fetchJob])

  const refreshImages = useCallback(async () => {
    if (!jobId) return
    await fetchImages()
  }, [jobId, fetchImages])

  return {
    job,
    images,
    loading,
    error,
    refreshJob,
    refreshImages,
  }
}
