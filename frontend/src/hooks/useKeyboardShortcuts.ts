import { useEffect } from 'react'
import type { Tool } from '@/types/annotations'

interface KeyboardShortcutsConfig {
  onSelectTool?: (tool: Tool) => void
  onDelete?: () => void
  onEscape?: () => void
  onNewAnnotation?: () => void
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
    }

    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [config])
}
