import { type ReactNode, useRef, useState } from 'react';
import { Tooltip, TooltipContent } from './Tooltip';
import { LabelSelector } from './LabelSelector';
import type { Label } from '../../types/annotations';
import { cn } from '../../lib/utils';

interface ToolButtonProps {
  icon: ReactNode;
  tooltipTitle: string;
  tooltipDescription?: string;
  shortcut?: string;
  onClick: () => void;
  isActive?: boolean;
  activeColor?: 'orange' | 'purple' | 'blue';
  disabled?: boolean;
  showLabelSelector?: boolean;
  labels?: Label[];
  selectedLabelId?: string | null;
  onSelectLabel?: (labelId: string) => void;
  className?: string;
}

export function ToolButton({
  icon,
  tooltipTitle,
  tooltipDescription,
  shortcut,
  onClick,
  isActive = false,
  activeColor = 'orange',
  disabled = false,
  showLabelSelector = false,
  labels = [],
  selectedLabelId,
  onSelectLabel,
  className,
}: ToolButtonProps) {
  const [showTooltip, setShowTooltip] = useState(false);
  const [isHoveringButton, setIsHoveringButton] = useState(false);
  const [isHoveringTooltip, setIsHoveringTooltip] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const activeColorClasses = {
    orange: 'bg-orange-500 text-white',
    purple: 'bg-purple-500 text-white',
    blue: 'bg-blue-500 text-white',
  };

  const selectedLabel = labels.find((l) => l.id === selectedLabelId);

  // Update tooltip visibility based on hover state
  const updateTooltipVisibility = (buttonHover: boolean, tooltipHover: boolean) => {
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = undefined;
    }

    if (buttonHover || tooltipHover) {
      setShowTooltip(true);
    } else {
      // Add small delay before hiding to allow mouse to move to tooltip
      hideTimeoutRef.current = setTimeout(() => {
        setShowTooltip(false);
      }, 100);
    }
  };

  const handleButtonMouseEnter = () => {
    if (!disabled) {
      setIsHoveringButton(true);
      updateTooltipVisibility(true, isHoveringTooltip);
    }
  };

  const handleButtonMouseLeave = () => {
    setIsHoveringButton(false);
    updateTooltipVisibility(false, isHoveringTooltip);
  };

  const handleTooltipMouseEnter = () => {
    setIsHoveringTooltip(true);
    updateTooltipVisibility(isHoveringButton, true);
  };

  const handleTooltipMouseLeave = () => {
    setIsHoveringTooltip(false);
    updateTooltipVisibility(isHoveringButton, false);
  };

  return (
    <>
      <button
        ref={buttonRef}
        onClick={onClick}
        disabled={disabled}
        onMouseEnter={handleButtonMouseEnter}
        onMouseLeave={handleButtonMouseLeave}
        className={cn(
          'w-10 h-10 flex items-center justify-center rounded transition-colors relative',
          disabled
            ? 'text-gray-600 cursor-not-allowed opacity-50'
            : isActive
            ? activeColorClasses[activeColor]
            : 'text-gray-400 hover:text-white hover:bg-gray-700',
          className
        )}
        aria-label={tooltipTitle}
      >
        {icon}
      </button>

      <Tooltip
        show={showTooltip}
        anchorRef={buttonRef as React.RefObject<HTMLElement>}
        onMouseEnter={handleTooltipMouseEnter}
        onMouseLeave={handleTooltipMouseLeave}
        content={
        <TooltipContent
          title={tooltipTitle}
          description={tooltipDescription}
          shortcut={shortcut}
        >
          {showLabelSelector && labels.length > 0 && onSelectLabel && (
            <>
              {selectedLabel && (
                <div className="mb-2 flex items-center gap-2 text-xs text-gray-700">
                  <span className="font-medium">Current:</span>
                  <div className="flex items-center gap-1.5 px-2 py-1 bg-white/50 rounded border border-gray-400/30">
                    <div
                      className="w-3 h-3 rounded border border-gray-400/50"
                      style={{ backgroundColor: selectedLabel.color }}
                    />
                    <span className="font-semibold text-gray-900">{selectedLabel.name}</span>
                  </div>
                </div>
              )}
              <LabelSelector
                labels={labels}
                selectedLabelId={selectedLabelId || null}
                onSelectLabel={onSelectLabel}
              />
            </>
          )}
        </TooltipContent>
      } />
    </>
  );
}
