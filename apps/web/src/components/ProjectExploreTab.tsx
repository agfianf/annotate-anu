/**
 * ProjectExploreTab Component
 * FiftyOne-like image gallery with virtualization and infinite scroll
 * Supports 10,000+ images with smooth performance
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
    Check,
    ChevronDown,
    Delete,
    Download,
    FolderOpen,
    Grid3X3,
    Image as ImageIcon,
    Loader2,
    Maximize2,
    Minimize2,
    Plus,
    RefreshCw,
    Search,
    Tag,
    X
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { useNavigate } from '@tanstack/react-router';
import { useExploreView } from '../contexts/ExploreViewContext';
import { useExploreFilters, useSidebarAggregations } from '../hooks/useExploreFilters';
import { useExploreVisibility } from '../hooks/useExploreVisibility';
import { useInfiniteExploreImages } from '../hooks/useInfiniteExploreImages';
import { useZoomLevel } from '../hooks/useZoomLevel';
import { tasksApi } from '../lib/api-client';
import {
    getFullSizeThumbnailUrl,
    projectImagesApi,
    sharedImagesApi,
    tagCategoriesApi,
    tagsApi,
    type ExploreFilters,
    type JobAssociation,
    type SharedImage,
    type Tag as TagType
} from '../lib/data-management-client';
import { filterCategoriesBySearch } from '../lib/tag-utils';
import { MultiTaskSelect, VirtualizedImageGrid } from './explore';
import { FullscreenImage } from './explore/FullscreenImage';
import { UnifiedExploreSidebar } from './explore/sidebar/unified';
import { ZoomControl } from './explore/ZoomControl';
import CategoryGroup from './CategoryGroup';
import TagSelectorDropdown from './TagSelectorDropdown';
import { getTextColorForBackground } from '@/lib/colors';
import { ExportWizardModal } from './export';
import type { FilterSnapshot } from '@/types/export';

interface ProjectExploreTabProps {
  projectId: string;
}

// Color palette for tags
const TAG_COLORS = [
  '#10B981', // emerald
  '#3B82F6', // blue
  '#8B5CF6', // violet
  '#EC4899', // pink
  '#F59E0B', // amber
  '#EF4444', // red
  '#06B6D4', // cyan
  '#84CC16', // lime
];

// Debounce hook for search
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
}

export default function ProjectExploreTab({ projectId }: ProjectExploreTabProps) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  // Full-view mode
  const { isFullView, toggleFullView, exitFullView } = useExploreView();

  // Zoom level
  const { zoomLevel, setZoomLevel, config: zoomConfig } = useZoomLevel();

  // Search with debounce
  const [searchInput, setSearchInput] = useState('');
  const debouncedSearch = useDebounce(searchInput, 300);

  // Sidebar filters state
  const {
    filters: sidebarFilters,
    toggleTag: toggleSidebarTag,
    removeTag: removeSidebarTag,
    getIncludedTagIds,
    getExcludedTagIds,
    setIncludeMatchMode,
    setExcludeMatchMode,
    toggleAttributeValue: toggleSidebarAttributeValue,
    setNumericRange: setSidebarNumericRange,
    toggleSizeFilter: toggleSidebarSizeFilter,
    setWidthRange: setSidebarWidthRange,
    setHeightRange: setSidebarHeightRange,
    setSizeRange: setSidebarSizeRange,
    setFilepathFilter: setSidebarFilepathFilter,
    setFilepathPaths: setSidebarFilepathPaths,
    setImageUids,
    clearFilters: clearSidebarFilters,
    hasActiveFilters: hasSidebarFilters,
  } = useExploreFilters();

  // Visibility state for controlling tag display on thumbnails
  const visibilityState = useExploreVisibility(projectId);

  // Fetch sidebar aggregations for metadata filters
  const {
    widthAggregation,
    heightAggregation,
    sizeAggregation,
  } = useSidebarAggregations(projectId, sidebarFilters);

  // Filters
  // Filters (Main Toolbar)
  // Converting local state to usage of sidebarFilters where appropriate or keeping separate if strictly top-bar specific?
  // We should unify tags.
  // const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]); // Removed in favor of sidebarFilters
  const [selectedTaskIds, setSelectedTaskIds] = useState<number[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<number | undefined>();
  const [isAnnotatedFilter, setIsAnnotatedFilter] = useState<boolean | undefined>();

  // Selection
  const [selectedImages, setSelectedImages] = useState<Set<string>>(new Set());

  // Refresh state
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Modals
  const [showTagManager, setShowTagManager] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState(TAG_COLORS[0]);
  const [showAddTagModal, setShowAddTagModal] = useState(false);
  const [showRemoveTagModal, setShowRemoveTagModal] = useState(false);
  const [showImageModal, setShowImageModal] = useState<SharedImage | null>(null);
  const [showExportWizard, setShowExportWizard] = useState(false);

  // Job association state for image modal
  const [selectedJobIdForAnnotation, setSelectedJobIdForAnnotation] = useState<number | null>(null);
  const [jobsData, setJobsData] = useState<JobAssociation[] | null>(null);
  const [jobsLoading, setJobsLoading] = useState(false);
  const [jobsError, setJobsError] = useState<string | null>(null);

  // Build filters object
  const filters: ExploreFilters = useMemo(
    () => {
      const includedTagIds = getIncludedTagIds();
      const excludedTagIds = getExcludedTagIds();

      return {
        search: debouncedSearch || undefined,
        tag_ids: includedTagIds.length > 0 ? includedTagIds : undefined,
        excluded_tag_ids: excludedTagIds.length > 0 ? excludedTagIds : undefined,
        include_match_mode: sidebarFilters.includeMatchMode,
        exclude_match_mode: sidebarFilters.excludeMatchMode,
        task_ids: selectedTaskIds.length > 0 ? selectedTaskIds : undefined,
        job_id: selectedJobId,
        is_annotated: isAnnotatedFilter,
        // Metadata filters from sidebar
        width_min: sidebarFilters.widthRange?.min,
        width_max: sidebarFilters.widthRange?.max,
        height_min: sidebarFilters.heightRange?.min,
        height_max: sidebarFilters.heightRange?.max,
        file_size_min: sidebarFilters.sizeRange?.min,
        file_size_max: sidebarFilters.sizeRange?.max,
        filepath_pattern: sidebarFilters.filepathPattern,
        filepath_paths: sidebarFilters.filepathPaths && sidebarFilters.filepathPaths.length > 0 ? sidebarFilters.filepathPaths : undefined,
        image_uids: sidebarFilters.imageUids && sidebarFilters.imageUids.length > 0 ? sidebarFilters.imageUids : undefined,
      };
    },
    [debouncedSearch, sidebarFilters, selectedTaskIds, selectedJobId, isAnnotatedFilter, getIncludedTagIds, getExcludedTagIds]
  );

  // Convert current filters to FilterSnapshot format for export wizard
  const currentFilterSnapshot: FilterSnapshot = useMemo(() => {
    const includedTagIds = getIncludedTagIds();
    const excludedTagIds = getExcludedTagIds();

    return {
      tag_ids: includedTagIds.length > 0 ? includedTagIds : undefined,
      excluded_tag_ids: excludedTagIds.length > 0 ? excludedTagIds : undefined,
      include_match_mode: sidebarFilters.includeMatchMode,
      exclude_match_mode: sidebarFilters.excludeMatchMode,
      task_ids: selectedTaskIds.length > 0 ? selectedTaskIds : undefined,
      job_id: selectedJobId,
      is_annotated: isAnnotatedFilter,
      width_min: sidebarFilters.widthRange?.min,
      width_max: sidebarFilters.widthRange?.max,
      height_min: sidebarFilters.heightRange?.min,
      height_max: sidebarFilters.heightRange?.max,
      file_size_min: sidebarFilters.sizeRange?.min,
      file_size_max: sidebarFilters.sizeRange?.max,
      filepath_paths: sidebarFilters.filepathPaths && sidebarFilters.filepathPaths.length > 0 ? sidebarFilters.filepathPaths : undefined,
      image_uids: sidebarFilters.imageUids && sidebarFilters.imageUids.length > 0 ? sidebarFilters.imageUids : undefined,
    };
  }, [sidebarFilters, selectedTaskIds, selectedJobId, isAnnotatedFilter, getIncludedTagIds, getExcludedTagIds]);

  // Fetch images with infinite scroll
  const {
    images,
    total,
    isLoading: isLoadingImages,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    refetch: refetchImages,
  } = useInfiniteExploreImages({
    projectId,
    filters,
    pageSize: 100,
    enabled: !!projectId,
  });

  // Fetch all tags for this project
  const { data: allTags = [], isLoading: isLoadingTags } = useQuery({
    queryKey: ['tags', projectId],
    queryFn: () => tagsApi.list(Number(projectId), { include_usage_count: true }),
    enabled: !!projectId,
  });

  // Fetch tag categories for dropdown
  const { data: tagCategories = [] } = useQuery({
    queryKey: ['tag-categories', projectId],
    queryFn: () => tagCategoriesApi.list(Number(projectId), { include_tags: true }),
    enabled: !!projectId,
  });

  // Create category color map for thumbnail tag borders
  // Exclude "uncategorized" category so those tags don't get borders
  const categoryColorMap = useMemo(() => {
    const map: Record<string, string> = {};
    tagCategories.forEach((category) => {
      if (category.id && category.name !== 'uncategorized') {
        map[category.id] = category.color;
      }
    });
    return map;
  }, [tagCategories]);


  // Fetch tasks for filter dropdown
  const { data: tasks = [] } = useQuery({
    queryKey: ['tasks', projectId],
    queryFn: () => tasksApi.list(projectId),
    enabled: !!projectId,
  });

  // Create tag mutation
  const createTagMutation = useMutation({
    mutationFn: (data: { name: string; color: string }) => tagsApi.create(Number(projectId), data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tags', projectId] });
      setNewTagName('');
      setShowTagManager(false);
      toast.success('Tag created');
    },
    onError: (error: any) => {
      console.error('Failed to create tag:', error);
      const errorMessage = error?.response?.data?.detail || error?.message || 'Failed to create tag';
      toast.error(errorMessage);
    },
  });

  // Bulk tag mutation
  const bulkTagMutation = useMutation({
    mutationFn: ({ imageIds, tagIds }: { imageIds: string[]; tagIds: string[] }) =>
      projectImagesApi.bulkTag(Number(projectId), imageIds, tagIds),
    onSuccess: (_, variables) => {
      // If adding to currently open modal image, fetch updated image data
      if (showImageModal && variables.imageIds.includes(showImageModal.id)) {
        // Refetch to get updated tags
        queryClient.invalidateQueries({ queryKey: ['project-explore-infinite'] });
        // Find updated image in the cache
        const updatedImage = images.find(img => img.id === showImageModal.id);
        if (updatedImage) {
          setShowImageModal(updatedImage);
        }
      }
      queryClient.invalidateQueries({ queryKey: ['project-explore-infinite'] });
      queryClient.invalidateQueries({ queryKey: ['tags', projectId] }); // Update tag counts
      setSelectedImages(new Set());
      setShowAddTagModal(false);
      toast.success('Tags added');
    },
    onError: (error: any) => {
      console.error('Failed to add tags:', error);
      const errorMessage = error?.response?.data?.detail || error?.message || 'Failed to add tags';
      toast.error(errorMessage);
    },
  });

  // Remove tag from specific image
  const removeTagMutation = useMutation({
    mutationFn: ({ imageId, tagId }: { imageId: string; tagId: string }) =>
      projectImagesApi.removeTag(Number(projectId), imageId, tagId),
    onSuccess: (updatedTags) => {
      // Update modal image state if open
      if (showImageModal) {
        setShowImageModal({
          ...showImageModal,
          tags: updatedTags,
        });
      }
      queryClient.invalidateQueries({ queryKey: ['project-explore-infinite'] });
      queryClient.invalidateQueries({ queryKey: ['tags', projectId] }); // Update tag counts
      toast.success('Tag removed');
    },
    onError: (error: any) => {
      console.error('Failed to remove tag:', error);
      const errorMessage = error?.response?.data?.detail || error?.message || 'Failed to remove tag';
      toast.error(errorMessage);
    },
  });

  // Bulk remove tags mutation
  const bulkUntagMutation = useMutation({
    mutationFn: ({ imageIds, tagIds }: { imageIds: string[]; tagIds: string[] }) =>
      projectImagesApi.bulkUntag(Number(projectId), imageIds, tagIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-explore-infinite'] });
      queryClient.invalidateQueries({ queryKey: ['tags', projectId] }); // Update tag counts
      setSelectedImages(new Set());
      setShowRemoveTagModal(false);
      toast.success('Tags removed');
    },
    onError: (error: any) => {
      console.error('Failed to remove tags:', error);
      const errorMessage = error?.response?.data?.detail || error?.message || 'Failed to remove tags';
      toast.error(errorMessage);
    },
  });

  // Clear selection when filters change
  useEffect(() => {
    setSelectedImages(new Set());
  }, [filters]);

  // Fetch jobs when image modal opens
  useEffect(() => {
    if (showImageModal) {
      setJobsLoading(true);
      setJobsError(null);
      setSelectedJobIdForAnnotation(null);

      sharedImagesApi
        .getImageJobs(showImageModal.id)
        .then((jobs) => {
          setJobsData(jobs);
          // Auto-select if only one job
          if (jobs.length === 1) {
            setSelectedJobIdForAnnotation(jobs[0].job_id);
          }
        })
        .catch((err) => {
          console.error('Failed to fetch jobs:', err);
          setJobsError('Failed to load job information');
          setJobsData([]);
        })
        .finally(() => setJobsLoading(false));
    } else {
      setJobsData(null);
      setJobsError(null);
    }
  }, [showImageModal]);

  // Handlers
  const handleSelectAll = useCallback(() => {
    if (selectedImages.size === images.length) {
      setSelectedImages(new Set());
    } else {
      setSelectedImages(new Set(images.map((img) => img.id)));
    }
  }, [images, selectedImages]);

  const handleToggleImage = useCallback((imageId: string) => {
    setSelectedImages((prev) => {
      const next = new Set(prev);
      if (next.has(imageId)) {
        next.delete(imageId);
      } else {
        next.add(imageId);
      }
      return next;
    });
  }, []);



  // Refresh handler with animation and toast
  const handleRefresh = useCallback(async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    try {
      await refetchImages();
      toast.success('Gallery refreshed');
    } catch {
      toast.error('Failed to refresh');
    } finally {
      setIsRefreshing(false);
    }
  }, [isRefreshing, refetchImages]);

  const handleCreateTag = () => {
    if (!newTagName.trim()) return;
    createTagMutation.mutate({ name: newTagName.trim(), color: newTagColor });
  };

  const handleBulkAddTags = (tagIds: string[]) => {
    if (selectedImages.size === 0 || tagIds.length === 0) return;
    bulkTagMutation.mutate({
      imageIds: Array.from(selectedImages),
      tagIds,
    });
  };

  const handleBulkRemoveTags = (tagIds: string[]) => {
    if (selectedImages.size === 0 || tagIds.length === 0) return;
    bulkUntagMutation.mutate({
      imageIds: Array.from(selectedImages),
      tagIds,
    });
  };

  // Get all unique tags from selected images
  const getTagsFromSelectedImages = useCallback((): TagType[] => {
    const tagMap = new Map<string, TagType>();
    const selectedImageIds = Array.from(selectedImages);

    selectedImageIds.forEach((imageId) => {
      const image = images.find((img) => img.id === imageId);
      if (image) {
        image.tags.forEach((tag) => {
          if (!tagMap.has(tag.id)) {
            tagMap.set(tag.id, tag);
          }
        });
      }
    });

    return Array.from(tagMap.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [selectedImages, images]);

  const handleRemoveTag = useCallback((imageId: string, tagId: string) => {
    removeTagMutation.mutate({ imageId, tagId });
  }, [removeTagMutation]);

  const handleAddTagsToImage = useCallback((imageId: string, tagIds: string[]) => {
    if (tagIds.length === 0) return;

    // Optimistically update the modal state
    if (showImageModal && showImageModal.id === imageId) {
      const tagsToAdd = allTags.filter(tag => tagIds.includes(tag.id));
      const updatedTags = [...showImageModal.tags, ...tagsToAdd];
      setShowImageModal({
        ...showImageModal,
        tags: updatedTags,
      });
    }

    bulkTagMutation.mutate({
      imageIds: [imageId],
      tagIds: tagIds,
    });
  }, [bulkTagMutation, showImageModal, allTags]);

  // Navigation in fullscreen modal
  const currentImageIndex = useMemo(() => {
    if (!showImageModal) return -1;
    return images.findIndex(img => img.id === showImageModal.id);
  }, [showImageModal, images]);

  // Group modal tags by category for display
  const modalTagsByCategory = useMemo(() => {
    if (!showImageModal) return {};

    const grouped: Record<string, { category: typeof tagCategories[0] | null; tags: typeof showImageModal.tags }> = {};

    // Sort: categorized first, then uncategorized
    const sortedTags = [...showImageModal.tags].sort((a, b) => {
      if (a.category_id && !b.category_id) return -1;
      if (!a.category_id && b.category_id) return 1;
      return 0;
    });

    sortedTags.forEach(tag => {
      const key = tag.category_id || 'uncategorized';
      if (!grouped[key]) {
        const category = tag.category_id
          ? tagCategories.find(c => c.id === tag.category_id) || null
          : null;
        grouped[key] = { category, tags: [] };
      }
      grouped[key].tags.push(tag);
    });

    return grouped;
  }, [showImageModal?.tags, tagCategories]);

  const handlePreviousImage = useCallback(() => {
    if (currentImageIndex > 0) {
      setShowImageModal(images[currentImageIndex - 1]);
    }
  }, [currentImageIndex, images]);

  const handleNextImage = useCallback(() => {
    if (currentImageIndex < images.length - 1) {
      setShowImageModal(images[currentImageIndex + 1]);
    }
  }, [currentImageIndex, images]);

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Handle ESC key to exit full-view
      if (e.key === 'Escape' && isFullView && !showTagManager && !showAddTagModal && !showImageModal) {
        exitFullView();
      }

      // Handle arrow keys in fullscreen modal
      if (showImageModal && !showTagManager && !showAddTagModal) {
        if (e.key === 'ArrowLeft') {
          e.preventDefault();
          handlePreviousImage();
        } else if (e.key === 'ArrowRight') {
          e.preventDefault();
          handleNextImage();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          setShowImageModal(null);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFullView, exitFullView, showTagManager, showAddTagModal, showImageModal, handlePreviousImage, handleNextImage]);

  const handleAnnotateClick = useCallback(() => {
    if (!jobsData || jobsData.length === 0 || !showImageModal) return;

    const targetJobId =
      jobsData.length === 1 ? jobsData[0].job_id : selectedJobIdForAnnotation;

    if (targetJobId) {
      // Include imageId in URL for direct navigation to the specific image
      navigate(`/annotation?jobId=${targetJobId}&imageId=${showImageModal.id}`);
      setShowImageModal(null);
    }
  }, [jobsData, selectedJobIdForAnnotation, navigate, showImageModal]);

  const getJobStatusColor = (status: string): string => {
    const statusColors: Record<string, string> = {
      pending: 'bg-gray-100 text-gray-700',
      assigned: 'bg-blue-100 text-blue-700',
      in_progress: 'bg-yellow-100 text-yellow-700',
      completed: 'bg-green-100 text-green-700',
      review: 'bg-purple-100 text-purple-700',
      approved: 'bg-emerald-100 text-emerald-700',
      rejected: 'bg-red-100 text-red-700',
    };
    return statusColors[status] || 'bg-gray-100 text-gray-700';
  };

  // Bulk Tag Modal Component
  const BulkTagModal = () => {
    const [searchTag, setSearchTag] = useState('');
    const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
    const searchInputRef = useRef<HTMLInputElement>(null);

    // Fetch categories with tags
    const { data: categoriesWithTags = [] } = useQuery({
      queryKey: ['tag-categories', projectId],
      queryFn: () => tagCategoriesApi.list(Number(projectId), { include_tags: true }),
      enabled: !!projectId && showAddTagModal,
    });

    // Auto-focus search input
    useEffect(() => {
      if (searchInputRef.current) {
        requestAnimationFrame(() => searchInputRef.current?.focus());
      }
    }, []);

    // Filter categories based on search
    const filteredCategories = useMemo(
      () => filterCategoriesBySearch(categoriesWithTags, searchTag),
      [searchTag, categoriesWithTags]
    );

    const handleToggleTag = (tagId: string) => {
      setSelectedTagIds((prev) =>
        prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId]
      );
    };

    const handleSelectAllInCategory = (categoryId: string) => {
      const category = categoriesWithTags.find((c) => c.id === categoryId);
      if (!category?.tags) return;

      const categoryTagIds = category.tags.map((t) => t.id);
      const allSelected = categoryTagIds.every((id) => selectedTagIds.includes(id));

      setSelectedTagIds((prev) =>
        allSelected
          ? prev.filter((id) => !categoryTagIds.includes(id))
          : [...new Set([...prev, ...categoryTagIds])]
      );
    };

    const handleAddSelected = () => {
      if (selectedTagIds.length === 0) return;
      handleBulkAddTags(selectedTagIds);
    };

    const handleClose = () => {
      setShowAddTagModal(false);
      setSearchTag('');
      setSelectedTagIds([]);
    };

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden flex flex-col max-h-[80vh]">
          {/* Header */}
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-emerald-50 to-white">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">
                Add Tags to Images
              </h3>
              <p className="text-sm text-gray-500 mt-0.5">
                {selectedImages.size} image{selectedImages.size !== 1 ? 's' : ''} selected
              </p>
            </div>
            <button
              onClick={handleClose}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Search */}
          <div className="px-6 py-3 border-b border-gray-100 bg-gray-50">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchTag}
                onChange={(e) => setSearchTag(e.target.value)}
                placeholder="Search tags..."
                className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
              />
            </div>
          </div>

          {/* Tags List */}
          <div className="flex-1 overflow-y-auto px-2 py-2">
            {filteredCategories.length === 0 ? (
              <div className="py-12 text-center">
                {searchTag.trim() ? (
                  <>
                    <Search className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                    <p className="text-sm text-gray-500">No tags match &quot;{searchTag}&quot;</p>
                    <button
                      onClick={() => setSearchTag('')}
                      className="text-xs text-emerald-600 hover:text-emerald-700 mt-2"
                    >
                      Clear search
                    </button>
                  </>
                ) : (
                  <>
                    <Tag className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                    <p className="text-sm text-gray-500 mb-4">No tags available</p>
                    <button
                      onClick={() => {
                        setShowAddTagModal(false);
                        setShowTagManager(true);
                      }}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg transition-colors inline-flex items-center gap-2"
                    >
                      <Plus className="w-4 h-4" />
                      Create First Tag
                    </button>
                  </>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                {/* Categorized Tags */}
                {filteredCategories.map((category) => (
                  <CategoryGroup
                    key={category.id}
                    category={category}
                    selectedTagIds={selectedTagIds}
                    onToggleTag={handleToggleTag}
                    onSelectAll={handleSelectAllInCategory}
                    showUsageCount={true}
                    searchQuery={searchTag}
                    isDefaultExpanded={category.name?.toLowerCase() === 'uncategorized'}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex items-center justify-end gap-3">
            <div className="flex items-center gap-2">
              <button
                onClick={handleClose}
                className="px-4 py-2 text-gray-600 hover:text-gray-800 text-sm font-medium rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAddSelected}
                disabled={selectedTagIds.length === 0 || bulkTagMutation.isPending}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
              >
                {bulkTagMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Adding...
                  </>
                ) : (
                  <>
                    Add {selectedTagIds.length > 0 && `(${selectedTagIds.length})`}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Bulk Remove Tag Modal Component
  const BulkRemoveTagModal = () => {
    const [searchTag, setSearchTag] = useState('');
    const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
    const searchInputRef = useRef<HTMLInputElement>(null);

    // Get tags from selected images
    const tagsFromSelectedImages = useMemo(() => getTagsFromSelectedImages(), []);

    // Fetch categories with tags
    const { data: allCategories = [] } = useQuery({
      queryKey: ['tag-categories', projectId],
      queryFn: () => tagCategoriesApi.list(Number(projectId), { include_tags: true }),
      enabled: !!projectId && showRemoveTagModal,
    });

    // Filter categories to only show those with tags present on selected images
    const categoriesWithRelevantTags = useMemo(() => {
      const relevantTagIds = new Set(tagsFromSelectedImages.map((t) => t.id));
      return allCategories
        .map((cat) => ({
          ...cat,
          tags: cat.tags?.filter((t) => relevantTagIds.has(t.id)) || [],
        }))
        .filter((cat) => cat.tags && cat.tags.length > 0);
    }, [tagsFromSelectedImages, allCategories]);

    // Auto-focus search input
    useEffect(() => {
      if (searchInputRef.current) {
        requestAnimationFrame(() => searchInputRef.current?.focus());
      }
    }, []);

    // Filter categories based on search
    const filteredCategories = useMemo(
      () => filterCategoriesBySearch(categoriesWithRelevantTags, searchTag),
      [searchTag, categoriesWithRelevantTags]
    );

    const handleToggleTag = (tagId: string) => {
      setSelectedTagIds((prev) =>
        prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId]
      );
    };

    const handleSelectAllInCategory = (categoryId: string) => {
      const category = categoriesWithRelevantTags.find((c) => c.id === categoryId);
      if (!category?.tags) return;

      const categoryTagIds = category.tags.map((t) => t.id);
      const allSelected = categoryTagIds.every((id) => selectedTagIds.includes(id));

      setSelectedTagIds((prev) =>
        allSelected
          ? prev.filter((id) => !categoryTagIds.includes(id))
          : [...new Set([...prev, ...categoryTagIds])]
      );
    };

    const handleRemoveSelected = () => {
      if (selectedTagIds.length === 0) return;
      handleBulkRemoveTags(selectedTagIds);
    };

    const handleClose = () => {
      setShowRemoveTagModal(false);
      setSearchTag('');
      setSelectedTagIds([]);
    };

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden flex flex-col max-h-[80vh]">
          {/* Header */}
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-red-50 to-white">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">
                Remove Tags from Images
              </h3>
              <p className="text-sm text-gray-500 mt-0.5">
                {selectedImages.size} image{selectedImages.size !== 1 ? 's' : ''} selected
              </p>
            </div>
            <button
              onClick={handleClose}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Search */}
          <div className="px-6 py-3 border-b border-gray-100 bg-gray-50">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchTag}
                onChange={(e) => setSearchTag(e.target.value)}
                placeholder="Search tags to remove..."
                className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
              />
            </div>
          </div>

          {/* Tags List */}
          <div className="flex-1 overflow-y-auto px-2 py-2">
            {filteredCategories.length === 0 ? (
              <div className="py-12 text-center">
                {searchTag.trim() ? (
                  <>
                    <Search className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                    <p className="text-sm text-gray-500">No tags match &quot;{searchTag}&quot;</p>
                    <button
                      onClick={() => setSearchTag('')}
                      className="text-xs text-red-600 hover:text-red-700 mt-2"
                    >
                      Clear search
                    </button>
                  </>
                ) : (
                  <>
                    <Tag className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                    <p className="text-sm text-gray-500 mb-2">
                      No tags on selected images
                    </p>
                    <p className="text-xs text-gray-400">
                      Add tags to images first
                    </p>
                  </>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                {/* Categorized Tags */}
                {filteredCategories.map((category) => (
                  <CategoryGroup
                    key={category.id}
                    category={category}
                    selectedTagIds={selectedTagIds}
                    onToggleTag={handleToggleTag}
                    onSelectAll={handleSelectAllInCategory}
                    showUsageCount={false}
                    searchQuery={searchTag}
                    isDefaultExpanded={category.name?.toLowerCase() === 'uncategorized'}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex items-center justify-end gap-2">
            <button
              onClick={handleClose}
              className="px-4 py-2 text-gray-600 hover:text-gray-800 text-sm font-medium rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleRemoveSelected}
              disabled={selectedTagIds.length === 0 || bulkUntagMutation.isPending}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
            >
              {bulkUntagMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Removing...
                </>
              ) : (
                <>
                  <X className="w-4 h-4" />
                  Remove {selectedTagIds.length > 0 && `(${selectedTagIds.length})`}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="h-full flex flex-col min-h-0">
      {/* Top Bar - Filters */}
      <div className="glass-strong rounded-2xl shadow-lg p-3 mb-3 relative z-20">
        <div className="flex flex-wrap items-center gap-4">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search by filename..."
              className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-200 bg-white/50 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm"
            />
          </div>

          {/* Multi-Task Filter */}
          <MultiTaskSelect
            tasks={tasks.map((t) => ({ id: t.id, name: t.name }))}
            selectedTaskIds={selectedTaskIds}
            onChange={setSelectedTaskIds}
            placeholder="All Tasks"
          />

          {/* Annotated Filter */}
          <div className="relative">
            <select
              value={isAnnotatedFilter === undefined ? '' : isAnnotatedFilter.toString()}
              onChange={(e) => {
                const val = e.target.value;
                setIsAnnotatedFilter(val === '' ? undefined : val === 'true');
              }}
              className="appearance-none pl-3 pr-8 py-2 rounded-lg border border-gray-200 bg-white/50 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
            >
              <option value="">All Status</option>
              <option value="true">Annotated</option>
              <option value="false">Not Annotated</option>
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          </div>

          {/* Refresh */}
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 transition-transform ${isRefreshing ? 'animate-spin' : ''}`} />
          </button>

          {/* Export Button with Filtered Count */}
          <div className="flex items-center gap-2">
            {(hasSidebarFilters || debouncedSearch || selectedTaskIds.length > 0 || isAnnotatedFilter !== undefined) && (
              <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-full">
                {images.length} images filtered
              </span>
            )}
            <button
              onClick={() => setShowExportWizard(true)}
              className="px-4 py-2 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white rounded-lg transition-all flex items-center gap-2 text-sm font-medium shadow-sm hover:shadow-md"
              title="Export filtered dataset"
            >
              <span>Export</span>
              <span className="text-base">🚀</span>
            </button>
          </div>

          {/* Zoom Control */}
          <ZoomControl currentZoom={zoomLevel} onZoomChange={setZoomLevel} />

          {/* Full View Toggle */}
          <button
            onClick={toggleFullView}
            className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors ml-auto"
            title={isFullView ? "Exit full view (ESC)" : "Enter full view"}
            aria-label={isFullView ? "Exit full view" : "Enter full view"}
          >
            {isFullView ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>

        {/* Active Filters Display */}
        <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-gray-100">
          <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
            Active Filters:
          </span>

          {/* No filters message */}
          {!(hasSidebarFilters || debouncedSearch || selectedTaskIds.length > 0 || isAnnotatedFilter !== undefined) && (
            <span className="text-xs text-gray-400 italic">
              No filters applied
            </span>
          )}

          {/* Search filter */}
          {debouncedSearch && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-blue-50 text-blue-700 rounded-full text-xs">
              <Search className="w-3 h-3" />
              <span className="font-medium">Search: &quot;{debouncedSearch}&quot;</span>
            </div>
          )}

          {/* Task filters */}
          {selectedTaskIds.length > 0 && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-purple-50 text-purple-700 rounded-full text-xs">
              <span className="font-medium">
                Tasks: {selectedTaskIds.length} selected
              </span>
            </div>
          )}

          {/* Annotated status filter */}
          {isAnnotatedFilter !== undefined && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-amber-50 text-amber-700 rounded-full text-xs">
              <span className="font-medium">
                {isAnnotatedFilter ? 'Annotated Only' : 'Not Annotated Only'}
              </span>
            </div>
          )}

          {/* Include tags with match mode */}
          {getIncludedTagIds().length > 0 && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 text-emerald-700 rounded-full text-xs border border-emerald-200">
              <span className="font-semibold">Include ({sidebarFilters.includeMatchMode}):</span>
              <div className="flex items-center gap-1">
                {getIncludedTagIds().map((tagId) => {
                  const tag = allTags.find(t => t.id === tagId);
                  if (!tag) return null;
                  return (
                    <span
                      key={tagId}
                      className="px-2 py-0.5 rounded-full font-medium flex items-center gap-1 group"
                      style={{
                        backgroundColor: `${tag.color}30`,
                        color: tag.color,
                      }}
                    >
                      <span>{tag.name}</span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          removeSidebarTag(tagId);
                        }}
                        className="hover:opacity-100 transition-opacity"
                        title="Remove from filter"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          {/* Exclude tags with match mode */}
          {getExcludedTagIds().length > 0 && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-red-50 text-red-700 rounded-full text-xs border border-red-200">
              <span className="font-semibold">Exclude ({sidebarFilters.excludeMatchMode}):</span>
              <div className="flex items-center gap-1">
                {getExcludedTagIds().map((tagId) => {
                  const tag = allTags.find(t => t.id === tagId);
                  if (!tag) return null;
                  return (
                    <span
                      key={tagId}
                      className="px-2 py-0.5 rounded-full font-medium flex items-center gap-1 group"
                      style={{
                        backgroundColor: `${tag.color}30`,
                        color: tag.color,
                      }}
                    >
                      <span>{tag.name}</span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          removeSidebarTag(tagId);
                        }}
                        className="hover:opacity-100 transition-opacity"
                        title="Remove from filter"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          {/* Dimension filters */}
          {sidebarFilters.widthRange && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-indigo-50 text-indigo-700 rounded-full text-xs">
              <span className="font-medium">
                Width: {sidebarFilters.widthRange.min} - {sidebarFilters.widthRange.max}px
              </span>
            </div>
          )}

          {sidebarFilters.heightRange && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-indigo-50 text-indigo-700 rounded-full text-xs">
              <span className="font-medium">
                Height: {sidebarFilters.heightRange.min} - {sidebarFilters.heightRange.max}px
              </span>
            </div>
          )}

          {/* File size filter */}
          {sidebarFilters.sizeRange && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-cyan-50 text-cyan-700 rounded-full text-xs">
              <span className="font-medium">
                Size: {(sidebarFilters.sizeRange.min / (1024 * 1024)).toFixed(1)} - {(sidebarFilters.sizeRange.max / (1024 * 1024)).toFixed(1)} MB
              </span>
            </div>
          )}

          {/* Filepath pattern filter */}
          {sidebarFilters.filepathPattern && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-teal-50 text-teal-700 rounded-full text-xs">
              <span className="font-medium">
                Path: {sidebarFilters.filepathPattern}
              </span>
            </div>
          )}

          {/* Filepath paths filter (checkbox-based directories) */}
          {sidebarFilters.filepathPaths && sidebarFilters.filepathPaths.length > 0 && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-teal-50 text-teal-700 rounded-full text-xs border border-teal-200">
              <FolderOpen className="w-3 h-3" />
              <span className="font-medium">
                Directories: {sidebarFilters.filepathPaths.length} selected
              </span>
              <button
                onClick={() => setSidebarFilepathPaths([])}
                className="hover:opacity-100 transition-opacity ml-1"
                title="Clear directory filter"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          )}

          {/* Image UIDs filter */}
          {sidebarFilters.imageUids && sidebarFilters.imageUids.length > 0 && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-violet-50 text-violet-700 rounded-full text-xs border border-violet-200">
              <ImageIcon className="w-3 h-3" />
              <span className="font-medium">
                Images: {sidebarFilters.imageUids.length} selected
              </span>
              <button
                onClick={() => setImageUids([])}
                className="hover:opacity-100 transition-opacity ml-1"
                title="Clear image selection"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          )}

          {/* Clear all filters button - Liquid Glass Red */}
          {(hasSidebarFilters || debouncedSearch || selectedTaskIds.length > 0 || isAnnotatedFilter !== undefined) && (
            <button
              onClick={() => {
                clearSidebarFilters();
                setSearchInput('');
                setSelectedTaskIds([]);
                setIsAnnotatedFilter(undefined);
              }}
              className="px-3 py-1 text-xs font-medium text-white rounded-full flex items-center gap-1 transition-all ml-auto shadow-lg hover:shadow-xl"
              style={{
                background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.85) 0%, rgba(220, 38, 38, 0.9) 100%)',
                backdropFilter: 'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)',
                border: '1px solid rgba(239, 68, 68, 0.5)',
                boxShadow: '0 4px 16px rgba(239, 68, 68, 0.25), 0 0 0 1px rgba(255, 255, 255, 0.1) inset'
              }}
            >
              <X className="w-3 h-3" />
              Clear All Filters
            </button>
          )}
        </div>
      </div>

      {/* Floating Selection Actions Bar */}
      {selectedImages.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-bottom-5 duration-300">
          <div
            className="text-white rounded-full shadow-2xl px-6 py-3 flex items-center gap-4 border"
            style={{
              background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.25) 0%, rgba(5, 150, 105, 0.3) 100%)',
              backdropFilter: 'blur(16px)',
              WebkitBackdropFilter: 'blur(16px)',
              borderColor: 'rgba(16, 185, 129, 0.4)',
              boxShadow: '0 8px 32px rgba(16, 185, 129, 0.3), 0 0 0 1px rgba(255, 255, 255, 0.1) inset'
            }}
          >
            <span className="text-sm font-medium">
              {selectedImages.size} selected
            </span>
            <div className="h-5 w-px bg-white/30"></div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowAddTagModal(true)}
                className="px-4 py-2 bg-white/20 hover:bg-white/30 backdrop-blur-sm text-white text-sm font-medium rounded-full flex items-center gap-1.5 transition-all"
              >
                <Tag className="w-4 h-4" />
                Add Tags
              </button>
              <button
                onClick={() => setShowRemoveTagModal(true)}
                disabled={getTagsFromSelectedImages().length === 0}
                className="p-2.5 bg-red-500/60 hover:bg-red-500/80 disabled:bg-white/10 disabled:cursor-not-allowed backdrop-blur-sm text-white rounded-full flex items-center transition-all shadow-lg shadow-red-500/30"
                title="Remove Tags"
              >
                <Delete className="w-4 h-4 rotate-45" />
              </button>
              <button
                onClick={() => setSelectedImages(new Set())}
                className="p-2 hover:bg-white/20 text-white rounded-full flex items-center transition-all"
                title="Clear selection"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content Area - with Sidebar in fullscreen */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        {/* Sidebar - only visible in fullscreen mode */}
        {isFullView && (
          <>
            {/* Unified Sidebar - filtering, visibility, and tag/category creation */}
            <UnifiedExploreSidebar
              projectId={projectId}
              filters={sidebarFilters}
              onToggleTag={toggleSidebarTag}
              setIncludeMatchMode={setIncludeMatchMode}
              setExcludeMatchMode={setExcludeMatchMode}
              visibility={visibilityState}
              // Metadata filter handlers
              onImageUidsChange={setImageUids}
              onWidthRangeChange={setSidebarWidthRange}
              onHeightRangeChange={setSidebarHeightRange}
              onSizeRangeChange={setSidebarSizeRange}
              onFilepathPathsChange={setSidebarFilepathPaths}
              // Metadata aggregations
              widthAggregation={widthAggregation}
              heightAggregation={heightAggregation}
              sizeAggregation={sizeAggregation}
            />
          </>
        )}

        {/* Main Content */}
      <div className="flex-1 glass-strong rounded-2xl shadow-lg overflow-hidden flex flex-col min-h-0 relative z-10">
        {/* Gallery Header */}
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-gray-50 to-white">
          <div className="flex items-center gap-3">
            <Grid3X3 className="w-5 h-5 text-emerald-600" />
            <span className="font-medium text-gray-700">
              {isLoadingImages ? 'Loading...' : `${total.toLocaleString()} image(s)`}
            </span>
            {isFetchingNextPage && (
              <span className="text-sm text-gray-400 flex items-center gap-1">
                <Loader2 className="w-3 h-3 animate-spin" />
                Loading more...
              </span>
            )}
          </div>
          {images.length > 0 && (
            <button
              onClick={handleSelectAll}
              className="text-sm text-emerald-600 hover:text-emerald-700 font-medium flex items-center gap-1"
            >
              {selectedImages.size === images.length ? (
                <>
                  <X className="w-4 h-4" />
                  Deselect All
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  Select All ({images.length})
                </>
              )}
            </button>
          )}
        </div>

        {/* Virtualized Gallery Grid */}
        {isLoadingImages ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="w-8 h-8 text-emerald-600 animate-spin" />
          </div>
        ) : images.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-gray-500">
            <ImageIcon className="w-16 h-16 text-gray-300 mb-4" />
            <p className="text-lg font-medium">No images found</p>
            <p className="text-sm">Try adjusting your filters or add images to the project pool</p>
          </div>
        ) : (
          <VirtualizedImageGrid
            images={images}
            selectedImages={selectedImages}
            onToggleImage={handleToggleImage}
            onImageDoubleClick={setShowImageModal}
            targetRowHeight={zoomConfig.targetRowHeight}
            thumbnailSize={zoomConfig.thumbnailSize}
            spacing={2}
            hasNextPage={hasNextPage}
            isFetchingNextPage={isFetchingNextPage}
            fetchNextPage={fetchNextPage}
            onRemoveTag={handleRemoveTag}
            visibility={visibilityState.visibility}
            categoryColorMap={categoryColorMap}
          />
        )}
      </div>
      </div>

      {/* Create Tag Modal */}
      {showTagManager && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Create New Tag</h3>
              <button
                onClick={() => setShowTagManager(false)}
                className="p-1 text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tag Name</label>
                <input
                  type="text"
                  value={newTagName}
                  onChange={(e) => setNewTagName(e.target.value)}
                  placeholder="e.g., reviewed, low-quality, vehicle"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Color</label>
                <div className="flex flex-wrap gap-2">
                  {TAG_COLORS.map((color) => (
                    <button
                      key={color}
                      onClick={() => setNewTagColor(color)}
                      className={`w-8 h-8 rounded-full transition-all ${
                        newTagColor === color ? 'ring-2 ring-offset-2 ring-gray-400' : ''
                      }`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={() => setShowTagManager(false)}
                  className="px-4 py-2 text-gray-600 hover:text-gray-800"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateTag}
                  disabled={!newTagName.trim() || createTagMutation.isPending}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white rounded-lg flex items-center gap-2"
                >
                  {createTagMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Plus className="w-4 h-4" />
                  )}
                  Create Tag
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Tags to Selection Modal */}
      {showAddTagModal && <BulkTagModal />}

      {/* Remove Tags from Selection Modal */}
      {showRemoveTagModal && <BulkRemoveTagModal />}

      {/* Export Wizard Modal */}
      <ExportWizardModal
        isOpen={showExportWizard}
        onClose={() => setShowExportWizard(false)}
        projectId={projectId}
        currentFilters={currentFilterSnapshot}
        onExportCreated={(exportId) => {
          toast.success(`Export created: ${exportId.slice(0, 8)}...`);
        }}
      />

      {/* Image Detail Modal */}
      {showImageModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-[90vw] h-[90vh] overflow-hidden flex flex-col">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <h3 className="text-lg font-semibold text-gray-900 truncate">
                  {showImageModal.filename}
                </h3>
                <span className="text-sm text-gray-500 whitespace-nowrap">
                  {currentImageIndex + 1} / {images.length}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {/* Previous button */}
                <button
                  onClick={handlePreviousImage}
                  disabled={currentImageIndex === 0}
                  className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  title="Previous (←)"
                >
                  <ChevronDown className="w-5 h-5 rotate-90" />
                </button>
                {/* Next button */}
                <button
                  onClick={handleNextImage}
                  disabled={currentImageIndex === images.length - 1}
                  className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  title="Next (→)"
                >
                  <ChevronDown className="w-5 h-5 -rotate-90" />
                </button>
                {/* Close button */}
                <button
                  onClick={() => setShowImageModal(null)}
                  className="p-2 text-gray-400 hover:text-gray-600"
                  title="Close (ESC)"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-hidden p-6">
              <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 h-full">
                {/* Image Preview - takes 3 columns on large screens */}
                <div className="lg:col-span-3 bg-gray-900 rounded-xl overflow-hidden flex items-center justify-center">
                  <FullscreenImage
                    src={getFullSizeThumbnailUrl(showImageModal.thumbnail_url)}
                    alt={showImageModal.filename}
                    className="w-full h-full object-contain"
                    bboxes={showImageModal.annotation_summary?.bboxes}
                    polygons={showImageModal.annotation_summary?.polygons}
                    displayOptions={visibilityState.visibility.annotationDisplay}
                  />
                </div>

                {/* Details - takes 1 column on large screens */}
                <div className="lg:col-span-1 overflow-y-auto space-y-4 pr-1">
                  <div>
                    <h4 className="text-sm font-medium text-gray-500 mb-1">File Info</h4>
                    <div className="bg-gray-50 rounded-lg p-3 space-y-3 text-sm">
                      {/* Path - full width, wrapping */}
                      <div>
                        <span className="text-xs text-gray-500 uppercase tracking-wide">Path</span>
                        <p className="text-gray-900 font-mono text-xs break-all mt-1">
                          {showImageModal.file_path}
                        </p>
                      </div>
                      {/* Grid for other fields */}
                      <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                        <div>
                          <span className="text-xs text-gray-500 uppercase tracking-wide">Dimensions</span>
                          <p className="text-gray-900 mt-0.5">
                            {showImageModal.width || '?'} × {showImageModal.height || '?'}
                          </p>
                        </div>
                        <div>
                          <span className="text-xs text-gray-500 uppercase tracking-wide">Size</span>
                          <p className="text-gray-900 mt-0.5">
                            {showImageModal.file_size_bytes
                              ? `${(showImageModal.file_size_bytes / 1024 / 1024).toFixed(2)} MB`
                              : 'Unknown'}
                          </p>
                        </div>
                        <div>
                          <span className="text-xs text-gray-500 uppercase tracking-wide">Type</span>
                          <p className="text-gray-900 mt-0.5">{showImageModal.mime_type || 'Unknown'}</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-sm font-medium text-gray-500">Tags</h4>
                      {/* Add tags button with dropdown */}
                      <TagSelectorDropdown
                        tags={allTags.filter((t) => t.category_id === null)}
                        categories={tagCategories}
                        excludeTagIds={showImageModal.tags.map(t => t.id)}
                        onAddTags={(tagIds) => handleAddTagsToImage(showImageModal.id, tagIds)}
                        buttonText="Add Tags"
                        disabled={bulkTagMutation.isPending}
                        showUsageCount={true}
                        size="sm"
                        showCategoryGrouping={true}
                      />
                    </div>

                    {showImageModal.tags.length === 0 ? (
                      <span className="text-sm text-gray-400">No tags assigned</span>
                    ) : (
                      <div className="space-y-3">
                        {Object.entries(modalTagsByCategory).map(([categoryId, { category, tags }]) => (
                          <div key={categoryId}>
                            {/* Category Header */}
                            <div className="flex items-center gap-2 mb-1.5">
                              {category ? (
                                <>
                                  <div
                                    className="w-2 h-2 rounded-full"
                                    style={{ backgroundColor: category.color }}
                                  />
                                  <span className="text-xs font-medium text-gray-600">{category.name}</span>
                                </>
                              ) : (
                                <span className="text-xs font-medium text-gray-400 italic">Uncategorized</span>
                              )}
                            </div>

                            {/* Tags in this category */}
                            <div className="flex flex-wrap gap-2 pl-4">
                              {tags.map((tag) => {
                                // Use tag color only (category already shown in header)
                                const background = tag.color || '#10B981';
                                const textColor = getTextColorForBackground(tag.color || '#10B981');

                                return (
                                  <div
                                    key={tag.id}
                                    className="px-3 py-1 rounded-lg text-xs font-medium flex items-center gap-2 group"
                                    style={{ background, color: textColor }}
                                  >
                                    <span>{tag.name}</span>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleRemoveTag(showImageModal.id, tag.id);
                                      }}
                                      disabled={removeTagMutation.isPending}
                                      className="opacity-0 group-hover:opacity-100 transition-opacity"
                                      style={{ color: textColor }}
                                      title="Remove tag"
                                    >
                                      <X className="w-3 h-3 hover:scale-110" />
                                    </button>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Jobs & Tasks */}
                  <div>
                    <h4 className="text-sm font-medium text-gray-500 mb-2">Jobs & Tasks</h4>
                    {jobsLoading ? (
                      <div className="bg-gray-50 rounded-lg p-3">
                        <div className="animate-pulse h-8 bg-gray-200 rounded" />
                      </div>
                    ) : jobsError ? (
                      <div className="text-sm text-red-600">{jobsError}</div>
                    ) : jobsData && jobsData.length > 0 ? (
                      <div className="space-y-2 max-h-48 overflow-y-auto">
                        {jobsData.map((job) => (
                          <div
                            key={`${job.task_id}-${job.job_id}`}
                            className="bg-gray-50 rounded-lg p-3 text-sm"
                          >
                            <div className="flex justify-between items-start mb-2">
                              <div className="flex-1">
                                <div className="font-medium text-gray-900">{job.task_name}</div>
                                <div className="text-xs text-gray-500 mt-1">
                                  Job #{job.job_sequence}
                                </div>
                              </div>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <span
                                className={`px-2 py-1 rounded text-xs font-medium ${getJobStatusColor(
                                  job.job_status
                                )}`}
                              >
                                {job.job_status}
                              </span>
                              {job.job_is_archived && (
                                <span className="text-xs px-2 py-1 bg-gray-200 text-gray-600 rounded">
                                  Archived
                                </span>
                              )}
                              {job.assignee_email && (
                                <span className="text-xs text-gray-600 truncate max-w-[150px]">
                                  {job.assignee_email}
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-400">No jobs assigned</p>
                    )}
                  </div>

                  {/* Annotation Summary */}
                  {showImageModal.annotation_summary && (
                    <div>
                      <h4 className="text-sm font-medium text-gray-500 mb-2">Annotations</h4>
                      <div className="bg-gray-50 rounded-lg p-3 space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-gray-600">Detections</span>
                          <span className="text-gray-900">
                            {showImageModal.annotation_summary.detection_count}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Segmentations</span>
                          <span className="text-gray-900">
                            {showImageModal.annotation_summary.segmentation_count}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-gray-100 flex justify-between gap-3">
              <div className="flex-1">
                {jobsData && jobsData.length > 1 && (
                  <select
                    value={selectedJobIdForAnnotation || ''}
                    onChange={(e) => setSelectedJobIdForAnnotation(Number(e.target.value))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select a job to annotate...</option>
                    {jobsData
                      .filter((job) => !job.job_is_archived)
                      .map((job) => (
                        <option key={job.job_id} value={job.job_id}>
                          {job.task_name} - Job #{job.job_sequence}
                        </option>
                      ))}
                  </select>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowImageModal(null)}
                  className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors"
                >
                  Close
                </button>
                {jobsData && jobsData.filter((job) => !job.job_is_archived).length > 0 && (
                  <button
                    onClick={handleAnnotateClick}
                    disabled={jobsData.length > 1 && !selectedJobIdForAnnotation}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
                  >
                    Annotate
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
