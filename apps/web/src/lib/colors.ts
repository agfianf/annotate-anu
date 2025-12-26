/**
 * Preset color palette for label annotations
 * Colors are chosen for maximum visual distinction and good contrast on images
 */

export const PRESET_COLORS = [
  '#ef4444', // Red
  '#f97316', // Orange
  '#f59e0b', // Amber
  '#eab308', // Yellow
  '#84cc16', // Lime
  '#22c55e', // Green
  '#10b981', // Emerald
  '#14b8a6', // Teal
  '#06b6d4', // Cyan
  '#0ea5e9', // Sky Blue
  '#3b82f6', // Blue
  '#6366f1', // Indigo
  '#8b5cf6', // Violet
  '#a855f7', // Purple
  '#d946ef', // Fuchsia
  '#ec4899', // Pink
  '#f43f5e', // Rose
  '#64748b', // Slate
  '#78716c', // Stone
  '#a8a29e', // Warm Gray
] as const

export type PresetColor = typeof PRESET_COLORS[number]

export const DEFAULT_LABEL_COLOR = PRESET_COLORS[0] // Red

/**
 * Calculate relative luminance of a hex color (WCAG formula)
 * @param hex - Hex color string (e.g., "#10B981" or "10B981")
 * @returns Luminance value between 0 (darkest) and 1 (lightest)
 */
function getLuminance(hex: string): number {
  // Remove # if present
  const cleanHex = hex.replace('#', '')

  // Parse RGB values
  const r = parseInt(cleanHex.substring(0, 2), 16) / 255
  const g = parseInt(cleanHex.substring(2, 4), 16) / 255
  const b = parseInt(cleanHex.substring(4, 6), 16) / 255

  // Apply sRGB gamma correction
  const [rs, gs, bs] = [r, g, b].map((channel) => {
    return channel <= 0.03928
      ? channel / 12.92
      : Math.pow((channel + 0.055) / 1.055, 2.4)
  })

  // Calculate luminance using WCAG formula
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs
}

/**
 * Get optimal text color (white or dark) for given background color
 * @param backgroundColor - Hex color string
 * @returns Text color hex string
 */
export function getTextColorForBackground(backgroundColor: string): string {
  const luminance = getLuminance(backgroundColor)

  // WCAG threshold: luminance > 0.5 is considered light
  // Use dark text for light backgrounds, white for dark backgrounds
  return luminance > 0.5 ? '#1F2937' : '#FFFFFF'
}
