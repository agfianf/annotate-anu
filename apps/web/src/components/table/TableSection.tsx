/**
 * TableSection Component
 * Collapsible section for one split category
 */

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Briefcase, Image, Plus } from 'lucide-react';
import { CountingNumber } from '@/components/ui/animate';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import type { TableSectionProps } from './types';
import TaskTable from './TaskTable';

export default function TableSection({
  config,
  tasks,
  stats,
  onTaskClick,
  onSplitChange,
  onAssigneeChange,
  onCreateTask,
  canCreate = false,
  projectId,
  userRole,
}: TableSectionProps) {
  const prefersReducedMotion = useReducedMotion();
  const Icon = config.icon;

  // Load expanded state from localStorage
  const storageKey = `tableExpandedSections-${projectId}`;
  const [isExpanded, setIsExpanded] = useState(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        const key = config.key === null ? 'null' : config.key;
        return parsed[key] !== false; // Default to true if not set
      }
    } catch (err) {
      console.error('Failed to load expanded state:', err);
    }
    return true; // Default: all sections expanded
  });

  // Save expanded state to localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      const parsed = stored ? JSON.parse(stored) : {};
      const key = config.key === null ? 'null' : config.key;
      parsed[key] = isExpanded;
      localStorage.setItem(storageKey, JSON.stringify(parsed));
    } catch (err) {
      console.error('Failed to save expanded state:', err);
    }
  }, [isExpanded, config.key, storageKey]);

  const toggleExpanded = () => {
    setIsExpanded((prev) => !prev);
  };

  return (
    <div className="glass-strong rounded-2xl overflow-hidden shadow-lg">
      {/* Section Header - Clickable */}
      <button
        onClick={toggleExpanded}
        className={`
          w-full px-6 py-4 flex items-center gap-3
          bg-gradient-to-r from-white/90 to-white/50 backdrop-blur-sm
          border-l-4 ${config.colors.border.replace('border-', 'border-l-')}
          hover:bg-white/60 transition-all
          ${isExpanded ? '' : 'border-b border-gray-200'}
        `}
      >
        {/* Icon + Title + Task Count */}
        <div className="flex items-center gap-3 flex-1">
          <div className={`p-2 rounded-lg ${config.colors.bg}`}>
            <Icon className={`w-5 h-5 ${config.colors.text}`} />
          </div>
          <h3 className={`text-lg font-semibold ${config.colors.text}`}>
            {config.title}
          </h3>
          <span
            className={`ml-2 px-2.5 py-1 rounded-full text-sm font-medium ${config.colors.bg} ${config.colors.text}`}
          >
            <CountingNumber value={stats.taskCount} duration={0.8} />
          </span>
        </div>

        {/* Stats */}
        <div className="flex items-center gap-6 text-sm">
          <div className="flex items-center gap-1.5">
            <Briefcase className="w-4 h-4 text-gray-400" />
            <span className="text-gray-500">Jobs:</span>
            <span className={`font-medium ${config.colors.text}`}>
              <CountingNumber value={stats.jobCount} duration={0.8} />
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <Image className="w-4 h-4 text-gray-400" />
            <span className="text-gray-500">Images:</span>
            <span className={`font-medium ${config.colors.text}`}>
              <CountingNumber value={stats.imageCount} duration={0.8} formatNumber />
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-gray-500">Progress:</span>
            <span className={`font-medium ${config.colors.text}`}>
              <CountingNumber value={stats.completionPercentage} duration={0.8} suffix="%" />
            </span>
          </div>
        </div>

        {/* Chevron Icon */}
        <motion.div
          animate={{ rotate: isExpanded ? 180 : 0 }}
          transition={{ duration: prefersReducedMotion ? 0.01 : 0.2 }}
          className="flex-shrink-0"
        >
          <ChevronDown className={`w-5 h-5 ${config.colors.text}`} />
        </motion.div>
      </button>

      {/* Collapsible Content */}
      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            initial={prefersReducedMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
            animate={prefersReducedMotion ? { opacity: 1 } : { height: 'auto', opacity: 1 }}
            exit={prefersReducedMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
            transition={{ duration: prefersReducedMotion ? 0.01 : 0.3, ease: 'easeInOut' }}
            style={{ overflow: 'hidden' }}
          >
            {tasks.length === 0 ? (
              // Empty State
              <div className="px-6 py-12 text-center border-t border-gray-200">
                <div className={`w-16 h-16 mx-auto mb-4 rounded-2xl ${config.colors.bg} flex items-center justify-center`}>
                  <Icon className={`w-8 h-8 ${config.colors.text}`} />
                </div>
                <h4 className="text-lg font-semibold text-gray-700 mb-2">
                  No tasks in this category
                </h4>
                <p className="text-gray-500 mb-6">
                  {canCreate
                    ? `Create a task to assign it to the ${config.title} split`
                    : `No tasks have been assigned to ${config.title} yet`}
                </p>
                {canCreate && onCreateTask && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onCreateTask(config.key);
                    }}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-lg transition-all inline-flex items-center gap-2"
                  >
                    <Plus className="w-4 h-4" />
                    Create Task
                  </button>
                )}
              </div>
            ) : (
              // Task Table
              <div className="border-t border-gray-200">
                <TaskTable
                  tasks={tasks}
                  config={config}
                  onTaskClick={onTaskClick}
                  onSplitChange={onSplitChange}
                  onAssigneeChange={onAssigneeChange}
                  projectId={projectId}
                  userRole={userRole}
                />
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
