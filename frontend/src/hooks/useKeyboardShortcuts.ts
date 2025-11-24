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
      if (event.key === 'v' && config.onSelectTool) {
        event.preventDefault()
        config.onSelectTool('select')
      } else if (event.key === 'r' && config.onSelectTool) {
        event.preventDefault()
        config.onSelectTool('rectangle')
      } else if (event.key === 'p' && config.onSelectTool) {
        event.preventDefault()
        config.onSelectTool('polygon')
      } else if (event.key === 'o' && config.onSelectTool) {
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
      else if (event.key === 'n' && config.onNewAnnotation) {
        event.preventDefault()
        config.onNewAnnotation()
      }

      // Image navigation shortcuts
      else if (event.key === 'f' && config.onNextImage) {
        event.preventDefault()
        config.onNextImage()
      } else if (event.key === 'd' && config.onPreviousImage) {
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
      else if (event.key === '?' && config.onShowShortcuts) {
        event.preventDefault()
        config.onShowShortcuts()
      }
    }

    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [config])
}
