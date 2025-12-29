/**
 * Dirty Tracker for incremental rendering updates
 *
 * Instead of recreating ALL graphics on every change (slow),
 * only update the annotations that actually changed (fast)
 *
 * Performance: O(1) mark dirty, O(k) get dirty where k = dirty count
 */

export class DirtyTracker {
  private dirtySet: Set<string> = new Set()
  private allDirty: boolean = false

  /**
   * Mark specific annotation as dirty (needs re-render)
   */
  markDirty(annotationId: string): void {
    if (!this.allDirty) {
      this.dirtySet.add(annotationId)
    }
  }

  /**
   * Mark multiple annotations as dirty
   */
  markManyDirty(annotationIds: string[]): void {
    if (!this.allDirty) {
      for (const id of annotationIds) {
        this.dirtySet.add(id)
      }
    }
  }

  /**
   * Mark ALL annotations as dirty (e.g., zoom/pan/initial load)
   */
  markAllDirty(): void {
    this.allDirty = true
    this.dirtySet.clear()
  }

  /**
   * Check if specific annotation is dirty
   */
  isDirty(annotationId: string): boolean {
    return this.allDirty || this.dirtySet.has(annotationId)
  }

  /**
   * Check if all annotations are dirty
   */
  isAllDirty(): boolean {
    return this.allDirty
  }

  /**
   * Get all dirty annotation IDs
   */
  getDirtyIds(): string[] {
    if (this.allDirty) {
      return [] // Special case: use getAllAnnotations() instead
    }
    return Array.from(this.dirtySet)
  }

  /**
   * Get dirty count for debugging
   */
  getDirtyCount(): number {
    return this.allDirty ? -1 : this.dirtySet.size
  }

  /**
   * Clear all dirty flags (call after render)
   */
  clear(): void {
    this.dirtySet.clear()
    this.allDirty = false
  }

  /**
   * Reset tracker (clear everything)
   */
  reset(): void {
    this.dirtySet.clear()
    this.allDirty = false
  }
}

/**
 * Hook to detect annotation changes and mark them dirty
 */
export function useAnnotationDiffer(
  annotations: any[],
  previousAnnotations: any[] | null
): {
  changedIds: string[]
  addedIds: string[]
  removedIds: string[]
  isFirstRender: boolean
} {
  if (!previousAnnotations) {
    return {
      changedIds: [],
      addedIds: annotations.map(a => a.id),
      removedIds: [],
      isFirstRender: true,
    }
  }

  const prevMap = new Map(previousAnnotations.map(a => [a.id, a]))
  const currMap = new Map(annotations.map(a => [a.id, a]))

  const addedIds: string[] = []
  const changedIds: string[] = []
  const removedIds: string[] = []

  // Find added and changed
  for (const curr of annotations) {
    const prev = prevMap.get(curr.id)
    if (!prev) {
      addedIds.push(curr.id)
    } else if (hasAnnotationChanged(prev, curr)) {
      changedIds.push(curr.id)
    }
  }

  // Find removed
  for (const prev of previousAnnotations) {
    if (!currMap.has(prev.id)) {
      removedIds.push(prev.id)
    }
  }

  return {
    changedIds,
    addedIds,
    removedIds,
    isFirstRender: false,
  }
}

/**
 * Check if annotation data changed (position, size, label, etc.)
 */
function hasAnnotationChanged(prev: any, curr: any): boolean {
  // Compare type
  if (prev.type !== curr.type) return true

  // Compare label
  if (prev.labelId !== curr.labelId) return true

  // Compare visibility
  if (prev.isVisible !== curr.isVisible) return true

  // Compare position/size for rectangles
  if (prev.type === 'rectangle') {
    if (
      prev.x !== curr.x ||
      prev.y !== curr.y ||
      prev.width !== curr.width ||
      prev.height !== curr.height
    ) {
      return true
    }
  }

  // Compare points for polygons
  if (prev.type === 'polygon') {
    if (prev.points.length !== curr.points.length) return true

    for (let i = 0; i < prev.points.length; i++) {
      if (prev.points[i].x !== curr.points[i].x || prev.points[i].y !== curr.points[i].y) {
        return true
      }
    }
  }

  return false
}
