/**
 * Panel Library Dropdown
 * Displays available panel types for selection
 */

import { memo, useRef, useState, useEffect } from 'react';
import { Plus } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { createPortal } from 'react-dom';
import { getAllPanelDefinitions } from './panelRegistry';
import { useAnalyticsPanels } from '@/hooks/useAnalyticsPanels';
import type { PanelType } from '@/types/analytics';
import { useReducedMotion } from '@/hooks/useReducedMotion';

interface PanelLibraryProps {
  onSelectPanel?: (type: PanelType) => void;
}

export const PanelLibrary = memo(function PanelLibrary({
  onSelectPanel,
}: PanelLibraryProps) {
  const { addPanel, panelCount } = useAnalyticsPanels();
  const panelDefinitions = getAllPanelDefinitions();
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const prefersReducedMotion = useReducedMotion();

  const handleOpen = () => {
    if (!isOpen && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setPosition({
        top: rect.bottom + 4,
        left: rect.left,
      });
      setIsOpen(true);
    } else {
      setIsOpen(false);
    }
  };

  const handleClose = () => {
    setIsOpen(false);
  };

  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node) &&
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        handleClose();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose();
        // Return focus to trigger button
        triggerRef.current?.focus();
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        // Allow arrow key navigation within dropdown
        e.preventDefault();
        const buttons = dropdownRef.current?.querySelectorAll('button');
        if (buttons && buttons.length > 0) {
          const currentIndex = Array.from(buttons).indexOf(document.activeElement as HTMLButtonElement);
          if (e.key === 'ArrowDown') {
            const nextIndex = currentIndex < buttons.length - 1 ? currentIndex + 1 : 0;
            (buttons[nextIndex] as HTMLButtonElement).focus();
          } else {
            const prevIndex = currentIndex > 0 ? currentIndex - 1 : buttons.length - 1;
            (buttons[prevIndex] as HTMLButtonElement).focus();
          }
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);

    // Focus first panel option when dropdown opens
    setTimeout(() => {
      const firstButton = dropdownRef.current?.querySelector('button');
      firstButton?.focus();
    }, 100);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const handleSelectPanel = (type: PanelType) => {
    if (panelCount === 0) {
      addPanel(type, 'tab');
    } else {
      addPanel(type, 'tab');
    }
    handleClose();
    onSelectPanel?.(type);
  };

  return (
    <>
      <button
        ref={triggerRef}
        onClick={handleOpen}
        className="px-4 py-2 bg-white border border-gray-200 hover:border-emerald-300 rounded-lg transition-all flex items-center gap-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2"
        aria-label="Add analytics panel"
        aria-expanded={isOpen}
        aria-haspopup="menu"
      >
        <Plus className="w-4 h-4" aria-hidden="true" />
        <span className="hidden sm:inline">Add Panel</span>
        <span className="sm:hidden">Add</span>
      </button>

      {createPortal(
        <AnimatePresence>
          {isOpen && (
            <motion.div
              ref={dropdownRef}
              className="fixed z-[9999]"
              style={{
                top: position.top,
                left: position.left,
                width: 320,
              }}
              initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.98, y: -8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.98, y: -4 }}
              transition={{ duration: prefersReducedMotion ? 0.01 : 0.2 }}
            >
              <div
                className="py-2 rounded-xl overflow-hidden bg-white/90 backdrop-blur-xl border border-gray-200 shadow-2xl max-h-[400px] overflow-y-auto"
                role="menu"
                aria-label="Available analytics panels"
              >
                <div className="px-3 py-2 border-b border-gray-100">
                  <div className="text-sm font-semibold text-gray-700">Analytics Panels</div>
                </div>
                {panelDefinitions.map((panel) => {
                  const Icon = panel.icon;
                  return (
                    <button
                      key={panel.type}
                      onClick={() => handleSelectPanel(panel.type)}
                      className="w-full flex items-start gap-3 p-3 hover:bg-emerald-50 focus:bg-emerald-50 focus:outline-none transition-colors text-left"
                      role="menuitem"
                      aria-label={`Add ${panel.name} panel`}
                    >
                      <Icon className="w-5 h-5 mt-0.5 text-emerald-600 flex-shrink-0" aria-hidden="true" />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm text-gray-900">{panel.name}</div>
                        <div className="text-xs text-gray-500 mt-1">
                          {panel.description}
                        </div>
                        {(panel.requiresJobFilter || panel.requiresTaskFilter) && (
                          <div className="text-xs text-amber-600 mt-1">
                            {panel.requiresJobFilter && 'Requires job filter'}
                            {panel.requiresTaskFilter && ' Requires task filter'}
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </>
  );
});
