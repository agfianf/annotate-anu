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
import { useNavigate } from 'react-router-dom';
import { useExploreView } from '../contexts/ExploreViewContext';
import { useExploreFilters } from '../hooks/useExploreFilters';
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
    toggleAttributeValue: toggleSidebarAttributeValue,
    setNumericRange: setSidebarNumericRange,
    toggleSizeFilter: toggleSidebarSizeFilter,
    setWidthRange: setSidebarWidthRange,
    setHeightRange: setSidebarHeightRange,
    setSizeRange: setSidebarSizeRange,
    setFilepathFilter: setSidebarFilepathFilter,
    clearFilters: clearSidebarFilters,
    hasActiveFilters: hasSidebarFilters,
    setTagIds: setSidebarTagIds,
  } = useExploreFilters();

  // Visibility state for controlling tag display on thumbnails
  const visibilityState = useExploreVisibility(projectId);

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

  // Modals
  const [showTagManager, setShowTagManager] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState(TAG_COLORS[0]);
  const [showAddTagModal, setShowAddTagModal] = useState(false);
  const [showRemoveTagModal, setShowRemoveTagModal] = useState(false);
  const [showImageModal, setShowImageModal] = useState<SharedImage | null>(null);

  // Job association state for image modal
  const [selectedJobIdForAnnotation, setSelectedJobIdForAnnotation] = useState<number | null>(null);
  const [jobsData, setJobsData] = useState<JobAssociation[] | null>(null);
  const [jobsLoading, setJobsLoading] = useState(false);
  const [jobsError, setJobsError] = useState<string | null>(null);

  // Build filters object
  const filters: ExploreFilters = useMemo(
    () => ({
      search: debouncedSearch || undefined,
      tag_ids: sidebarFilters.selectedTagIds.length > 0 ? sidebarFilters.selectedTagIds : undefined,
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
    }),
    [debouncedSearch, sidebarFilters, selectedTaskIds, selectedJobId, isAnnotatedFilter]
  );

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
  const categoryColorMap = useMemo(() => {
    const map: Record<string, string> = {};
    tagCategories.forEach((category) => {
      if (category.id) {
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
    if (!jobsData || jobsData.length === 0) return;

    const targetJobId =
      jobsData.length === 1 ? jobsData[0].job_id : selectedJobIdForAnnotation;

    if (targetJobId) {
      navigate(`/app?jobId=${targetJobId}`);
      setShowImageModal(null);
    }
  }, [jobsData, selectedJobIdForAnnotation, navigate]);

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

    const uncategorizedTags = useMemo(
      () => allTags.filter((t) => t.category_id === null),
      [allTags]
    );

    // Auto-focus search input
    useEffect(() => {
      if (searchInputRef.current) {
        requestAnimationFrame(() => searchInputRef.current?.focus());
      }
    }, []);

    // Filter categories and uncategorized tags based on search
    const filteredCategories = useMemo(
      () => filterCategoriesBySearch(categoriesWithTags, searchTag),
      [searchTag, categoriesWithTags]
    );

    const filteredUncategorizedTags = useMemo(() => {
      if (!searchTag.trim()) return uncategorizedTags;
      const searchLower = searchTag.toLowerCase();
      return uncategorizedTags.filter((t) => t.name.toLowerCase().includes(searchLower));
    }, [searchTag, uncategorizedTags]);

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
            {filteredCategories.length === 0 && filteredUncategorizedTags.length === 0 ? (
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
                  />
                ))}

                {/* Uncategorized Tags Section */}
                {filteredUncategorizedTags.length > 0 && (
                  <div className="mt-3">
                    <div className="text-xs text-gray-500 uppercase tracking-wide px-3 py-1.5 bg-gray-50 border-t border-gray-100 font-semibold rounded-t-lg">
                      Uncategorized Tags
                    </div>
                    <div className="space-y-1 mt-1">
                      {filteredUncategorizedTags.map((tag) => {
                        const isSelected = selectedTagIds.includes(tag.id);
                        return (
                          <label
                            key={tag.id}
                            className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 rounded-lg cursor-pointer transition-colors group"
                          >
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => handleToggleTag(tag.id)}
                              className="w-4 h-4 text-emerald-600 border-gray-300 rounded focus:ring-emerald-500"
                            />
                            <span
                              className="w-3 h-3 rounded-full flex-shrink-0"
                              style={{ backgroundColor: tag.color }}
                            />
                            <span className="text-sm text-gray-700 flex-1 font-medium">
                              {tag.name}
                            </span>
                            {tag.usage_count !== undefined && (
                              <span className="text-xs text-gray-400 font-mono">
                                ({tag.usage_count})
                              </span>
                            )}
                            {isSelected && (
                              <Check className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                            )}
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex items-center justify-between gap-3">
            <button
              onClick={() => {
                setShowAddTagModal(false);
                setShowTagManager(true);
              }}
              className="text-sm text-emerald-600 hover:text-emerald-700 font-medium flex items-center gap-1.5 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Create New Tag
            </button>
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

    const uncategorizedRelevantTags = useMemo(
      () => tagsFromSelectedImages.filter((t) => t.category_id === null),
      [tagsFromSelectedImages]
    );

    // Auto-focus search input
    useEffect(() => {
      if (searchInputRef.current) {
        requestAnimationFrame(() => searchInputRef.current?.focus());
      }
    }, []);

    // Filter categories and uncategorized tags based on search
    const filteredCategories = useMemo(
      () => filterCategoriesBySearch(categoriesWithRelevantTags, searchTag),
      [searchTag, categoriesWithRelevantTags]
    );

    const filteredUncategorizedTags = useMemo(() => {
      if (!searchTag.trim()) return uncategorizedRelevantTags;
      const searchLower = searchTag.toLowerCase();
      return uncategorizedRelevantTags.filter((t) => t.name.toLowerCase().includes(searchLower));
    }, [searchTag, uncategorizedRelevantTags]);

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
            {filteredCategories.length === 0 && filteredUncategorizedTags.length === 0 ? (
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
                  />
                ))}

                {/* Uncategorized Tags Section */}
                {filteredUncategorizedTags.length > 0 && (
                  <div className="mt-3">
                    <div className="text-xs text-gray-500 uppercase tracking-wide px-3 py-1.5 bg-gray-50 border-t border-gray-100 font-semibold rounded-t-lg">
                      Uncategorized Tags
                    </div>
                    <div className="space-y-1 mt-1">
                      {filteredUncategorizedTags.map((tag) => {
                        const isSelected = selectedTagIds.includes(tag.id);
                        return (
                          <label
                            key={tag.id}
                            className="flex items-center gap-3 px-4 py-2.5 hover:bg-red-50 rounded-lg cursor-pointer transition-colors group"
                          >
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => handleToggleTag(tag.id)}
                              className="w-4 h-4 text-red-600 border-gray-300 rounded focus:ring-red-500"
                            />
                            <span
                              className="w-3 h-3 rounded-full flex-shrink-0"
                              style={{ backgroundColor: tag.color }}
                            />
                            <span className="text-sm text-gray-700 flex-1 font-medium">
                              {tag.name}
                            </span>
                            {isSelected && (
                              <Check className="w-4 h-4 text-red-600 flex-shrink-0" />
                            )}
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}
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
            onClick={() => refetchImages()}
            className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4" />
          </button>

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

        {/* Tag Filters */}
        <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-gray-100">
          <span className="text-sm text-gray-500 flex items-center gap-1">
            <Tag className="w-4 h-4" />
            Tags:
          </span>
          {allTags.map((tag) => (
            <button
              key={tag.id}
              onClick={() => toggleSidebarTag(tag.id)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-all flex items-center gap-1 ${
                sidebarFilters.selectedTagIds.includes(tag.id)
                  ? 'ring-2 ring-offset-1'
                  : 'opacity-70 hover:opacity-100'
              }`}
              style={{
                backgroundColor: `${tag.color}20`,
                color: tag.color,
                borderColor: tag.color,
                ...(sidebarFilters.selectedTagIds.includes(tag.id) && { ringColor: tag.color }),
              }}
            >
              {tag.name}
              {tag.usage_count !== undefined && (
                <span className="text-[10px] opacity-60">({tag.usage_count})</span>
              )}
            </button>
          ))}
          <button
            onClick={() => setShowTagManager(true)}
            className="px-2 py-1 text-xs text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 rounded-full flex items-center gap-1"
          >
            <Plus className="w-3 h-3" />
            New Tag
          </button>
          {sidebarFilters.selectedTagIds.length > 0 && (
            <button
              onClick={() => setSidebarTagIds([])}
              className="px-2 py-1 text-xs text-gray-500 hover:text-gray-700 rounded-full flex items-center gap-1"
            >
              <X className="w-3 h-3" />
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Floating Selection Actions Bar */}
      {selectedImages.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-bottom-5 duration-300">
          <div className="bg-emerald-600 text-white rounded-full shadow-2xl px-6 py-3 flex items-center gap-4 border border-emerald-700">
            <span className="text-sm font-medium">
              {selectedImages.size} selected
            </span>
            <div className="h-5 w-px bg-emerald-400"></div>
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
                className="p-2.5 bg-red-500/20 hover:bg-red-500/30 disabled:bg-white/10 disabled:cursor-not-allowed backdrop-blur-sm text-white rounded-full flex items-center transition-all"
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
              visibility={visibilityState}
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
            spacing={12}
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

      {/* Image Detail Modal */}
      {showImageModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl mx-4 max-h-[95vh] overflow-hidden flex flex-col">
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

            <div className="flex-1 overflow-y-auto p-6">
              <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 h-full">
                {/* Image Preview - takes 3 columns on large screens */}
                <div className="lg:col-span-3 bg-gray-100 rounded-xl overflow-hidden flex items-center justify-center min-h-[400px] lg:min-h-0">
                  <FullscreenImage
                    src={getFullSizeThumbnailUrl(showImageModal.thumbnail_url)}
                    alt={showImageModal.filename}
                    className="w-full h-full object-contain max-h-[70vh]"
                  />
                </div>

                {/* Details - takes 1 column on large screens */}
                <div className="lg:col-span-1 space-y-4 lg:overflow-y-auto">
                  <div>
                    <h4 className="text-sm font-medium text-gray-500 mb-1">File Info</h4>
                    <div className="bg-gray-50 rounded-lg p-3 space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-600">Path</span>
                        <span className="text-gray-900 font-mono text-xs truncate max-w-[60%]">
                          {showImageModal.file_path}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Dimensions</span>
                        <span className="text-gray-900">
                          {showImageModal.width || '?'} x {showImageModal.height || '?'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Size</span>
                        <span className="text-gray-900">
                          {showImageModal.file_size_bytes
                            ? `${(showImageModal.file_size_bytes / 1024 / 1024).toFixed(2)} MB`
                            : 'Unknown'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Type</span>
                        <span className="text-gray-900">{showImageModal.mime_type || 'Unknown'}</span>
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

                    <div className="flex flex-wrap gap-2">
                      {showImageModal.tags.map((tag) => (
                        <div
                          key={tag.id}
                          className="px-3 py-1 rounded-full text-xs font-medium flex items-center gap-2 group"
                          style={{
                            backgroundColor: `${tag.color}20`,
                            color: tag.color,
                          }}
                        >
                          <span>{tag.name}</span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRemoveTag(showImageModal.id, tag.id);
                            }}
                            disabled={removeTagMutation.isPending}
                            className="opacity-0 group-hover:opacity-100 hover:text-red-600 transition-opacity"
                            title="Remove tag"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                      {showImageModal.tags.length === 0 && (
                        <span className="text-sm text-gray-400">No tags assigned</span>
                      )}
                    </div>
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
