import { useCallback, useState } from 'react';
import { useDebouncedPersist } from './useDebouncedPersist';
import type { Label } from '../types/annotations';

/**
 * Per-label confidence filter state
 */
export interface LabelConfidenceFilter {
  labelId: string;
  labelName: string;
  labelColor: string;
  minConfidence: number;  // 0-100, default 0
  maxConfidence: number;  // 0-100, default 100
  isVisible: boolean;
}

/**
 * Annotation filters state for confidence filtering per label
 */
export interface AnnotationFiltersState {
  labelFilters: Record<string, LabelConfidenceFilter>;
}

const STORAGE_KEY_PREFIX = 'annotation-filters-';

function getStorageKey(projectId: string): string {
  return `${STORAGE_KEY_PREFIX}${projectId}`;
}

const defaultFiltersState: AnnotationFiltersState = {
  labelFilters: {},
};

function loadFilters(projectId: string): AnnotationFiltersState {
  try {
    const stored = localStorage.getItem(getStorageKey(projectId));
    if (stored) {
      const parsed = JSON.parse(stored);
      return {
        ...defaultFiltersState,
        ...parsed,
      };
    }
  } catch (e) {
    console.warn('Failed to load annotation filters from localStorage:', e);
  }
  return { ...defaultFiltersState };
}

function labelFilterEquals(a: LabelConfidenceFilter, b: LabelConfidenceFilter): boolean {
  return (
    a.labelId === b.labelId &&
    a.labelName === b.labelName &&
    a.labelColor === b.labelColor &&
    a.minConfidence === b.minConfidence &&
    a.maxConfidence === b.maxConfidence &&
    a.isVisible === b.isVisible
  );
}

/**
 * Build the label filter map for `labels`, preserving existing per-label
 * settings and refreshing name/color. Returns `prev` unchanged when nothing
 * differs so callers can skip a state update (and the persist it triggers).
 */
function mergeLabelFilters(
  prev: Record<string, LabelConfidenceFilter>,
  labels: Label[]
): Record<string, LabelConfidenceFilter> {
  const next: Record<string, LabelConfidenceFilter> = {};
  let changed = false;

  labels.forEach((label) => {
    const existing = prev[label.id];
    const merged: LabelConfidenceFilter = existing
      ? { ...existing, labelName: label.name, labelColor: label.color }
      : {
          labelId: label.id,
          labelName: label.name,
          labelColor: label.color,
          minConfidence: 0,
          maxConfidence: 100,
          isVisible: true,
        };
    if (!existing || !labelFilterEquals(existing, merged)) {
      changed = true;
      next[label.id] = merged;
    } else {
      next[label.id] = existing;
    }
  });

  // Labels that disappeared also count as a change
  if (!changed && Object.keys(prev).length !== labels.length) {
    changed = true;
  }

  return changed ? next : prev;
}

/**
 * Hook for managing per-label confidence threshold filtering
 */
export function useAnnotationFilters(projectId: string, labels?: Label[]) {
  const [filters, setFilters] = useState<AnnotationFiltersState>(() =>
    loadFilters(projectId)
  );
  const [loadedProjectId, setLoadedProjectId] = useState(projectId);
  const [syncedLabels, setSyncedLabels] = useState<Label[] | undefined>(undefined);

  // Derived-state updates are done during render (React's "adjust state when a
  // prop changes" pattern) rather than in effects: the component re-renders
  // before commit, so no stale intermediate state is ever persisted.
  let currentFilters = filters;

  // Reload when projectId changes
  if (loadedProjectId !== projectId) {
    currentFilters = loadFilters(projectId);
    setLoadedProjectId(projectId);
    setFilters(currentFilters);
  }

  // Auto-initialize filters when labels are provided/updated
  if (labels !== syncedLabels) {
    setSyncedLabels(labels);
    if (labels && labels.length > 0) {
      const merged = mergeLabelFilters(currentFilters.labelFilters, labels);
      if (merged !== currentFilters.labelFilters) {
        setFilters({ labelFilters: merged });
      }
    }
  }

  // Persist to localStorage on change (trailing debounce, flushed on hide/unmount)
  useDebouncedPersist(getStorageKey(projectId), filters, 300);

  /**
   * Initialize filters from project labels
   * Creates a filter entry for each label with default values
   */
  const initializeFromLabels = useCallback((labels: Label[]) => {
    setFilters((prev) => {
      const merged = mergeLabelFilters(prev.labelFilters, labels);
      return merged === prev.labelFilters ? prev : { labelFilters: merged };
    });
  }, []);

  /**
   * Set confidence range for a specific label
   */
  const setConfidenceRange = useCallback((labelId: string, min: number, max: number) => {
    setFilters((prev) => ({
      ...prev,
      labelFilters: {
        ...prev.labelFilters,
        [labelId]: {
          ...prev.labelFilters[labelId],
          minConfidence: Math.max(0, Math.min(100, min)),
          maxConfidence: Math.max(0, Math.min(100, max)),
        },
      },
    }));
  }, []);

  /**
   * Toggle visibility for a specific label's annotations
   */
  const toggleLabelVisibility = useCallback((labelId: string) => {
    setFilters((prev) => ({
      ...prev,
      labelFilters: {
        ...prev.labelFilters,
        [labelId]: {
          ...prev.labelFilters[labelId],
          isVisible: !prev.labelFilters[labelId]?.isVisible,
        },
      },
    }));
  }, []);

  /**
   * Set visibility for a specific label
   */
  const setLabelVisibility = useCallback((labelId: string, visible: boolean) => {
    setFilters((prev) => ({
      ...prev,
      labelFilters: {
        ...prev.labelFilters,
        [labelId]: {
          ...prev.labelFilters[labelId],
          isVisible: visible,
        },
      },
    }));
  }, []);

  /**
   * Show all labels (set all to visible)
   */
  const showAllLabels = useCallback(() => {
    setFilters((prev) => {
      const newLabelFilters: Record<string, LabelConfidenceFilter> = {};
      Object.entries(prev.labelFilters).forEach(([id, filter]) => {
        newLabelFilters[id] = { ...filter, isVisible: true };
      });
      return { labelFilters: newLabelFilters };
    });
  }, []);

  /**
   * Hide all labels (set all to hidden)
   */
  const hideAllLabels = useCallback(() => {
    setFilters((prev) => {
      const newLabelFilters: Record<string, LabelConfidenceFilter> = {};
      Object.entries(prev.labelFilters).forEach(([id, filter]) => {
        newLabelFilters[id] = { ...filter, isVisible: false };
      });
      return { labelFilters: newLabelFilters };
    });
  }, []);

  /**
   * Reset all confidence filters to default (0-100%)
   */
  const resetAllFilters = useCallback(() => {
    setFilters((prev) => {
      const newLabelFilters: Record<string, LabelConfidenceFilter> = {};
      Object.entries(prev.labelFilters).forEach(([id, filter]) => {
        newLabelFilters[id] = {
          ...filter,
          minConfidence: 0,
          maxConfidence: 100,
          isVisible: true,
        };
      });
      return { labelFilters: newLabelFilters };
    });
  }, []);

  /**
   * Check if an annotation should be shown based on label and confidence
   * @param labelId The label ID of the annotation (optional)
   * @param confidence The confidence score (0-1 range, optional)
   * @returns true if the annotation should be displayed
   */
  const shouldShowAnnotation = useCallback(
    (labelId?: string, confidence?: number): boolean => {
      // If no labelId provided, show by default
      if (!labelId) return true;

      const filter = filters.labelFilters[labelId];

      // If no filter exists for this label, show by default
      if (!filter) return true;

      // Check visibility toggle
      if (!filter.isVisible) return false;

      // Check confidence threshold (convert 0-1 to 0-100)
      if (confidence != null) {
        const confidencePercent = confidence * 100;
        if (confidencePercent < filter.minConfidence || confidencePercent > filter.maxConfidence) {
          return false;
        }
      }

      return true;
    },
    [filters]
  );

  /**
   * Get visibility state for the entire annotations section
   * Returns true if all visible, false if all hidden, 'partial' if mixed
   */
  const isAnnotationsSectionVisible = useCallback((): boolean | 'partial' => {
    const filterValues = Object.values(filters.labelFilters);
    if (filterValues.length === 0) return true;

    const visibleCount = filterValues.filter((f) => f.isVisible).length;
    if (visibleCount === filterValues.length) return true;
    if (visibleCount === 0) return false;
    return 'partial';
  }, [filters]);

  /**
   * Check if any filters are active (confidence ranges != 0-100% or any label hidden)
   */
  const hasActiveFilters = useCallback((): boolean => {
    const filterValues = Object.values(filters.labelFilters);
    return filterValues.some(
      (f) => f.minConfidence !== 0 || f.maxConfidence !== 100 || !f.isVisible
    );
  }, [filters]);

  /**
   * Toggle all labels visibility (if any visible, hide all; otherwise show all)
   */
  const toggleAnnotationsSection = useCallback(() => {
    const filterValues = Object.values(filters.labelFilters);
    const anyVisible = filterValues.some((f) => f.isVisible);

    if (anyVisible) {
      hideAllLabels();
    } else {
      showAllLabels();
    }
  }, [filters, hideAllLabels, showAllLabels]);

  return {
    filters,
    labelFilters: filters.labelFilters,
    // Initialization
    initializeFromLabels,
    // Per-label operations
    setConfidenceRange,
    toggleLabelVisibility,
    setLabelVisibility,
    // Bulk operations
    showAllLabels,
    hideAllLabels,
    resetAllFilters,
    // Filter function
    shouldShowAnnotation,
    // Section-level
    isAnnotationsSectionVisible,
    toggleAnnotationsSection,
    hasActiveFilters,
  };
}

export type UseAnnotationFiltersReturn = ReturnType<typeof useAnnotationFilters>;
