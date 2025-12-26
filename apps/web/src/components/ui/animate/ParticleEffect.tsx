import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { useReducedMotion } from '@/hooks/useReducedMotion';

interface Particle {
  id: number;
  x: number;
  y: number;
  size: number;
  color: string;
  velocity: { x: number; y: number };
  rotation: number;
}

interface ParticleEffectProps {
  /**
   * Trigger the particle burst
   */
  trigger: boolean;

  /**
   * Number of particles
   * @default 30
   */
  quantity?: number;

  /**
   * Particle colors (emerald + chartreuse by default)
   */
  colors?: string[];

  /**
   * Origin point (x, y in pixels from top-left)
   * @default center of container
   */
  origin?: { x: number; y: number };

  /**
   * Duration of the effect in seconds
   * @default 1.2
   */
  duration?: number;

  /**
   * Spread radius
   * @default 150
   */
  spread?: number;

  /**
   * Container className
   */
  className?: string;
}

/**
 * ParticleEffect component for celebration animations
 * Perfect for success states, milestone achievements
 * Automatically respects prefers-reduced-motion
 *
 * @example
 * <ParticleEffect
 *   trigger={completed}
 *   quantity={30}
 *   colors={['#10b981', '#9ABA12']}
 * />
 */
export function ParticleEffect({
  trigger,
  quantity = 30,
  colors = ['#10b981', '#9ABA12', '#37520B'], // Emerald theme
  origin,
  duration = 1.2,
  spread = 150,
  className = '',
}: ParticleEffectProps) {
  const [particles, setParticles] = useState<Particle[]>([]);
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    if (!trigger || prefersReducedMotion) return;

    // Generate particles
    const newParticles: Particle[] = Array.from({ length: quantity }, (_, i) => {
      const angle = (Math.PI * 2 * i) / quantity + (Math.random() - 0.5) * 0.5;
      const velocity = Math.random() * spread + spread * 0.5;

      return {
        id: Date.now() + i,
        x: origin?.x ?? 0,
        y: origin?.y ?? 0,
        size: Math.random() * 8 + 4,
        color: colors[Math.floor(Math.random() * colors.length)],
        velocity: {
          x: Math.cos(angle) * velocity,
          y: Math.sin(angle) * velocity,
        },
        rotation: Math.random() * 360,
      };
    });

    setParticles(newParticles);

    // Clear particles after animation
    const timeout = setTimeout(() => {
      setParticles([]);
    }, duration * 1000);

    return () => clearTimeout(timeout);
  }, [trigger, quantity, colors, origin, duration, spread, prefersReducedMotion]);

  if (prefersReducedMotion || particles.length === 0) {
    return null;
  }

  return (
    <div className={`fixed inset-0 pointer-events-none z-[9999] ${className}`}>
      {particles.map((particle) => (
        <motion.div
          key={particle.id}
          className="absolute rounded-full"
          style={{
            width: particle.size,
            height: particle.size,
            backgroundColor: particle.color,
            left: '50%',
            top: '50%',
          }}
          initial={{
            x: particle.x,
            y: particle.y,
            opacity: 1,
            scale: 1,
            rotate: particle.rotation,
          }}
          animate={{
            x: particle.x + particle.velocity.x,
            y: particle.y + particle.velocity.y + 100, // Gravity effect
            opacity: 0,
            scale: 0,
            rotate: particle.rotation + 180,
          }}
          transition={{
            duration,
            ease: [0.33, 1, 0.68, 1], // Custom ease-out
          }}
        />
      ))}
    </div>
  );
}
