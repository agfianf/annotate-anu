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
      className={`flex flex-col glass-strong rounded-xl overflow-hidden ${className}`}
      role="article"
      aria-label={ariaLabel || definition.name}
    >
      {/* Panel Header - compact style matching gallery header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100 bg-gradient-to-r from-gray-50 to-white">
        <div className="flex items-center gap-2">
          <Icon className="w-4 h-4 text-emerald-600" aria-hidden="true" />
          <h3 className="font-medium text-xs text-gray-700" role="heading" aria-level={2}>
            {definition.name}
          </h3>
        </div>
        <button
          onClick={handleClose}
          className="h-5 w-5 flex items-center justify-center rounded hover:bg-gray-100 transition-colors text-gray-400 hover:text-gray-600"
          aria-label={`Close ${definition.name} panel`}
        >
          <X className="w-3.5 h-3.5" aria-hidden="true" />
        </button>
      </div>

      {/* Panel Content */}
      <div className="flex-1 overflow-auto">
        {children}
      </div>
    </motion.div>
  );
});
