import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Database, Eye, EyeOff, Layers, RefreshCw, Tag, Trash2 } from 'lucide-react';
import { useState, useRef, useCallback, useEffect } from 'react';
import type { UseExploreVisibilityReturn } from '@/hooks/useExploreVisibility';
import type { ExploreFiltersState } from '@/hooks/useExploreFilters';
import { tagsApi, tagCategoriesApi } from '@/lib/data-management-client';
import { UnifiedSidebarRow } from './UnifiedSidebarRow';
import { UnifiedSidebarSection } from './UnifiedSidebarSection';
import { TagCreationInline } from './TagCreationInline';
import { CategoryCreationInline } from './CategoryCreationInline';
import { CategoryConfigPanel } from './CategoryConfigPanel';
import { FilterModeSelector } from './FilterModeSelector';

interface UnifiedExploreSidebarProps {
  projectId: string;
  filters: ExploreFiltersState;
  onToggleTag: (tagId: string) => void;
  setIncludeMatchMode: (mode: 'AND' | 'OR') => void;
  setExcludeMatchMode: (mode: 'AND' | 'OR') => void;
  visibility: UseExploreVisibilityReturn;
}

type ActiveForm = 'tag' | 'category' | `cat-${string}` | null;

const MIN_SIDEBAR_WIDTH = 240; // 60 * 4 = 240px (w-60)
const MAX_SIDEBAR_WIDTH = 480; // 120 * 4 = 480px (w-120)
const DEFAULT_SIDEBAR_WIDTH = 288; // 72 * 4 = 288px (w-72)

export function UnifiedExploreSidebar({
  projectId,
  filters,
  onToggleTag,
  setIncludeMatchMode,
  setExcludeMatchMode,
  visibility,
}: UnifiedExploreSidebarProps) {
  const queryClient = useQueryClient();
  const [activeForm, setActiveForm] = useState<ActiveForm>(null);
  const [configPanelOpen, setConfigPanelOpen] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{
    categoryId: string;
    categoryName: string;
    tagCount: number;
  } | null>(null);

  // Sidebar resize state
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem('exploreSidebarWidth');
    return saved ? parseInt(saved, 10) : DEFAULT_SIDEBAR_WIDTH;
  });
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);

  // Save width to localStorage when it changes
  useEffect(() => {
    localStorage.setItem('exploreSidebarWidth', sidebarWidth.toString());
  }, [sidebarWidth]);

  // Mouse handlers for resizing
  const startResizing = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  const stopResizing = useCallback(() => {
    setIsResizing(false);
  }, []);

  const resize = useCallback(
    (e: MouseEvent) => {
      if (isResizing && sidebarRef.current) {
        const newWidth = e.clientX - sidebarRef.current.getBoundingClientRect().left;
        if (newWidth >= MIN_SIDEBAR_WIDTH && newWidth <= MAX_SIDEBAR_WIDTH) {
          setSidebarWidth(newWidth);
        }
      }
    },
    [isResizing]
  );

  useEffect(() => {
    if (isResizing) {
      window.addEventListener('mousemove', resize);
      window.addEventListener('mouseup', stopResizing);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';

      return () => {
        window.removeEventListener('mousemove', resize);
        window.removeEventListener('mouseup', stopResizing);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      };
    }
  }, [isResizing, resize, stopResizing]);

  // Fetch uncategorized tags
  const {
    data: uncategorizedTags,
    isLoading: tagsLoading,
    refetch: refetchTags,
    isRefetching: tagsRefetching,
  } = useQuery({
    queryKey: ['tags', projectId, 'uncategorized'],
    queryFn: () => tagsApi.listUncategorized(Number(projectId)),
    staleTime: 30000,
  });

  // Fetch categories with nested tags
  const {
    data: categories,
    isLoading: categoriesLoading,
    refetch: refetchCategories,
    isRefetching: categoriesRefetching,
  } = useQuery({
    queryKey: ['tag-categories', projectId],
    queryFn: () => tagCategoriesApi.listWithTags(Number(projectId)),
    staleTime: 30000,
  });

  const isLoading = tagsLoading || categoriesLoading;
  const isRefetching = tagsRefetching || categoriesRefetching;

  // Mutations for creating tags
  const createTagMutation = useMutation({
    mutationFn: async (data: { name: string; color: string; category_id?: string | null }) => {
      const createData = {
        name: data.name,
        color: data.color,
        category_id: data.category_id ?? undefined,
      };
      return tagsApi.create(Number(projectId), createData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tags', projectId] });
      queryClient.invalidateQueries({ queryKey: ['tag-categories', projectId] });
      setActiveForm(null);
    },
  });

  // Mutation for creating categories
  const createCategoryMutation = useMutation({
    mutationFn: async (data: { name: string; display_name: string; color: string }) =>
      tagCategoriesApi.create(Number(projectId), data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tag-categories', projectId] });
      setActiveForm(null);
    },
  });

  // Mutation for deleting tags
  const deleteTagMutation = useMutation({
    mutationFn: async (tagId: string) => tagsApi.delete(Number(projectId), tagId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tags', projectId] });
      queryClient.invalidateQueries({ queryKey: ['tag-categories', projectId] });
      // Invalidate images query to refresh tag associations on thumbnails
      queryClient.invalidateQueries({ queryKey: ['project-explore-infinite'] });
    },
  });

  // Mutation for deleting categories (and their tags)
  const deleteCategoryMutation = useMutation({
    mutationFn: async (data: { categoryId: string; tagIds: string[] }) => {
      // First delete all tags in the category
      await Promise.all(
        data.tagIds.map(tagId => tagsApi.delete(Number(projectId), tagId))
      );
      // Then delete the category
      await tagCategoriesApi.delete(Number(projectId), data.categoryId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tag-categories', projectId] });
      queryClient.invalidateQueries({ queryKey: ['tags', projectId] });
      // Invalidate images query to refresh tag associations on thumbnails
      queryClient.invalidateQueries({ queryKey: ['project-explore-infinite'] });
      setDeleteConfirm(null);
    },
  });

  // Mutation for updating categories
  const updateCategoryMutation = useMutation({
    mutationFn: async (data: { categoryId: string; name?: string; color?: string }) => {
      const { categoryId, ...updateData } = data;
      return tagCategoriesApi.update(Number(projectId), categoryId, updateData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tag-categories', projectId] });
      setConfigPanelOpen(null);
    },
  });

  const handleRefresh = () => {
    refetchTags();
    refetchCategories();
  };

  // Handler for opening config panel
  const handleOpenConfig = (categoryId: string) => {
    setConfigPanelOpen(categoryId);
  };

  // Handler for closing config panel
  const handleCloseConfig = () => {
    setConfigPanelOpen(null);
  };

  // Handler for updating category
  const handleUpdateCategory = (categoryId: string, data: { name?: string; color?: string }) => {
    updateCategoryMutation.mutate({ categoryId, ...data });
  };

  // Handler for batch creating tags
  const handleBatchCreateTags = async (categoryId: string, tags: Array<{ name: string; color: string }>) => {
    const promises = tags.map(tag =>
      tagsApi.create(Number(projectId), {
        name: tag.name,
        color: tag.color,
        category_id: categoryId,
      })
    );

    await Promise.all(promises);
    queryClient.invalidateQueries({ queryKey: ['tags', projectId] });
    queryClient.invalidateQueries({ queryKey: ['tag-categories', projectId] });
  };

  // Handler for confirming category deletion
  const handleConfirmDeleteCategory = () => {
    if (deleteConfirm) {
      const tagIds = categories
        ?.find(cat => cat.id === deleteConfirm.categoryId)
        ?.tags?.map(tag => tag.id) || [];
      deleteCategoryMutation.mutate({
        categoryId: deleteConfirm.categoryId,
        tagIds,
      });
    }
  };

  // Get the filter mode for a category (based on all its tags)
  const getTagFilterMode = (tags: Array<{ id: string }> | undefined): 'idle' | 'include' | 'exclude' | 'mixed' => {
    if (!tags || tags.length === 0) return 'idle';

    const modes = tags.map(tag => filters.tagFilters[tag.id] || 'idle');
    const allInclude = modes.every(m => m === 'include');
    const allExclude = modes.every(m => m === 'exclude');
    const allIdle = modes.every(m => m === 'idle');

    if (allInclude) return 'include';
    if (allExclude) return 'exclude';
    if (allIdle) return 'idle';
    return 'mixed';
  };

  // Toggle all tags in a category (tri-state cycle)
  const handleToggleCategoryFilter = (tags: Array<{ id: string }> | undefined) => {
    if (!tags || tags.length === 0) return;

    const currentMode = getTagFilterMode(tags);

    tags.forEach((tag) => {
      const currentTagMode = filters.tagFilters[tag.id] || 'idle';

      if (currentMode === 'idle' || currentMode === 'mixed') {
        // Set all to include
        if (currentTagMode !== 'include') onToggleTag(tag.id);
      } else if (currentMode === 'include') {
        // Set all to exclude
        onToggleTag(tag.id);
      } else {
        // Set all to idle
        if (currentTagMode === 'exclude') onToggleTag(tag.id);
      }
    });
  };

  // Metadata fields (hardcoded)
  const metadataFields = [
    { name: 'filename', color: '#6B7280' },
    { name: 'dimensions', color: '#6B7280' },
    { name: 'fileSize', color: '#6B7280' },
  ];

  const totalTags = (uncategorizedTags?.length || 0) +
    (categories?.reduce((sum, cat) => sum + (cat.tags?.length || 0), 0) || 0);

  // Collect all tag and category IDs for bulk operations
  const handleShowAll = () => {
    const allTagIds: string[] = [];
    const allCategoryIds: string[] = [];

    // Collect uncategorized tags
    if (uncategorizedTags) {
      allTagIds.push(...uncategorizedTags.map(tag => tag.id));
    }

    // Collect categories and their tags
    if (categories) {
      categories.forEach(category => {
        if (category.id) {
          allCategoryIds.push(category.id);
          if (category.tags) {
            allTagIds.push(...category.tags.map(tag => tag.id));
          }
        }
      });
    }

    visibility.showAll(allTagIds, allCategoryIds);
  };

  const handleHideAll = () => {
    const allTagIds: string[] = [];
    const allCategoryIds: string[] = [];

    // Collect uncategorized tags
    if (uncategorizedTags) {
      allTagIds.push(...uncategorizedTags.map(tag => tag.id));
    }

    // Collect categories and their tags
    if (categories) {
      categories.forEach(category => {
        if (category.id) {
          allCategoryIds.push(category.id);
          if (category.tags) {
            allTagIds.push(...category.tags.map(tag => tag.id));
          }
        }
      });
    }

    visibility.hideAll(allTagIds, allCategoryIds);
  };

  return (
    <div
      ref={sidebarRef}
      className="h-full flex flex-col bg-white/80 backdrop-blur-xl border-r border-orange-100 shadow-2xl font-sans text-sm text-slate-700 relative"
      style={{ width: `${sidebarWidth}px`, minWidth: `${MIN_SIDEBAR_WIDTH}px`, maxWidth: `${MAX_SIDEBAR_WIDTH}px` }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-orange-100 bg-orange-50/30 backdrop-blur-xl">
        <div className="flex items-center gap-2">
          <div className="p-1 border border-orange-200 bg-white/50 rounded-sm">
            <Layers className="h-3 w-3 text-orange-600" />
          </div>
          <h2 className="font-mono text-xs font-bold text-orange-900 tracking-widest uppercase">
            Explore
          </h2>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleRefresh}
            disabled={isRefetching}
            className="p-1.5 text-orange-600/60 hover:text-orange-700 hover:bg-orange-100 rounded-sm transition-all disabled:opacity-50"
            title="Refresh"
          >
            <RefreshCw className={`h-3 w-3 ${isRefetching ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={handleShowAll}
            className="p-1.5 text-orange-600/60 hover:text-orange-700 hover:bg-orange-100 rounded-sm transition-all"
            title="Show all"
          >
            <Eye className="h-3 w-3" />
          </button>
          <button
            onClick={handleHideAll}
            className="p-1.5 text-orange-600/60 hover:text-orange-700 hover:bg-orange-100 rounded-sm transition-all"
            title="Hide all"
          >
            <EyeOff className="h-3 w-3" />
          </button>
        </div>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-orange-200 scrollbar-track-transparent">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <RefreshCw className="h-4 w-4 text-orange-300 animate-spin" />
          </div>
        ) : (
          <div className="divide-y divide-orange-50">
            {/* Match Mode Selector - shows only when tags are filtered */}
            <FilterModeSelector
              includeMode={filters.includeMatchMode}
              excludeMode={filters.excludeMatchMode}
              onIncludeModeChange={setIncludeMatchMode}
              onExcludeModeChange={setExcludeMatchMode}
              hasIncludedTags={Object.values(filters.tagFilters).some(m => m === 'include')}
              hasExcludedTags={Object.values(filters.tagFilters).some(m => m === 'exclude')}
            />

            {/* TAGS Section (Uncategorized) */}
            <UnifiedSidebarSection
              title="Tags"
              icon={<Tag className="h-3.5 w-3.5 text-orange-500" />}
              color="#F97316"
              count={uncategorizedTags?.length}
              showAddButton
              onAddClick={() => setActiveForm('tag')}
            >
              {uncategorizedTags && uncategorizedTags.length > 0 ? (
                <div className="space-y-0.5 max-h-96 overflow-y-auto">
                  {uncategorizedTags.map((tag) => (
                    <UnifiedSidebarRow
                      key={tag.id}
                      name={tag.name}
                      color={tag.color}
                      count={tag.usage_count}
                      filterMode={filters.tagFilters[tag.id] || 'idle'}
                      isVisible={visibility.isTagVisible(tag.id)}
                      onToggleFilter={() => onToggleTag(tag.id)}
                      onToggleVisibility={() => visibility.toggleTag(tag.id)}
                      actions={[
                        {
                          label: 'Delete',
                          icon: <Trash2 className="w-3.5 h-3.5" />,
                          onClick: () => deleteTagMutation.mutate(tag.id),
                          variant: 'danger',
                        },
                      ]}
                    />
                  ))}
                </div>
              ) : (
                <p className="text-xs text-orange-900/50 py-2 px-3">No uncategorized tags</p>
              )}

              {/* Inline Tag Creation Form */}
              {activeForm === 'tag' && (
                <TagCreationInline
                  onCreate={(name, color) => createTagMutation.mutate({ name, color, category_id: null })}
                  onCancel={() => setActiveForm(null)}
                />
              )}
            </UnifiedSidebarSection>

            {/* LABELS Section (Categorized Tags) */}
            <UnifiedSidebarSection
              title="Labels"
              icon={<Layers className="h-3.5 w-3.5 text-blue-500" />}
              color="#3B82F6"
              count={categories?.filter(cat => cat.id !== null).length}
              showAddButton
              onAddClick={() => setActiveForm('category')}
            >
              {categories && categories.length > 0 ? (
                <div className="space-y-0.5 max-h-96 overflow-y-auto">
                  {categories.map((category) => {
                    // Skip virtual uncategorized category (id is null)
                    if (!category.id) return null;

                    // Store non-null category.id for type safety
                    const categoryId = category.id;

                    return (
                      <div key={categoryId} className="space-y-0.5">
                        <UnifiedSidebarRow
                          name={category.display_name || category.name}
                          color={category.color}
                          count={category.tags?.length}
                          filterMode={getTagFilterMode(category.tags)}
                          isVisible={visibility.isCategoryVisible(categoryId)}
                          onToggleFilter={() => handleToggleCategoryFilter(category.tags)}
                          onToggleVisibility={() => visibility.toggleCategory(categoryId)}
                          expandable={true}
                          showAddButton={true}
                          onAddClick={() => setActiveForm(`cat-${categoryId}`)}
                          showConfigButton={true}
                          onConfigClick={() => handleOpenConfig(categoryId)}
                          configPanelContent={
                            configPanelOpen === categoryId ? (
                              <CategoryConfigPanel
                                categoryId={categoryId}
                                category={category}
                                projectId={projectId}
                                onUpdate={(data) => handleUpdateCategory(categoryId, data)}
                                onClose={handleCloseConfig}
                                onCreateTags={(tags) => handleBatchCreateTags(categoryId, tags)}
                              />
                            ) : undefined
                          }
                          actions={[
                            {
                              label: 'Delete',
                              icon: <Trash2 className="w-3.5 h-3.5" />,
                              onClick: () => setDeleteConfirm({
                                categoryId,
                                categoryName: category.display_name || category.name,
                                tagCount: category.tags?.length || 0,
                              }),
                              variant: 'danger',
                            },
                          ]}
                        >
                          {/* Nested Tags */}
                          {category.tags?.map((tag) => (
                            <UnifiedSidebarRow
                              key={tag.id}
                              name={tag.name}
                              color={tag.color || category.color}
                              count={tag.usage_count}
                              filterMode={filters.tagFilters[tag.id] || 'idle'}
                              isVisible={visibility.isTagVisible(tag.id, categoryId)}
                              onToggleFilter={() => onToggleTag(tag.id)}
                              onToggleVisibility={() => visibility.toggleTag(tag.id)}
                              indent={1}
                              actions={[
                                {
                                  label: 'Delete',
                                  icon: <Trash2 className="w-3.5 h-3.5" />,
                                  onClick: () => deleteTagMutation.mutate(tag.id),
                                  variant: 'danger',
                                },
                              ]}
                            />
                          ))}

                          {/* Inline Tag Creation within Category */}
                          {activeForm === `cat-${categoryId}` && (
                            <div className="pl-4">
                              <TagCreationInline
                                onCreate={(name, color) =>
                                  createTagMutation.mutate({ name, color, category_id: categoryId })
                                }
                                onCancel={() => setActiveForm(null)}
                                defaultColor={category.color}
                                categoryId={categoryId}
                              />
                            </div>
                          )}
                        </UnifiedSidebarRow>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-xs text-orange-900/50 py-2 px-3">No label categories defined</p>
              )}

              {/* Inline Category Creation Form */}
              {activeForm === 'category' && (
                <CategoryCreationInline
                  onCreate={(name, color) =>
                    createCategoryMutation.mutate({ name, display_name: name, color })
                  }
                  onCancel={() => setActiveForm(null)}
                />
              )}
            </UnifiedSidebarSection>

            {/* METADATA Section */}
            <UnifiedSidebarSection
              title="Metadata"
              icon={<Database className="h-3.5 w-3.5 text-emerald-500" />}
              color="#10B981"
            >
              <div className="space-y-0.5">
                {metadataFields.map((field) => (
                  <UnifiedSidebarRow
                    key={field.name}
                    name={field.name}
                    color={field.color}
                    isFiltered={false}
                    isVisible={visibility.isMetadataVisible(
                      field.name as 'filename' | 'dimensions' | 'fileSize'
                    )}
                    onToggleVisibility={() =>
                      visibility.toggleMetadata(field.name as 'filename' | 'dimensions' | 'fileSize')
                    }
                    // NO onToggleFilter for metadata (not filterable via tags)
                  />
                ))}
              </div>
            </UnifiedSidebarSection>
          </div>
        )}
      </div>

      {/* Footer info */}
      <div className="px-4 py-2 border-t border-orange-100 bg-orange-50/20">
        <p className="text-[10px] text-orange-600/60 font-mono text-center">
          {totalTags} total tags • Filter & toggle visibility
        </p>
      </div>

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">Delete Label Category</h3>
            </div>

            {/* Content */}
            <div className="px-6 py-4">
              <p className="text-sm text-gray-700 mb-2">
                Are you sure you want to delete the category <span className="font-semibold">"{deleteConfirm.categoryName}"</span>?
              </p>
              {deleteConfirm.tagCount > 0 && (
                <div className="bg-red-50 border border-red-200 rounded p-3 mt-3">
                  <p className="text-sm text-red-800">
                    <strong>Warning:</strong> This will also permanently delete <strong>{deleteConfirm.tagCount} tag{deleteConfirm.tagCount !== 1 ? 's' : ''}</strong> in this category.
                  </p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 bg-gray-50 rounded-b-lg flex justify-end gap-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50 transition-colors"
                disabled={deleteCategoryMutation.isPending}
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDeleteCategory}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded hover:bg-red-700 transition-colors disabled:bg-red-400"
                disabled={deleteCategoryMutation.isPending}
              >
                {deleteCategoryMutation.isPending ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Resize handle */}
      <div
        className={`absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-orange-400 active:bg-orange-500 transition-colors group ${
          isResizing ? 'bg-orange-500' : 'bg-transparent'
        }`}
        onMouseDown={startResizing}
        title="Drag to resize"
      >
        <div className="absolute top-1/2 right-0 -translate-y-1/2 w-1 h-12 bg-orange-300 opacity-0 group-hover:opacity-100 transition-opacity rounded-l" />
      </div>
    </div>
  );
}
