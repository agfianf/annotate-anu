import { useCallback, useRef } from 'react';
import type { MouseEvent } from 'react';

interface ChartEvent<T> {
  activeTooltipIndex?: number;
  activePayload?: Array<{ payload?: T }>;
}

export function useChartClick<T>(
  data: T[],
  onSelect: (item: T) => void
) {
  const lastIndexRef = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const handleMouseMove = useCallback((state: ChartEvent<T>) => {
    if (typeof state?.activeTooltipIndex === 'number') {
      lastIndexRef.current = state.activeTooltipIndex;
    }
  }, []);

  const handleMouseLeave = useCallback(() => {
    lastIndexRef.current = null;
  }, []);

  const handleClick = useCallback(
    (state: ChartEvent<T>) => {
      const payload = state?.activePayload?.[0]?.payload;
      if (payload) {
        onSelect(payload);
        return;
      }

      const index =
        typeof state?.activeTooltipIndex === 'number'
          ? state.activeTooltipIndex
          : lastIndexRef.current;

      if (index === null || index === undefined) return;
      const item = data[index];
      if (!item) return;
      onSelect(item);
    },
    [data, onSelect]
  );

  const handleContainerClick = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      if (!data.length) return;
      const container = containerRef.current;
      if (!container) return;

      const svg = container.querySelector('svg');
      const rects = Array.from(
        container.querySelectorAll<SVGRectElement>(
          'g.recharts-bar-rectangles rect'
        )
      );

      if (svg && rects.length > 0) {
        const svgRect = svg.getBoundingClientRect();
        const clickX = event.clientX - svgRect.left;

        let closestIndex = 0;
        let closestDistance = Number.POSITIVE_INFINITY;

        rects.forEach((rect, index) => {
          const rectX = parseFloat(rect.getAttribute('x') || '0');
          const rectWidth = parseFloat(rect.getAttribute('width') || '0');
          const centerX = rectX + rectWidth / 2;
          const distance = Math.abs(clickX - centerX);
          if (distance < closestDistance) {
            closestDistance = distance;
            closestIndex = index;
          }
        });

        const item = data[closestIndex];
        if (item) {
          onSelect(item);
        }
        return;
      }

      const containerRect = container.getBoundingClientRect();
      const ratio =
        containerRect.width > 0
          ? (event.clientX - containerRect.left) / containerRect.width
          : 0;
      const index = Math.min(
        data.length - 1,
        Math.max(0, Math.floor(ratio * data.length))
      );
      const item = data[index];
      if (item) {
        onSelect(item);
      }
    },
    [data, onSelect]
  );

  return {
    containerRef,
    handleMouseMove,
    handleMouseLeave,
    handleClick,
    handleContainerClick,
  };
}
