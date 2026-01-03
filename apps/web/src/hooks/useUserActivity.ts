/**
 * useUserActivity Hook
 * Fetches user activity data (assigned tasks, jobs, completion stats)
 */

import { useQuery } from '@tanstack/react-query';
import { adminApi, type UserActivity } from '@/lib/api-client';

export type { UserActivity, RecentActivityItem } from '@/lib/api-client';

interface UseUserActivityOptions {
  enabled?: boolean;
}

export function useUserActivity(userId: string | null, options: UseUserActivityOptions = {}) {
  const { enabled = true } = options;

  return useQuery({
    queryKey: ['userActivity', userId],
    queryFn: async (): Promise<UserActivity> => {
      if (!userId) {
        throw new Error('User ID is required');
      }
      return adminApi.getUserActivity(userId);
    },
    enabled: enabled && !!userId,
    staleTime: 30000, // 30 seconds
    gcTime: 60000, // 1 minute (was cacheTime in v4)
  });
}

export default useUserActivity;
