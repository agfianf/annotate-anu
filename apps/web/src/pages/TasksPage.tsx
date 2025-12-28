/**
 * Tasks Page
 * List tasks for a project
 */

import {
    ArrowLeft,
    ArrowRight,
    ClipboardList,
    Loader2,
    Plus,
    X,
} from 'lucide-react';
import type { FormEvent } from 'react';
import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Link, useParams } from '@tanstack/react-router';
import ConfirmationModal from '../components/ConfirmationModal';
import CreateTaskWizard from '../components/CreateTaskWizard';
import Toggle from '../components/Toggle';
import { useAuth } from '../contexts/AuthContext';
import type { ProjectDetail, Task } from '../lib/api-client';
import { projectsApi, tasksApi } from '../lib/api-client';

export default function TasksPage() {
  const [includeArchived, setIncludeArchived] = useState(false);
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const { projectId } = useParams({ strict: false }) as { projectId: string };
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showWizard, setShowWizard] = useState(false);
  const [newTask, setNewTask] = useState({ name: '', description: '' });

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
    if (projectId) {
      loadData();
    }
  }, [projectId, includeArchived]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [projectData, tasksData] = await Promise.all([
        projectsApi.get(projectId!),
        tasksApi.list(projectId!, undefined, includeArchived),
      ]);
      setProject(projectData);
      setTasks(tasksData);
    } catch (err: unknown) {
      const axiosError = err as { response?: { data?: { detail?: string } } };
      toast.error(axiosError.response?.data?.detail || 'Failed to load tasks');
    } finally {
      setIsLoading(false);
    }
  };

  const handleArchive = (e: React.MouseEvent, task: Task) => {
    e.preventDefault();
    setConfirmModal({
      isOpen: true,
      title: 'Archive Task',
      message: `Are you sure you want to archive "${task.name}"? It will be hidden from the default view but can be restored later.`,
      confirmText: 'Archive',
      onConfirm: async () => {
        try {
          await tasksApi.archive(task.id);
          toast.success('Task archived');
          loadData();
        } catch (err) {
          toast.error('Failed to archive task');
        }
      }
    });
  };

  const handleUnarchive = async (e: React.MouseEvent, task: Task) => {
    e.preventDefault();
    try {
      await tasksApi.unarchive(task.id);
      toast.success('Task unarchived');
      loadData();
    } catch (err) {
      toast.error('Failed to unarchive task');
    }
  };

  const handleDelete = (e: React.MouseEvent, task: Task) => {
    e.preventDefault();
    setConfirmModal({
      isOpen: true,
      title: 'Delete Task',
      message: `Are you sure you want to PERMANENTLY delete "${task.name}"? This action cannot be undone and will delete all associated jobs and annotations.`,
      isDangerous: true,
      confirmText: 'Delete',
      onConfirm: async () => {
        try {
          await tasksApi.delete(task.id);
          toast.success('Task deleted');
          loadData();
        } catch (err) {
          toast.error('Failed to delete task');
        }
      }
    });
  };

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    if (!newTask.name.trim()) {
      toast.error('Task name is required');
      return;
    }

    setIsCreating(true);
    try {
      const created = await tasksApi.create(projectId!, {
        name: newTask.name,
        description: newTask.description || undefined,
      });
      setTasks((prev) => [created, ...prev]);
      setShowCreateModal(false);
      setNewTask({ name: '', description: '' });
      toast.success('Task created');
    } catch (err: unknown) {
      const axiosError = err as { response?: { data?: { detail?: string } } };
      toast.error(axiosError.response?.data?.detail || 'Failed to create task');
    } finally {
      setIsCreating(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-emerald-100 text-emerald-700';
      case 'in_progress':
        return 'bg-blue-100 text-blue-700';
      case 'pending':
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
          to="/dashboard/projects"
          className="p-2 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-all"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900"><span className="text-gray-400 font-normal">#{project?.id}</span> {project?.name}</h1>
          <p className="text-gray-500 text-sm">{project?.description || 'No description'}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="mr-2">
            <Toggle
                checked={includeArchived}
                onChange={setIncludeArchived}
                label="Show Archived"
            />
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-xl transition-all flex items-center gap-2"
          >
            <Plus className="w-5 h-5" />
            Quick Create
          </button>
          <button
            onClick={() => setShowWizard(true)}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-xl transition-all flex items-center gap-2 shadow-lg shadow-emerald-500/25"
          >
            <Plus className="w-5 h-5" />
            Create with Images
          </button>
        </div>
      </div>

      {/* Tasks list */}
      {tasks.length === 0 ? (
        <div className="glass-strong rounded-2xl p-12 text-center shadow-lg shadow-emerald-500/5">
          <ClipboardList className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-700 mb-2">No tasks yet</h3>
          <p className="text-gray-500 mb-6">
             {includeArchived ? 'No archived or active tasks found' : 'Create your first task to organize jobs'}
          </p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-xl transition-all inline-flex items-center gap-2"
          >
            <Plus className="w-5 h-5" />
            Create Task
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {tasks.map((task) => (
            <Link
              key={task.id}
              to={`/dashboard/tasks/${task.id}/jobs`}
              className={`glass rounded-xl p-5 shadow-lg shadow-emerald-500/5 border border-gray-100 hover:border-emerald-200 transition-all flex items-center justify-between group ${task.is_archived ? 'opacity-75 bg-gray-50' : ''}`}
            >
              <div className="flex items-center gap-4">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${task.is_archived ? 'bg-gray-200' : 'bg-blue-100'}`}>
                  <ClipboardList className={`w-6 h-6 ${task.is_archived ? 'text-gray-500' : 'text-blue-600'}`} />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                    <span className="text-gray-400 font-normal">#{task.id}</span> {task.name}
                    {task.is_archived && <span className="px-2 py-0.5 text-xs font-medium bg-gray-200 text-gray-600 rounded-lg">Archived</span>}
                  </h3>
                  <p className="text-sm text-gray-500">{task.description || 'No description'}</p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <span className={`px-3 py-1 rounded-full text-xs font-medium capitalize ${getStatusColor(task.status)}`}>
                  {task.status.replace('_', ' ')}
                </span>
                
                {isAdmin && (
                  <div className="flex items-center gap-3">
                    <div onClick={(e) => e.stopPropagation()}>
                      <Toggle
                        checked={task.is_archived}
                        onChange={(checked) => {
                          if (checked) {
                            handleArchive({ preventDefault: () => {} } as React.MouseEvent, task);
                          } else {
                            handleUnarchive({ preventDefault: () => {} } as React.MouseEvent, task);
                          }
                        }}
                        size="sm"
                      />
                    </div>
                      {task.is_archived && (
                        <button 
                             onClick={(e) => handleDelete(e, task)}
                             className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                             title="Delete"
                           >
                             <X className="w-4 h-4" />
                           </button>
                     )}
                  </div>
                )}
                
                <ArrowRight className="w-5 h-5 text-gray-400 group-hover:text-emerald-600 group-hover:translate-x-1 transition-all" />
              </div>
            </Link>
          ))}
        </div>
      )}

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

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <div className="glass-strong rounded-2xl p-6 w-full max-w-md shadow-2xl mx-4">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-gray-900">Create Task</h2>
              <button
                onClick={() => setShowCreateModal(false)}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label htmlFor="taskName" className="block text-sm font-medium text-gray-700 mb-1.5">
                  Task Name *
                </label>
                <input
                  id="taskName"
                  type="text"
                  value={newTask.name}
                  onChange={(e) => setNewTask((t) => ({ ...t, name: e.target.value }))}
                  placeholder="Annotation Task 1"
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white/50 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
                  autoFocus
                />
              </div>

              <div>
                <label htmlFor="taskDesc" className="block text-sm font-medium text-gray-700 mb-1.5">
                  Description
                </label>
                <textarea
                  id="taskDesc"
                  value={newTask.description}
                  onChange={(e) => setNewTask((t) => ({ ...t, description: e.target.value }))}
                  placeholder="Optional description..."
                  rows={3}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white/50 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all resize-none"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 text-gray-600 hover:text-gray-800 font-medium rounded-xl transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCreating}
                  className="px-6 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white font-medium rounded-xl transition-all flex items-center gap-2"
                >
                  {isCreating ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Plus className="w-4 h-4" />
                  )}
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create Task Wizard */}
      {showWizard && project && (
        <CreateTaskWizard
          projectId={projectId!}
          projectName={project.name}
          onClose={() => setShowWizard(false)}
          onSuccess={() => loadData()}
        />
      )}
    </div>
  );
}
