import { useCallback, useEffect, useState } from 'react';

/**
 * Metadata field visibility with color support
 */
export interface MetadataFieldState {
  visible: boolean;
  color: string;
}

/**
 * All supported metadata field keys
 */
export type MetadataFieldKey = 'filename' | 'width' | 'height' | 'fileSize' | 'imageId' | 'filepath';

/**
 * Stroke width levels for annotation overlay
 */
export type StrokeWidthLevel = 'thin' | 'normal' | 'medium' | 'thick' | 'extra-thick';

/**
 * Fill opacity levels for annotation overlay
 */
export type FillOpacityLevel = 'none' | 'light' | 'medium' | 'strong' | 'solid';

/**
 * Dim levels for highlight mode (image dimming)
 */
export type DimLevel = 'subtle' | 'medium' | 'strong';

/**
 * Annotation display options for thumbnails
 */
export interface AnnotationDisplayState {
  strokeWidth: StrokeWidthLevel;
  showLabels: boolean;
  showBboxes: boolean;
  showPolygons: boolean;
  fillOpacity: FillOpacityLevel;
  highlightMode: boolean;
  dimLevel: DimLevel;
}

/**
 * Visibility state for controlling what tags/attributes are displayed on thumbnails
 * This is separate from filtering - it only controls visual display
 */
export interface VisibilityState {
  // Tag visibility by tag_id (true = visible, false = hidden)
  tags: Record<string, boolean>;
  // Category/schema visibility (controls all tags under a category)
  categories: Record<string, boolean>;
  // Metadata field visibility with color
  metadata: Record<MetadataFieldKey, MetadataFieldState>;
  // Label/annotation visibility by label name
  labels: Record<string, boolean>;
  // Annotation display options (stroke width, labels, fill)
  annotationDisplay: AnnotationDisplayState;
}

// Default color for metadata fields
const DEFAULT_METADATA_COLOR = '#10B981'; // emerald-500

const defaultMetadataState: Record<MetadataFieldKey, MetadataFieldState> = {
  filename: { visible: true, color: DEFAULT_METADATA_COLOR },
  width: { visible: false, color: DEFAULT_METADATA_COLOR },
  height: { visible: false, color: DEFAULT_METADATA_COLOR },
  fileSize: { visible: false, color: DEFAULT_METADATA_COLOR },
  imageId: { visible: false, color: DEFAULT_METADATA_COLOR },
  filepath: { visible: false, color: DEFAULT_METADATA_COLOR },
};

const defaultAnnotationDisplay: AnnotationDisplayState = {
  strokeWidth: 'normal',
  showLabels: false,
  showBboxes: true,
  showPolygons: true,
  fillOpacity: 'none',
  highlightMode: false,
  dimLevel: 'medium',
};

const defaultVisibility: VisibilityState = {
  tags: {},
  categories: {},
  metadata: { ...defaultMetadataState },
  labels: {},
  annotationDisplay: { ...defaultAnnotationDisplay },
};

const STORAGE_KEY_PREFIX = 'explore-visibility-';

function getStorageKey(projectId: string): string {
  return `${STORAGE_KEY_PREFIX}${projectId}`;
}

/**
 * Migrate old boolean metadata format to new object format with colors
 */
function migrateMetadata(
  oldMetadata: Record<string, boolean | MetadataFieldState> | undefined
): Record<MetadataFieldKey, MetadataFieldState> {
  if (!oldMetadata) {
    return { ...defaultMetadataState };
  }

  const migrated: Record<MetadataFieldKey, MetadataFieldState> = { ...defaultMetadataState };

  for (const key of Object.keys(oldMetadata) as MetadataFieldKey[]) {
    const value = oldMetadata[key];
    if (typeof value === 'boolean') {
      // Old format: boolean - migrate to new format
      migrated[key] = {
        visible: value,
        color: DEFAULT_METADATA_COLOR,
      };
    } else if (value && typeof value === 'object' && 'visible' in value) {
      // New format: already an object
      migrated[key] = {
        visible: value.visible,
        color: value.color || DEFAULT_METADATA_COLOR,
      };
    }
  }

  return migrated;
}

function loadVisibility(projectId: string): VisibilityState {
  try {
    const stored = localStorage.getItem(getStorageKey(projectId));
    if (stored) {
      const parsed = JSON.parse(stored);
      return {
        ...defaultVisibility,
        ...parsed,
        metadata: migrateMetadata(parsed.metadata),
        annotationDisplay: {
          ...defaultAnnotationDisplay,
          ...(parsed.annotationDisplay || {}),
        },
      };
    }
  } catch (e) {
    console.warn('Failed to load visibility state from localStorage:', e);
  }
  return {
    ...defaultVisibility,
    metadata: { ...defaultMetadataState },
    annotationDisplay: { ...defaultAnnotationDisplay },
  };
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
  const toggleMetadata = useCallback((field: MetadataFieldKey) => {
    setVisibility((prev) => ({
      ...prev,
      metadata: {
        ...prev.metadata,
        [field]: {
          ...prev.metadata[field],
          visible: !prev.metadata[field].visible,
        },
      },
    }));
  }, []);

  /**
   * Set color for a metadata field
   */
  const setMetadataColor = useCallback((field: MetadataFieldKey, color: string) => {
    setVisibility((prev) => ({
      ...prev,
      metadata: {
        ...prev.metadata,
        [field]: {
          ...prev.metadata[field],
          color,
        },
      },
    }));
  }, []);

  /**
   * Get color for a metadata field
   */
  const getMetadataColor = useCallback(
    (field: MetadataFieldKey): string => {
      return visibility.metadata[field]?.color || DEFAULT_METADATA_COLOR;
    },
    [visibility]
  );

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
    setVisibility((prev) => ({
      tags: {},
      categories: {},
      metadata: {
        filename: { visible: true, color: prev.metadata.filename?.color || DEFAULT_METADATA_COLOR },
        width: { visible: true, color: prev.metadata.width?.color || DEFAULT_METADATA_COLOR },
        height: { visible: true, color: prev.metadata.height?.color || DEFAULT_METADATA_COLOR },
        fileSize: { visible: true, color: prev.metadata.fileSize?.color || DEFAULT_METADATA_COLOR },
        imageId: { visible: true, color: prev.metadata.imageId?.color || DEFAULT_METADATA_COLOR },
        filepath: { visible: true, color: prev.metadata.filepath?.color || DEFAULT_METADATA_COLOR },
      },
      labels: {},
      annotationDisplay: prev.annotationDisplay,
    }));
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
          filename: { visible: false, color: prev.metadata.filename?.color || DEFAULT_METADATA_COLOR },
          width: { visible: false, color: prev.metadata.width?.color || DEFAULT_METADATA_COLOR },
          height: { visible: false, color: prev.metadata.height?.color || DEFAULT_METADATA_COLOR },
          fileSize: { visible: false, color: prev.metadata.fileSize?.color || DEFAULT_METADATA_COLOR },
          imageId: { visible: false, color: prev.metadata.imageId?.color || DEFAULT_METADATA_COLOR },
          filepath: { visible: false, color: prev.metadata.filepath?.color || DEFAULT_METADATA_COLOR },
        },
        labels: hiddenLabels,
        annotationDisplay: prev.annotationDisplay,
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
    (field: MetadataFieldKey): boolean => {
      return visibility.metadata[field]?.visible ?? false;
    },
    [visibility]
  );

  /**
   * Set stroke width for annotation overlay
   */
  const setStrokeWidth = useCallback((level: StrokeWidthLevel) => {
    setVisibility((prev) => ({
      ...prev,
      annotationDisplay: {
        ...prev.annotationDisplay,
        strokeWidth: level,
      },
    }));
  }, []);

  /**
   * Toggle show labels on annotations
   */
  const toggleShowLabels = useCallback(() => {
    setVisibility((prev) => ({
      ...prev,
      annotationDisplay: {
        ...prev.annotationDisplay,
        showLabels: !prev.annotationDisplay.showLabels,
      },
    }));
  }, []);

  /**
   * Toggle show bboxes
   */
  const toggleShowBboxes = useCallback(() => {
    setVisibility((prev) => ({
      ...prev,
      annotationDisplay: {
        ...prev.annotationDisplay,
        showBboxes: !prev.annotationDisplay.showBboxes,
      },
    }));
  }, []);

  /**
   * Toggle show polygons
   */
  const toggleShowPolygons = useCallback(() => {
    setVisibility((prev) => ({
      ...prev,
      annotationDisplay: {
        ...prev.annotationDisplay,
        showPolygons: !prev.annotationDisplay.showPolygons,
      },
    }));
  }, []);

  /**
   * Set fill opacity level
   */
  const setFillOpacity = useCallback((level: FillOpacityLevel) => {
    setVisibility((prev) => ({
      ...prev,
      annotationDisplay: {
        ...prev.annotationDisplay,
        fillOpacity: level,
      },
    }));
  }, []);

  /**
   * Toggle highlight mode (dim image, spotlight annotations)
   */
  const toggleHighlightMode = useCallback(() => {
    setVisibility((prev) => ({
      ...prev,
      annotationDisplay: {
        ...prev.annotationDisplay,
        highlightMode: !prev.annotationDisplay.highlightMode,
      },
    }));
  }, []);

  /**
   * Set dim level for highlight mode
   */
  const setDimLevel = useCallback((level: DimLevel) => {
    setVisibility((prev) => ({
      ...prev,
      annotationDisplay: {
        ...prev.annotationDisplay,
        dimLevel: level,
      },
    }));
  }, []);

  // ============================================
  // SECTION-LEVEL & CASCADING VISIBILITY TOGGLES
  // ============================================

  /**
   * Toggle visibility for a category AND cascade to all its child tags.
   * This syncs the visibility state of all children with the parent.
   */
  const toggleCategoryWithChildren = useCallback(
    (categoryId: string, tagIds: string[]) => {
      setVisibility((prev) => {
        // Determine new state: if category is currently visible (or not set), hide it; otherwise show it
        const newCategoryVisible = prev.categories[categoryId] === false ? true : false;
        const newTags = { ...prev.tags };
        tagIds.forEach((id) => {
          newTags[id] = newCategoryVisible;
        });
        return {
          ...prev,
          categories: { ...prev.categories, [categoryId]: newCategoryVisible },
          tags: newTags,
        };
      });
    },
    []
  );

  /**
   * Toggle visibility for all uncategorized tags (TAGS section).
   * If any tag is visible, hide all; otherwise show all.
   */
  const toggleTagsSection = useCallback((tagIds: string[]) => {
    setVisibility((prev) => {
      // Check if any tag is visible (not explicitly set to false)
      const anyVisible = tagIds.some((id) => prev.tags[id] !== false);
      const newTags = { ...prev.tags };
      tagIds.forEach((id) => {
        newTags[id] = !anyVisible;
      });
      return { ...prev, tags: newTags };
    });
  }, []);

  /**
   * Toggle visibility for all categories and their child tags (LABELS section).
   * If any category is visible, hide all; otherwise show all.
   */
  const toggleLabelsSection = useCallback(
    (categories: Array<{ id: string; tagIds: string[] }>) => {
      setVisibility((prev) => {
        // Check if any category is visible (not explicitly set to false)
        const anyVisible = categories.some(
          (cat) => prev.categories[cat.id] !== false
        );
        const newCategories = { ...prev.categories };
        const newTags = { ...prev.tags };
        categories.forEach((cat) => {
          newCategories[cat.id] = !anyVisible;
          cat.tagIds.forEach((tagId) => {
            newTags[tagId] = !anyVisible;
          });
        });
        return { ...prev, categories: newCategories, tags: newTags };
      });
    },
    []
  );

  /**
   * Toggle visibility for all metadata fields (METADATA section).
   * If any field is visible, hide all; otherwise show all.
   */
  const toggleMetadataSection = useCallback(() => {
    setVisibility((prev) => {
      const fields: MetadataFieldKey[] = ['filename', 'width', 'height', 'fileSize', 'imageId', 'filepath'];
      const anyVisible = fields.some((f) => prev.metadata[f]?.visible);
      const newMetadata = { ...prev.metadata };
      fields.forEach((f) => {
        newMetadata[f] = { ...newMetadata[f], visible: !anyVisible };
      });
      return { ...prev, metadata: newMetadata };
    });
  }, []);

  /**
   * Check visibility state for TAGS section (uncategorized tags).
   * Returns true if all visible, false if all hidden, 'partial' if mixed.
   */
  const isTagsSectionVisible = useCallback(
    (tagIds: string[]): boolean | 'partial' => {
      if (tagIds.length === 0) return true;
      const visibleCount = tagIds.filter((id) => visibility.tags[id] !== false).length;
      if (visibleCount === tagIds.length) return true;
      if (visibleCount === 0) return false;
      return 'partial';
    },
    [visibility]
  );

  /**
   * Check visibility state for LABELS section (all categories).
   * Returns true if all visible, false if all hidden, 'partial' if mixed.
   */
  const isLabelsSectionVisible = useCallback(
    (categoryIds: string[]): boolean | 'partial' => {
      if (categoryIds.length === 0) return true;
      const visibleCount = categoryIds.filter(
        (id) => visibility.categories[id] !== false
      ).length;
      if (visibleCount === categoryIds.length) return true;
      if (visibleCount === 0) return false;
      return 'partial';
    },
    [visibility]
  );

  /**
   * Check visibility state for METADATA section.
   * Returns true if all visible, false if all hidden, 'partial' if mixed.
   */
  const isMetadataSectionVisible = useCallback((): boolean | 'partial' => {
    const fields: MetadataFieldKey[] = ['filename', 'width', 'height', 'fileSize', 'imageId', 'filepath'];
    const visibleCount = fields.filter((f) => visibility.metadata[f]?.visible).length;
    if (visibleCount === fields.length) return true;
    if (visibleCount === 0) return false;
    return 'partial';
  }, [visibility]);

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
    setMetadataColor,
    getMetadataColor,
    // Label operations
    toggleLabel,
    setLabelVisibility,
    isLabelVisible,
    // Bulk operations
    showAll,
    hideAll,
    // Annotation display operations
    setStrokeWidth,
    toggleShowLabels,
    toggleShowBboxes,
    toggleShowPolygons,
    setFillOpacity,
    toggleHighlightMode,
    setDimLevel,
    // Section-level & cascading visibility toggles
    toggleCategoryWithChildren,
    toggleTagsSection,
    toggleLabelsSection,
    toggleMetadataSection,
    isTagsSectionVisible,
    isLabelsSectionVisible,
    isMetadataSectionVisible,
  };
}

export type UseExploreVisibilityReturn = ReturnType<typeof useExploreVisibility>;
