/**
 * Projects Page
 * List projects with create functionality
 */

import {
    ArrowRight,
    Boxes,
    Loader2,
    Plus,
    X,
} from 'lucide-react';
import type { FormEvent } from 'react';
import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Link } from '@tanstack/react-router';
import ConfirmationModal from '../components/ConfirmationModal';
import Toggle from '../components/Toggle';
import { useAuth } from '../contexts/AuthContext';
import type { Project } from '../lib/api-client';
import { projectsApi } from '../lib/api-client';

export default function ProjectsPage() {
  const [includeArchived, setIncludeArchived] = useState(false);
  const { user } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newProject, setNewProject] = useState({ name: '', description: '' });

  const canCreateProject = user?.role === 'admin' || user?.role === 'member';
  const isAdmin = user?.role === 'admin';

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
    loadProjects();
  }, [includeArchived]);

  const loadProjects = async () => {
    setIsLoading(true);
    try {
      const data = await projectsApi.list(includeArchived);
      setProjects(data);
    } catch (err: unknown) {
      const axiosError = err as { response?: { data?: { detail?: string } } };
      toast.error(axiosError.response?.data?.detail || 'Failed to load projects');
    } finally {
      setIsLoading(false);
    }
  };

  const handleArchive = (e: React.MouseEvent, project: Project) => {
    e.preventDefault();
    setConfirmModal({
      isOpen: true,
      title: 'Archive Project',
      message: `Are you sure you want to archive "${project.name}"? It will be hidden from the default view but can be restored later.`,
      confirmText: 'Archive',
      onConfirm: async () => {
        try {
          await projectsApi.archive(project.id);
          toast.success('Project archived');
          loadProjects();
        } catch (err) {
          toast.error('Failed to archive project');
        }
      }
    });
  };

  const handleUnarchive = async (e: React.MouseEvent, project: Project) => {
    e.preventDefault();
    try {
      await projectsApi.unarchive(project.id);
      toast.success('Project unarchived');
      loadProjects();
    } catch (err) {
      toast.error('Failed to unarchive project');
    }
  };

  const handleDelete = (e: React.MouseEvent, project: Project) => {
    e.preventDefault();
    setConfirmModal({
      isOpen: true,
      title: 'Delete Project',
      message: `Are you sure you want to PERMANENTLY delete "${project.name}"? This action cannot be undone and will delete all associated tasks, jobs, and annotations.`,
      isDangerous: true,
      confirmText: 'Delete',
      onConfirm: async () => {
        try {
          await projectsApi.delete(project.id);
          toast.success('Project deleted');
          loadProjects();
        } catch (err) {
          toast.error('Failed to delete project');
        }
      }
    });
  };

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    if (!newProject.name.trim()) {
      toast.error('Project name is required');
      return;
    }

    setIsCreating(true);
    try {
      const created = await projectsApi.create({
        name: newProject.name,
        description: newProject.description || undefined,
      });
      setProjects((prev) => [created, ...prev]);
      setShowCreateModal(false);
      setNewProject({ name: '', description: '' });
      toast.success('Project created');
    } catch (err: unknown) {
      const axiosError = err as { response?: { data?: { detail?: string } } };
      toast.error(axiosError.response?.data?.detail || 'Failed to create project');
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Boxes className="w-7 h-7" />
          Projects
        </h1>
        <div className="flex items-center gap-4">
          <Toggle
            checked={includeArchived}
            onChange={setIncludeArchived}
            label="Show Archived"
          />
        
          {canCreateProject && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-xl transition-all flex items-center gap-2 shadow-lg shadow-emerald-500/25"
            >
              <Plus className="w-5 h-5" />
              New Project
            </button>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 text-emerald-600 animate-spin" />
        </div>
      ) : projects.length === 0 ? (
        <div className="glass-strong rounded-2xl p-12 text-center shadow-lg shadow-emerald-500/5">
          <Boxes className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-700 mb-2">No projects yet</h3>
          <p className="text-gray-500 mb-6">
            {includeArchived ? 'No archived or active projects found' : (canCreateProject ? 'Create your first project to get started' : 'No projects found')}
          </p>
          {canCreateProject && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-xl transition-all inline-flex items-center gap-2"
            >
              <Plus className="w-5 h-5" />
              Create Project
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {projects.map((project) => (
            <Link
              key={project.id}
              to="/dashboard/projects/$projectId"
              params={{ projectId: String(project.id) }}
              className={`glass rounded-2xl p-6 shadow-lg shadow-emerald-500/5 border border-gray-100 hover:border-emerald-200 hover:shadow-emerald-500/10 transition-all group relative ${project.is_archived ? 'opacity-75 bg-gray-50' : ''}`}
            >
              <div className="flex items-start justify-between mb-4">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center font-bold text-xl ${project.is_archived ? 'bg-gray-200 text-gray-500' : 'bg-emerald-100 text-emerald-600'}`}>
                  {project.name.charAt(0).toUpperCase()}
                </div>
                <div className="flex items-center gap-2">
                  {project.is_archived && <span className="px-2 py-1 text-xs font-medium bg-gray-200 text-gray-600 rounded-lg">Archived</span>}
                  <ArrowRight className="w-5 h-5 text-gray-400 group-hover:text-emerald-600 group-hover:translate-x-1 transition-all" />
                </div>
              </div>
              <h3 className="font-semibold text-gray-900 text-lg mb-1"><span className="text-gray-400 font-normal">#{project.id}</span> {project.name}</h3>
              <p className="text-gray-500 text-sm line-clamp-2">
                {project.description || 'No description'}
              </p>
              
              <div className="mt-4 pt-4 border-t border-gray-100 flex items-center justify-between">
                <div className="text-xs text-gray-400">
                  Created {new Date(project.created_at).toLocaleDateString()}
                </div>
                {isAdmin && (
                  <div className="flex items-center gap-3">
                    <div onClick={(e) => e.stopPropagation()}>
                      <Toggle
                        checked={project.is_archived}
                        onChange={(checked) => {
                          if (checked) {
                            handleArchive({ preventDefault: () => {} } as React.MouseEvent, project);
                          } else {
                            handleUnarchive({ preventDefault: () => {} } as React.MouseEvent, project);
                          }
                        }}
                        label={project.is_archived ? "Archived" : "Active"}
                        size="sm"
                      />
                    </div>
                     {project.is_archived && (
                        <button 
                          onClick={(e) => handleDelete(e, project)}
                          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Delete"
                        >
                          <X className="w-4 h-4" />
                        </button>
                     )}
                  </div>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <div className="glass-strong rounded-2xl p-6 w-full max-w-md shadow-2xl mx-4">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-gray-900">Create Project</h2>
              <button
                onClick={() => setShowCreateModal(false)}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label htmlFor="projectName" className="block text-sm font-medium text-gray-700 mb-1.5">
                  Project Name *
                </label>
                <input
                  id="projectName"
                  type="text"
                  value={newProject.name}
                  onChange={(e) => setNewProject((p) => ({ ...p, name: e.target.value }))}
                  placeholder="My Annotation Project"
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white/50 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
                  autoFocus
                />
              </div>

              <div>
                <label htmlFor="projectDesc" className="block text-sm font-medium text-gray-700 mb-1.5">
                  Description
                </label>
                <textarea
                  id="projectDesc"
                  value={newProject.description}
                  onChange={(e) => setNewProject((p) => ({ ...p, description: e.target.value }))}
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
