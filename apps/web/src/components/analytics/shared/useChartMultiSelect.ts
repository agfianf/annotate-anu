/**
 * Hook for managing multi-select state in analytics charts
 * Supports single-click select and Ctrl+Click multi-select
 */

import { useState, useCallback } from 'react';

export interface UseChartMultiSelectResult<T> {
  selectedIndices: Set<number>;
  selectedData: T[];
  handleBarClick: (index: number, data: T, event?: React.MouseEvent) => void;
  clearSelection: () => void;
  hasSelection: boolean;
  selectionCount: number;
}

export function useChartMultiSelect<T>(
  chartData: T[]
): UseChartMultiSelectResult<T> {
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());

  const handleBarClick = useCallback(
    (index: number, data: T, event?: React.MouseEvent) => {
      setSelectedIndices((prev) => {
        const newSet = new Set(prev);

        // All clicks toggle selection (additive behavior)
        if (newSet.has(index)) {
          newSet.delete(index);
        } else {
          newSet.add(index);
        }

        return newSet;
      });
    },
    []
  );

  const clearSelection = useCallback(() => {
    setSelectedIndices(new Set());
  }, []);

  const selectedData = Array.from(selectedIndices)
    .sort((a, b) => a - b)
    .map((index) => chartData[index])
    .filter(Boolean);

  return {
    selectedIndices,
    selectedData,
    handleBarClick,
    clearSelection,
    hasSelection: selectedIndices.size > 0,
    selectionCount: selectedIndices.size,
  };
}
