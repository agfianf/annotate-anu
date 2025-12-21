import { ChevronDown, ChevronRight, Eye, EyeOff, Minus, MoreVertical, Plus, Settings } from 'lucide-react';
import { useState, useRef, useEffect, useCallback, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

export interface RowAction {
  label: string;
  icon: ReactNode;
  onClick: () => void;
  variant?: 'default' | 'danger';
}

interface UnifiedSidebarRowProps {
  /** Display name */
  name: string;
  /** Color for indicator */
  color: string;
  /** Optional usage count */
  count?: number;
  /** Filter mode (tri-state: idle, include, exclude) */
  filterMode?: 'idle' | 'include' | 'exclude';
  /** Whether visible (eye state) */
  isVisible: boolean;
  /** Filter toggle callback (undefined = no filter checkbox) */
  onToggleFilter?: () => void;
  /** Visibility toggle callback */
  onToggleVisibility: () => void;
  /** Whether this item has children */
  expandable?: boolean;
  /** Children to render when expanded */
  children?: ReactNode;
  /** Indentation level (0, 1, 2...) */
  indent?: number;
  /** Hover action menu items */
  actions?: RowAction[];
  /** Show config button (gear icon) */
  showConfigButton?: boolean;
  /** Config button click callback */
  onConfigClick?: () => void;
  /** Show add button (plus icon) for quick tag creation */
  showAddButton?: boolean;
  /** Add button click callback */
  onAddClick?: () => void;
  /** Configuration panel content to render at top of expanded children */
  configPanelContent?: ReactNode;
}

export function UnifiedSidebarRow({
  name,
  color,
  count,
  filterMode = 'idle',
  isVisible,
  onToggleFilter,
  onToggleVisibility,
  expandable = false,
  children,
  indent = 0,
  actions = [],
  showConfigButton = false,
  onConfigClick,
  showAddButton = false,
  onAddClick,
  configPanelContent,
}: UnifiedSidebarRowProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [showActions, setShowActions] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });

  const handleFilterClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onToggleFilter) {
      onToggleFilter();
    }
  };

  const handleVisibilityClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onToggleVisibility();
  };

  const handleExpandClick = () => {
    if (expandable) {
      setIsExpanded(!isExpanded);
    }
  };

  const updateMenuPosition = useCallback(() => {
    if (menuButtonRef.current) {
      const rect = menuButtonRef.current.getBoundingClientRect();
      const menuWidth = 140;

      // Position dropdown below and aligned to the right of the button
      setMenuPosition({
        top: rect.bottom + 2,
        left: rect.right - menuWidth,
      });
    }
  }, []);

  const handleMenuToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isMenuOpen) {
      updateMenuPosition();
    }
    setIsMenuOpen(!isMenuOpen);
  };

  // Update position when menu is open (handle scroll)
  useEffect(() => {
    if (isMenuOpen) {
      updateMenuPosition();
      window.addEventListener('scroll', updateMenuPosition, true);
      window.addEventListener('resize', updateMenuPosition);

      return () => {
        window.removeEventListener('scroll', updateMenuPosition, true);
        window.removeEventListener('resize', updateMenuPosition);
      };
    }
  }, [isMenuOpen, updateMenuPosition]);

  const handleMenuClose = () => {
    setIsMenuOpen(false);
  };

  const handleAddClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsExpanded(true); // Auto-expand when clicking add button
    if (onAddClick) {
      onAddClick();
    }
  };

  const handleConfigClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsExpanded(true); // Auto-expand when clicking config button
    if (onConfigClick) {
      onConfigClick();
    }
  };

  return (
    <div>
      <div
        className="flex items-center gap-2 cursor-pointer hover:bg-orange-50/40 py-1.5 pr-2 rounded-r transition-colors group relative"
        style={{ paddingLeft: `${8 + indent * 16}px` }}
        onClick={expandable ? handleExpandClick : undefined}
        onMouseEnter={() => setShowActions(true)}
        onMouseLeave={() => setShowActions(false)}
      >
        {/* Filter Checkbox (tri-state: idle, include, exclude) */}
        {onToggleFilter && (
          <button
            onClick={handleFilterClick}
            className={`w-3.5 h-3.5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-all ${
              filterMode === 'include'
                ? 'bg-orange-500 border-orange-500'
                : filterMode === 'exclude'
                ? 'bg-red-500 border-red-500'
                : 'bg-white border-orange-200 hover:border-orange-400'
            }`}
            title={
              filterMode === 'include'
                ? 'Filter: show only with this tag'
                : filterMode === 'exclude'
                ? 'Filter: hide images with this tag'
                : 'No filter'
            }
          >
            {filterMode === 'include' && (
              <svg className="w-2 h-2 text-white" viewBox="0 0 12 12" fill="none">
                <path
                  d="M2.5 6L5 8.5L9.5 3.5"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            )}
            {filterMode === 'exclude' && (
              <Minus className="w-2.5 h-2.5 text-white" strokeWidth={3} />
            )}
          </button>
        )}

        {/* Visibility Eye */}
        <button
          onClick={handleVisibilityClick}
          className={`p-0.5 rounded flex-shrink-0 transition-all ${
            isVisible
              ? 'text-emerald-500 hover:bg-emerald-100'
              : 'text-gray-300 hover:bg-gray-100'
          }`}
          title={isVisible ? 'Hide on thumbnails' : 'Show on thumbnails'}
        >
          {isVisible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
        </button>

        {/* Color Dot */}
        <span
          className="w-2.5 h-2.5 rounded-full flex-shrink-0 transition-opacity"
          style={{
            backgroundColor: color,
            opacity: isVisible ? 1 : 0.4,
          }}
        />

        {/* Name */}
        <span
          className={`flex-1 text-sm truncate transition-colors font-medium ${
            isVisible ? 'text-slate-700' : 'text-slate-400'
          }`}
        >
          {name}
        </span>

        {/* Count */}
        {count !== undefined && (
          <span className="text-xs text-orange-500/60 font-mono font-bold">{count}</span>
        )}

        {/* Add Button (Plus Icon) */}
        {showAddButton && onAddClick && (
          <button
            onClick={handleAddClick}
            className={`p-1 rounded transition-all ${
              showActions
                ? 'opacity-100 hover:bg-orange-100'
                : 'opacity-0 group-hover:opacity-100'
            }`}
            title="Add tag to category"
          >
            <Plus className="w-3.5 h-3.5 text-orange-400" />
          </button>
        )}

        {/* Config Button (Gear Icon) */}
        {showConfigButton && onConfigClick && (
          <button
            onClick={handleConfigClick}
            className={`p-1 rounded transition-all ${
              showActions
                ? 'opacity-100 hover:bg-orange-100'
                : 'opacity-0 group-hover:opacity-100'
            }`}
            title="Category configuration"
          >
            <Settings className="w-3.5 h-3.5 text-orange-400" />
          </button>
        )}

        {/* Actions Menu */}
        {actions.length > 0 && (
          <div className="relative">
            <button
              ref={menuButtonRef}
              onClick={handleMenuToggle}
              className={`p-1 rounded transition-all ${
                showActions || isMenuOpen
                  ? 'opacity-100 hover:bg-orange-100'
                  : 'opacity-0 group-hover:opacity-100'
              }`}
            >
              <MoreVertical className="w-3.5 h-3.5 text-orange-400" />
            </button>
          </div>
        )}

        {/* Expand Chevron */}
        {expandable && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setIsExpanded(!isExpanded);
            }}
            className="p-0.5 hover:bg-orange-100 rounded transition-colors"
          >
            {isExpanded ? (
              <ChevronDown className="w-3.5 h-3.5 text-orange-400" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5 text-orange-400" />
            )}
          </button>
        )}
      </div>

      {/* Dropdown Menu (Portal) */}
      {isMenuOpen && actions.length > 0 && createPortal(
        <>
          {/* Click-outside overlay */}
          <div
            className="fixed inset-0 z-[9998]"
            onClick={handleMenuClose}
          />

          <div
            className="fixed bg-white border border-orange-100 rounded-lg shadow-xl z-[9999] min-w-[140px] py-1"
            style={{
              top: `${menuPosition.top}px`,
              left: `${menuPosition.left}px`,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {actions.map((action, idx) => (
              <button
                key={idx}
                onClick={(e) => {
                  e.stopPropagation();
                  action.onClick();
                  handleMenuClose();
                }}
                className={`w-full px-3 py-1.5 text-left text-xs flex items-center gap-2 transition-colors ${
                  action.variant === 'danger'
                    ? 'text-red-600 hover:bg-red-50'
                    : 'text-slate-600 hover:bg-orange-50'
                }`}
              >
                <span className="w-3.5 h-3.5">{action.icon}</span>
                <span>{action.label}</span>
              </button>
            ))}
          </div>
        </>,
        document.body
      )}

      {/* Children (nested items) */}
      {expandable && isExpanded && (
        <div className="animate-in slide-in-from-top-1 duration-150">
          {configPanelContent && <div className="mb-1">{configPanelContent}</div>}
          {children}
        </div>
      )}
    </div>
  );
}
