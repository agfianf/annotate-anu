import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion';
import { useRef, type ReactNode, type MouseEvent } from 'react';
import { useReducedMotion } from '@/hooks/useReducedMotion';

interface TiltCardProps {
  /**
   * Children to render
   */
  children: ReactNode;

  /**
   * Maximum tilt angle in degrees
   * @default 10
   */
  tiltAngle?: number;

  /**
   * Scale on hover
   * @default 1.02
   */
  hoverScale?: number;

  /**
   * Enable glare effect
   * @default true
   */
  glare?: boolean;

  /**
   * Additional className
   */
  className?: string;

  /**
   * Additional props
   */
  [key: string]: any;
}

/**
 * TiltCard component with 3D tilt effect on hover
 * Perfect for project cards, feature cards, image thumbnails
 * Automatically respects prefers-reduced-motion
 *
 * @example
 * <TiltCard tiltAngle={15} hoverScale={1.05}>
 *   <div className="card">Content</div>
 * </TiltCard>
 */
export function TiltCard({
  children,
  tiltAngle = 10,
  hoverScale = 1.02,
  glare = true,
  className = '',
  ...props
}: TiltCardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const prefersReducedMotion = useReducedMotion();

  // Motion values for tilt
  const x = useMotionValue(0);
  const y = useMotionValue(0);

  // Spring physics for smooth, natural movement
  const springConfig = { stiffness: 300, damping: 20 };
  const rotateX = useSpring(useTransform(y, [-0.5, 0.5], [tiltAngle, -tiltAngle]), springConfig);
  const rotateY = useSpring(useTransform(x, [-0.5, 0.5], [-tiltAngle, tiltAngle]), springConfig);

  // Glare effect position
  const glareX = useTransform(x, [-0.5, 0.5], ['0%', '100%']);
  const glareY = useTransform(y, [-0.5, 0.5], ['0%', '100%']);

  const handleMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    if (prefersReducedMotion || !ref.current) return;

    const rect = ref.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    const percentX = (e.clientX - centerX) / (rect.width / 2);
    const percentY = (e.clientY - centerY) / (rect.height / 2);

    x.set(percentX);
    y.set(percentY);
  };

  const handleMouseLeave = () => {
    if (prefersReducedMotion) return;

    x.set(0);
    y.set(0);
  };

  if (prefersReducedMotion) {
    return (
      <div ref={ref} className={className} {...props}>
        {children}
      </div>
    );
  }

  return (
    <motion.div
      ref={ref}
      className={`relative ${className}`}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{
        rotateX,
        rotateY,
        transformStyle: 'preserve-3d',
      }}
      whileHover={{ scale: hoverScale, y: -4 }}
      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
      {...props}
    >
      {/* Content */}
      <div style={{ transform: 'translateZ(20px)' }}>{children}</div>

      {/* Glare effect */}
      {glare && (
        <motion.div
          className="absolute inset-0 pointer-events-none rounded-inherit overflow-hidden"
          style={{
            background: `radial-gradient(circle at ${glareX} ${glareY}, rgba(255, 255, 255, 0.1), transparent 50%)`,
          }}
        />
      )}
    </motion.div>
  );
}
