import { ChevronDown, ChevronRight, Plus } from 'lucide-react';
import { useState, type ReactNode } from 'react';

interface UnifiedSidebarSectionProps {
  /** Section title */
  title: string;
  /** Icon to display next to title */
  icon: ReactNode;
  /** Color for left border accent (e.g., '#F97316' for orange, '#10B981' for emerald) */
  color: string;
  /** Optional count badge */
  count?: number;
  /** Whether section is expanded by default */
  defaultExpanded?: boolean;
  /** Children to render inside section */
  children: ReactNode;
  /** Show add button in header */
  showAddButton?: boolean;
  /** Callback when add button clicked */
  onAddClick?: () => void;
}

export function UnifiedSidebarSection({
  title,
  icon,
  color,
  count,
  defaultExpanded = true,
  children,
  showAddButton = false,
  onAddClick,
}: UnifiedSidebarSectionProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  // Determine hover and background colors based on main color
  const isOrange = color === '#F97316';
  const hoverBg = isOrange ? 'hover:bg-orange-50' : 'hover:bg-emerald-50';
  const textColor = isOrange ? 'text-orange-900/80' : 'text-emerald-900/80';
  const countColor = isOrange ? 'text-orange-600/60' : 'text-emerald-600/60';
  const contentBg = isOrange ? 'bg-orange-50/20' : 'bg-emerald-50/20';
  const addButtonColors = isOrange
    ? 'text-orange-500/60 hover:text-orange-600 hover:bg-orange-50'
    : 'text-emerald-500/60 hover:text-emerald-600 hover:bg-emerald-50';
  const chevronColor = isOrange ? 'text-orange-400' : 'text-emerald-400';

  return (
    <div
      className="border-b border-gray-100 group transition-colors"
      style={{ borderLeftWidth: '3px', borderLeftColor: color }}
    >
      {/* Header */}
      <div className="flex items-center">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className={`flex flex-1 items-center justify-between px-3 py-2.5 text-xs font-mono ${textColor} ${hoverBg} transition-colors uppercase tracking-wider`}
        >
          <div className="flex items-center gap-2">
            {icon && (
              <span className="opacity-70 group-hover:opacity-100 transition-opacity">
                {icon}
              </span>
            )}
            <span className="font-bold">{title}</span>
            {count !== undefined && (
              <span className={`text-[10px] ${countColor} font-normal`}>[{count}]</span>
            )}
          </div>
          {isExpanded ? (
            <ChevronDown className={`h-3.5 w-3.5 ${chevronColor}`} />
          ) : (
            <ChevronRight className={`h-3.5 w-3.5 ${chevronColor}`} />
          )}
        </button>

        {/* Add button */}
        {showAddButton && (
          <button
            onClick={onAddClick}
            className={`p-2 ${addButtonColors} transition-colors mr-1`}
            title={`Add ${title.toLowerCase()}`}
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Content */}
      {isExpanded && (
        <div className={`px-1 pb-3 pt-1 ${contentBg} animate-in slide-in-from-top-1 duration-200`}>
          {children}
        </div>
      )}
    </div>
  );
}
