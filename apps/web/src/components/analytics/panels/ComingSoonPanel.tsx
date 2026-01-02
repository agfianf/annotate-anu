/**
 * Coming Soon Panel
 * Professional placeholder for panels that are not yet implemented
 */

import { motion } from 'framer-motion';
import { Sparkles } from 'lucide-react';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import type { PanelProps } from '@/types/analytics';
import { getPanelDefinition } from '../panelRegistry';

export default function ComingSoonPanel({ projectId }: PanelProps) {
  const prefersReducedMotion = useReducedMotion();

  // Get the model-analysis panel definition to access features
  const definition = getPanelDefinition('model-analysis');
  const Icon = definition.icon;
  const features = definition.features || [];

  return (
    <div className="h-full flex flex-col items-center justify-center p-6 relative overflow-hidden">
      {/* Decorative background pattern */}
      <div className="absolute inset-0 opacity-[0.03] pointer-events-none">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: 'radial-gradient(circle at 50% 50%, #10B981 1px, transparent 1px)',
            backgroundSize: '24px 24px',
          }}
        />
      </div>

      {/* Main content card */}
      <motion.div
        className="relative w-full max-w-xs bg-gradient-to-br from-gray-50 to-white border-2 border-dashed border-gray-200 rounded-2xl p-8 text-center shadow-sm"
        initial={prefersReducedMotion ? {} : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: prefersReducedMotion ? 0.01 : 0.4 }}
      >
        {/* Icon container */}
        <div className="flex items-center justify-center mb-4">
          <div className="p-3 rounded-xl bg-gradient-to-br from-emerald-50 to-emerald-100 border border-emerald-200/50">
            <Icon className="w-6 h-6 text-emerald-600" />
          </div>
        </div>

        {/* Coming Soon badge */}
        <div className="inline-flex items-center gap-1.5 px-3 py-1 mb-4 bg-amber-50 border border-amber-200 rounded-full text-amber-700 text-xs font-medium">
          <Sparkles className="w-3 h-3" />
          Coming Soon
        </div>

        {/* Title */}
        <h3 className="text-lg font-semibold text-gray-900 mb-2">
          {definition.name}
        </h3>

        {/* Description */}
        <p className="text-sm text-gray-500 mb-4">
          {definition.description}
        </p>

        {/* Features list */}
        {features.length > 0 && (
          <div className="mt-4 pt-4 border-t border-gray-100 text-left">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">
              Includes
            </p>
            <ul className="space-y-1.5">
              {features.map((feature, idx) => (
                <li
                  key={idx}
                  className="flex items-center gap-2 text-sm text-gray-600"
                >
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" />
                  {feature}
                </li>
              ))}
            </ul>
          </div>
        )}
      </motion.div>
    </div>
  );
}
