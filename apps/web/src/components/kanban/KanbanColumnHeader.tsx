/**
 * KanbanColumnHeader Component
 * Displays column title and animated stats
 */

import { Briefcase, Image, CheckCircle2 } from 'lucide-react';
import { CountingNumber } from '@/components/ui/animate';
import type { KanbanColumnHeaderProps } from './types';

export function KanbanColumnHeader({ config, stats }: KanbanColumnHeaderProps) {
  const Icon = config.icon;

  return (
    <div className={`p-4 rounded-xl ${config.colors.accent} border ${config.colors.border}`}>
      {/* Column Title */}
      <div className="flex items-center gap-2 mb-3">
        <div className={`p-1.5 rounded-lg ${config.colors.bg}`}>
          <Icon className={`w-4 h-4 ${config.colors.text}`} />
        </div>
        <h3 className={`font-semibold ${config.colors.text}`}>
          {config.title}
        </h3>
        <span className={`ml-auto text-sm font-medium px-2 py-0.5 rounded-full ${config.colors.bg} ${config.colors.text}`}>
          <CountingNumber value={stats.taskCount} duration={0.8} />
        </span>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-2">
        {/* Jobs */}
        <div className="flex items-center gap-1.5 text-xs">
          <Briefcase className="w-3.5 h-3.5 text-gray-400" />
          <span className="text-gray-500">Jobs:</span>
          <span className={`font-medium ${config.colors.text}`}>
            <CountingNumber value={stats.jobCount} duration={0.8} />
          </span>
        </div>

        {/* Images */}
        <div className="flex items-center gap-1.5 text-xs">
          <Image className="w-3.5 h-3.5 text-gray-400" />
          <span className="text-gray-500">Images:</span>
          <span className={`font-medium ${config.colors.text}`}>
            <CountingNumber value={stats.imageCount} duration={0.8} formatNumber />
          </span>
        </div>

        {/* Completion - spans full width */}
        <div className="col-span-2 mt-2">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-1.5 text-xs">
              <CheckCircle2 className="w-3.5 h-3.5 text-gray-400" />
              <span className="text-gray-500">Progress</span>
            </div>
            <span className={`text-xs font-medium ${config.colors.text}`}>
              <CountingNumber value={stats.completionPercentage} duration={0.8} suffix="%" />
            </span>
          </div>
          {/* Progress Bar */}
          <div className="h-1.5 bg-white/60 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                config.key === null
                  ? 'bg-gray-400'
                  : config.key === 'train'
                  ? 'bg-blue-500'
                  : config.key === 'val'
                  ? 'bg-amber-500'
                  : 'bg-purple-500'
              }`}
              style={{ width: `${stats.completionPercentage}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
