import { type ReactNode, useRef, useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Tooltip, TooltipContent } from './Tooltip';
import { LabelSelector } from './LabelSelector';
import type { Label } from '../../types/annotations';
import { cn } from '../../lib/utils';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { SPRING_CONFIGS } from '@/lib/motion-config';

interface ToolButtonProps {
  icon: ReactNode;
  tooltipTitle: string;
  tooltipDescription?: string;
  shortcut?: string;
  onClick: () => void;
  isActive?: boolean;
  activeColor?: 'orange' | 'purple' | 'blue' | 'emerald' | 'violet';
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
  const [justActivated, setJustActivated] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const prefersReducedMotion = useReducedMotion();

  const activeColorClasses = {
    orange: 'bg-orange-500 text-white',
    purple: 'bg-purple-500 text-white',
    blue: 'bg-blue-500 text-white',
    emerald: 'bg-emerald-500 text-white',
    violet: 'bg-violet-500 text-white',
  };

  const glowColors = {
    orange: 'rgba(249, 115, 22, 0.4)',
    purple: 'rgba(168, 85, 247, 0.4)',
    blue: 'rgba(59, 130, 246, 0.4)',
    emerald: 'rgba(16, 185, 129, 0.4)',
    violet: 'rgba(139, 92, 246, 0.4)',
  };

  const selectedLabel = labels.find((l) => l.id === selectedLabelId);

  // Trigger activation animation
  useEffect(() => {
    if (isActive && !prefersReducedMotion) {
      setJustActivated(true);
      const timeout = setTimeout(() => setJustActivated(false), 300);
      return () => clearTimeout(timeout);
    }
  }, [isActive, prefersReducedMotion]);

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

  // Animation variants
  const buttonVariants = {
    inactive: {
      scale: 1,
      boxShadow: '0 0 0 0 rgba(0, 0, 0, 0)',
    },
    active: {
      scale: 1,
      boxShadow: isActive
        ? `0 0 0 3px ${glowColors[activeColor]}`
        : '0 0 0 0 rgba(0, 0, 0, 0)',
    },
    justActivated: {
      scale: 1.1,
      boxShadow: isActive
        ? `0 0 0 3px ${glowColors[activeColor]}`
        : '0 0 0 0 rgba(0, 0, 0, 0)',
    },
  };

  const iconVariants = {
    inactive: {
      rotate: 0,
      scale: 1,
    },
    active: {
      rotate: 0,
      scale: 1,
    },
  };

  return (
    <>
      <motion.button
        ref={buttonRef}
        onClick={onClick}
        disabled={disabled}
        onMouseEnter={handleButtonMouseEnter}
        onMouseLeave={handleButtonMouseLeave}
        className={cn(
          'w-10 h-10 flex items-center justify-center rounded transition-colors relative',
          disabled
            ? 'text-gray-400 cursor-not-allowed opacity-50'
            : isActive
            ? activeColorClasses[activeColor]
            : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100',
          className
        )}
        aria-label={tooltipTitle}
        variants={buttonVariants}
        animate={justActivated ? 'justActivated' : isActive ? 'active' : 'inactive'}
        whileHover={disabled || prefersReducedMotion ? {} : { scale: 1.05 }}
        whileTap={disabled || prefersReducedMotion ? {} : { scale: 0.95 }}
        transition={prefersReducedMotion ? {} : { duration: 0.3 }}
      >
        <motion.div
          variants={iconVariants}
          animate={isActive ? 'active' : 'inactive'}
          transition={prefersReducedMotion ? {} : { duration: 0.2 }}
        >
          {icon}
        </motion.div>
      </motion.button>

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
