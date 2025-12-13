import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { shareApi } from '../api/share'

// Query keys factory
export const fileTreeKeys = {
  all: ['fileTree'] as const,
  directory: (path: string) => [...fileTreeKeys.all, 'directory', path] as const,
  thumbnails: (paths: string[]) =>
    [...fileTreeKeys.all, 'thumbnails', paths] as const,
}

/**
 * Hook to fetch directory contents with lazy loading
 */
export function useDirectoryContents(
  path: string,
  options?: {
    enabled?: boolean
    includeHidden?: boolean
  }
) {
  return useQuery({
    queryKey: fileTreeKeys.directory(path),
    queryFn: () => shareApi.listDirectory(path, options?.includeHidden),
    enabled: options?.enabled ?? true,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes
  })
}

/**
 * Hook to prefetch directory on hover
 */
export function usePrefetchDirectory() {
  const queryClient = useQueryClient()

  return (path: string) => {
    // Prefetch after 300ms hover
    const timeoutId = setTimeout(() => {
      queryClient.prefetchQuery({
        queryKey: fileTreeKeys.directory(path),
        queryFn: () => shareApi.listDirectory(path),
        staleTime: 5 * 60 * 1000,
      })
    }, 300)

    return () => clearTimeout(timeoutId)
  }
}

/**
 * Hook to create a new directory
 */
export function useCreateDirectory() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ path, name }: { path: string; name: string }) =>
      shareApi.createDirectory(path, name),
    onSuccess: (_, variables) => {
      // Invalidate parent directory to show new folder
      queryClient.invalidateQueries({
        queryKey: fileTreeKeys.directory(variables.path),
      })
    },
  })
}

/**
 * Hook to resolve selection (expand folders to files)
 */
export function useResolveSelection() {
  return useMutation({
    mutationFn: ({ paths, recursive = true }: { paths: string[]; recursive?: boolean }) =>
      shareApi.resolveSelection(paths, recursive),
  })
}
