import type { PromptMode } from '@/types/annotations'
import { Activity, Loader2 } from 'lucide-react'

interface AIModeIndicatorProps {
  mode: PromptMode
  isActive: boolean // true when text-prompt or bbox-prompt panel is open
  textPrompt?: string // The current text prompt being used
  isProcessing?: boolean // true when AI is currently processing
}

export function AIModeIndicator({ mode, isActive, textPrompt = '', isProcessing = false }: AIModeIndicatorProps) {
  if (!isActive) return null

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
    <div className="relative flex items-center gap-2 px-2 py-1 bg-emerald-600/20 border border-emerald-600/50 rounded pulse-container">
      {isProcessing ? (
        <Loader2 className="w-3 h-3 text-emerald-600 animate-spin" />
      ) : (
        <Activity className="w-3 h-3 text-emerald-600" />
      )}
      <span className="text-xs font-medium text-emerald-700">
        AI: {getModeLabel()}
        {textPrompt && <span className="text-emerald-600"> | "{textPrompt}"</span>}
        {getStatusLabel() && <span className="text-emerald-600"> | {getStatusLabel()}</span>}
      </span>
      <style>{`
        .pulse-container::before {
          content: '';
          position: absolute;
          top: -1px;
          left: -1px;
          right: -1px;
          bottom: -1px;
          border-radius: 0.25rem;
          border: 1px solid rgba(16, 185, 129, 0.4);
          animation: pulse-ripple 3s cubic-bezier(0.4, 0, 0.6, 1) infinite;
          pointer-events: none;
        }

        @keyframes pulse-ripple {
          0% {
            transform: scale(1);
            opacity: 0.6;
          }
          50% {
            transform: scale(1.08);
            opacity: 0.3;
          }
          100% {
            transform: scale(1.15);
            opacity: 0;
          }
        }
      `}</style>
    </div>
  )
}
