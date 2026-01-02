import { useId } from 'react';
import type { ReactElement } from 'react';
import type { MouseEvent, RefObject } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  LabelList,
} from 'recharts';

import { BarValueLabel } from './PanelComponents';
import {
  CHART_CONFIG,
  getBarProps,
  getGridProps,
  getTooltipCursorProps,
  getXAxisProps,
  getYAxisProps,
} from './chartConfig';
import type { UseChartMultiSelectResult } from './useChartMultiSelect';

type TooltipContent =
  | ReactElement
  | ((props: any) => ReactElement | null);

export interface HistogramChartClickHandlers {
  containerRef: RefObject<HTMLDivElement>;
  handleContainerClick: (event: MouseEvent<HTMLDivElement>) => void;
}

export interface HistogramTheme<T> {
  gradient?: {
    from: string;
    to: string;
    selectedFrom: string;
    selectedTo: string;
  };
  getFill?: (entry: T, index: number) => string;
  selectionBackground?: {
    selected: string;
    unselected: string;
  };
  selectedStroke: string;
  selectedStrokeWidth?: number;
  opacity?: {
    default: number;
    selected: number;
    unselected: number;
  };
  cellClassName?: string;
}

export const HISTOGRAM_THEMES = {
  purple: {
    gradient: {
      from: '#8B5CF6',
      to: '#7C3AED',
      selectedFrom: '#7C3AED',
      selectedTo: '#6D28D9',
    },
    selectionBackground: {
      selected: 'rgba(139, 92, 246, 0.15)',
      unselected: 'rgba(60, 60, 60, 0.05)',
    },
    selectedStroke: '#5B21B6',
  },
  orange: {
    gradient: {
      from: '#F97316',
      to: '#EA580C',
      selectedFrom: '#EA580C',
      selectedTo: '#C2410C',
    },
    selectionBackground: {
      selected: 'rgba(249, 115, 22, 0.15)',
      unselected: 'rgba(60, 60, 60, 0.05)',
    },
    selectedStroke: '#9A3412',
  },
  emerald: {
    selectionBackground: {
      selected: 'rgba(16, 185, 129, 0.12)',
      unselected: 'rgba(60, 60, 60, 0.05)',
    },
    selectedStroke: '#065F46',
  },
} as const;

type ChartMargin = {
  top: number;
  right: number;
  left: number;
  bottom: number;
};

const DEFAULT_OPACITY = {
  default: 0.85,
  selected: 1,
  unselected: 0.25,
};

export interface HistogramChartProps<T> {
  data: T[];
  xKey: keyof T;
  yKey: keyof T;
  tooltip: TooltipContent;
  multiSelect: UseChartMultiSelectResult<T>;
  chartClick: HistogramChartClickHandlers;
  theme: HistogramTheme<T>;
  xAxisAngled?: boolean;
  prefersReducedMotion?: boolean;
  margin?: ChartMargin;
  showLabels?: boolean;
  labelContent?: ReactElement;
}

export function HistogramChart<T>({
  data,
  xKey,
  yKey,
  tooltip,
  multiSelect,
  chartClick,
  theme,
  xAxisAngled = true,
  prefersReducedMotion = false,
  margin = CHART_CONFIG.marginCompact,
  showLabels = true,
  labelContent,
}: HistogramChartProps<T>) {
  const rawId = useId();
  const uniqueId = rawId.replace(/:/g, '');
  const baseGradientId = `histogram-${uniqueId}`;
  const selectedGradientId = `histogram-selected-${uniqueId}`;
  const opacity = theme.opacity ?? DEFAULT_OPACITY;

  const renderSelectionBackground = theme.selectionBackground
    ? (props: any) => {
        const index = props.index;
        const isSelected = multiSelect.selectedIndices.has(index);
        const hasSelection = multiSelect.hasSelection;

        if (!hasSelection) return null;

        return (
          <rect
            x={props.x}
            y={0}
            width={props.width}
            height={props.height + props.y}
            fill={
              isSelected
                ? theme.selectionBackground?.selected
                : theme.selectionBackground?.unselected
            }
          />
        );
      }
    : undefined;

  const resolvedLabel = labelContent ?? <BarValueLabel />;

  return (
    <div
      ref={chartClick.containerRef}
      onClick={chartClick.handleContainerClick}
      className="h-full cursor-pointer chart-clickable"
    >
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <BarChart data={data} margin={margin}>
          {theme.gradient && (
            <defs>
              <linearGradient id={baseGradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={theme.gradient.from} stopOpacity={0.8} />
                <stop offset="100%" stopColor={theme.gradient.to} stopOpacity={0.6} />
              </linearGradient>
              <linearGradient id={selectedGradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={theme.gradient.selectedFrom} stopOpacity={1} />
                <stop offset="100%" stopColor={theme.gradient.selectedTo} stopOpacity={1} />
              </linearGradient>
            </defs>
          )}
          <CartesianGrid {...getGridProps()} />
          <XAxis dataKey={String(xKey)} {...getXAxisProps(xAxisAngled)} />
          <YAxis {...getYAxisProps()} />
          <Tooltip content={tooltip} cursor={getTooltipCursorProps()} />
          <Bar
            dataKey={String(yKey)}
            {...getBarProps(!prefersReducedMotion)}
            background={renderSelectionBackground}
          >
            {data.map((entry, index) => {
              const isSelected = multiSelect.selectedIndices.has(index);
              const hasSelection = multiSelect.hasSelection;
              const fill = theme.getFill
                ? theme.getFill(entry, index)
                : theme.gradient
                ? `url(#${isSelected ? selectedGradientId : baseGradientId})`
                : '#10B981';

              return (
                <Cell
                  key={`cell-${index}`}
                  fill={fill}
                  stroke={isSelected ? theme.selectedStroke : 'none'}
                  strokeWidth={isSelected ? theme.selectedStrokeWidth ?? 3 : 0}
                  opacity={
                    hasSelection
                      ? isSelected
                        ? opacity.selected
                        : opacity.unselected
                      : opacity.default
                  }
                  className={theme.cellClassName}
                />
              );
            })}
            {showLabels && <LabelList dataKey={String(yKey)} content={resolvedLabel} />}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
