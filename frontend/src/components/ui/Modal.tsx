import { X } from 'lucide-react'
import { type ReactNode } from 'react'

interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title: string
  children: ReactNode
  showCloseButton?: boolean
  blocking?: boolean
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl'
}

export function Modal({
  isOpen,
  onClose,
  title,
  children,
  showCloseButton = true,
  blocking = false,
  maxWidth = '2xl',
}: ModalProps) {
  if (!isOpen) return null

  const maxWidthClasses = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
    '2xl': 'max-w-2xl',
  }

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!blocking && e.target === e.currentTarget) {
      onClose()
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      onClick={handleBackdropClick}
    >
      <div
        className={`glass-strong rounded-lg shadow-2xl ${maxWidthClasses[maxWidth]} w-full mx-4 max-h-[80vh] overflow-hidden flex flex-col`}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200/50 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-gray-900">{title}</h2>
          {showCloseButton && !blocking && (
            <button
              onClick={onClose}
              className="text-gray-600 hover:text-gray-900 transition-colors"
              aria-label="Close modal"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto flex-1">{children}</div>
      </div>
    </div>
  )
}
