/**
 * Panel Wrapper
 * Provides chrome (header, close button) for panel content
 */

import { memo } from 'react';
import { X } from 'lucide-react';
import { motion } from 'framer-motion';
import { useAnalyticsPanels } from '@/hooks/useAnalyticsPanels';
import { getPanelDefinition } from './panelRegistry';
import type { PanelConfig } from '@/types/analytics';
import { useReducedMotion } from '@/hooks/useReducedMotion';

interface PanelWrapperProps {
  panel: PanelConfig;
  children: React.ReactNode;
  className?: string;
  'aria-label'?: string;
}

export const PanelWrapper = memo(function PanelWrapper({
  panel,
  children,
  className = '',
  'aria-label': ariaLabel,
}: PanelWrapperProps) {
  const { removePanel } = useAnalyticsPanels();
  const prefersReducedMotion = useReducedMotion();
  const definition = getPanelDefinition(panel.type);
  const Icon = definition.icon;

  const handleClose = () => {
    removePanel(panel.id);
  };

  return (
    <motion.div
      initial={prefersReducedMotion ? {} : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={prefersReducedMotion ? {} : { opacity: 0, y: -10 }}
      transition={{ duration: prefersReducedMotion ? 0.01 : 0.2 }}
      className={`relative flex flex-col bg-white/80 backdrop-blur-xl rounded-xl overflow-hidden border border-gray-200/80 shadow-lg shadow-gray-900/5 ${className}`}
      role="article"
      aria-label={ariaLabel || definition.name}
    >
      {/* Left accent bar */}
      <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-emerald-400 to-emerald-600" />

      {/* Panel Header - enhanced with icon container */}
      <div className="flex items-start justify-between gap-3 px-4 py-3 pl-5 border-b border-gray-100 bg-gradient-to-r from-gray-50/80 to-white/50">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-emerald-50 border border-emerald-100 mt-0.5">
            <Icon className="w-4 h-4 text-emerald-600" aria-hidden="true" />
          </div>
          <div>
            <h3 className="font-semibold text-sm text-gray-900" role="heading" aria-level={2}>
              {definition.name}
            </h3>
            <p className="text-xs text-gray-500 mt-0.5 max-w-[200px]">
              {definition.description}
            </p>
          </div>
        </div>
        <button
          onClick={handleClose}
          className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          aria-label={`Close ${definition.name} panel`}
        >
          <X className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>

      {/* Panel Content with better padding */}
      <div className="flex-1 overflow-auto p-4">
        {children}
      </div>
    </motion.div>
  );
});
