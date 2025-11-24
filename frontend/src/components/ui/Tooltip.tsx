import { type ReactNode, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

interface TooltipProps {
  content: ReactNode;
  show: boolean;
  anchorRef: React.RefObject<HTMLElement>;
  delay?: number;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}

export function Tooltip({ content, show, anchorRef, delay = 300, onMouseEnter, onMouseLeave }: TooltipProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const tooltipRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (show) {
      timeoutRef.current = setTimeout(() => {
        setIsVisible(true);
      }, delay);
    } else {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      setIsVisible(false);
    }

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [show, delay]);

  useEffect(() => {
    if (isVisible && anchorRef.current && tooltipRef.current) {
      const anchorRect = anchorRef.current.getBoundingClientRect();
      const tooltipRect = tooltipRef.current.getBoundingClientRect();

      // Position tooltip to the right of the anchor
      const left = anchorRect.right + 12; // 12px gap
      const top = anchorRect.top + anchorRect.height / 2 - tooltipRect.height / 2;

      // Adjust if tooltip goes off screen vertically
      const adjustedTop = Math.max(
        8,
        Math.min(top, window.innerHeight - tooltipRect.height - 8)
      );

      setPosition({ top: adjustedTop, left });
    }
  }, [isVisible, anchorRef, content]);

  if (!isVisible) return null;

  const tooltipContent = (
    <div
      ref={tooltipRef}
      className="fixed z-50 transition-opacity duration-200"
      style={{
        top: `${position.top}px`,
        left: `${position.left}px`,
        opacity: isVisible ? 1 : 0,
      }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div className="relative">
        {/* Arrow pointing left with frosted glass effect */}
        <div className="absolute left-0 top-1/2 -translate-x-2 -translate-y-1/2">
          <div className="w-0 h-0 border-t-[6px] border-t-transparent border-b-[6px] border-b-transparent border-r-[6px] border-r-white/80" />
        </div>

        {/* Tooltip content with frosted glass */}
        <div className="bg-white/80 backdrop-blur-md border border-white/30 rounded-lg shadow-xl px-4 py-3 min-w-[200px] max-w-[320px]">
          {content}
        </div>
      </div>
    </div>
  );

  return createPortal(tooltipContent, document.body);
}

interface TooltipContentProps {
  title: string;
  description?: string;
  shortcut?: string;
  children?: ReactNode;
}

export function TooltipContent({ title, description, shortcut, children }: TooltipContentProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <h4 className="text-sm font-bold text-gray-900">{title}</h4>
        {shortcut && (
          <kbd className="px-2 py-0.5 text-xs font-mono bg-gray-900/10 text-gray-800 rounded border border-gray-400/30 backdrop-blur-sm">
            {shortcut}
          </kbd>
        )}
      </div>
      {description && (
        <p className="text-xs text-gray-700 leading-relaxed">{description}</p>
      )}
      {children && <div className="pt-2 mt-2 border-t border-gray-400/30">{children}</div>}
    </div>
  );
}
