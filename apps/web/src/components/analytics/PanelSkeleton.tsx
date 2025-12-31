/**
 * Panel Skeleton Loading State
 * Shown while panel content is loading
 */

import { memo } from 'react';
import { motion } from 'framer-motion';
import { useReducedMotion } from '@/hooks/useReducedMotion';

export const PanelSkeleton = memo(function PanelSkeleton() {
  const prefersReducedMotion = useReducedMotion();

  return (
    <div className="p-6 space-y-6">
      {/* Summary Stats Skeleton */}
      <div className="grid grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <SkeletonCard key={i} delay={i * 0.05} />
        ))}
      </div>

      {/* Chart Title Skeleton */}
      <div className="space-y-2">
        <SkeletonBar width="40%" height={20} delay={0.2} />
        <SkeletonBar width="60%" height={12} delay={0.25} />
      </div>

      {/* Chart Skeleton */}
      <div className="space-y-3">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex items-center gap-3">
            <SkeletonBar width="30%" height={12} delay={0.3 + i * 0.05} />
            <SkeletonBar
              width={`${Math.random() * 40 + 40}%`}
              height={32}
              delay={0.35 + i * 0.05}
            />
          </div>
        ))}
      </div>
    </div>
  );
});

interface SkeletonBarProps {
  width?: string | number;
  height?: number;
  delay?: number;
}

function SkeletonBar({ width = '100%', height = 16, delay = 0 }: SkeletonBarProps) {
  const prefersReducedMotion = useReducedMotion();

  return (
    <motion.div
      initial={prefersReducedMotion ? {} : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2, delay }}
      className="relative overflow-hidden rounded bg-gray-200"
      style={{ width, height }}
    >
      {!prefersReducedMotion && (
        <motion.div
          className="absolute inset-0 bg-gradient-to-r from-transparent via-white/60 to-transparent"
          animate={{
            x: ['-100%', '100%'],
          }}
          transition={{
            duration: 1.5,
            repeat: Infinity,
            ease: 'linear',
          }}
        />
      )}
    </motion.div>
  );
}

function SkeletonCard({ delay = 0 }: { delay?: number }) {
  const prefersReducedMotion = useReducedMotion();

  return (
    <motion.div
      initial={prefersReducedMotion ? {} : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, delay }}
      className="p-4 rounded-lg border border-gray-200 bg-gray-50 space-y-2"
    >
      <SkeletonBar width="60%" height={12} />
      <SkeletonBar width="40%" height={24} />
    </motion.div>
  );
}
