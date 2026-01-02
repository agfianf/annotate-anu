/**
 * React Query hook for quality processing progress tracking
 * Polls the backend for real-time progress updates during quality metrics processing.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { analyticsApi, type QualityProgressResponse } from '@/lib/analytics-client';

interface UseQualityProgressOptions {
  projectId: string;
  enabled?: boolean;
}

/**
 * Hook to track quality processing progress with automatic polling.
 * Polls every 2 seconds while processing is active.
 */
export function useQualityProgress({
  projectId,
  enabled = true,
}: UseQualityProgressOptions) {
  const queryClient = useQueryClient();

  // Progress polling query
  const {
    data: progress,
    isLoading,
    isFetching,
    error,
    refetch,
  } = useQuery({
    queryKey: ['quality-progress', projectId],
    queryFn: () => analyticsApi.getQualityProgress(projectId),
    enabled: enabled && !!projectId,
    // Poll every 2 seconds while processing is active, stop when done
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === 'processing' || status === 'pending' ? 2000 : false;
    },
    staleTime: 1000, // Consider stale after 1 second
    gcTime: 60000, // Keep in cache for 1 minute
  });

  // Start job mutation
  const startJobMutation = useMutation({
    mutationFn: (batchSize: number = 50) => analyticsApi.startQualityJob(projectId, batchSize),
    onSuccess: () => {
      // Invalidate progress query to start polling
      queryClient.invalidateQueries({ queryKey: ['quality-progress', projectId] });
    },
  });

  // Cancel job mutation
  const cancelJobMutation = useMutation({
    mutationFn: () => analyticsApi.cancelQualityJob(projectId),
    onSuccess: () => {
      // Invalidate both progress and stats queries
      queryClient.invalidateQueries({ queryKey: ['quality-progress', projectId] });
      queryClient.invalidateQueries({ queryKey: ['enhanced-dataset-stats', projectId] });
    },
  });

  // Derive useful state
  const isProcessing = progress?.status === 'processing' || progress?.status === 'pending';
  const isComplete = progress?.status === 'completed';
  const isFailed = progress?.status === 'failed';
  const isCancelled = progress?.status === 'cancelled';
  const isIdle = progress?.status === 'idle' || !progress;

  return {
    // Progress data
    progress,
    isLoading,
    isFetching,
    error,
    refetch,

    // Derived state
    isProcessing,
    isComplete,
    isFailed,
    isCancelled,
    isIdle,

    // Job actions
    startJob: startJobMutation.mutate,
    startJobAsync: startJobMutation.mutateAsync,
    isStarting: startJobMutation.isPending,
    startError: startJobMutation.error,

    cancelJob: cancelJobMutation.mutate,
    cancelJobAsync: cancelJobMutation.mutateAsync,
    isCancelling: cancelJobMutation.isPending,
    cancelError: cancelJobMutation.error,

    // Convenience accessors (with defaults)
    processed: progress?.processed ?? 0,
    failed: progress?.failed ?? 0,
    total: progress?.total ?? 0,
    remaining: progress?.remaining ?? 0,
    progressPct: progress?.progress_pct ?? 0,
    status: progress?.status ?? 'idle',
    jobId: progress?.job_id ?? null,
    startedAt: progress?.started_at ?? null,
  };
}
