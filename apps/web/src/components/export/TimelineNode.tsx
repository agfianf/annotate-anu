/**
 * TimelineNode - Individual export node on the timeline.
 */

import { motion } from 'framer-motion';
import {
  Box,
  Hexagon,
  Tag as TagIcon,
  CheckCircle,
  Loader2,
  Clock,
  AlertTriangle,
  Download,
  Image,
  FileText,
} from 'lucide-react';
import type { Export, ExportMode } from '@/types/export';
import { ExportDiffSummary } from './ExportDiffSummary';
import { getExportModeLabel, getOutputFormatLabel, formatFileSize } from '@/lib/export-client';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { SPRING_CONFIGS } from '@/lib/motion-config';

interface TimelineNodeProps {
  export_: Export;
  previousExport?: Export;
  isFirst?: boolean;
  isLast: boolean;
  onDiffClick?: (exportA: Export, exportB: Export) => void;
  onExportClick?: (export_: Export) => void;
  onDownload?: (export_: Export) => void;
  index: number;
}

const MODE_ICONS: Record<ExportMode, typeof Box> = {
  classification: TagIcon,
  detection: Box,
  segmentation: Hexagon,
};

const MODE_COLORS: Record<ExportMode, string> = {
  classification: 'bg-purple-100 text-purple-600 border-purple-200',
  detection: 'bg-blue-100 text-blue-600 border-blue-200',
  segmentation: 'bg-amber-100 text-amber-600 border-amber-200',
};

const STATUS_CONFIG = {
  pending: {
    icon: Clock,
    color: 'text-gray-400',
    bgColor: 'bg-gray-100',
    label: 'Pending',
    animate: false,
  },
  processing: {
    icon: Loader2,
    color: 'text-blue-500',
    bgColor: 'bg-blue-100',
    label: 'Processing',
    animate: true,
  },
  completed: {
    icon: CheckCircle,
    color: 'text-emerald-500',
    bgColor: 'bg-emerald-100',
    label: 'Completed',
    animate: false,
  },
  failed: {
    icon: AlertTriangle,
    color: 'text-red-500',
    bgColor: 'bg-red-100',
    label: 'Failed',
    animate: false,
  },
};

export function TimelineNode({
  export_,
  previousExport,
  isLast,
  onDiffClick,
  onExportClick,
  onDownload,
  index,
}: TimelineNodeProps) {
  const prefersReducedMotion = useReducedMotion();
  const ModeIcon = MODE_ICONS[export_.export_mode];
  const statusConfig = STATUS_CONFIG[export_.status];
  const StatusIcon = statusConfig.icon;

  const date = new Date(export_.created_at).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  const time = new Date(export_.created_at).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });

  return (
    <motion.div
      className="relative"
      initial={{ opacity: 0, x: prefersReducedMotion ? 0 : -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{
        delay: prefersReducedMotion ? 0 : index * 0.05,
        ...SPRING_CONFIGS.gentle,
      }}
    >
      {/* Connector Line */}
      {!isLast && (
        <div className="absolute left-[23px] top-12 bottom-0 w-0.5 bg-gradient-to-b from-gray-300 to-gray-200" />
      )}

      {/* Diff Connector (between this and previous) */}
      {previousExport && (
        <div className="relative ml-12 mb-2">
          <div className="absolute -left-[25px] top-1/2 w-4 h-0.5 bg-gray-300" />
          <div
            className={`
              inline-flex items-center gap-1 px-2 py-1 rounded-full
              bg-gray-100 border border-gray-200 text-xs
              ${onDiffClick ? 'cursor-pointer hover:bg-gray-200 transition-colors' : ''}
            `}
            onClick={() => onDiffClick?.(previousExport, export_)}
          >
            <ExportDiffSummary
              exportA={previousExport}
              exportB={export_}
              onClick={onDiffClick ? () => onDiffClick(previousExport, export_) : undefined}
            />
          </div>
        </div>
      )}

      {/* Main Node */}
      <div className="flex gap-4">
        {/* Timeline Dot */}
        <div className="relative z-10">
          <div
            className={`
              w-12 h-12 rounded-xl flex items-center justify-center
              border-2 ${MODE_COLORS[export_.export_mode]}
              shadow-sm
            `}
          >
            <ModeIcon className="w-5 h-5" />
          </div>
          {/* Status indicator */}
          <div
            className={`
              absolute -bottom-1 -right-1 w-5 h-5 rounded-full
              flex items-center justify-center
              ${statusConfig.bgColor} border-2 border-white
            `}
          >
            <StatusIcon
              className={`w-3 h-3 ${statusConfig.color} ${statusConfig.animate ? 'animate-spin' : ''}`}
            />
          </div>
        </div>

        {/* Content Card */}
        <motion.div
          className={`
            flex-1 p-4 rounded-xl border bg-white shadow-sm
            ${onExportClick ? 'cursor-pointer hover:shadow-md hover:border-emerald-200 transition-all' : ''}
          `}
          onClick={() => onExportClick?.(export_)}
          whileHover={onExportClick && !prefersReducedMotion ? { scale: 1.01 } : undefined}
          transition={SPRING_CONFIGS.responsive}
        >
          {/* Header */}
          <div className="flex items-start justify-between mb-2">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-gray-900">
                  {export_.name || `${getExportModeLabel(export_.export_mode)} Export`}
                </h3>
                {export_.version_number && (
                  <span className="px-1.5 py-0.5 text-xs font-medium bg-emerald-100 text-emerald-700 rounded">
                    v{export_.version_number}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 mt-1 text-sm text-gray-500">
                <span>{date}</span>
                <span>&middot;</span>
                <span>{time}</span>
              </div>
            </div>

            {/* Download button for completed exports */}
            {export_.status === 'completed' && onDownload && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDownload(export_);
                }}
                className="p-2 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                aria-label="Download export"
              >
                <Download className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Stats */}
          <div className="flex flex-wrap items-center gap-3 text-sm">
            {/* Mode & Format badges */}
            <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs">
              {getExportModeLabel(export_.export_mode)}
            </span>
            <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs">
              {getOutputFormatLabel(export_.output_format)}
            </span>

            {/* Counts (if available) */}
            {export_.summary && (
              <>
                <div className="flex items-center gap-1 text-gray-500">
                  <Image className="w-3.5 h-3.5" />
                  <span>{export_.summary.image_count.toLocaleString()}</span>
                </div>
                <div className="flex items-center gap-1 text-gray-500">
                  <FileText className="w-3.5 h-3.5" />
                  <span>{export_.summary.annotation_count.toLocaleString()}</span>
                </div>
              </>
            )}

            {/* File size */}
            {export_.artifact_size_bytes && (
              <span className="text-gray-400 text-xs">
                {formatFileSize(export_.artifact_size_bytes)}
              </span>
            )}
          </div>

          {/* Tags preview */}
          {export_.resolved_metadata?.tags && export_.resolved_metadata.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-3">
              {export_.resolved_metadata.tags.slice(0, 5).map((tag) => (
                <span
                  key={tag.id}
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs"
                  style={{
                    backgroundColor: `${tag.color}15`,
                    color: tag.color,
                  }}
                >
                  <span
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ backgroundColor: tag.color }}
                  />
                  {tag.category_name ? `${tag.category_name}:${tag.name}` : tag.name}
                </span>
              ))}
              {export_.resolved_metadata.tags.length > 5 && (
                <span className="text-xs text-gray-400">
                  +{export_.resolved_metadata.tags.length - 5} more
                </span>
              )}
            </div>
          )}

          {/* Error message */}
          {export_.status === 'failed' && export_.error_message && (
            <div className="mt-3 p-2 bg-red-50 border border-red-100 rounded text-xs text-red-600">
              {export_.error_message}
            </div>
          )}
        </motion.div>
      </div>
    </motion.div>
  );
}
