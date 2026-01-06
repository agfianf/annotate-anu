import { Eye, EyeOff } from 'lucide-react';
import { cn } from '@/lib/utils';

export type VisibilityState = boolean | 'partial';

/** Predefined color themes for the visibility toggle */
export type VisibilityColorTheme = 'emerald' | 'orange' | 'blue' | 'purple' | 'cyan';

interface VisibilityToggleButtonProps {
  /** Visibility state: true (visible), false (hidden), or 'partial' (mixed) */
  isVisible: VisibilityState;
  /** Callback when toggle is clicked */
  onToggle: () => void;
  /** Size variant */
  size?: 'sm' | 'md';
  /** Additional class names */
  className?: string;
  /** Tooltip text for visible state */
  visibleTitle?: string;
  /** Tooltip text for hidden state */
  hiddenTitle?: string;
  /** Disable the button */
  disabled?: boolean;
  /** Color theme for the icon (default: emerald) */
  colorTheme?: VisibilityColorTheme;
}

/** Color classes for each theme */
const colorClasses: Record<VisibilityColorTheme, { visible: string; partial: string; hover: string }> = {
  emerald: {
    visible: 'text-emerald-500',
    partial: 'text-emerald-400/60',
    hover: 'hover:bg-emerald-100',
  },
  orange: {
    visible: 'text-orange-500',
    partial: 'text-orange-400/60',
    hover: 'hover:bg-orange-100',
  },
  blue: {
    visible: 'text-blue-500',
    partial: 'text-blue-400/60',
    hover: 'hover:bg-blue-100',
  },
  purple: {
    visible: 'text-purple-500',
    partial: 'text-purple-400/60',
    hover: 'hover:bg-purple-100',
  },
  cyan: {
    visible: 'text-cyan-500',
    partial: 'text-cyan-400/60',
    hover: 'hover:bg-cyan-100',
  },
};

/**
 * Reusable visibility toggle button with Eye/EyeOff icon.
 * Supports three states: visible (true), hidden (false), and partial ('partial').
 */
export function VisibilityToggleButton({
  isVisible,
  onToggle,
  size = 'sm',
  className,
  visibleTitle = 'Hide',
  hiddenTitle = 'Show',
  disabled = false,
  colorTheme = 'emerald',
}: VisibilityToggleButtonProps) {
  const isPartial = isVisible === 'partial';
  const isVisibleBool = isVisible === true;

  const sizeClasses = {
    sm: 'p-0.5',
    md: 'p-1',
  };

  const iconSizeClasses = {
    sm: 'w-3.5 h-3.5',
    md: 'w-4 h-4',
  };

  const colors = colorClasses[colorTheme];

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!disabled) {
      onToggle();
    }
  };

  const title = isPartial
    ? 'Toggle visibility (partial)'
    : isVisibleBool
    ? visibleTitle
    : hiddenTitle;

  return (
    <button
      onClick={handleClick}
      disabled={disabled}
      className={cn(
        'rounded flex-shrink-0 transition-all',
        sizeClasses[size],
        isVisibleBool
          ? `${colors.visible} ${colors.hover}`
          : isPartial
          ? `${colors.partial} ${colors.hover}`
          : 'text-gray-300 hover:bg-gray-100',
        disabled && 'opacity-50 cursor-not-allowed',
        className
      )}
      title={title}
    >
      {isVisibleBool || isPartial ? (
        <Eye
          className={cn(
            iconSizeClasses[size],
            isPartial && 'opacity-60'
          )}
        />
      ) : (
        <EyeOff className={iconSizeClasses[size]} />
      )}
    </button>
  );
}
