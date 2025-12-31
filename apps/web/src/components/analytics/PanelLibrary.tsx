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

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
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
        className="px-4 py-2 bg-white border border-gray-200 hover:border-emerald-300 rounded-lg transition-all flex items-center gap-2 text-sm font-medium"
        aria-label="Add analytics panel"
      >
        <Plus className="w-4 h-4" />
        Add Panel
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
              <div className="py-2 rounded-xl overflow-hidden bg-white/90 backdrop-blur-xl border border-gray-200 shadow-2xl max-h-[400px] overflow-y-auto">
                <div className="px-3 py-2 border-b border-gray-100">
                  <div className="text-sm font-semibold text-gray-700">Analytics Panels</div>
                </div>
                {panelDefinitions.map((panel) => {
                  const Icon = panel.icon;
                  return (
                    <button
                      key={panel.type}
                      onClick={() => handleSelectPanel(panel.type)}
                      className="w-full flex items-start gap-3 p-3 hover:bg-emerald-50 transition-colors text-left"
                    >
                      <Icon className="w-5 h-5 mt-0.5 text-emerald-600 flex-shrink-0" />
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
