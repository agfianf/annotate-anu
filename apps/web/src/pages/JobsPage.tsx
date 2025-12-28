/**
 * Jobs Page
 * List jobs for a task, click to open annotation page
 * Includes job assignment functionality with inline dropdown
 */

import {
  ArrowLeft,
  Loader2,
  Filter,
  X
} from 'lucide-react';
import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Link, useNavigate, useParams } from '@tanstack/react-router';
import AssigneeDropdown from '../components/AssigneeDropdown';
import ConfirmationModal from '../components/ConfirmationModal';
import Toggle from '../components/Toggle';
import JobTable from '../components/table/JobTable';
import { useAuth } from '../contexts/AuthContext';
import type { Job, TaskDetail } from '../lib/api-client';
import { jobsApi, tasksApi } from '../lib/api-client';

export default function JobsPage() {
  const { taskId, projectId } = useParams({ strict: false }) as { taskId: string; projectId?: string };
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const navigate = useNavigate();
  const [task, setTask] = useState<TaskDetail | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [includeArchived, setIncludeArchived] = useState(false);

  // Filter state
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [assigneeFilter, setAssigneeFilter] = useState<string | null>(null);
  
  // Modal state
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    isDangerous?: boolean;
    confirmText?: string;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });

  useEffect(() => {
    if (taskId) {
      loadData();
    }
  }, [taskId, includeArchived]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [taskData, jobsData] = await Promise.all([
        tasksApi.get(taskId!),
        jobsApi.list(taskId!, undefined, includeArchived),
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

  const handleArchive = (e: React.MouseEvent, job: Job) => {
    e.stopPropagation();
    setConfirmModal({
      isOpen: true,
      title: 'Archive Job',
      message: `Are you sure you want to archive Job #${job.id}? It will be hidden from the default view but can be restored later.`,
      confirmText: 'Archive',
      onConfirm: async () => {
        try {
          await jobsApi.archive(job.id);
          toast.success('Job archived');
          loadData();
        } catch (err) {
          toast.error('Failed to archive job');
        }
      }
    });
  };

  const handleUnarchive = async (e: React.MouseEvent, job: Job) => {
    e.stopPropagation();
    try {
      await jobsApi.unarchive(job.id);
      toast.success('Job unarchived');
      loadData();
    } catch (err) {
      toast.error('Failed to unarchive job');
    }
  };

  const handleDelete = (e: React.MouseEvent, job: Job) => {
    e.stopPropagation();
    setConfirmModal({
      isOpen: true,
      title: 'Delete Job',
      message: `Are you sure you want to PERMANENTLY delete Job #${job.id}? This action cannot be undone and will delete all associated annotations.`,
      isDangerous: true,
      confirmText: 'Delete',
      onConfirm: async () => {
        try {
          await jobsApi.delete(job.id);
          toast.success('Job deleted');
          loadData();
        } catch (err) {
          toast.error('Failed to delete job');
        }
      }
    });
  };

  const handleJobClick = (jobId: string) => {
    // Navigate to annotation page with job context
    navigate({ to: '/annotation', search: { jobId } });
  };

  const handleAssigneeChange = async (jobId: string, assigneeId: string | null) => {
    try {
      let updatedJob: Job;
      if (assigneeId) {
        updatedJob = await jobsApi.assign(jobId, assigneeId);
        toast.success('Job assigned');
      } else {
        updatedJob = await jobsApi.unassign(jobId);
        toast.success('Job unassigned');
      }
      setJobs(prev => prev.map(j => j.id === jobId ? updatedJob : j));
    } catch (err: unknown) {
      const axiosError = err as { response?: { data?: { detail?: string } } };
      toast.error(axiosError.response?.data?.detail || 'Failed to update assignment');
    }
  };

  // Apply filters to jobs
  const filteredJobs = jobs.filter(job => {
    // Status filter
    if (statusFilter.length > 0 && !statusFilter.includes(job.status)) {
      return false;
    }
    // Assignee filter
    if (assigneeFilter && job.assignee_id !== assigneeFilter) {
      return false;
    }
    return true;
  });

  // Available status options
  const statusOptions = [
    { value: 'pending', label: 'Pending' },
    { value: 'assigned', label: 'Assigned' },
    { value: 'in_progress', label: 'In Progress' },
    { value: 'completed', label: 'Completed' },
    { value: 'review', label: 'Review' },
    { value: 'approved', label: 'Approved' },
    { value: 'rejected', label: 'Rejected' },
  ];

  const toggleStatusFilter = (status: string) => {
    setStatusFilter(prev =>
      prev.includes(status)
        ? prev.filter(s => s !== status)
        : [...prev, status]
    );
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
          to={`/dashboard/projects/${projectId || task?.project_id}?tab=tasks`}
          className="p-2 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-all"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900"><span className="text-gray-400 font-normal">#{task?.id}</span> {task?.name}</h1>
          <p className="text-gray-500 text-sm">{task?.description || 'No description'}</p>
        </div>
        <div className="flex items-center gap-4">
            <Toggle
                checked={includeArchived}
                onChange={setIncludeArchived}
                label="Show Archived"
            />
            <span className="text-gray-500">{filteredJobs.length} of {jobs.length} jobs</span>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Status Filter */}
        <div className="relative">
          <details className="group">
            <summary className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg cursor-pointer hover:border-emerald-300 transition-colors">
              <Filter className="w-4 h-4 text-gray-400" />
              <span className="text-sm font-medium text-gray-700">
                Status {statusFilter.length > 0 && `(${statusFilter.length})`}
              </span>
            </summary>
            <div className="absolute top-full left-0 mt-2 w-56 bg-white border border-gray-200 rounded-lg shadow-lg z-10 py-2">
              {statusOptions.map((option) => (
                <label
                  key={option.value}
                  className="flex items-center gap-3 px-4 py-2 hover:bg-gray-50 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={statusFilter.includes(option.value)}
                    onChange={() => toggleStatusFilter(option.value)}
                    className="w-4 h-4 text-emerald-600 rounded border-gray-300 focus:ring-emerald-500"
                  />
                  <span className="text-sm text-gray-700">{option.label}</span>
                </label>
              ))}
              {statusFilter.length > 0 && (
                <div className="border-t border-gray-200 mt-2 pt-2 px-4">
                  <button
                    onClick={() => setStatusFilter([])}
                    className="text-sm text-emerald-600 hover:text-emerald-700 font-medium"
                  >
                    Clear all
                  </button>
                </div>
              )}
            </div>
          </details>
        </div>

        {/* Assignee Filter */}
        <div className="relative">
          {task && (
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-gray-400" />
              <AssigneeDropdown
                projectId={String(task.project_id)}
                value={assigneeFilter}
                onChange={setAssigneeFilter}
                placeholder="All Assignees"
                size="sm"
                showClear={true}
              />
            </div>
          )}
        </div>

        {/* Active Filters Display */}
        {(statusFilter.length > 0 || assigneeFilter) && (
          <button
            onClick={() => {
              setStatusFilter([]);
              setAssigneeFilter(null);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
          >
            <X className="w-4 h-4" />
            Clear all filters
          </button>
        )}
      </div>

      {/* Jobs Table */}
      <JobTable
        jobs={filteredJobs}
        onJobClick={handleJobClick}
        onAssigneeChange={handleAssigneeChange}
        onArchive={isAdmin ? (jobId) => {
          const job = jobs.find(j => j.id === jobId);
          if (job) {
            if (job.is_archived) {
              handleUnarchive({ stopPropagation: () => {} } as React.MouseEvent, job);
            } else {
              handleArchive({ stopPropagation: () => {} } as React.MouseEvent, job);
            }
          }
        } : undefined}
        onDelete={isAdmin ? (jobId) => {
          const job = jobs.find(j => j.id === jobId);
          if (job) {
            handleDelete({ stopPropagation: () => {} } as React.MouseEvent, job);
          }
        } : undefined}
        projectId={projectId || String(task?.project_id || '')}
        taskId={taskId}
        userRole={user?.role}
      />

      {/* Confirmation Modal */}
      <ConfirmationModal
        isOpen={confirmModal.isOpen}
        onClose={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
        onConfirm={confirmModal.onConfirm}
        title={confirmModal.title}
        message={confirmModal.message}
        isDangerous={confirmModal.isDangerous}
        confirmText={confirmModal.confirmText}
      />
    </div>
  );
}
