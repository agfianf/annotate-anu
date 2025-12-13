/**
 * Path utility functions for file explorer
 * Handles path relationships and hierarchy
 */

/**
 * Normalize a path by removing leading/trailing slashes
 * @param path - The path to normalize
 * @returns Normalized path without leading/trailing slashes
 */
export function normalizePath(path: string): string {
  return path.replace(/^\/+|\/+$/g, '')
}

/**
 * Check if childPath is a descendant (direct or nested) of parentPath
 * @param childPath - The potential child path
 * @param parentPath - The potential parent path
 * @returns true if childPath is a child of parentPath
 */
export function isChildOf(childPath: string, parentPath: string): boolean {
  const normalizedChild = normalizePath(childPath)
  const normalizedParent = normalizePath(parentPath)

  // Root is parent of all paths
  if (normalizedParent === '') return true

  // Same path is not a child
  if (normalizedChild === normalizedParent) return false

  // Check if child starts with parent path followed by /
  return normalizedChild.startsWith(normalizedParent + '/')
}

/**
 * Check if childPath is a direct child (one level down) of parentPath
 * @param childPath - The potential child path
 * @param parentPath - The potential parent path
 * @returns true if childPath is exactly one level below parentPath
 */
export function isDirectChildOf(
  childPath: string,
  parentPath: string
): boolean {
  const normalizedChild = normalizePath(childPath)
  const normalizedParent = normalizePath(parentPath)

  const childParts = normalizedChild.split('/')
  const parentParts = normalizedParent === '' ? [] : normalizedParent.split('/')

  // Direct child must be exactly one level deeper
  return (
    childParts.length === parentParts.length + 1 &&
    childParts.slice(0, -1).join('/') === parentParts.join('/')
  )
}

/**
 * Get the parent path of a given path
 * @param path - The path to get the parent of
 * @returns Parent path, or null if path is root
 */
export function getParentPath(path: string): string | null {
  const normalized = normalizePath(path)

  // Root has no parent
  if (normalized === '') return null

  const parts = normalized.split('/')

  // Direct child of root
  if (parts.length === 1) return ''

  // Return parent by removing last segment
  return parts.slice(0, -1).join('/')
}

/**
 * Get all ancestor paths for a given path
 * @param path - The path to get ancestors for
 * @returns Array of ancestor paths from immediate parent to root
 */
export function getAncestorPaths(path: string): string[] {
  const ancestors: string[] = []
  let current = getParentPath(path)

  while (current !== null) {
    ancestors.push(current)
    current = getParentPath(current)
  }

  return ancestors
}
