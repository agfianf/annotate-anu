/**
 * Tag Utility Functions
 * Helpers for filtering, searching, and managing tag selections with categories
 */

import type { Tag, TagCategory } from './data-management-client';

/**
 * Filter categories by search query
 * Returns categories that have at least one tag matching the search
 */
export function filterCategoriesBySearch(
  categories: TagCategory[],
  searchQuery: string
): TagCategory[] {
  if (!searchQuery.trim()) return categories;

  const searchLower = searchQuery.toLowerCase();

  return categories
    .map((cat) => ({
      ...cat,
      tags: cat.tags?.filter((t) => t.name.toLowerCase().includes(searchLower)) || [],
    }))
    .filter((cat) => cat.tags.length > 0);
}

/**
 * Check the selection state for a category
 * Returns whether all, some, or none of the tags are selected
 */
export function getCategorySelectionState(
  category: TagCategory,
  selectedTagIds: string[]
): { all: boolean; some: boolean; none: boolean } {
  const categoryTagIds = category.tags?.map((t) => t.id) || [];

  if (categoryTagIds.length === 0) {
    return { all: false, some: false, none: true };
  }

  const selectedCount = categoryTagIds.filter((id) => selectedTagIds.includes(id)).length;

  return {
    all: selectedCount === categoryTagIds.length,
    some: selectedCount > 0 && selectedCount < categoryTagIds.length,
    none: selectedCount === 0,
  };
}

/**
 * Toggle all tags in a category on or off
 * Returns updated array of selected tag IDs
 */
export function toggleAllTagsInCategory(
  category: TagCategory,
  selectedTagIds: string[],
  shouldSelectAll: boolean
): string[] {
  const categoryTagIds = category.tags?.map((t) => t.id) || [];

  if (shouldSelectAll) {
    // Add all category tags to selection (avoiding duplicates)
    return [...new Set([...selectedTagIds, ...categoryTagIds])];
  } else {
    // Remove all category tags from selection
    return selectedTagIds.filter((id) => !categoryTagIds.includes(id));
  }
}

/**
 * Filter uncategorized tags by search query
 */
export function filterUncategorizedTags(tags: Tag[], searchQuery: string): Tag[] {
  if (!searchQuery.trim()) return tags;

  const searchLower = searchQuery.toLowerCase();
  return tags.filter((t) => t.name.toLowerCase().includes(searchLower));
}
