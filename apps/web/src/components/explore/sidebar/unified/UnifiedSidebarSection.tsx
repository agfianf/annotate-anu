import { ChevronDown, ChevronRight, HelpCircle, Plus } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { VisibilityToggleButton, type VisibilityState as VisibilityStateType, type VisibilityColorTheme } from '@/components/ui/VisibilityToggleButton';

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
  /** Optional tooltip/hint text to explain the section */
  tooltip?: string;
  /** Show visibility toggle in header */
  showVisibilityToggle?: boolean;
  /** Section visibility state: true (all visible), false (all hidden), 'partial' (mixed) */
  isVisible?: VisibilityStateType;
  /** Callback when visibility toggle is clicked */
  onToggleVisibility?: () => void;
  /** Optional header actions to render before visibility toggle */
  headerActions?: ReactNode;
  /** Override the visibility toggle color theme (otherwise derived from section color) */
  visibilityColorTheme?: VisibilityColorTheme;
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
  tooltip,
  showVisibilityToggle = false,
  isVisible = true,
  onToggleVisibility,
  headerActions,
  visibilityColorTheme: visibilityColorThemeOverride,
}: UnifiedSidebarSectionProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  // Determine hover and background colors based on main color
  const isOrange = color === '#F97316';
  const isBlue = color === '#3B82F6';
  const isPurple = color === '#A855F7';
  const isCyan = color === '#06B6D4';

  // Derive color theme for visibility toggle (use override if provided)
  const visibilityColorTheme: VisibilityColorTheme = visibilityColorThemeOverride
    ?? (isOrange
      ? 'orange'
      : isBlue
      ? 'blue'
      : isPurple
      ? 'purple'
      : isCyan
      ? 'cyan'
      : 'emerald');
  const hoverBg = isOrange
    ? 'hover:bg-orange-50'
    : isBlue
    ? 'hover:bg-blue-50'
    : isCyan
    ? 'hover:bg-cyan-50'
    : isPurple
    ? 'hover:bg-purple-50'
    : 'hover:bg-emerald-50';
  const textColor = isOrange
    ? 'text-orange-900/80'
    : isBlue
    ? 'text-blue-900/80'
    : isCyan
    ? 'text-cyan-900/80'
    : isPurple
    ? 'text-purple-900/80'
    : 'text-emerald-900/80';
  const countColor = isOrange
    ? 'text-orange-600/60'
    : isBlue
    ? 'text-blue-600/60'
    : isCyan
    ? 'text-cyan-600/60'
    : isPurple
    ? 'text-purple-600/60'
    : 'text-emerald-600/60';
  const contentBg = isOrange
    ? 'bg-orange-50/20'
    : isBlue
    ? 'bg-blue-50/20'
    : isCyan
    ? 'bg-cyan-50/20'
    : isPurple
    ? 'bg-purple-50/20'
    : 'bg-emerald-50/20';
  const addButtonColors = isOrange
    ? 'text-orange-500/60 hover:text-orange-600 hover:bg-orange-50'
    : isBlue
    ? 'text-blue-500/60 hover:text-blue-600 hover:bg-blue-50'
    : isCyan
    ? 'text-cyan-500/60 hover:text-cyan-600 hover:bg-cyan-50'
    : isPurple
    ? 'text-purple-500/60 hover:text-purple-600 hover:bg-purple-50'
    : 'text-emerald-500/60 hover:text-emerald-600 hover:bg-emerald-50';
  const chevronColor = isOrange
    ? 'text-orange-400'
    : isBlue
    ? 'text-blue-400'
    : isCyan
    ? 'text-cyan-400'
    : isPurple
    ? 'text-purple-400'
    : 'text-emerald-400';

  return (
    <div
      className="border-b border-gray-100 group transition-colors"
      style={{ borderLeftWidth: '3px', borderLeftColor: color }}
    >
      {/* Header */}
      <div className="flex items-center">
        {/* Title area - clickable to expand/collapse */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className={`flex flex-1 items-center gap-2 px-3 py-2.5 text-xs font-mono ${textColor} ${hoverBg} transition-colors uppercase tracking-wider`}
        >
          {icon && (
            <span className="opacity-70 group-hover:opacity-100 transition-opacity">
              {icon}
            </span>
          )}
          <span className="font-bold">{title}</span>
          {count !== undefined && (
            <span className={`text-[10px] ${countColor} font-normal`}>[{count}]</span>
          )}
          {tooltip && (
            <span
              className={`${countColor} opacity-60 hover:opacity-100 cursor-help`}
              title={tooltip}
              onClick={(e) => e.stopPropagation()}
            >
              <HelpCircle className="w-3 h-3" />
            </span>
          )}
        </button>

        {/* Add button */}
        {showAddButton && (
          <button
            onClick={onAddClick}
            className={`p-2 ${addButtonColors} transition-colors`}
            title={`Add ${title.toLowerCase()}`}
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        )}

        {/* Header actions slot */}
        {headerActions}

        {/* Visibility toggle - before chevron */}
        {showVisibilityToggle && onToggleVisibility && (
          <VisibilityToggleButton
            isVisible={isVisible}
            onToggle={onToggleVisibility}
            size="md"
            visibleTitle={`Hide all ${title.toLowerCase()}`}
            hiddenTitle={`Show all ${title.toLowerCase()}`}
            colorTheme={visibilityColorTheme}
          />
        )}

        {/* Expand/collapse chevron - always at the end */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className={`p-2 ${hoverBg} transition-colors mr-1`}
          title={isExpanded ? 'Collapse section' : 'Expand section'}
        >
          {isExpanded ? (
            <ChevronDown className={`h-3.5 w-3.5 ${chevronColor}`} />
          ) : (
            <ChevronRight className={`h-3.5 w-3.5 ${chevronColor}`} />
          )}
        </button>
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
