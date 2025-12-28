/**
 * useKanbanStats Hook
 * Fetches and computes stats for Kanban columns
 */

import { useEffect, useMemo, useState } from 'react';
import type { Task, Job } from '@/lib/api-client';
import { tasksApi, jobsApi } from '@/lib/api-client';
import type { Split, KanbanTaskWithStats, ColumnStats } from './types';
import { SPLIT_ORDER } from './types';

interface UseKanbanStatsResult {
  tasksWithStats: KanbanTaskWithStats[];
  tasksBySplit: Record<string, KanbanTaskWithStats[]>;
  columnStats: Record<string, ColumnStats>;
  isLoading: boolean;
}

// Empty stats for columns with no tasks
const EMPTY_STATS: ColumnStats = {
  taskCount: 0,
  jobCount: 0,
  imageCount: 0,
  annotatedCount: 0,
  completionPercentage: 0,
};

export function useKanbanStats(tasks: Task[]): UseKanbanStatsResult {
  const [jobsByTask, setJobsByTask] = useState<Record<number, Job[]>>({});
  const [isLoading, setIsLoading] = useState(true);

  // Fetch jobs for all tasks in parallel
  // Only refetch when task IDs change (tasks added/removed), not when task properties change
  const taskIds = useMemo(() => tasks.map(t => t.id).sort().join(','), [tasks]);

  useEffect(() => {
    if (tasks.length === 0) {
      setJobsByTask({});
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    const fetchAllJobs = async () => {
      try {
        const jobsPromises = tasks.map(async (task) => {
          try {
            const jobs = await jobsApi.list(task.id.toString());
            return { taskId: task.id, jobs };
          } catch (err) {
            console.error(`Failed to fetch jobs for task ${task.id}:`, err);
            return { taskId: task.id, jobs: [] };
          }
        });

        const results = await Promise.all(jobsPromises);

        if (!cancelled) {
          const jobsMap: Record<number, Job[]> = {};
          for (const { taskId, jobs } of results) {
            jobsMap[taskId] = jobs;
          }
          setJobsByTask(jobsMap);
          setIsLoading(false);
        }
      } catch (err) {
        console.error('Failed to fetch jobs:', err);
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    fetchAllJobs();

    return () => {
      cancelled = true;
    };
  }, [taskIds, tasks.length]);

  // Compute tasks with stats
  const tasksWithStats = useMemo(() => {
    return tasks.map((task): KanbanTaskWithStats => {
      const jobs = jobsByTask[task.id] || [];
      const job_count = jobs.length;
      const total_images = jobs.reduce((sum, job) => sum + (job.total_images || 0), 0);
      const annotated_images = jobs.reduce((sum, job) => sum + (job.annotated_images || 0), 0);
      const completion_percentage = total_images > 0
        ? Math.round((annotated_images / total_images) * 100)
        : 0;

      return {
        ...task,
        job_count,
        total_images,
        annotated_images,
        completion_percentage,
      };
    });
  }, [tasks, jobsByTask]);

  // Group tasks by split
  const tasksBySplit = useMemo(() => {
    const groups: Record<string, KanbanTaskWithStats[]> = {
      null: [],
      train: [],
      val: [],
      test: [],
    };

    for (const task of tasksWithStats) {
      const key = task.split === null ? 'null' : task.split;
      groups[key].push(task);
    }

    return groups;
  }, [tasksWithStats]);

  // Compute column stats
  const columnStats = useMemo(() => {
    const stats: Record<string, ColumnStats> = {};

    for (const split of SPLIT_ORDER) {
      const key = split === null ? 'null' : split;
      const columnTasks = tasksBySplit[key];

      if (columnTasks.length === 0) {
        stats[key] = EMPTY_STATS;
        continue;
      }

      const taskCount = columnTasks.length;
      const jobCount = columnTasks.reduce((sum, t) => sum + t.job_count, 0);
      const imageCount = columnTasks.reduce((sum, t) => sum + t.total_images, 0);
      const annotatedCount = columnTasks.reduce((sum, t) => sum + t.annotated_images, 0);
      const completionPercentage = imageCount > 0
        ? Math.round((annotatedCount / imageCount) * 100)
        : 0;

      stats[key] = {
        taskCount,
        jobCount,
        imageCount,
        annotatedCount,
        completionPercentage,
      };
    }

    return stats;
  }, [tasksBySplit]);

  return {
    tasksWithStats,
    tasksBySplit,
    columnStats,
    isLoading,
  };
}
