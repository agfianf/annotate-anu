/**
 * ProjectExploreTab Component
 * FiftyOne-like image gallery with virtualization and infinite scroll
 * Supports 10,000+ images with smooth performance
 */

import { useMutation, useQuery, useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { useAnnotationFilters } from '../hooks/useAnnotationFilters';
import {
    AlertTriangle,
    Grid3X3,
    Image as ImageIcon,
    Link as LinkIcon,
    Loader2,
    Plus,
    RefreshCw,
    Search,
    Sparkles,
    Tag,
    Delete,
    X
} from '@/components/ui/icons';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { useNavigate } from '@tanstack/react-router';
import { useExploreView } from '../contexts/ExploreViewContext';
import { useExploreFilters, useSidebarAggregations } from '../hooks/useExploreFilters';
import { useExploreVisibility } from '../hooks/useExploreVisibility';
import { useInfiniteExploreImages } from '../hooks/useInfiniteExploreImages';
import { useZoomLevel } from '../hooks/useZoomLevel';
import { tasksApi } from '../lib/api-client';
import { getApiErrorMessage } from '../lib/api-error';
import {
    getFullSizeThumbnailUrl,
    projectImagesApi,
    tagCategoriesApi,
    tagsApi,
    type BulkTagPreviewResponse,
    type ExploreFilters,
    type ExploreResponse,
    type ImageSelectionScope,
    type SharedImage,
    type Tag as TagType
} from '../lib/data-management-client';
import { projectsApi } from '../lib/api-client';
import { filterCategoriesBySearch } from '../lib/tag-utils';
import { ImageDetailDialog, VirtualizedImageGrid } from './explore';
import { UnifiedExploreSidebar } from './explore/sidebar/unified';
import { ExploreToolbar, useGridSize, type ExploreFilterChipKey } from './explore/toolbar';
import CategoryGroup from './CategoryGroup';
import { ExportWizardModal } from './export';
import type { FilterSnapshot } from '@/types/export';
import {
    buildImageFilterContract,
    filterContractKey,
    filterContractToSnapshot,
    hasAnyFilter,
    type ImageFilterContract,
    type ToolbarFilterState,
} from '@/lib/explore-filter-contract';
import {
    exploreViewToFilterState,
    useExploreUrlSync,
    type ExploreView,
    type ExploreViewDisplay,
} from '@/hooks/useExploreUrlSync';
import { BatchClassifyModal } from './explore/BatchClassifyModal';
import { AutoTagModal } from './explore/AutoTagModal';
import { useModelRegistry } from '../hooks/useModelRegistry';
// Analytics Panel System
import { AnalyticsPanelContext, AnalyticsPanelProvider } from '@/contexts/AnalyticsPanelContext';
import { AnalyticsPanelContainer, PanelLibrary } from './analytics';
import type { LayoutMode } from '@/types/analytics';

interface ProjectExploreTabProps {
  projectId: string;
}

/** `useGridSize`'s own default. A density equal to it is what a link's recipient gets anyway, so it is not worth encoding into a shared view. */
const DEFAULT_VIEW_DENSITY = 'm';

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

  // Zoom level (keeping for backward compatibility)
  const { zoomLevel, setZoomLevel, config: zoomConfig } = useZoomLevel();

  // New grid size slider (5 stops: xs, s, m, l, xl)
  const { size: gridSize, setSize: setGridSize, config: gridConfig } = useGridSize();

  // Track window width for responsive layout
  const [isDesktop, setIsDesktop] = useState(typeof window !== 'undefined' ? window.innerWidth >= 768 : true);

  useEffect(() => {
    const handleResize = () => {
      setIsDesktop(window.innerWidth >= 768);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Sidebar collapse state (synced with UnifiedExploreSidebar)
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  // Panel container resize state
  const MIN_PANEL_WIDTH = 280;
  const MAX_PANEL_WIDTH = 600;
  const DEFAULT_PANEL_WIDTH = 380;

  const [panelWidth, setPanelWidth] = useState(() => {
    const saved = localStorage.getItem('explorePanelWidth');
    return saved ? parseInt(saved, 10) : DEFAULT_PANEL_WIDTH;
  });
  const [isPanelResizing, setIsPanelResizing] = useState(false);
  const panelContainerRef = useRef<HTMLDivElement>(null);

  // Save panel width to localStorage
  useEffect(() => {
    const timer = setTimeout(() => {
      localStorage.setItem('explorePanelWidth', panelWidth.toString());
    }, 300);
    return () => clearTimeout(timer);
  }, [panelWidth]);

  // Panel resize handlers
  const startPanelResizing = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsPanelResizing(true);
  }, []);

  const stopPanelResizing = useCallback(() => {
    setIsPanelResizing(false);
  }, []);

  const resizePanel = useCallback(
    (e: MouseEvent) => {
      if (isPanelResizing && panelContainerRef.current) {
        // Calculate width from right edge of viewport to mouse position
        const containerRight = panelContainerRef.current.getBoundingClientRect().right;
        const newWidth = containerRight - e.clientX;
        if (newWidth >= MIN_PANEL_WIDTH && newWidth <= MAX_PANEL_WIDTH) {
          setPanelWidth(newWidth);
        }
      }
    },
    [isPanelResizing]
  );

  useEffect(() => {
    if (isPanelResizing) {
      window.addEventListener('mousemove', resizePanel);
      window.addEventListener('mouseup', stopPanelResizing);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';

      return () => {
        window.removeEventListener('mousemove', resizePanel);
        window.removeEventListener('mouseup', stopPanelResizing);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      };
    }
  }, [isPanelResizing, resizePanel, stopPanelResizing]);

  // Search with debounce
  const [searchInput, setSearchInput] = useState('');
  const debouncedSearch = useDebounce(searchInput, 300);

  // Sidebar filters state
  const {
    filters: sidebarFilters,
    setFilters,
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
    setAspectRatioRange: setSidebarAspectRatioRange,
    setSizeRange: setSidebarSizeRange,
    // Clearing a range is not the same as widening it: a range set to sentinel bounds is still a
    // constraint, still encoded into the URL and the export snapshot, and still excludes whatever
    // falls outside the sentinels. These set the range back to undefined.
    clearWidthRange,
    clearHeightRange,
    clearAspectRatioRange,
    clearFileSizeRange,
    setFilepathFilter: setSidebarFilepathFilter,
    setFilepathPaths: setSidebarFilepathPaths,
    setImageUids,
    clearFilters: clearSidebarFilters,
    hasActiveFilters: hasSidebarFilters,
  } = useExploreFilters();

  // Visibility state for controlling tag display on thumbnails
  const visibilityState = useExploreVisibility(projectId);

  // Fetch project details to get labels for annotation filtering
  const { data: projectDetails } = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => projectsApi.get(Number(projectId)),
    enabled: !!projectId,
  });

  const projectLabels = useMemo(() => projectDetails?.labels.map(label => ({
    ...label, createdAt: 0,
  })), [projectDetails?.labels]);

  // Annotation filters hook for per-label confidence threshold filtering
  const annotationFilters = useAnnotationFilters(projectId, projectLabels);

  // Model registry for classification (undefined = solo mode, all models available)
  const { allModels } = useModelRegistry();

  // Filters
  // Filters (Main Toolbar)
  // Converting local state to usage of sidebarFilters where appropriate or keeping separate if strictly top-bar specific?
  // We should unify tags.
  // const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]); // Removed in favor of sidebarFilters
  const [selectedTaskIds, setSelectedTaskIds] = useState<number[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<number | undefined>();
  const [isAnnotatedFilter, setIsAnnotatedFilter] = useState<boolean | undefined>();

  /**
   * Selection has two scopes, and the difference is not cosmetic (G05).
   *
   * `loaded` holds explicit image ids — only images the client has actually fetched, which is what
   * the old "Select All" button did while claiming to select everything.
   *
   * `matching` means "every image the current filters select, minus these exclusions". The ids are
   * never materialised in the browser: bulk endpoints take the filter scope and resolve it
   * **when the request arrives**, so an image that started matching after the user pressed the
   * button is included and one that stopped matching is not. Every label and confirmation below
   * has to describe that rule rather than implying a frozen set.
   */
  const [selectionMode, setSelectionMode] = useState<'loaded' | 'matching'>('loaded');
  const [selectedImages, setSelectedImages] = useState<Set<string>>(new Set());
  const [excludedImageIds, setExcludedImageIds] = useState<Set<string>>(new Set());
  /** Anchor for Shift-range selection, held as a stable image id rather than an index. */
  const [selectionAnchorId, setSelectionAnchorId] = useState<string | null>(null);
  /** Politely announced status text for assistive technology (G02, G05). */
  const [statusMessage, setStatusMessage] = useState('');

  const clearSelection = useCallback(() => {
    setSelectionMode('loaded');
    setSelectedImages(new Set());
    setExcludedImageIds(new Set());
    setSelectionAnchorId(null);
  }, []);

  // Refresh state
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Modals
  const [showTagManager, setShowTagManager] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState(TAG_COLORS[0]);
  const [showAddTagModal, setShowAddTagModal] = useState(false);
  const [showRemoveTagModal, setShowRemoveTagModal] = useState(false);
  const [showExportWizard, setShowExportWizard] = useState(false);
  const [showClassifyModal, setShowClassifyModal] = useState(false);
  const [showAutoTagModal, setShowAutoTagModal] = useState(false);

  // Bulk tag confirmation state (1 tag per label rule)
  const [pendingBulkTag, setPendingBulkTag] = useState<{
    imageIds?: string[];
    scope?: ImageSelectionScope;
    tagIds: string[];
    preview: BulkTagPreviewResponse;
  } | null>(null);

  /**
   * The viewer is keyed by image id, not by a copied image object (G07). The live object is
   * looked up from the query data on every render, so a bulk tag or a tag removal shows on the
   * open image as soon as the refreshed page lands, instead of freezing whatever the tile held
   * when it was clicked.
   */
  const [viewerImageId, setViewerImageId] = useState<string | null>(null);
  /** Last known object for the viewed image, so the dialog survives the moment between an invalidation and the refreshed page. */
  const [viewerImageSnapshot, setViewerImageSnapshot] = useState<SharedImage | null>(null);
  /** True while a next page is being fetched so the viewer can step past the last loaded image. */
  const [isAdvancingViewer, setIsAdvancingViewer] = useState(false);

  // Filters
  // The gallery query, the export snapshot, the saved-view URL, and the analytics panels are all
  // derived from one contract (G03). Assembling them separately is what let an export cover a
  // different image set from the one on screen: the old snapshot silently dropped search, aspect
  // ratio, quality metrics, RGB, issues, and the annotation-count filters.
  const toolbarFilters: ToolbarFilterState = useMemo(
    () => ({
      search: debouncedSearch || undefined,
      taskIds: selectedTaskIds.length > 0 ? selectedTaskIds : undefined,
      jobId: selectedJobId,
      isAnnotated: isAnnotatedFilter,
    }),
    [debouncedSearch, selectedTaskIds, selectedJobId, isAnnotatedFilter]
  );

  const filters: ImageFilterContract = useMemo(
    () => buildImageFilterContract(sidebarFilters, toolbarFilters),
    [sidebarFilters, toolbarFilters]
  );

  const currentFilterSnapshot: FilterSnapshot = useMemo(
    () => filterContractToSnapshot(filters),
    [filters]
  );

  /** Identity of the committed filter set. Equal keys mean "the same images match". */
  const committedFilterKey = useMemo(() => filterContractKey(filters), [filters]);

  const isFiltered = useMemo(() => hasAnyFilter(filters), [filters]);

  // Sidebar facet counts describe the same subset as the gallery (G11): the toolbar's half of the
  // membership filters is passed through, so the numbers next to a facet are not counted over a
  // wider set than the one on screen.
  const {
    widthAggregation,
    heightAggregation,
    sizeAggregation,
  } = useSidebarAggregations(projectId, sidebarFilters, toolbarFilters);

  // Geometry is requested only when it is actually drawn (G10). Counts come back either way, so
  // the annotation badges keep working with the overlays switched off.
  const annotationDisplay = visibilityState.visibility.annotationDisplay;
  const includeBboxes = annotationDisplay.showBboxes;
  const includePolygons = annotationDisplay.showPolygons;

  // Fetch images with infinite scroll
  const {
    images,
    total,
    isLoading: isLoadingImages,
    isFetching: isFetchingImages,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    refetch: refetchImages,
    error: imagesError,
    isError: isImagesError,
    nextPageError,
  } = useInfiniteExploreImages({
    projectId,
    filters,
    pageSize: 100,
    enabled: !!projectId,
    includeBboxes,
    includePolygons,
  });

  /**
   * A filter change is committed but its result set has not arrived yet (G17).
   *
   * `isFetchingImages` is not this signal: a next-page fetch sets it too, which is exactly the
   * conflation that let an ordinary scroll blur the whole gallery. The honest test is whether the
   * committed filter key differs from the key whose data is currently rendered — with
   * `keepPreviousData` in play, that is the window in which the counts and the tiles describe
   * different filter sets, so scope-describing actions are disabled while it is true.
   */
  const [resolvedFilterKey, setResolvedFilterKey] = useState<string | null>(null);
  useEffect(() => {
    if (isFetchingImages) return;
    setResolvedFilterKey(committedFilterKey);
  }, [isFetchingImages, committedFilterKey]);
  const isFilterChangePending = resolvedFilterKey !== committedFilterKey;
  const isBackgroundRefreshing = isFetchingImages && !isLoadingImages && !isFetchingNextPage && !isFilterChangePending;

  /** Result-set and pagination state, announced rather than only drawn (G02). Derived, so it never lags the data it describes. */
  const resultsAnnouncement = useMemo(() => {
    if (isLoadingImages) return 'Loading images.';
    if (isImagesError && images.length === 0) return 'The gallery could not be loaded.';
    if (isFilterChangePending) return 'Updating results for the new filters.';
    if (nextPageError) return 'Could not load more images. The images already loaded are still available.';
    if (isFetchingNextPage) return 'Loading more images.';
    return `${total.toLocaleString()} image(s) match the current filters. ${images.length.toLocaleString()} loaded.`;
  }, [isLoadingImages, isImagesError, isFilterChangePending, nextPageError, isFetchingNextPage, total, images.length]);

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
    queryFn: () => tasksApi.list(Number(projectId)),
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
      const errorMessage = getApiErrorMessage(error, 'Failed to create tag');
      toast.error(errorMessage);
    },
  });

  /**
   * Patch one image in place in the infinite query cache.
   *
   * The mutation response already carries the image's new tags, so applying it directly is both
   * faster and more correct than the old code, which read the *existing* `images` array right
   * after invalidation and therefore copied pre-mutation tags into the viewer (G07).
   */
  const patchImageInCache = useCallback(
    (imageId: string, patch: Partial<SharedImage>) => {
      queryClient.setQueriesData<InfiniteData<ExploreResponse>>(
        { queryKey: ['project-explore-infinite'] },
        (data) => {
          if (!data) return data;
          return {
            ...data,
            pages: data.pages.map((page) => ({
              ...page,
              images: page.images.map((img) => (img.id === imageId ? { ...img, ...patch } : img)),
            })),
          };
        }
      );
    },
    [queryClient]
  );

  // Bulk tag mutation. `scope` and `imageIds` are the two shapes the endpoint accepts: an explicit
  // id list, or a filter scope the server resolves when the request lands.
  const bulkTagMutation = useMutation({
    mutationFn: ({
      imageIds,
      scope,
      tagIds,
    }: {
      imageIds?: string[];
      scope?: ImageSelectionScope;
      tagIds: string[];
    }) =>
      scope
        ? projectImagesApi.bulkTagScope(Number(projectId), scope, tagIds)
        : projectImagesApi.bulkTag(Number(projectId), imageIds ?? [], tagIds),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['project-explore-infinite'] });
      queryClient.invalidateQueries({ queryKey: ['tags', projectId] }); // Update tag counts
      clearSelection();
      setShowAddTagModal(false);

      // Show toast with replacement info if applicable
      if (result.tags_replaced > 0) {
        toast.success(
          `Added ${result.tags_added} tag(s) (replaced ${result.tags_replaced} existing)`,
          { duration: 4000 }
        );
      } else {
        toast.success(`Tags added (${result.tags_added})`);
      }
    },
    onError: (error: any) => {
      console.error('Failed to add tags:', error);
      const errorMessage = getApiErrorMessage(error, 'Failed to add tags');
      toast.error(errorMessage);
    },
  });

  // Remove tag from specific image
  const removeTagMutation = useMutation({
    mutationFn: ({ imageId, tagId }: { imageId: string; tagId: string }) =>
      projectImagesApi.removeTag(Number(projectId), imageId, tagId),
    onSuccess: (updatedTags, variables) => {
      // The response is the image's new tag list: write it into the cache so the grid and the
      // open viewer both read the same updated data.
      patchImageInCache(variables.imageId, { tags: updatedTags });
      queryClient.invalidateQueries({ queryKey: ['project-explore-infinite'] });
      queryClient.invalidateQueries({ queryKey: ['tags', projectId] }); // Update tag counts
      toast.success('Tag removed');
    },
    onError: (error: any) => {
      console.error('Failed to remove tag:', error);
      const errorMessage = getApiErrorMessage(error, 'Failed to remove tag');
      toast.error(errorMessage);
    },
  });

  // Bulk remove tags mutation
  const bulkUntagMutation = useMutation({
    mutationFn: ({
      imageIds,
      scope,
      tagIds,
    }: {
      imageIds?: string[];
      scope?: ImageSelectionScope;
      tagIds: string[];
    }) =>
      scope
        ? projectImagesApi.bulkUntagScope(Number(projectId), scope, tagIds)
        : projectImagesApi.bulkUntag(Number(projectId), imageIds ?? [], tagIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-explore-infinite'] });
      queryClient.invalidateQueries({ queryKey: ['tags', projectId] }); // Update tag counts
      clearSelection();
      setShowRemoveTagModal(false);
      toast.success('Tags removed');
    },
    onError: (error: any) => {
      console.error('Failed to remove tags:', error);
      const errorMessage = getApiErrorMessage(error, 'Failed to remove tags');
      toast.error(errorMessage);
    },
  });

  // A filter change invalidates the selection: the ids no longer describe "what is on screen",
  // and a scope selection would resolve against filters the user has moved away from. Announce it
  // rather than silently emptying the bar (G05).
  const previousFilterKeyRef = useRef(committedFilterKey);
  useEffect(() => {
    if (previousFilterKeyRef.current === committedFilterKey) return;
    previousFilterKeyRef.current = committedFilterKey;
    const hadSelection = selectionMode === 'matching' || selectedImages.size > 0;
    clearSelection();
    if (hadSelection) {
      setStatusMessage('Filters changed, so the image selection was cleared.');
    }
  }, [committedFilterKey, selectionMode, selectedImages.size, clearSelection]);

  // Handlers
  /**
   * Shift-range selection (G05). The grid's `onToggleImage` carries only an image id, so the
   * modifier is read from the event that is about to produce the toggle: a capture-phase listener
   * records `shiftKey` immediately before the handler runs. Ranges are resolved through stable
   * image ids, never through row or tile indices, so a range stays correct across re-flow.
   */
  const shiftHeldRef = useRef(false);
  useEffect(() => {
    const record = (event: MouseEvent | PointerEvent | KeyboardEvent) => {
      shiftHeldRef.current = event.shiftKey;
    };
    window.addEventListener('pointerdown', record, true);
    window.addEventListener('mousedown', record, true);
    window.addEventListener('keydown', record, true);
    return () => {
      window.removeEventListener('pointerdown', record, true);
      window.removeEventListener('mousedown', record, true);
      window.removeEventListener('keydown', record, true);
    };
  }, []);

  const handleSelectLoaded = useCallback(() => {
    setSelectionMode('loaded');
    setExcludedImageIds(new Set());
    setSelectedImages(new Set(images.map((img) => img.id)));
    setStatusMessage(`${images.length.toLocaleString()} loaded image(s) selected.`);
  }, [images]);

  const handleSelectAllMatching = useCallback(() => {
    setSelectionMode('matching');
    setSelectedImages(new Set());
    setExcludedImageIds(new Set());
    setSelectionAnchorId(null);
    setStatusMessage(
      `Every image matching the current filters is selected. The exact set is resolved when an action runs, about ${total.toLocaleString()} right now.`
    );
  }, [total]);

  const handleClearSelection = useCallback(() => {
    clearSelection();
    setStatusMessage('Selection cleared.');
  }, [clearSelection]);

  const handleToggleImage = useCallback(
    (imageId: string) => {
      const withShift = shiftHeldRef.current;

      // In "all matching" scope a tile click is a de-selection: it adds an exclusion the server
      // subtracts when it resolves the scope.
      if (selectionMode === 'matching') {
        setExcludedImageIds((prev) => {
          const next = new Set(prev);
          if (next.has(imageId)) next.delete(imageId);
          else next.add(imageId);
          return next;
        });
        setSelectionAnchorId(imageId);
        return;
      }

      if (withShift && selectionAnchorId && selectionAnchorId !== imageId) {
        const anchorIndex = images.findIndex((img) => img.id === selectionAnchorId);
        const targetIndex = images.findIndex((img) => img.id === imageId);
        if (anchorIndex !== -1 && targetIndex !== -1) {
          const [from, to] = anchorIndex < targetIndex ? [anchorIndex, targetIndex] : [targetIndex, anchorIndex];
          const rangeIds = images.slice(from, to + 1).map((img) => img.id);
          setSelectedImages((prev) => {
            const next = new Set(prev);
            rangeIds.forEach((id) => next.add(id));
            return next;
          });
          setSelectionAnchorId(imageId);
          setStatusMessage(`${rangeIds.length.toLocaleString()} image(s) added to the selection.`);
          return;
        }
      }

      setSelectedImages((prev) => {
        const next = new Set(prev);
        if (next.has(imageId)) {
          next.delete(imageId);
        } else {
          next.add(imageId);
        }
        return next;
      });
      setSelectionAnchorId(imageId);
    },
    [images, selectionAnchorId, selectionMode]
  );

  /** What the grid paints as selected. In "all matching" scope every loaded tile is selected except the exclusions. */
  const gridSelectedImages = useMemo(() => {
    if (selectionMode !== 'matching') return selectedImages;
    const next = new Set<string>();
    images.forEach((img) => {
      if (!excludedImageIds.has(img.id)) next.add(img.id);
    });
    return next;
  }, [selectionMode, selectedImages, images, excludedImageIds]);

  /** How many images an action would affect. In scope mode it is the server's matching total minus the exclusions — an estimate until the action resolves. */
  const selectedCount =
    selectionMode === 'matching'
      ? Math.max(0, total - excludedImageIds.size)
      : selectedImages.size;

  const hasSelection = selectionMode === 'matching' || selectedImages.size > 0;

  /** The scope to send with a bulk action, or null when the action takes explicit ids. */
  const selectionScope: ImageSelectionScope | null =
    selectionMode === 'matching'
      ? { filters, excluded_image_ids: Array.from(excludedImageIds) }
      : null;

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

  const handleBulkAddTags = async (tagIds: string[]) => {
    if (!hasSelection || tagIds.length === 0) return;

    const imageIds = selectionScope ? undefined : Array.from(selectedImages);

    // Preview first, so the 1-tag-per-label replacement confirmation still happens. In scope mode
    // the preview resolves the filter separately from the operation, so it is an estimate rather
    // than a reservation — the confirmation copy says so.
    try {
      const preview = selectionScope
        ? await projectImagesApi.bulkTagPreviewScope(Number(projectId), selectionScope, tagIds)
        : await projectImagesApi.bulkTagPreview(Number(projectId), imageIds ?? [], tagIds);

      // If there are tags to replace, show confirmation dialog
      if (preview.tags_to_replace > 0) {
        setPendingBulkTag({
          imageIds,
          scope: selectionScope ?? undefined,
          tagIds,
          preview,
        });
        setShowAddTagModal(false); // Close the tag selection modal
        return;
      }

      // No conflicts, proceed directly
      bulkTagMutation.mutate({ imageIds, scope: selectionScope ?? undefined, tagIds });
    } catch (error: any) {
      console.error('Failed to preview bulk tag:', error);
      const errorMessage = getApiErrorMessage(error, 'Failed to preview tag operation');
      toast.error(errorMessage);
    }
  };

  // Confirm the pending bulk tag operation (after user sees preview)
  const handleConfirmBulkTag = () => {
    if (!pendingBulkTag) return;
    bulkTagMutation.mutate({
      imageIds: pendingBulkTag.imageIds,
      scope: pendingBulkTag.scope,
      tagIds: pendingBulkTag.tagIds,
    });
    setPendingBulkTag(null);
  };

  // Cancel the pending bulk tag operation
  const handleCancelBulkTag = () => {
    setPendingBulkTag(null);
  };

  const handleBulkRemoveTags = (tagIds: string[]) => {
    if (!hasSelection || tagIds.length === 0) return;
    bulkUntagMutation.mutate({
      imageIds: selectionScope ? undefined : Array.from(selectedImages),
      scope: selectionScope ?? undefined,
      tagIds,
    });
  };

  /**
   * Tags present on the selection, for the "remove tags" picker. In "all matching" scope only the
   * loaded images can be inspected, so the list is the tags seen so far rather than every tag in
   * the matching set; the picker says as much.
   */
  const getTagsFromSelectedImages = useCallback((): TagType[] => {
    const tagMap = new Map<string, TagType>();
    const source =
      selectionMode === 'matching'
        ? images.filter((img) => !excludedImageIds.has(img.id))
        : images.filter((img) => selectedImages.has(img.id));

    source.forEach((image) => {
      image.tags.forEach((tag) => {
        if (!tagMap.has(tag.id)) {
          tagMap.set(tag.id, tag);
        }
      });
    });

    return Array.from(tagMap.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [selectedImages, images, selectionMode, excludedImageIds]);

  const handleRemoveTag = useCallback((imageId: string, tagId: string) => {
    removeTagMutation.mutate({ imageId, tagId });
  }, [removeTagMutation]);

  const handleAddTagsToImage = useCallback(
    (imageId: string, tagIds: string[]) => {
      if (tagIds.length === 0) return;

      // Optimistic update goes into the query cache, which is what the grid and the viewer both
      // read. The mutation's invalidation then replaces it with the server's own answer.
      const tagsToAdd = allTags.filter((tag) => tagIds.includes(tag.id));
      const existing = images.find((img) => img.id === imageId);
      if (existing) {
        patchImageInCache(imageId, { tags: [...existing.tags, ...tagsToAdd] });
      }

      bulkTagMutation.mutate({ imageIds: [imageId], tagIds });
    },
    [bulkTagMutation, allTags, images, patchImageInCache]
  );

  // The viewer reads the live image out of the query data by id. The fallback covers the instant
  // between an invalidation and the refreshed page, so the dialog does not blink out.
  const viewerImage = useMemo(() => {
    if (!viewerImageId) return null;
    const live = images.find((img) => img.id === viewerImageId);
    if (live) return live;
    return viewerImageSnapshot?.id === viewerImageId ? viewerImageSnapshot : null;
  }, [viewerImageId, images, viewerImageSnapshot]);

  const currentImageIndex = useMemo(
    () => (viewerImageId ? images.findIndex((img) => img.id === viewerImageId) : -1),
    [viewerImageId, images]
  );

  /**
   * The control the viewer was opened from, so focus can return to it on close (G06). It is captured
   * at the click rather than read inside the dialog's mount effect: by the time that effect runs a
   * re-render may already have moved focus, and the tile's own open button is only a fallback for
   * the case where virtualization unmounted the real opener.
   */
  const viewerOpenerRef = useRef<HTMLElement | null>(null);

  const openImageViewer = useCallback((image: SharedImage) => {
    viewerOpenerRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setViewerImageSnapshot(image);
    setViewerImageId(image.id);
  }, []);

  const closeImageViewer = useCallback(() => {
    setViewerImageId(null);
    setIsAdvancingViewer(false);
  }, []);

  const handlePreviousImage = useCallback(() => {
    if (currentImageIndex > 0) {
      setViewerImageId(images[currentImageIndex - 1].id);
    }
  }, [currentImageIndex, images]);

  /**
   * Review continues across page boundaries (G07). At the last loaded image with more pages
   * available, Next fetches the next page and steps into it once it lands, instead of being
   * disabled while the result set clearly has more images in it.
   */
  const handleNextImage = useCallback(() => {
    if (currentImageIndex < 0) return;
    if (currentImageIndex < images.length - 1) {
      setViewerImageId(images[currentImageIndex + 1].id);
      return;
    }
    if (hasNextPage) {
      setIsAdvancingViewer(true);
      fetchNextPage();
    }
  }, [currentImageIndex, images, hasNextPage, fetchNextPage]);

  useEffect(() => {
    if (!isAdvancingViewer) return;
    if (currentImageIndex >= 0 && currentImageIndex < images.length - 1) {
      setIsAdvancingViewer(false);
      setViewerImageId(images[currentImageIndex + 1].id);
    } else if (!isFetchingNextPage && !hasNextPage) {
      setIsAdvancingViewer(false);
    }
  }, [isAdvancingViewer, currentImageIndex, images, isFetchingNextPage, hasNextPage]);

  // Fetch the next page as the review approaches the end of the loaded images, so stepping
  // through the viewer does not stall at every page boundary.
  useEffect(() => {
    if (currentImageIndex < 0 || !hasNextPage || isFetchingNextPage) return;
    if (currentImageIndex >= images.length - 5) fetchNextPage();
  }, [currentImageIndex, images.length, hasNextPage, isFetchingNextPage, fetchNextPage]);

  // Escape leaves full-view only when no dialog is open; the dialog handles its own Escape and
  // arrow keys, including the guard that keeps editable controls in charge of their own keys (G06).
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFullView && !showTagManager && !showAddTagModal && !viewerImageId) {
        exitFullView();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFullView, exitFullView, showTagManager, showAddTagModal, viewerImageId]);

  const handleAnnotate = useCallback(
    (imageId: string, jobId: number) => {
      // Remember where the review stopped so returning from annotation can resume it (G12).
      try {
        sessionStorage.setItem(
          `explore-resume-${projectId}`,
          JSON.stringify({ imageId, at: Date.now() })
        );
      } catch {
        // Session storage can be unavailable (private mode, blocked storage); resuming is a
        // convenience, never a requirement.
      }
      navigate({ to: '/annotation', search: { jobId, imageId } as any } as any);
      closeImageViewer();
    },
    [navigate, closeImageViewer, projectId]
  );

  /** An image the user was reviewing before leaving for the annotation editor, offered as an explicit resume action rather than a surprise reopen. */
  const [resumeImageId, setResumeImageId] = useState<string | null>(() => {
    try {
      const raw = sessionStorage.getItem(`explore-resume-${projectId}`);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as { imageId?: string };
      return parsed?.imageId ?? null;
    } catch {
      return null;
    }
  });

  const resumeImage = useMemo(
    () => (resumeImageId ? images.find((img) => img.id === resumeImageId) ?? null : null),
    [resumeImageId, images]
  );

  /** Neighbouring images, prefetched through the shared authenticated-image cache so stepping is instant. */
  const viewerPrefetchUrls = useMemo(() => {
    if (currentImageIndex < 0) return [];
    return [images[currentImageIndex - 1], images[currentImageIndex + 1]]
      .filter((img): img is SharedImage => !!img)
      .map((img) => getFullSizeThumbnailUrl(img.thumbnail_url));
  }, [currentImageIndex, images]);

  const dismissResume = useCallback(() => {
    setResumeImageId(null);
    try {
      sessionStorage.removeItem(`explore-resume-${projectId}`);
    } catch {
      // ignored — see above
    }
  }, [projectId]);

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
                {selectionMode === 'matching'
                  ? `About ${selectedCount.toLocaleString()} matching image(s), resolved when the action runs`
                  : `${selectedImages.size.toLocaleString()} image${selectedImages.size !== 1 ? 's' : ''} selected`}
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
                {selectionMode === 'matching'
                  ? `About ${selectedCount.toLocaleString()} matching image(s), resolved when the action runs`
                  : `${selectedImages.size.toLocaleString()} image${selectedImages.size !== 1 ? 's' : ''} selected`}
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

  // Handler for panel filter updates
  const handlePanelFilterUpdate = useCallback((panelFilters: Partial<ExploreFilters>) => {
    // Merge panel filters with existing filters
    // Panel filters can update: tag_ids, task_ids, job_id, etc.
    if (panelFilters.tag_ids !== undefined) {
      // Update tag filters - set all specified tags to 'include' mode
      setFilters(prev => {
        const newTagFilters: Record<string, 'include' | 'exclude'> = {};
        panelFilters.tag_ids?.forEach(tagId => {
          newTagFilters[tagId] = 'include';
        });
        return {
          ...prev,
          tagFilters: newTagFilters,
        };
      });
    }
    if (panelFilters.task_ids !== undefined) {
      setSelectedTaskIds(panelFilters.task_ids || []);
    }
    if (panelFilters.job_id !== undefined) {
      setSelectedJobId(panelFilters.job_id ?? undefined);
    }
    if (panelFilters.width_min !== undefined || panelFilters.width_max !== undefined) {
      setSidebarWidthRange(
        panelFilters.width_min ?? 0,
        panelFilters.width_max ?? 10000
      );
    }
    if (panelFilters.height_min !== undefined || panelFilters.height_max !== undefined) {
      setSidebarHeightRange(
        panelFilters.height_min ?? 0,
        panelFilters.height_max ?? 10000
      );
    }
    if (panelFilters.aspect_ratio_min !== undefined || panelFilters.aspect_ratio_max !== undefined) {
      setSidebarAspectRatioRange(
        panelFilters.aspect_ratio_min ?? 0,
        panelFilters.aspect_ratio_max ?? 10
      );
    }
    if (panelFilters.object_count_min !== undefined || panelFilters.object_count_max !== undefined) {
      console.log('[ProjectExploreTab] Setting object count range:', {
        min: panelFilters.object_count_min,
        max: panelFilters.object_count_max
      });
      setFilters(prev => ({
        ...prev,
        object_count_min: panelFilters.object_count_min,
        object_count_max: panelFilters.object_count_max,
      }));
    }
    // BBox count filter (detections only)
    if (panelFilters.bbox_count_min !== undefined || panelFilters.bbox_count_max !== undefined) {
      setFilters(prev => ({
        ...prev,
        bbox_count_min: panelFilters.bbox_count_min,
        bbox_count_max: panelFilters.bbox_count_max,
      }));
    }
    // Polygon count filter (segmentations only)
    if (panelFilters.polygon_count_min !== undefined || panelFilters.polygon_count_max !== undefined) {
      setFilters(prev => ({
        ...prev,
        polygon_count_min: panelFilters.polygon_count_min,
        polygon_count_max: panelFilters.polygon_count_max,
      }));
    }
    // Quality metric filters
    if (panelFilters.quality_min !== undefined || panelFilters.quality_max !== undefined) {
      setFilters(prev => ({
        ...prev,
        quality_min: panelFilters.quality_min,
        quality_max: panelFilters.quality_max,
      }));
    }
    if (panelFilters.sharpness_min !== undefined || panelFilters.sharpness_max !== undefined) {
      setFilters(prev => ({
        ...prev,
        sharpness_min: panelFilters.sharpness_min,
        sharpness_max: panelFilters.sharpness_max,
      }));
    }
    if (panelFilters.brightness_min !== undefined || panelFilters.brightness_max !== undefined) {
      setFilters(prev => ({
        ...prev,
        brightness_min: panelFilters.brightness_min,
        brightness_max: panelFilters.brightness_max,
      }));
    }
    if (panelFilters.contrast_min !== undefined || panelFilters.contrast_max !== undefined) {
      setFilters(prev => ({
        ...prev,
        contrast_min: panelFilters.contrast_min,
        contrast_max: panelFilters.contrast_max,
      }));
    }
    if (panelFilters.uniqueness_min !== undefined || panelFilters.uniqueness_max !== undefined) {
      setFilters(prev => ({
        ...prev,
        uniqueness_min: panelFilters.uniqueness_min,
        uniqueness_max: panelFilters.uniqueness_max,
      }));
    }
    // RGB channel filters
    if (panelFilters.red_min !== undefined || panelFilters.red_max !== undefined) {
      setFilters(prev => ({
        ...prev,
        red_min: panelFilters.red_min,
        red_max: panelFilters.red_max,
      }));
    }
    if (panelFilters.green_min !== undefined || panelFilters.green_max !== undefined) {
      setFilters(prev => ({
        ...prev,
        green_min: panelFilters.green_min,
        green_max: panelFilters.green_max,
      }));
    }
    if (panelFilters.blue_min !== undefined || panelFilters.blue_max !== undefined) {
      setFilters(prev => ({
        ...prev,
        blue_min: panelFilters.blue_min,
        blue_max: panelFilters.blue_max,
      }));
    }
    // Specific image filter (for flagged images)
    if (panelFilters.image_uids !== undefined) {
      setFilters(prev => ({
        ...prev,
        imageId: panelFilters.image_uids,
      }));
    }
    // Quality issues filter
    if (panelFilters.issues !== undefined) {
      setFilters(prev => ({
        ...prev,
        issues: panelFilters.issues,
      }));
    }
  }, [setFilters, setSidebarWidthRange, setSidebarHeightRange, setSidebarAspectRatioRange]);

  /**
   * Remove exactly one filter constraint (C5 / G13). Each chip clears only its own key; the
   * grouped `onClearQualityFilters` stays as the fallback path for when this prop is absent.
   * Unknown keys degrade to a no-op rather than throwing or clearing something broad.
   */
  const handleRemoveFilter = useCallback(
    (key: ExploreFilterChipKey) => {
      switch (key) {
        case 'search': setSearchInput(''); break;
        case 'tasks': setSelectedTaskIds([]); break;
        case 'job': setSelectedJobId(undefined); break;
        case 'annotated': setIsAnnotatedFilter(undefined); break;
        case 'tags': getIncludedTagIds().forEach(removeSidebarTag); break;
        case 'excludedTags': getExcludedTagIds().forEach(removeSidebarTag); break;
        case 'width': clearWidthRange(); break;
        case 'height': clearHeightRange(); break;
        case 'aspectRatio': clearAspectRatioRange(); break;
        case 'fileSize': clearFileSizeRange(); break;
        case 'filepath': setSidebarFilepathFilter(''); setSidebarFilepathPaths([]); break;
        case 'imageUids': setImageUids([]); break;
        case 'quality': setFilters(p => ({ ...p, quality_min: undefined, quality_max: undefined })); break;
        case 'sharpness': setFilters(p => ({ ...p, sharpness_min: undefined, sharpness_max: undefined })); break;
        case 'brightness': setFilters(p => ({ ...p, brightness_min: undefined, brightness_max: undefined })); break;
        case 'contrast': setFilters(p => ({ ...p, contrast_min: undefined, contrast_max: undefined })); break;
        case 'uniqueness': setFilters(p => ({ ...p, uniqueness_min: undefined, uniqueness_max: undefined })); break;
        case 'issues': setFilters(p => ({ ...p, issues: undefined })); break;
        case 'red': setFilters(p => ({ ...p, red_min: undefined, red_max: undefined })); break;
        case 'green': setFilters(p => ({ ...p, green_min: undefined, green_max: undefined })); break;
        case 'blue': setFilters(p => ({ ...p, blue_min: undefined, blue_max: undefined })); break;
        case 'objectCount': setFilters(p => ({ ...p, object_count_min: undefined, object_count_max: undefined })); break;
        case 'bboxCount': setFilters(p => ({ ...p, bbox_count_min: undefined, bbox_count_max: undefined })); break;
        case 'polygonCount': setFilters(p => ({ ...p, polygon_count_min: undefined, polygon_count_max: undefined })); break;
      }
    },
    [
      setFilters,
      setImageUids,
      getIncludedTagIds,
      getExcludedTagIds,
      removeSidebarTag,
      clearWidthRange,
      clearHeightRange,
      clearAspectRatioRange,
      clearFileSizeRange,
      setSidebarFilepathFilter,
      setSidebarFilepathPaths,
    ]
  );

  const handleClearAllFilters = useCallback(() => {
    clearSidebarFilters();
    setSearchInput('');
    setSelectedTaskIds([]);
    setIsAnnotatedFilter(undefined);
    // The job filter is applied from analytics panels and lives outside the sidebar state, so
    // clearing it has to be explicit: without this line Clear All left the gallery filtered.
    setSelectedJobId(undefined);
  }, [clearSidebarFilters]);

  /**
   * Saved views (G12). The URL carries a versioned, validated encoding of the filter contract plus
   * display preferences. Writes use `replace`, so adjusting a filter does not push a history entry;
   * Back and Forward move between views a user actually navigated to, and each one is re-applied
   * here. Display state is restored separately because it never changes which images match.
   */
  const applyView = useCallback(
    (view: ExploreView) => {
      const { sidebar, toolbar } = exploreViewToFilterState(view);
      setFilters((prev) => ({ ...prev, ...sidebar }));
      setSelectedTaskIds(toolbar.taskIds ?? []);
      setSelectedJobId(toolbar.jobId);
      setIsAnnotatedFilter(toolbar.isAnnotated);
      setSearchInput(toolbar.search ?? '');
      if (view.display?.density) setGridSize(view.display.density);
    },
    [setFilters, setGridSize]
  );

  /**
   * Display preferences worth carrying in a link, which means the ones that differ from what a
   * recipient would get anyway. Sending all three unconditionally made the view never empty, so the
   * URL carried a `view` param even with zero filters and the write below always had something to
   * write — including over an incoming link that could not be read (G12).
   */
  const viewDisplay = useMemo(() => {
    const display: ExploreViewDisplay = {};
    if (gridSize !== DEFAULT_VIEW_DENSITY) display.density = gridSize;
    if (!includeBboxes) display.showBboxes = false;
    if (!includePolygons) display.showPolygons = false;
    return Object.keys(display).length > 0 ? display : undefined;
  }, [gridSize, includeBboxes, includePolygons]);

  const {
    viewError: incomingViewError,
    dismissViewError,
    buildShareUrl,
  } = useExploreUrlSync({
    filters,
    display: viewDisplay,
    onApplyView: applyView,
  });

  /**
   * The decode error is latched at mount rather than read live from the hook. It is derived from the
   * `view` param, and the same hook rewrites that param to describe the current gallery — a locally
   * persisted grid density is enough to make it write one — so the explanation of why a pasted link
   * could not be restored would be gone before anyone could read it. The first render, before that
   * write, is the only moment it is reliably visible; a later one (Back onto a bad view) is taken
   * too. Only the user's dismissal clears the message, and only that message.
   */
  const [initialViewError] = useState(() => incomingViewError);
  const [dismissedViewError, setDismissedViewError] = useState<string | null>(null);
  const latestViewError = incomingViewError ?? initialViewError;
  const viewError =
    latestViewError && latestViewError !== dismissedViewError ? latestViewError : null;

  const handleDismissViewError = useCallback(() => {
    setDismissedViewError(latestViewError);
    dismissViewError();
  }, [latestViewError, dismissViewError]);

  const handleCopyViewLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(buildShareUrl());
      toast.success('View link copied');
    } catch {
      toast.error('Could not copy the link');
    }
  }, [buildShareUrl]);

  /**
   * Export scope (G03/G05). The wizard takes one filter snapshot, so the choice between "the
   * images I selected" and "everything matching these filters" is resolved here, into a snapshot
   * that carries the whole contract either way.
   */
  const [exportScope, setExportScope] = useState<'matching' | 'selected'>('matching');
  const [showExportScopeChooser, setShowExportScopeChooser] = useState(false);

  const exportFilterSnapshot: FilterSnapshot = useMemo(() => {
    if (exportScope === 'selected' && selectionMode === 'loaded' && selectedImages.size > 0) {
      return filterContractToSnapshot({ ...filters, image_uids: Array.from(selectedImages) });
    }
    return currentFilterSnapshot;
  }, [exportScope, selectionMode, selectedImages, filters, currentFilterSnapshot]);

  const exportScopeCount = exportScope === 'selected' ? selectedImages.size : total;

  /** Human-readable list of the constraints an export would carry, so the scope is visible before it is created. */
  const activeFilterSummary = useMemo(() => {
    const labels: Record<string, string> = {
      search: 'search', tag_ids: 'tags', excluded_tag_ids: 'excluded tags', task_ids: 'tasks',
      job_id: 'job', is_annotated: 'annotated', width_min: 'width', width_max: 'width',
      height_min: 'height', height_max: 'height', aspect_ratio_min: 'aspect ratio',
      aspect_ratio_max: 'aspect ratio', file_size_min: 'file size', file_size_max: 'file size',
      filepath_pattern: 'file path', filepath_paths: 'file path', image_uids: 'specific images',
      quality_min: 'quality', quality_max: 'quality', sharpness_min: 'sharpness',
      sharpness_max: 'sharpness', brightness_min: 'brightness', brightness_max: 'brightness',
      contrast_min: 'contrast', contrast_max: 'contrast', uniqueness_min: 'uniqueness',
      uniqueness_max: 'uniqueness', red_min: 'red', red_max: 'red', green_min: 'green',
      green_max: 'green', blue_min: 'blue', blue_max: 'blue', issues: 'quality issues',
      object_count_min: 'object count', object_count_max: 'object count',
      bbox_count_min: 'box count', bbox_count_max: 'box count',
      polygon_count_min: 'polygon count', polygon_count_max: 'polygon count',
    };
    const names = new Set<string>();
    Object.keys(filters).forEach((key) => {
      if (key === 'include_match_mode' || key === 'exclude_match_mode') return;
      const label = labels[key];
      if (label) names.add(label);
    });
    return Array.from(names);
  }, [filters]);

  const handleExportClick = useCallback(() => {
    // The scope and its resolved count are always shown before an export is created (G03); with an
    // explicit id selection there are two defensible scopes, so the user picks one.
    if (selectionMode !== 'loaded' || selectedImages.size === 0) setExportScope('matching');
    setShowExportScopeChooser(true);
  }, [selectionMode, selectedImages.size]);

  const renderProjectExploreContent = (
    isPanelsVisible: boolean,
    layoutMode: LayoutMode,
    setLayoutMode: (mode: LayoutMode) => void,
    panelCount: number
  ) => (
      <div className="h-full flex flex-col min-h-0 max-w-full overflow-hidden">
      {/* New Explore Toolbar */}
      <div className="mb-1.5">
      <ExploreToolbar
        // Filter Zone props
        searchValue={searchInput}
        onSearchChange={setSearchInput}
        tasks={tasks.map((t) => ({ id: t.id, name: t.name }))}
        selectedTaskIds={selectedTaskIds}
        onTasksChange={setSelectedTaskIds}
        isAnnotatedFilter={isAnnotatedFilter}
        onAnnotatedFilterChange={setIsAnnotatedFilter}
        // View Zone props
        gridSize={gridSize}
        onGridSizeChange={setGridSize}
        isFullView={isFullView}
        onToggleFullView={toggleFullView}
        // Action Zone props
        onExport={handleExportClick}
        // Selection scope (G05): "loaded" and "matching" are different sets, labelled as such
        selectedCount={selectedCount}
        onSelectLoaded={handleSelectLoaded}
        onClearSelection={handleClearSelection}
        onSelectAllMatching={total > images.length ? handleSelectAllMatching : undefined}
        isAllMatchingSelected={selectionMode === 'matching' && excludedImageIds.size === 0}
        // Pending vs background refresh (G17)
        isResultsPending={isFilterChangePending}
        isBackgroundRefreshing={isBackgroundRefreshing}
        // Status Bar props
        sidebarFilters={{
          tagFilters: sidebarFilters.tagFilters,
          includeMatchMode: sidebarFilters.includeMatchMode,
          excludeMatchMode: sidebarFilters.excludeMatchMode,
          widthRange: sidebarFilters.widthRange,
          heightRange: sidebarFilters.heightRange,
          aspectRatioRange: sidebarFilters.aspectRatioRange,
          sizeRange: sidebarFilters.sizeRange,
          filepathPattern: sidebarFilters.filepathPattern,
          filepathPaths: sidebarFilters.filepathPaths,
          imageIds: sidebarFilters.imageId,
          quality_min: sidebarFilters.quality_min,
          quality_max: sidebarFilters.quality_max,
          sharpness_min: sidebarFilters.sharpness_min,
          sharpness_max: sidebarFilters.sharpness_max,
          brightness_min: sidebarFilters.brightness_min,
          brightness_max: sidebarFilters.brightness_max,
          contrast_min: sidebarFilters.contrast_min,
          contrast_max: sidebarFilters.contrast_max,
          uniqueness_min: sidebarFilters.uniqueness_min,
          uniqueness_max: sidebarFilters.uniqueness_max,
          quality_issues: sidebarFilters.issues,
          object_count_min: sidebarFilters.object_count_min,
          object_count_max: sidebarFilters.object_count_max,
          bbox_count_min: sidebarFilters.bbox_count_min,
          bbox_count_max: sidebarFilters.bbox_count_max,
          polygon_count_min: sidebarFilters.polygon_count_min,
          polygon_count_max: sidebarFilters.polygon_count_max,
          red_min: sidebarFilters.red_min,
          red_max: sidebarFilters.red_max,
          green_min: sidebarFilters.green_min,
          green_max: sidebarFilters.green_max,
          blue_min: sidebarFilters.blue_min,
          blue_max: sidebarFilters.blue_max,
        }}
        selectedJobId={selectedJobId}
        allTags={allTags.map(t => ({ id: t.id, name: t.name, color: t.color }))}
        onClearSearch={() => setSearchInput('')}
        onClearTasks={() => setSelectedTaskIds([])}
        onClearAnnotatedFilter={() => setIsAnnotatedFilter(undefined)}
        onRemoveTag={removeSidebarTag}
        onClearWidthRange={clearWidthRange}
        onClearHeightRange={clearHeightRange}
        onClearAspectRatioRange={clearAspectRatioRange}
        onClearSizeRange={clearFileSizeRange}
        onClearFilepathPattern={() => setSidebarFilepathFilter('')}
        onClearFilepathPaths={() => setSidebarFilepathPaths([])}
        onClearImageIds={() => setImageUids([])}
        onClearQualityFilters={() => setFilters(prev => ({
          ...prev,
          quality_min: undefined,
          quality_max: undefined,
          sharpness_min: undefined,
          sharpness_max: undefined,
          brightness_min: undefined,
          brightness_max: undefined,
          contrast_min: undefined,
          contrast_max: undefined,
          uniqueness_min: undefined,
          uniqueness_max: undefined,
          issues: undefined,
        }))}
        onClearObjectCount={() => setFilters(prev => ({ ...prev, object_count_min: undefined, object_count_max: undefined }))}
        onClearBboxCount={() => setFilters(prev => ({ ...prev, bbox_count_min: undefined, bbox_count_max: undefined }))}
        onClearPolygonCount={() => setFilters(prev => ({ ...prev, polygon_count_min: undefined, polygon_count_max: undefined }))}
        onClearAll={handleClearAllFilters}
        onRemoveFilter={handleRemoveFilter}
        annotationDisplay={annotationDisplay}
        // Three distinct counts (C4). `projectTotal` is deliberately not passed: this component has
        // no unfiltered project image count to read, and deriving one from a filtered total or from
        // `images.length` would be a fabrication. The readout degrades to "loaded of matching".
        loadedCount={images.length}
        matchingCount={total}
      />
      </div>

      {/* Floating Selection Actions Bar */}
      {hasSelection && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 max-w-[calc(100vw-2rem)] animate-in slide-in-from-bottom-5 duration-300">
          <div
            className="text-white rounded-3xl shadow-2xl px-4 py-3 flex flex-wrap items-center justify-center gap-3 border"
            style={{
              background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.25) 0%, rgba(5, 150, 105, 0.3) 100%)',
              backdropFilter: 'blur(16px)',
              WebkitBackdropFilter: 'blur(16px)',
              borderColor: 'rgba(16, 185, 129, 0.4)',
              boxShadow: '0 8px 32px rgba(16, 185, 129, 0.3), 0 0 0 1px rgba(255, 255, 255, 0.1) inset'
            }}
          >
            <span className="text-sm font-medium">
              {selectionMode === 'matching' ? (
                <>
                  About {selectedCount.toLocaleString()} matching
                  {excludedImageIds.size > 0 && ` (${excludedImageIds.size.toLocaleString()} deselected)`}
                </>
              ) : (
                <>{selectedImages.size.toLocaleString()} loaded image(s) selected</>
              )}
            </span>
            {selectionMode === 'matching' && (
              <span className="text-xs text-white/80 max-w-[420px]">
                Actions apply to every image matching the current filters, resolved when the action runs — not to a list fixed when you selected.
              </span>
            )}
            <div className="hidden sm:block h-5 w-px bg-white/30"></div>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => setShowAddTagModal(true)}
                disabled={isFilterChangePending}
                title={isFilterChangePending ? 'Waiting for the new filters to resolve' : undefined}
                className="px-4 py-2 bg-white/20 hover:bg-white/30 disabled:opacity-50 disabled:cursor-not-allowed backdrop-blur-sm text-white text-sm font-medium rounded-full flex items-center gap-1.5 transition-all"
              >
                <Tag className="w-4 h-4" />
                Add Tags
              </button>
              <button
                type="button"
                onClick={() => setShowAutoTagModal(true)}
                disabled={selectionMode === 'matching' || isFilterChangePending}
                title={
                  selectionMode === 'matching'
                    ? 'Auto-tagging works on explicitly selected images. Use "Select loaded" first.'
                    : 'Auto-tag with Moondream AI'
                }
                className="px-4 py-2 bg-cyan-500/60 hover:bg-cyan-500/80 disabled:opacity-50 disabled:cursor-not-allowed backdrop-blur-sm text-white text-sm font-medium rounded-full flex items-center gap-1.5 transition-all shadow-lg shadow-cyan-500/30"
              >
                <Sparkles className="w-4 h-4" />
                Auto-Tag
              </button>
              <button
                type="button"
                onClick={() => setShowClassifyModal(true)}
                disabled={selectionMode === 'matching' || isFilterChangePending}
                title={
                  selectionMode === 'matching'
                    ? 'Classification works on explicitly selected images. Use "Select loaded" first.'
                    : 'AI Classification'
                }
                className="px-4 py-2 bg-violet-500/60 hover:bg-violet-500/80 disabled:opacity-50 disabled:cursor-not-allowed backdrop-blur-sm text-white text-sm font-medium rounded-full flex items-center gap-1.5 transition-all shadow-lg shadow-violet-500/30"
              >
                <Sparkles className="w-4 h-4" />
                AI Classify
              </button>
              <button
                type="button"
                onClick={() => setShowRemoveTagModal(true)}
                disabled={getTagsFromSelectedImages().length === 0 || isFilterChangePending}
                className="p-2.5 bg-red-500/60 hover:bg-red-500/80 disabled:bg-white/10 disabled:cursor-not-allowed backdrop-blur-sm text-white rounded-full flex items-center transition-all shadow-lg shadow-red-500/30"
                title="Remove Tags"
                aria-label="Remove tags from the selection"
              >
                <Delete className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={handleClearSelection}
                className="p-2 hover:bg-white/20 text-white rounded-full flex items-center transition-all"
                title="Clear selection"
                aria-label="Clear selection"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content Area - with Sidebar in fullscreen */}
      <div
        className="flex-1 flex gap-1.5 overflow-hidden min-h-0"
      >
        {/* Sidebar - only visible in fullscreen mode */}
        {isFullView && (
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
            onClearWidthRange={clearWidthRange}
            onClearHeightRange={clearHeightRange}
            onClearSizeRange={clearFileSizeRange}
            onFilepathPathsChange={setSidebarFilepathPaths}
            // Metadata aggregations
            widthAggregation={widthAggregation}
            heightAggregation={heightAggregation}
            sizeAggregation={sizeAggregation}
            // Collapse control
            isCollapsed={isSidebarCollapsed}
            onCollapseChange={setIsSidebarCollapsed}
            // Annotation filters
            projectLabels={projectLabels}
            annotationFilters={annotationFilters}
          />
        )}

        {/* Gallery */}
      <div className="flex-1 min-w-0 glass-strong rounded-2xl shadow-lg overflow-hidden flex flex-col min-h-0 h-full relative z-10">
        {/* Gallery Header */}
        <div className="px-4 py-3 border-b border-gray-100 flex flex-wrap items-center justify-between gap-2 bg-gradient-to-r from-gray-50 to-white">
          <div className="flex flex-wrap items-center gap-3 min-w-0">
            <Grid3X3 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
            <span className="font-medium text-gray-700">
              {isLoadingImages ? 'Loading…' : `${total.toLocaleString()} image(s) match`}
            </span>
            {isFilterChangePending && !isLoadingImages && (
              <span className="text-sm text-amber-600">Updating results for the new filters…</span>
            )}
            {isBackgroundRefreshing && (
              <span className="text-sm text-gray-400">Refreshing in the background…</span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {resumeImage && !viewerImageId && (
              <button
                type="button"
                onClick={() => {
                  openImageViewer(resumeImage);
                  dismissResume();
                }}
                className="text-sm text-emerald-700 hover:text-emerald-800 font-medium px-2 py-1 rounded-lg hover:bg-emerald-50"
                title={`Reopen ${resumeImage.filename}, where you left the review`}
              >
                Resume at {resumeImage.filename}
              </button>
            )}
            <button
              type="button"
              onClick={handleCopyViewLink}
              className="text-sm text-gray-500 hover:text-gray-700 font-medium flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-gray-100"
              title="Copy a link that restores these filters"
            >
              <LinkIcon className="w-4 h-4" />
              Copy view link
            </button>
            <button
              type="button"
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="text-sm text-gray-500 hover:text-gray-700 font-medium flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-gray-100 disabled:opacity-50"
              title="Refresh the gallery"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>

        {/* Saved view could not be restored (G12) */}
        {viewError && (
          <div className="mx-4 mt-3 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-800 flex items-start justify-between gap-3" role="status">
            <span>{viewError}</span>
            <button
              type="button"
              onClick={handleDismissViewError}
              className="text-amber-700 hover:text-amber-900 flex-shrink-0"
              aria-label="Dismiss this message"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Status changes are announced rather than only drawn (G02) */}
        <div className="sr-only" role="status" aria-live="polite">
          {resultsAnnouncement}
        </div>
        <div className="sr-only" role="status" aria-live="polite">
          {statusMessage}
        </div>

        {/* Virtualized Gallery Grid */}
        {isLoadingImages ? (
          <div className="flex items-center justify-center h-64" role="status">
            <Loader2 className="w-8 h-8 text-emerald-600 animate-spin" />
            <span className="sr-only">Loading images</span>
          </div>
        ) : isImagesError && images.length === 0 ? (
          // Initial failure: no images were ever loaded, so the whole gallery is an error state.
          <div className="flex flex-col items-center justify-center h-64 text-center px-6" role="alert">
            <AlertTriangle className="w-12 h-12 text-red-400 mb-3" />
            <p className="text-lg font-medium text-gray-800">The gallery could not be loaded</p>
            <p className="text-sm text-gray-500 mt-1 max-w-md">
              {getApiErrorMessage(imagesError, 'The image request failed.')}
            </p>
            <button
              type="button"
              onClick={() => refetchImages()}
              className="mt-4 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg"
            >
              Try again
            </button>
          </div>
        ) : images.length === 0 ? (
          // An empty project and a filter that matches nothing are different problems with
          // different remedies, so they get different messages (G02).
          <div className="flex flex-col items-center justify-center h-64 text-gray-500 text-center px-6" role="status">
            <ImageIcon className="w-16 h-16 text-gray-300 mb-4" />
            {isFiltered ? (
              <>
                <p className="text-lg font-medium">No images match these filters</p>
                <p className="text-sm">Every image in the project pool was excluded by the current filters.</p>
                <button
                  type="button"
                  onClick={handleClearAllFilters}
                  className="mt-4 px-4 py-2 border border-gray-300 hover:bg-gray-50 text-gray-700 text-sm font-medium rounded-lg"
                >
                  Clear all filters
                </button>
              </>
            ) : (
              <>
                <p className="text-lg font-medium">This project has no images yet</p>
                <p className="text-sm">Add images to the project pool to start annotating.</p>
              </>
            )}
          </div>
        ) : (
          <div className="relative flex-1 overflow-hidden" aria-busy={isFilterChangePending}>
            <VirtualizedImageGrid
              images={images}
              selectedImages={gridSelectedImages}
              onToggleImage={handleToggleImage}
              onImageDoubleClick={openImageViewer}
              onOpenImage={openImageViewer}
              targetRowHeight={gridConfig.targetRowHeight}
              thumbnailSize={gridConfig.thumbnailSize}
              spacing={2}
              hasNextPage={hasNextPage}
              isFetchingNextPage={isFetchingNextPage}
              fetchNextPage={fetchNextPage}
              nextPageError={nextPageError}
              onRetryNextPage={() => fetchNextPage()}
              onRemoveTag={handleRemoveTag}
              visibility={visibilityState.visibility}
              categoryColorMap={categoryColorMap}
              shouldShowAnnotation={annotationFilters.shouldShowAnnotation}
            />
          </div>
        )}
      </div>

      {/* Analytics Panels with Resize Handle */}
      {isPanelsVisible && (
        <div
          ref={panelContainerRef}
          className={`relative flex-shrink-0 ${isPanelResizing ? '' : 'transition-[width] duration-200 ease-out'}`}
          style={{ width: `${panelWidth}px` }}
        >
          {/* Enhanced Resize Handle with visible boundary */}
          <div
            className="absolute left-0 top-0 bottom-0 w-3 z-20 cursor-col-resize group flex items-center justify-center"
            onMouseDown={startPanelResizing}
            title="Drag to resize panels"
          >
            {/* Vertical divider line - always visible */}
            <div className="absolute inset-y-0 left-0 w-px bg-gradient-to-b from-transparent via-gray-300 to-transparent" />

            {/* Grip indicator - subtle when idle, prominent on hover */}
            <div className={`w-1 rounded-full transition-all duration-200 ${
              isPanelResizing
                ? 'h-32 bg-emerald-500 shadow-lg shadow-emerald-500/30'
                : 'h-24 bg-gray-200 group-hover:bg-emerald-400 group-hover:h-32 group-hover:shadow-lg group-hover:shadow-emerald-500/30'
            }`} />

            {/* Shadow edge for depth - always visible */}
            <div className="absolute inset-y-0 left-0 w-4 bg-gradient-to-r from-black/5 to-transparent pointer-events-none" />
          </div>

          <AnalyticsPanelContainer
            projectId={projectId}
            filters={filters}
            onFilterUpdate={handlePanelFilterUpdate}
          />
        </div>
      )}
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
      {/* Export scope chooser (G03/G05): which set is being exported is stated before the wizard opens */}
      {showExportScopeChooser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-[440px] max-w-[90vw] overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100">
              <h3 className="text-lg font-semibold text-gray-900">What should the export cover?</h3>
            </div>
            <div className="px-6 py-4 space-y-3">
              {selectionMode === 'loaded' && selectedImages.size > 0 && (
                <label className="flex items-start gap-3 p-3 rounded-xl border border-gray-200 hover:bg-gray-50 cursor-pointer">
                  <input
                    type="radio"
                    name="export-scope"
                    className="mt-1"
                    checked={exportScope === 'selected'}
                    onChange={() => setExportScope('selected')}
                  />
                  <span>
                    <span className="block text-sm font-medium text-gray-900">
                      The {selectedImages.size.toLocaleString()} image(s) I selected
                    </span>
                    <span className="block text-xs text-gray-500 mt-0.5">
                      Exactly these images, listed by id.
                    </span>
                  </span>
                </label>
              )}
              <label className="flex items-start gap-3 p-3 rounded-xl border border-gray-200 hover:bg-gray-50 cursor-pointer">
                <input
                  type="radio"
                  name="export-scope"
                  className="mt-1"
                  checked={exportScope === 'matching'}
                  onChange={() => setExportScope('matching')}
                />
                <span>
                  <span className="block text-sm font-medium text-gray-900">
                    Everything matching the current filters ({total.toLocaleString()})
                  </span>
                  <span className="block text-xs text-gray-500 mt-0.5">
                    The filter set is re-resolved when the export runs, so the contents can differ if the project changes in between.
                  </span>
                </span>
              </label>
              <p className="text-xs text-gray-500">
                {activeFilterSummary.length > 0
                  ? `The export carries the gallery's complete filter scope: ${activeFilterSummary.join(', ')}.`
                  : 'No filters are applied, so this covers the whole project pool.'}
              </p>
            </div>
            <div className="px-6 py-4 bg-gray-50 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowExportScopeChooser(false)}
                className="px-4 py-2 text-gray-600 hover:text-gray-800 text-sm font-medium rounded-lg"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowExportScopeChooser(false);
                  setShowExportWizard(true);
                }}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg"
              >
                Continue with {exportScopeCount.toLocaleString()} image(s)
              </button>
            </div>
          </div>
        </div>
      )}

      <ExportWizardModal
        isOpen={showExportWizard}
        onClose={() => setShowExportWizard(false)}
        projectId={projectId}
        currentFilters={exportFilterSnapshot}
        onExportCreated={(exportId) => {
          toast.success(`Export created: ${exportId.slice(0, 8)}...`);
        }}
      />

      {/* Batch Classification Modal */}
      <BatchClassifyModal
        isOpen={showClassifyModal}
        onClose={() => setShowClassifyModal(false)}
        projectId={Number(projectId)}
        selectedImageIds={Array.from(selectedImages)}
        availableModels={allModels}
      />

      {/* Auto-Tag Modal */}
      <AutoTagModal
        isOpen={showAutoTagModal}
        onClose={() => setShowAutoTagModal(false)}
        projectId={Number(projectId)}
        selectedImageIds={Array.from(selectedImages)}
        availableModels={allModels}
      />

      {/* Bulk Tag Confirmation Modal (1 tag per label rule) */}
      {pendingBulkTag && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl w-[480px] max-w-[90vw] overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-3">
              <div className="p-2 bg-amber-100 rounded-lg">
                <AlertTriangle className="w-5 h-5 text-amber-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900">Confirm Tag Replacement</h3>
            </div>
            <div className="px-6 py-5">
              <p className="text-gray-600 mb-4">
                Adding these tags will replace <span className="font-semibold text-amber-600">{pendingBulkTag.preview.tags_to_replace}</span> existing tag(s) due to the <span className="font-medium">1 tag per Label</span> rule.
              </p>
              {Object.keys(pendingBulkTag.preview.conflicts_by_label).length > 0 && (
                <div className="bg-gray-50 rounded-lg p-4 mb-4">
                  <p className="text-sm font-medium text-gray-700 mb-2">Replacements by Label:</p>
                  <ul className="space-y-1">
                    {Object.entries(pendingBulkTag.preview.conflicts_by_label).map(([label, count]) => (
                      <li key={label} className="text-sm text-gray-600 flex items-center gap-2">
                        <span className="w-2 h-2 bg-blue-400 rounded-full"></span>
                        <span className="font-medium">{label}:</span>
                        <span>{count} image(s)</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <p className="text-sm text-gray-500">
                {pendingBulkTag.preview.total_images.toLocaleString()} image(s) will be affected.
              </p>
              {pendingBulkTag.scope && (
                <p className="text-xs text-gray-500 mt-2">
                  This is an estimate: the filter scope is resolved again when the operation runs, so the exact set can differ if the project changes in between.
                </p>
              )}
            </div>
            <div className="px-6 py-4 bg-gray-50 flex justify-end gap-3">
              <button
                onClick={handleCancelBulkTag}
                className="px-4 py-2 text-gray-700 hover:bg-gray-200 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmBulkTag}
                disabled={bulkTagMutation.isPending}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-700 disabled:bg-amber-400 text-white rounded-lg transition-colors flex items-center gap-2"
              >
                {bulkTagMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Replacing...
                  </>
                ) : (
                  <>Replace & Add Tags</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Image Detail Dialog (G06) */}
      {viewerImage && (
        <ImageDetailDialog
          image={viewerImage}
          position={currentImageIndex >= 0 ? currentImageIndex + 1 : 1}
          matchingTotal={total}
          loadedCount={images.length}
          onClose={closeImageViewer}
          onPrevious={handlePreviousImage}
          onNext={handleNextImage}
          hasPrevious={currentImageIndex > 0}
          hasNext={currentImageIndex >= 0 && (currentImageIndex < images.length - 1 || hasNextPage)}
          isAdvancing={isAdvancingViewer}
          prefetchUrls={viewerPrefetchUrls}
          allTags={allTags}
          tagCategories={tagCategories}
          onAddTags={handleAddTagsToImage}
          onRemoveTag={handleRemoveTag}
          isAddTagPending={bulkTagMutation.isPending}
          isRemoveTagPending={removeTagMutation.isPending}
          displayOptions={annotationDisplay}
          shouldShowAnnotation={annotationFilters.shouldShowAnnotation}
          onAnnotate={handleAnnotate}
          restoreFocusTo={viewerOpenerRef.current}
        />
      )}
      </div>
    );

  return (
    <AnalyticsPanelProvider projectId={projectId} onFilterUpdate={handlePanelFilterUpdate}>
      <AnalyticsPanelContext.Consumer>
        {(panelContext) => {
          if (!panelContext) return null;
          const { state, setLayoutMode } = panelContext;
          return renderProjectExploreContent(
            state.isVisible,
            state.layoutMode,
            setLayoutMode,
            state.panels.length
          );
        }}
      </AnalyticsPanelContext.Consumer>
    </AnalyticsPanelProvider>
  );
}
