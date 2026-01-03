/**
 * UserOverviewPanel Component
 * Slide-out panel showing user details and activity
 */

import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Briefcase,
  CheckCircle2,
  Clock,
  ListTodo,
  Loader2,
  ShieldCheck,
  Shield,
  ShieldX,
  Trash2,
  TrendingUp,
} from 'lucide-react';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import type { User } from '@/lib/api-client';
import type { UserActivity } from '@/hooks/useUserActivity';

const roles = ['admin', 'member', 'annotator'] as const;

const getRoleConfig = (role: string) => {
  switch (role) {
    case 'admin':
      return {
        icon: <ShieldCheck className="w-4 h-4" />,
        className: 'bg-emerald-100 text-emerald-700',
        label: 'Admin',
      };
    case 'member':
      return {
        icon: <Shield className="w-4 h-4" />,
        className: 'bg-blue-100 text-blue-700',
        label: 'Member',
      };
    default:
      return {
        icon: <ShieldX className="w-4 h-4" />,
        className: 'bg-gray-100 text-gray-600',
        label: 'Annotator',
      };
  }
};

const getStatusConfig = (status: string) => {
  switch (status) {
    case 'completed':
    case 'approved':
      return { icon: <CheckCircle2 className="w-3.5 h-3.5" />, className: 'text-emerald-600' };
    case 'in_progress':
      return { icon: <Clock className="w-3.5 h-3.5" />, className: 'text-blue-600' };
    default:
      return { icon: <Clock className="w-3.5 h-3.5" />, className: 'text-gray-400' };
  }
};

const formatRelativeTime = (dateString: string): string => {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

interface StatCardProps {
  value: number | string;
  label: string;
  icon: React.ReactNode;
}

function StatCard({ value, label, icon }: StatCardProps) {
  return (
    <div className="glass rounded-xl p-4 flex flex-col items-center justify-center">
      <div className="text-gray-400 mb-1">{icon}</div>
      <div className="text-2xl font-bold text-gray-900">{value}</div>
      <div className="text-xs text-gray-500">{label}</div>
    </div>
  );
}

export interface UserOverviewPanelProps {
  user: User;
  activity: UserActivity | null;
  isLoadingActivity: boolean;
  currentUserId: string;
  isOpen: boolean;
  onClose: () => void;
  onRoleChange: (userId: string, newRole: string) => Promise<void>;
  onDelete: (userId: string, username: string) => Promise<void>;
  isUpdating: boolean;
}

export default function UserOverviewPanel({
  user,
  activity,
  isLoadingActivity,
  currentUserId,
  isOpen,
  onClose,
  onRoleChange,
  onDelete,
  isUpdating,
}: UserOverviewPanelProps) {
  const prefersReducedMotion = useReducedMotion();
  const panelRef = useRef<HTMLDivElement>(null);
  const isSelf = user.id === currentUserId;

  // Handle escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  // Focus trap (simple version)
  useEffect(() => {
    if (isOpen && panelRef.current) {
      const firstFocusable = panelRef.current.querySelector<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      firstFocusable?.focus();
    }
  }, [isOpen]);

  const roleConfig = getRoleConfig(user.role);
  const displayName = user.full_name || user.username;
  const initial = displayName.charAt(0).toUpperCase();

  const backdropVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1 },
  };

  const panelVariants = prefersReducedMotion
    ? {
        hidden: { opacity: 0 },
        visible: { opacity: 1 },
        exit: { opacity: 0 },
      }
    : {
        hidden: { x: '100%', opacity: 0 },
        visible: { x: 0, opacity: 1 },
        exit: { x: '100%', opacity: 0 },
      };

  return (
    <AnimatePresence mode="wait">
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 bg-black/30 z-40"
            variants={backdropVariants}
            initial="hidden"
            animate="visible"
            exit="hidden"
            transition={{ duration: prefersReducedMotion ? 0.01 : 0.2 }}
            onClick={onClose}
          />

          {/* Panel */}
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="user-panel-title"
            className="fixed right-0 top-0 h-full w-full max-w-md bg-white/95 backdrop-blur-xl shadow-2xl z-50 flex flex-col"
            variants={panelVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            transition={{
              type: prefersReducedMotion ? 'tween' : 'spring',
              stiffness: 300,
              damping: 30,
              duration: prefersReducedMotion ? 0.01 : undefined,
            }}
          >
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <h2 id="user-panel-title" className="text-lg font-semibold text-gray-900">
                User Overview
              </h2>
              <button
                onClick={onClose}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                aria-label="Close panel"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* User Profile */}
              <div className="text-center">
                <div className="w-20 h-20 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 text-2xl font-bold mx-auto mb-3">
                  {initial}
                </div>
                <h3 className="text-xl font-semibold text-gray-900">{displayName}</h3>
                <p className="text-gray-500 text-sm">{user.email}</p>
                <div className="mt-2 inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm">
                  <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full ${roleConfig.className}`}>
                    {roleConfig.icon}
                    {roleConfig.label}
                  </span>
                </div>
              </div>

              {/* Divider */}
              <div className="border-t border-gray-200" />

              {/* Activity Stats */}
              <div>
                <h4 className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4" />
                  Activity
                </h4>
                {isLoadingActivity ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 text-emerald-600 animate-spin" />
                  </div>
                ) : activity ? (
                  <div className="grid grid-cols-2 gap-3">
                    <StatCard
                      value={activity.assignedTasks}
                      label="Assigned Tasks"
                      icon={<ListTodo className="w-5 h-5" />}
                    />
                    <StatCard
                      value={activity.assignedJobs}
                      label="Assigned Jobs"
                      icon={<Briefcase className="w-5 h-5" />}
                    />
                    <StatCard
                      value={activity.completedJobs}
                      label="Completed"
                      icon={<CheckCircle2 className="w-5 h-5" />}
                    />
                    <StatCard
                      value={`${activity.completionRate}%`}
                      label="Completion"
                      icon={<TrendingUp className="w-5 h-5" />}
                    />
                  </div>
                ) : (
                  <div className="text-center text-gray-500 py-4">No activity data</div>
                )}
              </div>

              {/* Recent Work */}
              {activity && activity.recentItems.length > 0 && (
                <>
                  <div className="border-t border-gray-200" />
                  <div>
                    <h4 className="text-sm font-medium text-gray-700 mb-3">Recent Work</h4>
                    <div className="space-y-2">
                      {activity.recentItems.slice(0, 10).map((item) => {
                        const statusConfig = getStatusConfig(item.status);
                        return (
                          <div
                            key={`${item.type}-${item.id}`}
                            className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50"
                          >
                            <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
                              {item.type === 'task' ? (
                                <ListTodo className="w-4 h-4 text-gray-500" />
                              ) : (
                                <Briefcase className="w-4 h-4 text-gray-500" />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-900 truncate">
                                {item.name}
                              </p>
                              <div className="flex items-center gap-1.5 text-xs">
                                <span className={statusConfig.className}>
                                  {statusConfig.icon}
                                </span>
                                <span className="text-gray-500 capitalize">
                                  {item.status.replace('_', ' ')}
                                </span>
                                <span className="text-gray-300">-</span>
                                <span className="text-gray-400">
                                  {formatRelativeTime(item.updatedAt)}
                                </span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}

              {/* Divider */}
              <div className="border-t border-gray-200" />

              {/* Actions */}
              <div>
                <h4 className="text-sm font-medium text-gray-700 mb-3">Actions</h4>
                <div className="space-y-3">
                  {/* Role Change */}
                  <div className="flex items-center justify-between">
                    <label htmlFor="role-select" className="text-sm text-gray-600">
                      Role
                    </label>
                    <select
                      id="role-select"
                      value={user.role}
                      onChange={(e) => onRoleChange(user.id, e.target.value)}
                      disabled={isUpdating}
                      className="px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 capitalize disabled:opacity-50"
                    >
                      {roles.map((role) => (
                        <option key={role} value={role} className="capitalize">
                          {role}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Delete Button */}
                  {!isSelf && (
                    <button
                      onClick={() => onDelete(user.id, user.username)}
                      disabled={isUpdating}
                      className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-red-200 text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
                    >
                      {isUpdating ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Trash2 className="w-4 h-4" />
                      )}
                      Delete User
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-gray-200 text-xs text-gray-400">
              Joined {new Date(user.created_at).toLocaleDateString()}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
