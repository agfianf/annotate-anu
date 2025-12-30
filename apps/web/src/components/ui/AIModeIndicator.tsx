import type { PromptMode } from '@/types/annotations'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import { Loader2 } from 'lucide-react'

interface AIModeIndicatorProps {
  mode: PromptMode
  isActive: boolean // true when text-prompt or bbox-prompt panel is open
  textPrompt?: string // The current text prompt being used
  isProcessing?: boolean // true when AI is currently processing
}

// Minimalist AI icon with subtle animation
function AIIcon() {
  return (
    <div className="ai-icon-wrap">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        className="ai-icon-svg"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id="aiGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="rgba(239, 68, 68, 1)" />
            <stop offset="100%" stopColor="rgba(220, 38, 38, 0.9)" />
          </linearGradient>
        </defs>
        {/* Simple brain/circuit design */}
        <circle className="ai-core" cx="12" cy="12" r="4" fill="url(#aiGradient)" />
        <circle className="ai-ring-inner" cx="12" cy="12" r="7" stroke="rgba(239, 68, 68, 0.6)" strokeWidth="1.2" fill="none" />
        <circle className="ai-ring-outer" cx="12" cy="12" r="10" stroke="rgba(239, 68, 68, 0.35)" strokeWidth="0.8" fill="none" strokeDasharray="3 3" />
        {/* Neural dots */}
        <circle className="ai-dot d1" cx="12" cy="5" r="1.2" fill="rgba(239, 68, 68, 0.8)" />
        <circle className="ai-dot d2" cx="19" cy="12" r="1.2" fill="rgba(239, 68, 68, 0.8)" />
        <circle className="ai-dot d3" cx="12" cy="19" r="1.2" fill="rgba(239, 68, 68, 0.8)" />
        <circle className="ai-dot d4" cx="5" cy="12" r="1.2" fill="rgba(239, 68, 68, 0.8)" />
      </svg>
    </div>
  )
}

export function AIModeIndicator({ mode, isActive, textPrompt = '', isProcessing = false }: AIModeIndicatorProps) {
  if (!isActive) return null

  const prefersReducedMotion = useReducedMotion()

  const getModeLabel = () => {
    switch (mode) {
      case 'single':
        return 'Single'
      case 'auto-apply':
        return 'Auto-Apply'
      case 'batch':
        return 'Batch'
      default:
        return 'AI'
    }
  }

  const getStatusLabel = () => {
    if (isProcessing) return 'Processing...'
    if (mode === 'auto-apply') return 'Ready'
    return ''
  }

  return (
    <div
      className={`relative flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-medium z-50 ${
        prefersReducedMotion ? 'ai-glass-static' : 'ai-glass-animate'
      } ai-liquid-glass`}
    >
      {/* Subtle pulse rings */}
      <span className="ai-pulse-rings" aria-hidden="true">
        <span className="ai-ring r1" />
        <span className="ai-ring r2" />
        <span className="ai-ring r3" />
      </span>

      {/* AI Icon */}
      <span className="relative z-10 flex items-center justify-center w-4 h-4">
        {isProcessing ? (
          <Loader2 className="w-3.5 h-3.5 text-red-400 animate-spin" />
        ) : (
          <AIIcon />
        )}
      </span>

      {/* Text content */}
      <span className="relative z-10 text-red-600/90">
        <span className="font-semibold">AI</span>
        <span className="text-red-400/70">:</span> {getModeLabel()}
        {textPrompt && <span className="text-red-500/80"> · "{textPrompt}"</span>}
        {getStatusLabel() && <span className="text-red-500/80"> · {getStatusLabel()}</span>}
      </span>

      <style>{`
        /* ===== Liquid Glass Effect ===== */
        .ai-liquid-glass {
          background: linear-gradient(
            135deg,
            rgba(255, 255, 255, 0.9) 0%,
            rgba(254, 226, 226, 0.85) 40%,
            rgba(252, 165, 165, 0.7) 100%
          );
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          border: 1px solid rgba(239, 68, 68, 0.35);
          box-shadow:
            0 8px 32px rgba(239, 68, 68, 0.2),
            0 4px 16px rgba(239, 68, 68, 0.15),
            0 2px 4px rgba(0, 0, 0, 0.05),
            inset 0 1px 0 rgba(255, 255, 255, 0.9),
            inset 0 -1px 0 rgba(239, 68, 68, 0.15);
          overflow: visible;
          isolation: isolate;
        }

        /* Subtle inner glow */
        .ai-liquid-glass::before {
          content: '';
          position: absolute;
          inset: 0;
          border-radius: inherit;
          background: radial-gradient(
            ellipse 80% 50% at 20% 20%,
            rgba(255, 255, 255, 0.6) 0%,
            transparent 60%
          );
          pointer-events: none;
          z-index: 1;
        }

        /* ===== Pulse Rings ===== */
        .ai-pulse-rings {
          position: absolute;
          inset: -16px;
          z-index: -1;
          pointer-events: none;
        }

        .ai-ring {
          position: absolute;
          inset: 0;
          border-radius: 20px;
          border: 1.5px solid rgba(239, 68, 68, 0.5);
          opacity: 0;
          box-shadow: 0 0 8px rgba(239, 68, 68, 0.3);
        }

        /* ===== AI Icon Styles ===== */
        .ai-icon-wrap {
          width: 16px;
          height: 16px;
        }

        .ai-icon-svg {
          width: 100%;
          height: 100%;
        }

        /* ===== Animations ===== */
        .ai-glass-animate {
          animation: glass-breathe 2.5s ease-in-out infinite, float-up 3s ease-in-out infinite;
        }

        .ai-glass-animate .ai-ring {
          animation: ring-pulse 2.5s ease-out infinite;
        }

        .ai-glass-animate .r2 {
          animation-delay: 0.8s;
        }

        .ai-glass-animate .r3 {
          animation-delay: 1.6s;
        }

        /* Icon animations */
        .ai-glass-animate .ai-core {
          animation: core-pulse 2s ease-in-out infinite;
        }

        .ai-glass-animate .ai-ring-outer {
          animation: ring-rotate 10s linear infinite;
          transform-origin: center;
        }

        .ai-glass-animate .ai-dot {
          animation: dot-pulse 1.5s ease-in-out infinite;
        }

        .ai-glass-animate .d2 { animation-delay: 0.4s; }
        .ai-glass-animate .d3 { animation-delay: 0.8s; }
        .ai-glass-animate .d4 { animation-delay: 1.2s; }

        /* Static state */
        .ai-glass-static .ai-ring {
          opacity: 0.2;
        }

        /* ===== Keyframes ===== */
        @keyframes glass-breathe {
          0%, 100% {
            box-shadow:
              0 8px 32px rgba(239, 68, 68, 0.2),
              0 4px 16px rgba(239, 68, 68, 0.15),
              0 2px 4px rgba(0, 0, 0, 0.05),
              inset 0 1px 0 rgba(255, 255, 255, 0.9),
              inset 0 -1px 0 rgba(239, 68, 68, 0.15);
            transform: scale(1);
          }
          50% {
            box-shadow:
              0 12px 40px rgba(239, 68, 68, 0.3),
              0 6px 20px rgba(239, 68, 68, 0.2),
              0 3px 6px rgba(0, 0, 0, 0.06),
              inset 0 1px 0 rgba(255, 255, 255, 1),
              inset 0 -1px 0 rgba(239, 68, 68, 0.2);
            transform: scale(1.02);
          }
        }

        @keyframes float-up {
          0%, 100% {
            transform: translateY(0px);
          }
          50% {
            transform: translateY(-2px);
          }
        }

        @keyframes ring-pulse {
          0% {
            transform: scale(1);
            opacity: 0.6;
          }
          100% {
            transform: scale(1.6);
            opacity: 0;
          }
        }

        @keyframes core-pulse {
          0%, 100% {
            opacity: 0.85;
            r: 4;
          }
          50% {
            opacity: 1;
            r: 5;
          }
        }

        @keyframes ring-rotate {
          0% {
            transform: rotate(0deg);
          }
          100% {
            transform: rotate(360deg);
          }
        }

        @keyframes dot-pulse {
          0%, 100% {
            opacity: 0.5;
            r: 1;
          }
          50% {
            opacity: 1;
            r: 1.5;
          }
        }
      `}</style>
    </div>
  )
}
