/**
 * ProjectTasksTab Component
 * Displays and manages tasks within a project
 */

import {
    Briefcase,
    FolderKanban,
    ListTodo,
    Loader2,
    Plus,
    RefreshCw,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Link } from 'react-router-dom';
import type { Task } from '../lib/api-client';
import { tasksApi } from '../lib/api-client';

interface ProjectTasksTabProps {
  projectId: string;
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

export default function ProjectTasksTab({ projectId }: ProjectTasksTabProps) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [newTaskName, setNewTaskName] = useState('');
  const [newTaskDescription, setNewTaskDescription] = useState('');

  useEffect(() => {
    loadTasks();
  }, [projectId]);

  const loadTasks = async () => {
    setIsLoading(true);
    try {
      const data = await tasksApi.list(projectId);
      setTasks(data);
    } catch (err) {
      console.error('Failed to load tasks:', err);
      toast.error('Failed to load tasks');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateTask = async () => {
    if (!newTaskName.trim()) {
      toast.error('Task name is required');
      return;
    }

    try {
      await tasksApi.create(projectId, {
        name: newTaskName.trim(),
        description: newTaskDescription.trim() || undefined,
      });
      toast.success('Task created successfully');
      setNewTaskName('');
      setNewTaskDescription('');
      setIsCreating(false);
      loadTasks();
    } catch (err) {
      console.error('Failed to create task:', err);
      toast.error('Failed to create task');
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
          <button
            onClick={loadTasks}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-all"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={() => setIsCreating(true)}
            className="px-3 py-1.5 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 font-medium rounded-lg transition-all flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            New Task
          </button>
        </div>
      </div>

      <div className="p-6">
        {/* Create Task Form */}
        {isCreating && (
          <div className="mb-6 p-4 bg-gray-50 rounded-xl border border-gray-100">
            <h3 className="font-medium text-gray-800 mb-3">Create New Task</h3>
            <div className="space-y-3">
              <input
                type="text"
                placeholder="Task name"
                value={newTaskName}
                onChange={(e) => setNewTaskName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <textarea
                placeholder="Description (optional)"
                value={newTaskDescription}
                onChange={(e) => setNewTaskDescription(e.target.value)}
                rows={2}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
              />
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => {
                    setIsCreating(false);
                    setNewTaskName('');
                    setNewTaskDescription('');
                  }}
                  className="px-4 py-2 text-gray-600 hover:text-gray-800 font-medium rounded-lg transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateTask}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-lg transition-all"
                >
                  Create Task
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Tasks List */}
        {tasks.length === 0 ? (
          <div className="text-center py-12">
            <FolderKanban className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-700 mb-2">No tasks yet</h3>
            <p className="text-gray-500 mb-6">
              Create your first task to start organizing your annotation work
            </p>
            {!isCreating && (
              <button
                onClick={() => setIsCreating(true)}
                className="px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-xl transition-all inline-flex items-center gap-2"
              >
                <Plus className="w-5 h-5" />
                Create First Task
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {tasks.map((task) => (
              <Link
                key={task.id}
                to={`/dashboard/projects/${projectId}/tasks/${task.id}`}
                className="block p-4 bg-white rounded-xl border border-gray-100 hover:border-emerald-200 hover:shadow-sm transition-all group"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <div className="p-2 bg-emerald-50 rounded-lg group-hover:bg-emerald-100 transition-colors">
                      <Briefcase className="w-5 h-5 text-emerald-600" />
                    </div>
                    <div>
                      <h3 className="font-medium text-gray-900 group-hover:text-emerald-700 transition-colors">
                        {task.name}
                      </h3>
                      {task.description && (
                        <p className="text-sm text-gray-500 mt-0.5 line-clamp-2">
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
                  <span
                    className={`px-2.5 py-1 rounded-full text-xs font-medium capitalize ${getStatusColor(
                      task.status
                    )}`}
                  >
                    {task.status.replace('_', ' ')}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
