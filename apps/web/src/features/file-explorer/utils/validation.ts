/**
 * Validation utilities for file explorer
 */

/**
 * Regex pattern for valid folder names
 * Allows: alphanumeric characters, hyphens, and underscores
 */
export const FOLDER_NAME_REGEX = /^[a-zA-Z0-9_-]+$/

/**
 * Validation result interface
 */
export interface ValidationResult {
  valid: boolean
  error?: string
}

/**
 * Validate folder name
 * Rules:
 * - Cannot be empty
 * - Only alphanumeric characters, hyphens (-), and underscores (_) allowed
 * - No spaces or special characters
 *
 * @param name - The folder name to validate
 * @returns Validation result with error message if invalid
 */
export function validateFolderName(name: string): ValidationResult {
  const trimmed = name.trim()

  if (!trimmed) {
    return { valid: false, error: 'Folder name cannot be empty' }
  }

  if (!FOLDER_NAME_REGEX.test(trimmed)) {
    return {
      valid: false,
      error: 'Only alphanumeric, hyphens (-), and underscores (_) allowed',
    }
  }

  return { valid: true }
}

/**
 * Sanitize folder name by removing invalid characters
 *
 * @param name - The folder name to sanitize
 * @returns Sanitized folder name
 */
export function sanitizeFolderName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, '')
}

/**
 * Validate a folder path with "/" separators
 * Each segment must be valid (alphanumeric, hyphens, underscores)
 *
 * @param path - The folder path to validate (e.g., "folder1/folder2")
 * @returns Validation result with error message if invalid
 */
export function validateFolderPath(path: string): ValidationResult {
  const trimmed = path.trim()

  if (!trimmed) {
    return { valid: false, error: 'Folder path cannot be empty' }
  }

  // Split by "/" and validate each segment
  const segments = trimmed.split('/').filter((s) => s.length > 0)

  if (segments.length === 0) {
    return { valid: false, error: 'Folder path cannot be empty' }
  }

  // Validate each folder name in the path
  for (const segment of segments) {
    if (!FOLDER_NAME_REGEX.test(segment)) {
      return {
        valid: false,
        error: `Invalid folder name "${segment}". Only alphanumeric, hyphens (-), and underscores (_) allowed`,
      }
    }
  }

  return { valid: true }
}

/**
 * Parse folder path into segments
 * Filters out empty segments from leading/trailing/multiple slashes
 *
 * @param path - The folder path to parse (e.g., "folder1/folder2/")
 * @returns Array of folder name segments
 */
export function parseFolderPath(path: string): string[] {
  return path
    .trim()
    .split('/')
    .filter((s) => s.length > 0)
}
