import { ChevronDown, ChevronRight } from 'lucide-react';
import { useState } from 'react';

interface VisibilityItemProps {
  /** Display name for the item */
  name: string;
  /** Whether the item is currently visible (checked) */
  checked: boolean;
  /** Color for the left bar and indicator dot */
  color: string;
  /** Optional count to display */
  count?: number;
  /** Callback when visibility is toggled */
  onToggle: () => void;
  /** Whether this item has children (shows expand arrow) */
  expandable?: boolean;
  /** Children to render when expanded */
  children?: React.ReactNode;
  /** Indentation level (for nested items) */
  indent?: number;
  /** Optional callback when color dot is clicked (enables color picker) */
  onColorClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
}

export function VisibilityItem({
  name,
  checked,
  color,
  count,
  onToggle,
  expandable = false,
  children,
  indent = 0,
  onColorClick,
}: VisibilityItemProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  const handleCheckboxClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onToggle();
  };

  const handleExpandClick = () => {
    if (expandable) {
      setIsExpanded(!isExpanded);
    }
  };

  return (
    <div>
      <div
        className="flex items-center gap-2 cursor-pointer hover:bg-emerald-50/80 py-1.5 pr-2 rounded-r transition-colors group"
        style={{ paddingLeft: `${8 + indent * 16}px` }}
        onClick={expandable ? handleExpandClick : undefined}
      >
        {/* Color bar indicator */}
        <div
          className="w-[3px] h-5 rounded-full flex-shrink-0 transition-opacity"
          style={{
            backgroundColor: color,
            opacity: checked ? 1 : 0.3,
          }}
        />

        {/* Checkbox */}
        <button
          onClick={handleCheckboxClick}
          className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-all ${
            checked
              ? 'bg-emerald-500 border-emerald-500'
              : 'bg-white border-emerald-200 hover:border-emerald-400'
          }`}
        >
          {checked && (
            <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 12 12" fill="none">
              <path
                d="M2.5 6L5 8.5L9.5 3.5"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}
        </button>

        {/* Color dot indicator */}
        {onColorClick ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onColorClick(e);
            }}
            className="w-3 h-3 rounded-sm flex-shrink-0 transition-all hover:ring-2 hover:ring-emerald-300 hover:ring-offset-1"
            style={{
              backgroundColor: color,
              opacity: checked ? 1 : 0.4,
            }}
            title="Change color"
          />
        ) : (
          <span
            className="w-2.5 h-2.5 rounded-full flex-shrink-0 transition-opacity"
            style={{
              backgroundColor: color,
              opacity: checked ? 1 : 0.4,
            }}
          />
        )}

        {/* Name */}
        <span
          className={`flex-1 text-sm truncate transition-colors ${
            checked ? 'text-slate-700' : 'text-slate-400'
          }`}
        >
          {name}
        </span>

        {/* Count */}
        {count !== undefined && (
          <span className="text-xs text-emerald-500/60 font-mono">{count}</span>
        )}

        {/* Expand chevron */}
        {expandable && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setIsExpanded(!isExpanded);
            }}
            className="p-0.5 hover:bg-emerald-100 rounded transition-colors"
          >
            {isExpanded ? (
              <ChevronDown className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5 text-emerald-400" />
            )}
          </button>
        )}
      </div>

      {/* Children (nested items) */}
      {expandable && isExpanded && children && (
        <div className="animate-in slide-in-from-top-1 duration-150">{children}</div>
      )}
    </div>
  );
}
