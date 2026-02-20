import { useEffect } from 'react'
import type { Tool } from '@/types/annotations'

interface KeyboardShortcutsConfig {
  onSelectTool?: (tool: Tool) => void
  onDelete?: () => void
  onEscape?: () => void
  onNewAnnotation?: () => void
  onNextImage?: () => void
  onPreviousImage?: () => void
  onUndo?: () => void
  onRedo?: () => void
  onZoomIn?: () => void
  onZoomOut?: () => void
  onAutofit?: () => void
  onResetZoom?: () => void
  onShowShortcuts?: () => void
  onToggleSidebar?: () => void
  onDuplicate?: () => void
  onSave?: () => void
  onToggleVisibility?: () => void
  onLock?: () => void
  selectedTool?: Tool
}

export function useKeyboardShortcuts(config: KeyboardShortcutsConfig) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Ignore if user is typing in an input
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement
      ) {
        return
      }

      // Tool selection shortcuts
      if (event.key === 'v' && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey && config.onSelectTool) {
        event.preventDefault()
        config.onSelectTool('select')
      } else if (event.key === 'r' && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey && config.onSelectTool) {
        event.preventDefault()
        config.onSelectTool('rectangle')
      } else if (event.key === 'p' && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey && config.onSelectTool) {
        event.preventDefault()
        config.onSelectTool('polygon')
      } else if (event.key === 'o' && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey && config.onSelectTool) {
        event.preventDefault()
        config.onSelectTool('point')
      }

      // Delete shortcut
      else if ((event.key === 'Delete' || event.key === 'Backspace') && config.onDelete) {
        event.preventDefault()
        config.onDelete()
      }

      // Escape to cancel
      else if (event.key === 'Escape' && config.onEscape) {
        event.preventDefault()
        config.onEscape()
      }

      // 'n' for new annotation (same type as previous)
      else if (event.key === 'n' && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey && config.onNewAnnotation) {
        event.preventDefault()
        config.onNewAnnotation()
      }

      // Image navigation shortcuts
      else if (((event.key === 'f' || event.key === 'ArrowRight') && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) && config.onNextImage) {
        event.preventDefault()
        config.onNextImage()
      } else if (((event.key === 'd' || event.key === 'ArrowLeft') && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) && config.onPreviousImage) {
        event.preventDefault()
        config.onPreviousImage()
      }

      // Undo/Redo shortcuts
      else if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key === 'Z' && config.onRedo) {
        event.preventDefault()
        config.onRedo()
      } else if ((event.ctrlKey || event.metaKey) && event.key === 'y' && config.onRedo) {
        event.preventDefault()
        config.onRedo()
      } else if ((event.ctrlKey || event.metaKey) && event.key === 'z' && config.onUndo) {
        event.preventDefault()
        config.onUndo()
      }

      // Zoom shortcuts
      else if ((event.key === '+' || event.key === '=') && config.onZoomIn) {
        event.preventDefault()
        config.onZoomIn()
      } else if (event.key === '-' && config.onZoomOut) {
        event.preventDefault()
        config.onZoomOut()
      } else if ((event.ctrlKey || event.metaKey) && event.key === '0' && config.onAutofit) {
        event.preventDefault()
        config.onAutofit()
      } else if (event.key === '0' && !event.ctrlKey && !event.metaKey && config.onResetZoom) {
        event.preventDefault()
        config.onResetZoom()
      }

      // Show shortcuts help
      else if (event.key === '?' && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey && config.onShowShortcuts) {
        event.preventDefault()
        config.onShowShortcuts()
      }

      // Toggle sidebar
      else if ((event.ctrlKey || event.metaKey) && event.key === 'b' && config.onToggleSidebar) {
        event.preventDefault()
        config.onToggleSidebar()
      }

      // Duplicate annotation
      else if ((event.ctrlKey || event.metaKey) && event.key === 'd' && config.onDuplicate) {
        event.preventDefault()
        config.onDuplicate()
      }

      // Save/Export
      else if ((event.ctrlKey || event.metaKey) && event.key === 's' && config.onSave) {
        event.preventDefault()
        config.onSave()
      }

      // Toggle visibility
      else if (event.key === 'h' && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey && config.onToggleVisibility) {
        event.preventDefault()
        config.onToggleVisibility()
      }

      // Lock/Unlock
      else if (event.key === 'l' && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey && config.onLock) {
        event.preventDefault()
        config.onLock()
      }
    }

    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [config])
}
