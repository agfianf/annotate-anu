/**
 * Shared compact panel components
 * Reusable UI components for analytics panels with consistent compact styling
 */

import { ReactNode } from 'react';
import { Loader2, AlertCircle, type LucideIcon } from 'lucide-react';
import { motion } from 'framer-motion';
import { useReducedMotion } from '@/hooks/useReducedMotion';

/**
 * Compact loading state for panels
 */
export function PanelLoadingState({ message = 'Loading...' }: { message?: string }) {
  return (
    <div className="flex items-center justify-center h-full min-h-[200px]">
      <div className="text-center">
        <Loader2 className="w-6 h-6 text-emerald-600 animate-spin mx-auto mb-2" />
        <p className="text-xs text-gray-500">{message}</p>
      </div>
    </div>
  );
}

/**
 * Compact error state for panels
 */
export function PanelErrorState({
  title = 'Failed to load',
  message
}: {
  title?: string;
  message: string;
}) {
  return (
    <div className="flex items-center justify-center h-full min-h-[200px] p-4">
      <div className="text-center">
        <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-2">
          <AlertCircle className="w-5 h-5 text-red-600" />
        </div>
        <h3 className="text-sm font-semibold text-gray-900 mb-1">{title}</h3>
        <p className="text-xs text-gray-500">{message}</p>
      </div>
    </div>
  );
}

/**
 * Compact empty state for panels
 */
export function PanelEmptyState({
  icon: Icon,
  title = 'No data',
  message = 'No data available'
}: {
  icon: LucideIcon;
  title?: string;
  message?: string;
}) {
  return (
    <div className="flex items-center justify-center h-full min-h-[200px] p-4">
      <div className="text-center">
        <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-2">
          <Icon className="w-5 h-5 text-gray-400" />
        </div>
        <h3 className="text-sm font-semibold text-gray-900 mb-1">{title}</h3>
        <p className="text-xs text-gray-500">{message}</p>
      </div>
    </div>
  );
}

/**
 * Color variants for stat cards
 */
type ColorVariant = 'emerald' | 'blue' | 'purple' | 'orange' | 'red' | 'yellow' | 'cyan';

const colorStyles: Record<ColorVariant, { bg: string; border: string; iconBg: string; iconColor: string; textColor: string; labelColor: string }> = {
  emerald: {
    bg: 'linear-gradient(135deg, rgba(16, 185, 129, 0.05) 0%, rgba(5, 150, 105, 0.08) 100%)',
    border: 'border-emerald-200/50',
    iconBg: 'bg-emerald-100',
    iconColor: 'text-emerald-600',
    textColor: 'text-gray-900',
    labelColor: 'text-gray-500',
  },
  blue: {
    bg: 'linear-gradient(135deg, rgba(59, 130, 246, 0.05) 0%, rgba(37, 99, 235, 0.08) 100%)',
    border: 'border-blue-200/50',
    iconBg: 'bg-blue-100',
    iconColor: 'text-blue-600',
    textColor: 'text-gray-900',
    labelColor: 'text-gray-500',
  },
  purple: {
    bg: 'linear-gradient(135deg, rgba(139, 92, 246, 0.05) 0%, rgba(124, 58, 237, 0.08) 100%)',
    border: 'border-purple-200/50',
    iconBg: 'bg-purple-100',
    iconColor: 'text-purple-600',
    textColor: 'text-gray-900',
    labelColor: 'text-gray-500',
  },
  orange: {
    bg: 'linear-gradient(135deg, rgba(249, 115, 22, 0.05) 0%, rgba(234, 88, 12, 0.08) 100%)',
    border: 'border-orange-200/50',
    iconBg: 'bg-orange-100',
    iconColor: 'text-orange-600',
    textColor: 'text-gray-900',
    labelColor: 'text-gray-500',
  },
  red: {
    bg: 'linear-gradient(135deg, rgba(239, 68, 68, 0.05) 0%, rgba(220, 38, 38, 0.08) 100%)',
    border: 'border-red-200/50',
    iconBg: 'bg-red-100',
    iconColor: 'text-red-600',
    textColor: 'text-gray-900',
    labelColor: 'text-gray-500',
  },
  yellow: {
    bg: 'linear-gradient(135deg, rgba(245, 158, 11, 0.05) 0%, rgba(217, 119, 6, 0.08) 100%)',
    border: 'border-yellow-200/50',
    iconBg: 'bg-yellow-100',
    iconColor: 'text-yellow-600',
    textColor: 'text-gray-900',
    labelColor: 'text-gray-500',
  },
  cyan: {
    bg: 'linear-gradient(135deg, rgba(6, 182, 212, 0.05) 0%, rgba(8, 145, 178, 0.08) 100%)',
    border: 'border-cyan-200/50',
    iconBg: 'bg-cyan-100',
    iconColor: 'text-cyan-600',
    textColor: 'text-gray-900',
    labelColor: 'text-gray-500',
  },
};

/**
 * Compact stat card
 */
export function StatCard({
  icon: Icon,
  label,
  value,
  subtitle,
  color = 'emerald',
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  value: string | number;
  subtitle?: string;
  color?: ColorVariant;
  onClick?: () => void;
}) {
  const styles = colorStyles[color];

  return (
    <div
      className={`p-2.5 rounded-lg border ${styles.border} ${onClick ? 'cursor-pointer hover:shadow-md transition-shadow' : ''}`}
      style={{ background: styles.bg }}
      onClick={onClick}
    >
      <div className="flex items-center gap-1.5 mb-1">
        <Icon className={`w-3 h-3 ${styles.iconColor}`} />
        <span className={`text-[10px] font-semibold ${styles.labelColor} uppercase tracking-wide truncate`}>
          {label}
        </span>
      </div>
      <div className={`text-base font-bold ${styles.textColor}`}>
        {typeof value === 'number' ? value.toLocaleString() : value}
      </div>
      {subtitle && (
        <div className="text-[10px] text-gray-500 leading-tight truncate">
          {subtitle}
        </div>
      )}
    </div>
  );
}

/**
 * Compact chart section wrapper
 */
export function ChartSection({
  icon: Icon,
  title,
  hint,
  color = 'emerald',
  height = 200,
  children,
}: {
  icon: LucideIcon;
  title: string;
  hint?: string;
  color?: ColorVariant;
  height?: number;
  children: ReactNode;
}) {
  const styles = colorStyles[color];

  return (
    <div className={`p-3 rounded-lg border ${styles.border} bg-white/80`}>
      <div className="flex items-center gap-2 mb-2">
        <Icon className={`w-3.5 h-3.5 ${styles.iconColor}`} />
        <h3 className="text-xs font-semibold text-gray-700">{title}</h3>
        {hint && <span className="text-[10px] text-gray-400 ml-auto">{hint}</span>}
      </div>
      <div style={{ width: '100%', height }}>
        {children}
      </div>
    </div>
  );
}

/**
 * Compact panel container
 */
export function PanelContainer({ children }: { children: ReactNode }) {
  return (
    <div className="h-full overflow-y-auto p-3 space-y-3">
      {children}
    </div>
  );
}

/**
 * Stats grid - 2 column layout
 */
export function StatsGrid({ children }: { children: ReactNode }) {
  const prefersReducedMotion = useReducedMotion();

  return (
    <motion.div
      initial={prefersReducedMotion ? {} : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: prefersReducedMotion ? 0.01 : 0.2 }}
      className="grid grid-cols-2 gap-2"
    >
      {children}
    </motion.div>
  );
}

/**
 * Stats grid - 3 column layout
 */
export function StatsGrid3({ children }: { children: ReactNode }) {
  const prefersReducedMotion = useReducedMotion();

  return (
    <motion.div
      initial={prefersReducedMotion ? {} : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: prefersReducedMotion ? 0.01 : 0.2 }}
      className="grid grid-cols-3 gap-2"
    >
      {children}
    </motion.div>
  );
}

/**
 * Compact info/recommendation box
 */
export function InfoBox({
  type = 'info',
  children,
}: {
  type?: 'success' | 'warning' | 'error' | 'info';
  children: ReactNode;
}) {
  const styles = {
    success: 'bg-emerald-50 border-emerald-200 text-emerald-700',
    warning: 'bg-yellow-50 border-yellow-200 text-yellow-700',
    error: 'bg-red-50 border-red-200 text-red-700',
    info: 'bg-blue-50 border-blue-200 text-blue-700',
  };

  return (
    <div className={`rounded-lg border p-2.5 text-xs ${styles[type]}`}>
      {children}
    </div>
  );
}

/**
 * Compact legend item
 */
export function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-2.5 h-2.5 rounded" style={{ backgroundColor: color }} />
      <span className="text-[10px] text-gray-600">{label}</span>
    </div>
  );
}

/**
 * Legend container
 */
export function Legend({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center justify-center gap-4 mt-2 flex-wrap">
      {children}
    </div>
  );
}

/**
 * Coming soon placeholder
 */
export function ComingSoonState({
  icon: Icon,
  title,
  description,
  features,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  features: string[];
}) {
  const prefersReducedMotion = useReducedMotion();

  return (
    <motion.div
      initial={prefersReducedMotion ? {} : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: prefersReducedMotion ? 0.01 : 0.2 }}
      className="bg-gradient-to-br from-blue-50/50 to-emerald-50/50 rounded-lg p-4 border border-dashed border-emerald-300/50"
    >
      <div className="text-center">
        <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-emerald-100 mb-3">
          <Icon className="w-5 h-5 text-emerald-600" />
        </div>
        <h3 className="text-sm font-bold text-gray-800 mb-1">{title}</h3>
        <p className="text-xs text-gray-600 mb-3">{description}</p>

        <div className="bg-white/80 rounded-lg p-3 text-left">
          <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-2">Planned:</p>
          <ul className="space-y-1">
            {features.map((feature, i) => (
              <li key={i} className="text-[10px] text-gray-600 flex items-start gap-1.5">
                <span className="text-emerald-500">•</span>
                <span>{feature}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </motion.div>
  );
}
