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
}

export const PanelWrapper = memo(function PanelWrapper({
  panel,
  children,
  className = '',
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
      className={`flex flex-col bg-white rounded-lg border border-gray-200 overflow-hidden ${className}`}
    >
      {/* Panel Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-gray-50">
        <div className="flex items-center gap-2">
          <Icon className="w-4 h-4 text-emerald-600" />
          <h3 className="font-medium text-sm text-gray-900">
            {definition.name}
          </h3>
        </div>
        <button
          onClick={handleClose}
          className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-gray-100 transition-colors"
          aria-label={`Close ${definition.name} panel`}
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Panel Content */}
      <div className="flex-1 overflow-auto">
        {children}
      </div>
    </motion.div>
  );
});
