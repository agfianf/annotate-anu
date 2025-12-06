/**
 * Jobs Page
 * List jobs for a task, click to open annotation page
 */

import {
    AlertCircle,
    ArrowLeft,
    Briefcase,
    CheckCircle2,
    Clock,
    Loader2,
    Play,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { Job, TaskDetail } from '../lib/api-client';
import { jobsApi, tasksApi } from '../lib/api-client';

export default function JobsPage() {
  const { taskId } = useParams<{ taskId: string }>();
  const navigate = useNavigate();
  const [task, setTask] = useState<TaskDetail | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (taskId) {
      loadData();
    }
  }, [taskId]);

  const loadData = async () => {
    try {
      const [taskData, jobsData] = await Promise.all([
        tasksApi.get(taskId!),
        jobsApi.list(taskId!),
      ]);
      setTask(taskData);
      setJobs(jobsData);
    } catch (err: unknown) {
      const axiosError = err as { response?: { data?: { detail?: string } } };
      toast.error(axiosError.response?.data?.detail || 'Failed to load jobs');
    } finally {
      setIsLoading(false);
    }
  };

  const handleJobClick = (jobId: string) => {
    // Navigate to annotation page with job context
    navigate(`/app?jobId=${jobId}`);
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'approved':
        return <CheckCircle2 className="w-5 h-5 text-emerald-600" />;
      case 'completed':
      case 'review':
        return <CheckCircle2 className="w-5 h-5 text-blue-600" />;
      case 'in_progress':
        return <Play className="w-5 h-5 text-yellow-600" />;
      case 'rejected':
        return <AlertCircle className="w-5 h-5 text-red-600" />;
      default:
        return <Clock className="w-5 h-5 text-gray-400" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'approved':
        return 'bg-emerald-100 text-emerald-700';
      case 'completed':
      case 'review':
        return 'bg-blue-100 text-blue-700';
      case 'in_progress':
        return 'bg-yellow-100 text-yellow-700';
      case 'rejected':
        return 'bg-red-100 text-red-700';
      default:
        return 'bg-gray-100 text-gray-600';
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 text-emerald-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          to={`/dashboard/projects/${task?.project_id}/tasks`}
          className="p-2 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-all"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">{task?.name}</h1>
          <p className="text-gray-500 text-sm">{task?.description || 'No description'}</p>
        </div>
        <span className="text-gray-500">{jobs.length} jobs</span>
      </div>

      {/* Jobs list */}
      {jobs.length === 0 ? (
        <div className="glass-strong rounded-2xl p-12 text-center shadow-lg shadow-emerald-500/5">
          <Briefcase className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-700 mb-2">No jobs yet</h3>
          <p className="text-gray-500">Jobs will appear here when created</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {jobs.map((job) => (
            <button
              key={job.id}
              onClick={() => handleJobClick(job.id)}
              className="glass rounded-xl p-5 shadow-lg shadow-emerald-500/5 border border-gray-100 hover:border-emerald-200 hover:shadow-emerald-500/10 transition-all text-left group"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  {getStatusIcon(job.status)}
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${getStatusColor(job.status)}`}>
                    {job.status.replace('_', ' ')}
                  </span>
                </div>
              </div>

              <h3 className="font-semibold text-gray-900 mb-1">
                {job.name || `Job ${job.id.slice(0, 8)}`}
              </h3>

              <div className="text-xs text-gray-500 space-y-1">
                <p>Created: {new Date(job.created_at).toLocaleDateString()}</p>
                {job.assignee_id && <p>Assigned</p>}
              </div>

              <div className="mt-4 pt-3 border-t border-gray-100">
                <span className="text-emerald-600 text-sm font-medium group-hover:underline">
                  Open Annotation →
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
