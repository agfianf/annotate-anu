import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import { enableMapSet } from 'immer'

// Enable Immer plugin for Set/Map support
enableMapSet()

interface FileSelectionState {
  // Selected file/folder paths
  selectedPaths: Set<string>
  // Paths with partial selection (some children selected)
  indeterminatePaths: Set<string>
  // Expanded folder paths
  expandedPaths: Set<string>
  // Current directory path
  currentPath: string

  // Actions
  toggleSelect: (path: string, isDirectory: boolean) => void
  selectAll: (paths: string[]) => void
  clearSelection: () => void
  toggleExpand: (path: string) => void
  setCurrentPath: (path: string) => void

  // Helpers
  isSelected: (path: string) => boolean
  isIndeterminate: (path: string) => boolean
  isExpanded: (path: string) => boolean
  getSelectedPaths: () => string[]
}

export const useFileSelectionStore = create<FileSelectionState>()(
  immer((set, get) => ({
    selectedPaths: new Set(),
    indeterminatePaths: new Set(),
    expandedPaths: new Set(),
    currentPath: '',

    toggleSelect: (path: string) => {
      set((state) => {
        const isCurrentlySelected = state.selectedPaths.has(path)

        if (isCurrentlySelected) {
          state.selectedPaths.delete(path)
          state.indeterminatePaths.delete(path)
        } else {
          state.selectedPaths.add(path)
          state.indeterminatePaths.delete(path)
        }
      })
    },

    selectAll: (paths: string[]) => {
      set((state) => {
        paths.forEach((p) => state.selectedPaths.add(p))
        state.indeterminatePaths.clear()
      })
    },

    clearSelection: () => {
      set((state) => {
        state.selectedPaths.clear()
        state.indeterminatePaths.clear()
      })
    },

    toggleExpand: (path: string) => {
      set((state) => {
        if (state.expandedPaths.has(path)) {
          state.expandedPaths.delete(path)
        } else {
          state.expandedPaths.add(path)
        }
      })
    },

    setCurrentPath: (path: string) => {
      set((state) => {
        state.currentPath = path
      })
    },

    isSelected: (path: string) => get().selectedPaths.has(path),
    isIndeterminate: (path: string) => get().indeterminatePaths.has(path),
    isExpanded: (path: string) => get().expandedPaths.has(path),
    getSelectedPaths: () => Array.from(get().selectedPaths),
  }))
)
