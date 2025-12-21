import { useCallback, useEffect, useState } from 'react';

/**
 * Visibility state for controlling what tags/attributes are displayed on thumbnails
 * This is separate from filtering - it only controls visual display
 */
export interface VisibilityState {
  // Tag visibility by tag_id (true = visible, false = hidden)
  tags: Record<string, boolean>;
  // Category/schema visibility (controls all tags under a category)
  categories: Record<string, boolean>;
  // Metadata field visibility
  metadata: {
    filename: boolean;
    dimensions: boolean;
    fileSize: boolean;
  };
  // Label/annotation visibility by label name
  labels: Record<string, boolean>;
}

const defaultVisibility: VisibilityState = {
  tags: {},
  categories: {},
  metadata: {
    filename: true,
    dimensions: false,
    fileSize: false,
  },
  labels: {},
};

const STORAGE_KEY_PREFIX = 'explore-visibility-';

function getStorageKey(projectId: string): string {
  return `${STORAGE_KEY_PREFIX}${projectId}`;
}

function loadVisibility(projectId: string): VisibilityState {
  try {
    const stored = localStorage.getItem(getStorageKey(projectId));
    if (stored) {
      const parsed = JSON.parse(stored);
      return {
        ...defaultVisibility,
        ...parsed,
        metadata: {
          ...defaultVisibility.metadata,
          ...parsed.metadata,
        },
      };
    }
  } catch (e) {
    console.warn('Failed to load visibility state from localStorage:', e);
  }
  return defaultVisibility;
}

function saveVisibility(projectId: string, visibility: VisibilityState): void {
  try {
    localStorage.setItem(getStorageKey(projectId), JSON.stringify(visibility));
  } catch (e) {
    console.warn('Failed to save visibility state to localStorage:', e);
  }
}

export function useExploreVisibility(projectId: string) {
  const [visibility, setVisibility] = useState<VisibilityState>(() =>
    loadVisibility(projectId)
  );

  // Persist to localStorage on change
  useEffect(() => {
    saveVisibility(projectId, visibility);
  }, [projectId, visibility]);

  // Reload when projectId changes
  useEffect(() => {
    setVisibility(loadVisibility(projectId));
  }, [projectId]);

  /**
   * Toggle visibility for a specific tag
   */
  const toggleTag = useCallback((tagId: string) => {
    setVisibility((prev) => ({
      ...prev,
      tags: {
        ...prev.tags,
        [tagId]: prev.tags[tagId] === false ? true : false,
      },
    }));
  }, []);

  /**
   * Set visibility for a specific tag
   */
  const setTagVisibility = useCallback((tagId: string, visible: boolean) => {
    setVisibility((prev) => ({
      ...prev,
      tags: {
        ...prev.tags,
        [tagId]: visible,
      },
    }));
  }, []);

  /**
   * Toggle visibility for a category (affects all tags in that category)
   */
  const toggleCategory = useCallback((categoryId: string) => {
    setVisibility((prev) => ({
      ...prev,
      categories: {
        ...prev.categories,
        [categoryId]: prev.categories[categoryId] === false ? true : false,
      },
    }));
  }, []);

  /**
   * Set visibility for a category
   */
  const setCategoryVisibility = useCallback((categoryId: string, visible: boolean) => {
    setVisibility((prev) => ({
      ...prev,
      categories: {
        ...prev.categories,
        [categoryId]: visible,
      },
    }));
  }, []);

  /**
   * Toggle visibility for a metadata field
   */
  const toggleMetadata = useCallback((field: keyof VisibilityState['metadata']) => {
    setVisibility((prev) => ({
      ...prev,
      metadata: {
        ...prev.metadata,
        [field]: !prev.metadata[field],
      },
    }));
  }, []);

  /**
   * Toggle visibility for a label
   */
  const toggleLabel = useCallback((labelName: string) => {
    setVisibility((prev) => ({
      ...prev,
      labels: {
        ...prev.labels,
        [labelName]: prev.labels[labelName] === false ? true : false,
      },
    }));
  }, []);

  /**
   * Set visibility for a label
   */
  const setLabelVisibility = useCallback((labelName: string, visible: boolean) => {
    setVisibility((prev) => ({
      ...prev,
      labels: {
        ...prev.labels,
        [labelName]: visible,
      },
    }));
  }, []);

  /**
   * Show all items (reset to default visible state)
   */
  const showAll = useCallback((_allTagIds?: string[], _allCategoryIds?: string[], _allLabelNames?: string[]) => {
    setVisibility({
      tags: {},
      categories: {},
      metadata: {
        filename: true,
        dimensions: true,
        fileSize: true,
      },
      labels: {},
    });
  }, []);

  /**
   * Hide all items
   */
  const hideAll = useCallback((allTagIds?: string[], allCategoryIds?: string[], allLabelNames?: string[]) => {
    setVisibility((prev) => {
      // Get all current tag/category/label IDs and set them to false
      const hiddenTags: Record<string, boolean> = {};
      const hiddenCategories: Record<string, boolean> = {};
      const hiddenLabels: Record<string, boolean> = {};

      // If provided, use all IDs; otherwise fall back to existing keys
      const tagIds = allTagIds || Object.keys(prev.tags);
      const categoryIds = allCategoryIds || Object.keys(prev.categories);
      const labelNames = allLabelNames || Object.keys(prev.labels);

      tagIds.forEach((id) => {
        hiddenTags[id] = false;
      });
      categoryIds.forEach((id) => {
        hiddenCategories[id] = false;
      });
      labelNames.forEach((id) => {
        hiddenLabels[id] = false;
      });

      return {
        tags: hiddenTags,
        categories: hiddenCategories,
        metadata: {
          filename: false,
          dimensions: false,
          fileSize: false,
        },
        labels: hiddenLabels,
      };
    });
  }, []);

  /**
   * Check if a tag is visible
   * Returns true if not explicitly set to false (default is visible)
   */
  const isTagVisible = useCallback(
    (tagId: string, categoryId?: string): boolean => {
      // Check category visibility first (if provided)
      if (categoryId && visibility.categories[categoryId] === false) {
        return false;
      }
      // Check individual tag visibility
      return visibility.tags[tagId] !== false;
    },
    [visibility]
  );

  /**
   * Check if a category is visible
   */
  const isCategoryVisible = useCallback(
    (categoryId: string): boolean => {
      return visibility.categories[categoryId] !== false;
    },
    [visibility]
  );

  /**
   * Check if a label is visible
   */
  const isLabelVisible = useCallback(
    (labelName: string): boolean => {
      return visibility.labels[labelName] !== false;
    },
    [visibility]
  );

  /**
   * Check if metadata field is visible
   */
  const isMetadataVisible = useCallback(
    (field: keyof VisibilityState['metadata']): boolean => {
      return visibility.metadata[field];
    },
    [visibility]
  );

  return {
    visibility,
    setVisibility,
    // Tag operations
    toggleTag,
    setTagVisibility,
    isTagVisible,
    // Category operations
    toggleCategory,
    setCategoryVisibility,
    isCategoryVisible,
    // Metadata operations
    toggleMetadata,
    isMetadataVisible,
    // Label operations
    toggleLabel,
    setLabelVisibility,
    isLabelVisible,
    // Bulk operations
    showAll,
    hideAll,
  };
}

export type UseExploreVisibilityReturn = ReturnType<typeof useExploreVisibility>;
