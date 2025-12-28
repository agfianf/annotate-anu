/**
 * ProjectTasksTab Component
 * Displays and manages tasks within a project
 */

import {
    Boxes,
    LayoutGrid,
    ListTodo,
    Loader2,
    Plus,
    RefreshCw,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { useNavigate } from '@tanstack/react-router';
import type { Task } from '../lib/api-client';
import { tasksApi } from '../lib/api-client';
import CreateTaskWizard from './CreateTaskWizard';
import Toggle from './Toggle';
import { KanbanBoard, type Split } from './kanban';

interface ProjectTasksTabProps {
  projectId: string;
  projectName: string;
  userRole?: 'owner' | 'maintainer' | 'annotator' | 'viewer';
}

export default function ProjectTasksTab({ projectId, projectName, userRole }: ProjectTasksTabProps) {
  const navigate = useNavigate();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showWizard, setShowWizard] = useState(false);
  const [includeArchived, setIncludeArchived] = useState(false);

  // Permission checks based on user role
  const canCreate = userRole === 'owner' || userRole === 'maintainer';

  const loadTasks = useCallback(async () => {
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
  }, [projectId, includeArchived]);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  const handleTaskClick = useCallback((taskId: number) => {
    navigate({ to: `/dashboard/projects/${projectId}/tasks/${taskId}` });
  }, [navigate, projectId]);

  const handleSplitChange = useCallback(async (taskId: number, split: Split) => {
    // Optimistic update
    setTasks(prev => {
      const originalTasks = [...prev];
      const updatedTasks = prev.map(t =>
        t.id === taskId ? { ...t, split } : t
      );

      // Start the async update
      (async () => {
        try {
          await tasksApi.update(taskId, { split });
          toast.success(split ? `Moved to ${split}` : 'Moved to unassigned');
        } catch (err) {
          // Revert on error
          setTasks(originalTasks);
          console.error('Failed to update task split:', err);
          toast.error('Failed to move task');
        }
      })();

      return updatedTasks;
    });
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 text-emerald-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="glass-strong rounded-2xl shadow-lg overflow-hidden">
        <div className="px-6 py-4 flex items-center justify-between bg-gradient-to-r from-gray-50 to-white">
          <div className="flex items-center gap-2">
            <LayoutGrid className="w-5 h-5 text-emerald-600" />
            <h2 className="text-lg font-semibold text-gray-900">Task Board</h2>
            <span className="text-sm text-gray-400">({tasks.length} tasks)</span>
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
              title="Refresh"
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
      </div>

      {/* Kanban Board */}
      {tasks.length === 0 ? (
        <div className="glass-strong rounded-2xl shadow-lg p-6">
          <div className="text-center py-12">
            <Boxes className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-700 mb-2">No tasks yet</h3>
            <p className="text-gray-500 mb-6">
              {canCreate
                ? includeArchived
                  ? 'No archived or active tasks found'
                  : 'Create your first task to start organizing your annotation work'
                : 'No tasks have been created for this project yet'}
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
        </div>
      ) : (
        <KanbanBoard
          projectId={projectId}
          tasks={tasks}
          userRole={userRole}
          onSplitChange={handleSplitChange}
          onTaskClick={handleTaskClick}
        />
      )}

      {/* Create Task Wizard Modal */}
      {showWizard && (
        <CreateTaskWizard
          projectId={projectId}
          projectName={projectName}
          onClose={() => setShowWizard(false)}
          onSuccess={() => loadTasks()}
        />
      )}
    </div>
  );
}

