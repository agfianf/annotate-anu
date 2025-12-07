/**
 * ProjectTasksTab Component
 * Displays and manages tasks within a project
 */

import {
  Briefcase,
  ChevronRight,
  FolderKanban,
  ListTodo,
  Loader2,
  Plus,
  RefreshCw,
  Trash2
} from 'lucide-react';
import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import type { Task } from '../lib/api-client';
import { tasksApi } from '../lib/api-client';
import AssigneeDropdown from './AssigneeDropdown';
import ConfirmationModal from './ConfirmationModal';
import CreateTaskWizard from './CreateTaskWizard';
import Toggle from './Toggle';

interface ProjectTasksTabProps {
  projectId: string;
  projectName: string;
  userRole?: 'owner' | 'maintainer' | 'annotator' | 'viewer';
}

const getStatusColor = (status: string) => {
  switch (status) {
    case 'pending':
      return 'bg-gray-100 text-gray-600';
    case 'in_progress':
      return 'bg-blue-100 text-blue-700';
    case 'completed':
      return 'bg-emerald-100 text-emerald-700';
    case 'review':
      return 'bg-amber-100 text-amber-700';
    case 'approved':
      return 'bg-green-100 text-green-700';
    default:
      return 'bg-gray-100 text-gray-600';
  }
};

export default function ProjectTasksTab({ projectId, projectName, userRole }: ProjectTasksTabProps) {
  const navigate = useNavigate();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showWizard, setShowWizard] = useState(false);
  const [includeArchived, setIncludeArchived] = useState(false);

  // Permission checks based on user role
  const canCreate = userRole === 'owner' || userRole === 'maintainer';
  const canManage = userRole === 'owner' || userRole === 'maintainer'; // Assuming maintainers can also archive/delete

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
    loadTasks();
  }, [projectId, includeArchived]);

  const loadTasks = async () => {
    setIsLoading(true);
    try {
      const data = await tasksApi.list(projectId, undefined, includeArchived);
      setTasks(data);
    } catch (err) {
      console.error('Failed to load tasks:', err);
      toast.error('Failed to load tasks');
    } finally {
      setIsLoading(false);
    }
  };

  const handleArchive = (e: React.MouseEvent, task: Task) => {
    e.stopPropagation();
    setConfirmModal({
      isOpen: true,
      title: 'Archive Task',
      message: `Are you sure you want to archive "${task.name}"? It will be hidden from the default view but can be restored later.`,
      confirmText: 'Archive',
      onConfirm: async () => {
        try {
          await tasksApi.archive(task.id);
          toast.success('Task archived');
          loadTasks();
        } catch (err) {
          toast.error('Failed to archive task');
        }
      }
    });
  };

  const handleUnarchive = async (e: React.MouseEvent, task: Task) => {
    e.stopPropagation();
    try {
      await tasksApi.unarchive(task.id);
      toast.success('Task unarchived');
      loadTasks();
    } catch (err) {
      toast.error('Failed to unarchive task');
    }
  };

  const handleDelete = (e: React.MouseEvent, task: Task) => {
    e.stopPropagation();
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
          loadTasks();
        } catch (err) {
          toast.error('Failed to delete task');
        }
      }
    });
  };

  const handleTaskClick = (taskId: number) => {
    navigate(`/dashboard/projects/${projectId}/tasks/${taskId}`);
  };

  const handleAssigneeChange = async (taskId: number, assigneeId: string | null) => {
    try {
      await tasksApi.assign(taskId, assigneeId);
      
      // Update local state
      setTasks(prev => prev.map(t => 
        t.id === taskId ? { ...t, assignee_id: assigneeId } : t
      ));
      
      toast.success(assigneeId ? 'Task assigned' : 'Task unassigned');
    } catch (err) {
      console.error('Failed to update task:', err);
      toast.error('Failed to update task assignment');
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
    <div className="glass-strong rounded-2xl shadow-lg overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-gray-50 to-white">
        <div className="flex items-center gap-2">
          <ListTodo className="w-5 h-5 text-emerald-600" />
          <h2 className="text-lg font-semibold text-gray-900">Tasks</h2>
          <span className="text-sm text-gray-400">({tasks.length})</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="mr-2">
             <Toggle
                checked={includeArchived}
                onChange={setIncludeArchived}
                label="Show Archived"
                size="sm"
             />
          </div>
          <button
            onClick={loadTasks}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-all"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          {canCreate && (
            <button
              onClick={() => setShowWizard(true)}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-lg transition-all flex items-center gap-1.5 shadow-sm"
            >
              <Plus className="w-4 h-4" />
              New Task
            </button>
          )}
        </div>
      </div>

      <div className="p-6">
        {/* Tasks List */}
        {tasks.length === 0 ? (
          <div className="text-center py-12">
            <FolderKanban className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-700 mb-2">No tasks yet</h3>
            <p className="text-gray-500 mb-6">
              {canCreate 
                ? (includeArchived ? 'No archived or active tasks found' : 'Create your first task to start organizing your annotation work')
                : 'No tasks have been created for this project yet'
              }
            </p>
            {canCreate && (
              <button
                onClick={() => setShowWizard(true)}
                className="px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-xl transition-all inline-flex items-center gap-2 shadow-lg shadow-emerald-500/25"
              >
                <Plus className="w-5 h-5" />
                Create First Task
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {tasks.map((task) => (
              <div
                key={task.id}
                className={`p-4 bg-white rounded-xl border border-gray-100 hover:border-emerald-200 hover:shadow-sm transition-all ${task.is_archived ? 'opacity-75 bg-gray-50' : ''}`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div 
                    className="flex items-start gap-3 flex-1 min-w-0 cursor-pointer group"
                    onClick={() => handleTaskClick(task.id)}
                  >
                    <div className={`p-2 rounded-lg transition-colors flex-shrink-0 ${task.is_archived ? 'bg-gray-200' : 'bg-emerald-50 group-hover:bg-emerald-100'}`}>
                      <Briefcase className={`w-5 h-5 ${task.is_archived ? 'text-gray-500' : 'text-emerald-600'}`} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="font-medium text-gray-900 group-hover:text-emerald-700 transition-colors flex items-center gap-1">
                        <span className="text-gray-400 font-normal">#{task.id}</span> 
                        <span className="truncate">{task.name}</span>
                        <ChevronRight className="w-4 h-4 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                        {task.is_archived && <span className="px-2 py-0.5 text-xs font-medium bg-gray-200 text-gray-600 rounded-lg">Archived</span>}
                      </h3>
                      {task.description && (
                        <p className="text-sm text-gray-500 mt-0.5 line-clamp-1">
                          {task.description}
                        </p>
                      )}
                      <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
                        <span>
                          Created {new Date(task.created_at).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  </div>
                  
                  {/* Status and Assignee */}
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <div className="w-44" onClick={(e) => e.stopPropagation()}>
                      <AssigneeDropdown
                        projectId={projectId}
                        value={task.assignee_id || null}
                        onChange={(id) => handleAssigneeChange(task.id, id)}
                        placeholder="Unassigned"
                        size="sm"
                        assignedUser={task.assignee}
                      />
                    </div>
                    <span
                      className={`px-2.5 py-1 rounded-full text-xs font-medium capitalize whitespace-nowrap ${getStatusColor(
                        task.status
                      )}`}
                    >
                      {task.status.replace('_', ' ')}
                    </span>
                    
                     {canManage && (
                      <div className="flex items-center gap-2 border-l border-gray-100 pl-3 ml-1">
                        <div onClick={(e) => e.stopPropagation()}>
                          <Toggle
                            checked={task.is_archived}
                            onChange={(checked) => {
                              if (checked) {
                                handleArchive({ stopPropagation: () => {} } as React.MouseEvent, task);
                              } else {
                                handleUnarchive({ stopPropagation: () => {} } as React.MouseEvent, task);
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
                                 <Trash2 className="w-4 h-4" />
                               </button>
                         )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create Task Wizard Modal */}
      {showWizard && (
        <CreateTaskWizard
          projectId={projectId}
          projectName={projectName}
          onClose={() => setShowWizard(false)}
          onSuccess={() => loadTasks()}
        />
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
    </div>
  );
}

