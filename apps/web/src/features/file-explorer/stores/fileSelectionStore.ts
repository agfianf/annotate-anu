import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import { enableMapSet } from 'immer'
import { QueryClient } from '@tanstack/react-query'
import { fileTreeKeys } from '../hooks/useFileTree'
import * as pathUtils from '../utils/pathUtils'
import type { DirectoryListResponse } from '../types'

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
  toggleSelect: (path: string, isDirectory: boolean, queryClient: QueryClient) => void
  selectAll: (paths: string[]) => void
  clearSelection: () => void
  toggleExpand: (path: string) => void
  setCurrentPath: (path: string) => void
  updateIndeterminateStates: (queryClient: QueryClient) => void

  // Helpers
  isSelected: (path: string) => boolean
  isIndeterminate: (path: string) => boolean
  isExpanded: (path: string) => boolean
  getSelectedPaths: () => string[]
}

/**
 * Get loaded children from QueryClient cache
 */
function getLoadedChildren(path: string, queryClient: QueryClient): string[] {
  const data = queryClient.getQueryData<DirectoryListResponse>(
    fileTreeKeys.directory(path)
  )
  if (!data?.items) return []
  return data.items.map((item) => item.path)
}

/**
 * Get loaded children with their FileItem data from QueryClient cache
 */
function getLoadedChildrenWithType(
  path: string,
  queryClient: QueryClient
): import('../types').FileItem[] {
  const data = queryClient.getQueryData<DirectoryListResponse>(
    fileTreeKeys.directory(path)
  )
  if (!data?.items) return []
  return data.items
}

/**
 * Compute folder selection state based on loaded children
 */
function computeFolderSelectionState(
  selectedPaths: Set<string>,
  loadedChildren: string[]
): 'none' | 'partial' | 'full' {
  if (loadedChildren.length === 0) return 'none'

  const selectedCount = loadedChildren.filter((p) => selectedPaths.has(p)).length

  if (selectedCount === 0) return 'none'
  if (selectedCount === loadedChildren.length) return 'full'
  return 'partial'
}

/**
 * Select path and all loaded descendants
 */
function selectWithDescendants(
  path: string,
  isDirectory: boolean,
  state: FileSelectionState,
  queryClient: QueryClient
): void {
  state.selectedPaths.add(path)

  if (!isDirectory) return

  // Recursively select loaded children
  const children = getLoadedChildrenWithType(path, queryClient)
  for (const child of children) {
    // Use child.type to determine if it's a directory
    selectWithDescendants(child.path, child.type === 'directory', state, queryClient)
  }
}

/**
 * Deselect path and all descendants (loaded and unloaded)
 */
function deselectWithDescendants(
  path: string,
  state: FileSelectionState
): void {
  // Remove this path
  state.selectedPaths.delete(path)

  // Remove all descendants using path prefix matching
  const pathsToRemove: string[] = []
  for (const selectedPath of state.selectedPaths) {
    if (pathUtils.isChildOf(selectedPath, path)) {
      pathsToRemove.push(selectedPath)
    }
  }

  // Remove collected paths
  for (const pathToRemove of pathsToRemove) {
    state.selectedPaths.delete(pathToRemove)
  }
}

/**
 * Update indeterminate state for ancestors
 */
function updateAncestorStates(
  path: string,
  state: FileSelectionState,
  queryClient: QueryClient
): void {
  const ancestors = pathUtils.getAncestorPaths(path)

  for (const ancestorPath of ancestors) {
    const children = getLoadedChildren(ancestorPath, queryClient)
    const selectionState = computeFolderSelectionState(
      state.selectedPaths,
      children
    )

    // Update indeterminate state
    if (selectionState === 'partial') {
      state.indeterminatePaths.add(ancestorPath)
      state.selectedPaths.delete(ancestorPath) // Remove from selected when partial
    } else {
      state.indeterminatePaths.delete(ancestorPath)
    }

    // Auto-select parent if all children selected
    if (selectionState === 'full' && children.length > 0) {
      state.selectedPaths.add(ancestorPath)
    } else if (selectionState === 'none') {
      state.selectedPaths.delete(ancestorPath)
    }
  }
}

export const useFileSelectionStore = create<FileSelectionState>()(
  immer((set, get) => ({
    selectedPaths: new Set(),
    indeterminatePaths: new Set(),
    expandedPaths: new Set(),
    currentPath: '',

    toggleSelect: (path: string, isDirectory: boolean, queryClient: QueryClient) => {
      set((state) => {
        const isCurrentlySelected = state.selectedPaths.has(path)

        if (isCurrentlySelected) {
          // Deselect this path and all descendants
          deselectWithDescendants(path, state)
        } else {
          // Select this path and all loaded descendants
          selectWithDescendants(path, isDirectory, state, queryClient)
        }

        // Update ancestor indeterminate states
        updateAncestorStates(path, state, queryClient)
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

    updateIndeterminateStates: (queryClient: QueryClient) => {
      set((state) => {
        state.indeterminatePaths.clear()

        // Recompute for all expanded directories
        for (const expandedPath of state.expandedPaths) {
          const children = getLoadedChildren(expandedPath, queryClient)
          const selectionState = computeFolderSelectionState(
            state.selectedPaths,
            children
          )

          if (selectionState === 'partial') {
            state.indeterminatePaths.add(expandedPath)
          }
        }
      })
    },

    isSelected: (path: string) => get().selectedPaths.has(path),
    isIndeterminate: (path: string) => get().indeterminatePaths.has(path),
    isExpanded: (path: string) => get().expandedPaths.has(path),
    getSelectedPaths: () => Array.from(get().selectedPaths),
  }))
)
