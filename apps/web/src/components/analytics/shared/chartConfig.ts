/**
 * Shared Chart Configuration
 * Centralized styling for consistent, compact, boxy charts across all analytics panels
 */

/**
 * Chart configuration constants
 * Design principles: COMPACT, BOXY, CONSISTENT
 */
export const CHART_CONFIG = {
  // All bars are boxy - no rounded corners
  barRadius: 0 as const,

  // No stroke on bars (removes selection highlight)
  cellStroke: 'none' as const,
  cellStrokeWidth: 0,

  // Grid styling
  gridStroke: '#e5e7eb',
  gridDash: '3 3',

  // Axis styling
  axisStyle: { fill: '#6B7280', fontSize: 9 } as const,
  axisWidth: 30,

  // Animation
  animationDuration: 500,

  // Margins (compact)
  margin: {
    top: 14,
    right: 10,
    left: -10,
    bottom: 60,
  },
  marginCompact: {
    top: 12,
    right: 10,
    left: -10,
    bottom: 40,
  },

  // Category stripe height for stacked bars
  categoryStripeHeight: 3,

  // Cursor for clickable bars
  cursor: 'pointer' as const,

  // Tooltip cursor highlight (matches tag distribution hover tone)
  tooltipCursorFill: 'rgba(16, 185, 129, 0.08)',
} as const;

export const CHART_TOOLTIP_CLASSNAME =
  'rounded-lg p-2.5 shadow-lg border border-emerald-200/50 bg-white/95 backdrop-blur-sm text-xs';

/**
 * Get consistent Cell props for chart bars
 * Removes any focus outlines and selection borders
 */
export function getCellProps(fill: string) {
  return {
    fill,
    stroke: CHART_CONFIG.cellStroke,
    strokeWidth: CHART_CONFIG.cellStrokeWidth,
    style: { outline: 'none' } as React.CSSProperties,
  };
}

/**
 * Get consistent Bar props for chart bars
 */
export function getBarProps(animated: boolean = true) {
  return {
    radius: CHART_CONFIG.barRadius,
    cursor: CHART_CONFIG.cursor,
    animationDuration: animated ? CHART_CONFIG.animationDuration : 0,
    isAnimationActive: animated,
    activeBar: false,
    stroke: CHART_CONFIG.cellStroke,
    strokeWidth: CHART_CONFIG.cellStrokeWidth,
    style: { outline: 'none' } as React.CSSProperties,
  };
}

/**
 * Get consistent CartesianGrid props
 */
export function getGridProps() {
  return {
    strokeDasharray: CHART_CONFIG.gridDash,
    stroke: CHART_CONFIG.gridStroke,
  };
}

/**
 * Get consistent XAxis props
 */
export function getXAxisProps(angled: boolean = true) {
  return {
    tick: CHART_CONFIG.axisStyle,
    axisLine: false,
    tickLine: false,
    ...(angled ? {
      angle: -45,
      textAnchor: 'end' as const,
      height: 60,
      interval: 0,
    } : {}),
  };
}

/**
 * Get consistent YAxis props
 */
export function getYAxisProps() {
  return {
    tick: CHART_CONFIG.axisStyle,
    axisLine: false,
    tickLine: false,
    width: CHART_CONFIG.axisWidth,
  };
}

/**
 * Get consistent Tooltip cursor props
 */
export function getTooltipCursorProps() {
  return {
    fill: CHART_CONFIG.tooltipCursorFill,
    stroke: 'none',
  };
}
