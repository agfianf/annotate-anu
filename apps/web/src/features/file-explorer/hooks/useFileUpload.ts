import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useCallback, useState } from 'react'
import { shareApi } from '../api/share'
import type { UploadFile, UploadResponse } from '../types'
import { fileTreeKeys } from './useFileTree'

// Fallback for crypto.randomUUID (not available in all contexts)
const generateId = (): string => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  // Fallback implementation
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

interface UseFileUploadOptions {
  onSuccess?: (response: UploadResponse) => void
  onError?: (error: Error) => void
}

export function useFileUpload(options?: UseFileUploadOptions) {
  const [uploadQueue, setUploadQueue] = useState<UploadFile[]>([])
  const [overallProgress, setOverallProgress] = useState(0)
  const queryClient = useQueryClient()

  const uploadMutation = useMutation({
    mutationFn: async ({
      destination,
      files,
    }: {
      destination: string
      files: File[]
    }) => {
      return shareApi.uploadFiles(destination, files, (progress) => {
        setOverallProgress(progress)
      })
    },
    onSuccess: (response, variables) => {
      // Update upload queue with results
      setUploadQueue((prev) =>
        prev.map((item) => {
          const wasUploaded = response.uploaded.some((p) =>
            p.endsWith(item.file.name)
          )
          const failure = response.failed.find(
            (f) => f.filename === item.file.name
          )

          return {
            ...item,
            status: wasUploaded ? 'success' : failure ? 'error' : item.status,
            error: failure?.reason,
          } as UploadFile
        })
      )

      // Invalidate directory cache to show new files
      queryClient.invalidateQueries({
        queryKey: fileTreeKeys.directory(variables.destination),
      })

      options?.onSuccess?.(response)
    },
    onError: (error: unknown) => {
      // Parse error message from axios response
      let errorMessage = 'Upload failed'
      
      // Check if it's an axios error with response data
      if (error && typeof error === 'object' && 'response' in error) {
        const axiosError = error as { response?: { data?: { message?: string; detail?: string } } }
        const responseData = axiosError.response?.data
        errorMessage = responseData?.message || responseData?.detail || errorMessage
      } else if (error instanceof Error) {
        errorMessage = error.message
      }

      setUploadQueue((prev) =>
        prev.map((item) => ({
          ...item,
          status: 'error' as const,
          error: errorMessage,
        }))
      )
      options?.onError?.(new Error(errorMessage))
    },
  })

  const addFiles = useCallback((files: File[], basePath: string = '') => {
    const newItems: UploadFile[] = files.map((file) => ({
      id: generateId(),
      file,
      relativePath: basePath,
      progress: 0,
      status: 'pending' as const,
    }))

    setUploadQueue((prev) => [...prev, ...newItems])
    return newItems
  }, [])

  const removeFile = useCallback((id: string) => {
    setUploadQueue((prev) => prev.filter((item) => item.id !== id))
  }, [])

  const clearQueue = useCallback(() => {
    setUploadQueue([])
    setOverallProgress(0)
  }, [])

  const startUpload = useCallback(
    (destination: string) => {
      const pendingFiles = uploadQueue
        .filter((item) => item.status === 'pending')
        .map((item) => item.file)

      if (pendingFiles.length === 0) return

      setUploadQueue((prev) =>
        prev.map((item) =>
          item.status === 'pending'
            ? { ...item, status: 'uploading' as const }
            : item
        )
      )

      uploadMutation.mutate({ destination, files: pendingFiles })
    },
    [uploadQueue, uploadMutation]
  )

  return {
    uploadQueue,
    overallProgress,
    isUploading: uploadMutation.isPending,
    addFiles,
    removeFile,
    clearQueue,
    startUpload,
  }
}
