import { ChevronDown, ChevronRight, Plus } from 'lucide-react';
import { useState } from 'react';

interface VisibilitySectionProps {
  /** Section title */
  title: string;
  /** Icon to display next to title */
  icon?: React.ReactNode;
  /** Count badge */
  count?: number;
  /** Color for left border accent */
  color?: string;
  /** Whether section is expanded by default */
  defaultExpanded?: boolean;
  /** Children to render inside section */
  children: React.ReactNode;
  /** Show add button in header */
  showAddButton?: boolean;
  /** Callback when add button clicked */
  onAddClick?: () => void;
}

export function VisibilitySection({
  title,
  icon,
  count,
  color,
  defaultExpanded = true,
  children,
  showAddButton = false,
  onAddClick,
}: VisibilitySectionProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  return (
    <div
      className="border-b border-emerald-100 group transition-colors"
      style={{ borderLeftWidth: '3px', borderLeftColor: color || 'transparent' }}
    >
      {/* Header */}
      <div className="flex items-center">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex flex-1 items-center justify-between px-3 py-2.5 text-xs font-mono text-emerald-900/80 hover:bg-emerald-50 transition-colors uppercase tracking-wider"
        >
          <div className="flex items-center gap-2">
            {icon && (
              <span className="opacity-70 group-hover:opacity-100 transition-opacity">
                {icon}
              </span>
            )}
            <span className="font-bold">{title}</span>
            {count !== undefined && (
              <span className="text-[10px] text-emerald-600/60 font-normal">[{count}]</span>
            )}
          </div>
          {isExpanded ? (
            <ChevronDown className="h-3.5 w-3.5 text-emerald-400" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 text-emerald-400" />
          )}
        </button>

        {/* Add button */}
        {showAddButton && (
          <button
            onClick={onAddClick}
            className="p-2 text-emerald-500/60 hover:text-emerald-600 hover:bg-emerald-50 transition-colors mr-1"
            title={`Add ${title.toLowerCase()}`}
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Content */}
      {isExpanded && (
        <div className="px-1 pb-3 pt-1 bg-emerald-50/20 animate-in slide-in-from-top-1 duration-200">
          {children}
        </div>
      )}
    </div>
  );
}
