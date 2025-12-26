/**
 * ProjectHistoryTab Component
 * Timeline visualization of project activity
 */

import {
    Boxes,
    Briefcase,
    ChevronDown,
    ChevronUp,
    Clock,
    Download,
    Filter,
    ListTodo,
    Loader2,
    Palette,
    Plus,
    RefreshCw,
    Trash2,
    User,
    UserPlus,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import type { ProjectActivity } from '../lib/api-client';
import { projectsApi } from '../lib/api-client';
import { ExportHistoryPanel } from './export/ExportHistoryPanel';
import { SavedFiltersPanel } from './export/SavedFiltersPanel';

interface ProjectHistoryTabProps {
  projectId: string;
}

const getActionIcon = (action: string) => {
  switch (action) {
    case 'created':
      return Plus;
    case 'deleted':
      return Trash2;
    case 'updated':
      return RefreshCw;
    case 'status_changed':
      return Clock;
    case 'assigned':
      return UserPlus;
    default:
      return Clock;
  }
};

const getEntityIcon = (entityType: string) => {
  switch (entityType) {
    case 'task':
      return ListTodo;
    case 'job':
      return Briefcase;
    case 'label':
      return Palette;
    case 'member':
      return User;
    case 'project':
      return Boxes;
    case 'export':
      return Download;
    case 'filter':
      return Filter;
    default:
      return Clock;
  }
};

const getEntityColor = (entityType: string): string => {
  switch (entityType) {
    case 'task':
      return '#3B82F6'; // blue
    case 'job':
      return '#10B981'; // emerald
    case 'label':
      return '#F59E0B'; // amber
    case 'member':
      return '#8B5CF6'; // violet
    case 'project':
      return '#EC4899'; // pink
    case 'export':
      return '#059669'; // emerald-600
    case 'filter':
      return '#6366F1'; // indigo
    default:
      return '#6B7280'; // gray
  }
};

const getActionLabel = (action: string): string => {
  switch (action) {
    case 'created':
      return 'created';
    case 'deleted':
      return 'deleted';
    case 'updated':
      return 'updated';
    case 'status_changed':
      return 'changed status';
    case 'assigned':
      return 'assigned';
    case 'completed':
      return 'completed';
    case 'failed':
      return 'failed';
    default:
      return action;
  }
};

const formatTimeAgo = (dateString: string): string => {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
};

export default function ProjectHistoryTab({ projectId }: ProjectHistoryTabProps) {
  const [activities, setActivities] = useState<ProjectActivity[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [showFilters, setShowFilters] = useState(true);
  const [showExports, setShowExports] = useState(true);

  useEffect(() => {
    loadActivities();
  }, [projectId]);

  const loadActivities = async () => {
    setIsLoading(true);
    try {
      const result = await projectsApi.getActivity(projectId, 100, 0);
      setActivities(result.data);
      setTotal(result.total);
    } catch (err) {
      console.error('Failed to load activity:', err);
      toast.error('Failed to load project history');
    } finally {
      setIsLoading(false);
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
    {/* Activity Timeline Section */}
    {activities.length === 0 ? (
      <div className="glass-strong rounded-2xl shadow-lg p-12 text-center">
        <Clock className="w-16 h-16 text-gray-300 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-gray-700 mb-2">No activity yet</h3>
        <p className="text-gray-500">
          Activity will appear here when tasks and jobs are created or updated.
        </p>
      </div>
    ) : (
    <div className="glass-strong rounded-2xl shadow-lg overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-gray-50 to-white">
        <div className="flex items-center gap-2">
          <Clock className="w-5 h-5 text-emerald-600" />
          <h2 className="text-lg font-semibold text-gray-900">Activity Timeline</h2>
          <span className="text-sm text-gray-400">({total} events)</span>
        </div>
        <button
          onClick={loadActivities}
          className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-all"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      <div className="p-6">
        {/* Timeline */}
        <div className="relative">
          {/* Timeline line */}
          <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gradient-to-b from-emerald-200 via-gray-200 to-gray-100" />

          {/* Activity items */}
          <div className="space-y-4">
            {activities.map((activity, index) => {
              const EntityIcon = getEntityIcon(activity.entity_type);
              const ActionIcon = getActionIcon(activity.action);
              const color = getEntityColor(activity.entity_type);

              return (
                <div key={activity.id} className="relative flex gap-4 pl-2">
                  {/* Timeline dot */}
                  <div
                    className="relative z-10 w-5 h-5 rounded-full flex items-center justify-center shadow-sm"
                    style={{ backgroundColor: color }}
                  >
                    <EntityIcon className="w-3 h-3 text-white" />
                  </div>

                  {/* Content */}
                  <div
                    className={`flex-1 p-4 rounded-xl border transition-all ${
                      index === 0
                        ? 'bg-white border-gray-200 shadow-sm'
                        : 'bg-gray-50/50 border-gray-100'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span
                            className="text-xs px-2 py-0.5 rounded-full font-medium capitalize"
                            style={{
                              backgroundColor: `${color}15`,
                              color: color,
                            }}
                          >
                            {activity.entity_type}
                          </span>
                          <span className="text-sm text-gray-600">
                            <span className="font-medium text-gray-900">
                              {activity.actor_name || 'System'}
                            </span>{' '}
                            {getActionLabel(activity.action)}{' '}
                            <span className="font-medium text-gray-900">
                              {activity.entity_name || activity.entity_id.slice(0, 8)}
                            </span>
                          </span>
                        </div>

                        {/* Show status change details */}
                        {activity.action === 'status_changed' &&
                          activity.previous_data &&
                          activity.new_data && (
                            <div className="mt-2 text-xs text-gray-500 flex items-center gap-2">
                              <span className="px-2 py-0.5 bg-gray-100 rounded">
                                {(activity.previous_data as { status?: string }).status || '?'}
                              </span>
                              <span>→</span>
                              <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded">
                                {(activity.new_data as { status?: string }).status || '?'}
                              </span>
                            </div>
                          )}
                      </div>

                      <div className="flex items-center gap-2 text-xs text-gray-400 shrink-0">
                        <ActionIcon className="w-3 h-3" />
                        {formatTimeAgo(activity.created_at)}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Load more hint */}
        {total > activities.length && (
          <div className="mt-6 text-center text-sm text-gray-400">
            Showing {activities.length} of {total} activities
          </div>
        )}
      </div>
    </div>
    )}

    {/* Saved Filters Section */}
    <div className="glass-strong rounded-2xl shadow-lg overflow-hidden">
      <button
        onClick={() => setShowFilters(!showFilters)}
        className="w-full px-6 py-4 flex items-center justify-between bg-gradient-to-r from-gray-50 to-white hover:from-gray-100 hover:to-gray-50 transition-all"
      >
        <div className="flex items-center gap-2">
          <Filter className="w-5 h-5 text-indigo-600" />
          <h2 className="text-lg font-semibold text-gray-900">Saved Filters</h2>
        </div>
        {showFilters ? (
          <ChevronUp className="w-5 h-5 text-gray-400" />
        ) : (
          <ChevronDown className="w-5 h-5 text-gray-400" />
        )}
      </button>
      {showFilters && (
        <div className="p-6 border-t border-gray-100">
          <SavedFiltersPanel projectId={projectId} />
        </div>
      )}
    </div>

    {/* Export History Section */}
    <div className="glass-strong rounded-2xl shadow-lg overflow-hidden">
      <button
        onClick={() => setShowExports(!showExports)}
        className="w-full px-6 py-4 flex items-center justify-between bg-gradient-to-r from-gray-50 to-white hover:from-gray-100 hover:to-gray-50 transition-all"
      >
        <div className="flex items-center gap-2">
          <Download className="w-5 h-5 text-emerald-600" />
          <h2 className="text-lg font-semibold text-gray-900">Export History</h2>
        </div>
        {showExports ? (
          <ChevronUp className="w-5 h-5 text-gray-400" />
        ) : (
          <ChevronDown className="w-5 h-5 text-gray-400" />
        )}
      </button>
      {showExports && (
        <div className="p-6 border-t border-gray-100">
          <ExportHistoryPanel projectId={projectId} />
        </div>
      )}
    </div>
    </div>
  );
}
