/**
 * Dashboard Overview Page
 * Quick summary and stats for the user
 */

import { ArrowRight, Briefcase, ClipboardList, FolderKanban, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import type { Project } from '../lib/api-client';
import { projectsApi } from '../lib/api-client';

export default function DashboardPage() {
  const { user } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadProjects = async () => {
      try {
        const data = await projectsApi.list();
        setProjects(data);
      } catch {
        // Ignore errors
      } finally {
        setIsLoading(false);
      }
    };
    loadProjects();
  }, []);

  return (
    <div className="space-y-8">
      {/* Welcome */}
      <div className="glass-strong rounded-2xl p-6 shadow-lg shadow-emerald-500/5">
        <h1 className="text-2xl font-bold text-gray-900">
          Welcome back, {user?.full_name || user?.username}! 👋
        </h1>
        <p className="text-gray-500 mt-1">
          Here's what's happening with your annotation projects.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="glass rounded-2xl p-6 shadow-lg shadow-emerald-500/5 border border-gray-100">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-emerald-100 flex items-center justify-center">
              <FolderKanban className="w-6 h-6 text-emerald-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{projects.length}</p>
              <p className="text-gray-500 text-sm">Projects</p>
            </div>
          </div>
        </div>

        <div className="glass rounded-2xl p-6 shadow-lg shadow-emerald-500/5 border border-gray-100">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center">
              <ClipboardList className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">-</p>
              <p className="text-gray-500 text-sm">Active Tasks</p>
            </div>
          </div>
        </div>

        <div className="glass rounded-2xl p-6 shadow-lg shadow-emerald-500/5 border border-gray-100">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-purple-100 flex items-center justify-center">
              <Briefcase className="w-6 h-6 text-purple-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">-</p>
              <p className="text-gray-500 text-sm">Jobs Completed</p>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Projects */}
      <div className="glass-strong rounded-2xl p-6 shadow-lg shadow-emerald-500/5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Recent Projects</h2>
          <Link
            to="/dashboard/projects"
            className="text-emerald-600 hover:text-emerald-700 text-sm font-medium flex items-center gap-1"
          >
            View all <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 text-emerald-600 animate-spin" />
          </div>
        ) : projects.length === 0 ? (
          <div className="text-center py-8">
            <FolderKanban className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">No projects yet</p>
            <Link
              to="/dashboard/projects"
              className="text-emerald-600 hover:text-emerald-700 text-sm font-medium mt-2 inline-block"
            >
              Create your first project
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {projects.slice(0, 5).map((project) => (
              <Link
                key={project.id}
                to={`/dashboard/projects/${project.id}/tasks`}
                className="flex items-center justify-between p-4 rounded-xl border border-gray-100 hover:border-emerald-200 hover:bg-emerald-50/50 transition-all group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center text-emerald-600 font-semibold">
                    {project.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">{project.name}</p>
                    <p className="text-xs text-gray-500">{project.description || 'No description'}</p>
                  </div>
                </div>
                <ArrowRight className="w-5 h-5 text-gray-400 group-hover:text-emerald-600 transition-colors" />
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
