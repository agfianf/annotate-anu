/**
 * ProjectExploreTab Component
 * FiftyOne-like image gallery for browsing, filtering, and tagging images
 */

import {
  Check,
  ChevronDown,
  Filter,
  Grid3X3,
  Image as ImageIcon,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Tag,
  Trash2,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  projectImagesApi,
  tagsApi,
  sharedImagesApi,
  type SharedImage,
  type Tag as TagType,
  type ExploreFilters,
} from '../lib/data-management-client';
import { tasksApi } from '../lib/api-client';

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

export default function ProjectExploreTab({ projectId }: ProjectExploreTabProps) {
  const queryClient = useQueryClient();

  // Filters
  const [search, setSearch] = useState('');
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<number | undefined>();
  const [selectedJobId, setSelectedJobId] = useState<number | undefined>();
  const [isAnnotatedFilter, setIsAnnotatedFilter] = useState<boolean | undefined>();

  // Pagination
  const [page, setPage] = useState(1);
  const pageSize = 50;

  // Selection
  const [selectedImages, setSelectedImages] = useState<Set<string>>(new Set());

  // Modals
  const [showTagManager, setShowTagManager] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState(TAG_COLORS[0]);
  const [showAddTagModal, setShowAddTagModal] = useState(false);
  const [showImageModal, setShowImageModal] = useState<SharedImage | null>(null);

  // Build filters object
  const filters: ExploreFilters & { page: number; page_size: number } = useMemo(
    () => ({
      search: search || undefined,
      tag_ids: selectedTagIds.length > 0 ? selectedTagIds : undefined,
      task_id: selectedTaskId,
      job_id: selectedJobId,
      is_annotated: isAnnotatedFilter,
      page,
      page_size: pageSize,
    }),
    [search, selectedTagIds, selectedTaskId, selectedJobId, isAnnotatedFilter, page]
  );

  // Fetch images
  const {
    data: exploreData,
    isLoading: isLoadingImages,
    refetch: refetchImages,
  } = useQuery({
    queryKey: ['project-explore', projectId, filters],
    queryFn: () => projectImagesApi.explore(projectId, filters),
    enabled: !!projectId,
  });

  // Fetch all tags
  const { data: allTags = [], isLoading: isLoadingTags } = useQuery({
    queryKey: ['tags'],
    queryFn: () => tagsApi.list({ include_usage_count: true }),
  });

  // Fetch tasks for filter dropdown
  const { data: tasks = [] } = useQuery({
    queryKey: ['tasks', projectId],
    queryFn: () => tasksApi.list(projectId),
    enabled: !!projectId,
  });

  // Create tag mutation
  const createTagMutation = useMutation({
    mutationFn: (data: { name: string; color: string }) => tagsApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tags'] });
      setNewTagName('');
      setShowTagManager(false);
      toast.success('Tag created');
    },
    onError: () => {
      toast.error('Failed to create tag');
    },
  });

  // Bulk tag mutation
  const bulkTagMutation = useMutation({
    mutationFn: ({ imageIds, tagIds }: { imageIds: string[]; tagIds: string[] }) =>
      sharedImagesApi.bulkTag(imageIds, tagIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-explore'] });
      setSelectedImages(new Set());
      setShowAddTagModal(false);
      toast.success('Tags added');
    },
    onError: () => {
      toast.error('Failed to add tags');
    },
  });

  // Reset pagination when filters change
  useEffect(() => {
    setPage(1);
  }, [search, selectedTagIds, selectedTaskId, selectedJobId, isAnnotatedFilter]);

  // Clear selection when images change
  useEffect(() => {
    setSelectedImages(new Set());
  }, [exploreData]);

  // Handlers
  const handleSelectAll = useCallback(() => {
    if (!exploreData?.images) return;
    if (selectedImages.size === exploreData.images.length) {
      setSelectedImages(new Set());
    } else {
      setSelectedImages(new Set(exploreData.images.map((img) => img.id)));
    }
  }, [exploreData, selectedImages]);

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

  const handleToggleTag = useCallback((tagId: string) => {
    setSelectedTagIds((prev) =>
      prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId]
    );
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

  // Calculate pagination
  const totalPages = exploreData ? Math.ceil(exploreData.total / pageSize) : 0;
  const images = exploreData?.images || [];
  const total = exploreData?.total || 0;

  return (
    <div className="h-full flex flex-col">
      {/* Top Bar - Filters */}
      <div className="glass-strong rounded-2xl shadow-lg p-4 mb-4">
        <div className="flex flex-wrap items-center gap-4">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by filename..."
              className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-200 bg-white/50 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm"
            />
          </div>

          {/* Task Filter */}
          <div className="relative">
            <select
              value={selectedTaskId || ''}
              onChange={(e) => {
                const val = e.target.value;
                setSelectedTaskId(val ? parseInt(val) : undefined);
                setSelectedJobId(undefined);
              }}
              className="appearance-none pl-3 pr-8 py-2 rounded-lg border border-gray-200 bg-white/50 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
            >
              <option value="">All Tasks</option>
              {tasks.map((task) => (
                <option key={task.id} value={task.id}>
                  {task.name}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          </div>

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
          >
            <RefreshCw className="w-4 h-4" />
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
              onClick={() => handleToggleTag(tag.id)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-all flex items-center gap-1 ${
                selectedTagIds.includes(tag.id)
                  ? 'ring-2 ring-offset-1'
                  : 'opacity-70 hover:opacity-100'
              }`}
              style={{
                backgroundColor: `${tag.color}20`,
                color: tag.color,
                borderColor: tag.color,
                ...(selectedTagIds.includes(tag.id) && { ringColor: tag.color }),
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
          {selectedTagIds.length > 0 && (
            <button
              onClick={() => setSelectedTagIds([])}
              className="px-2 py-1 text-xs text-gray-500 hover:text-gray-700 rounded-full flex items-center gap-1"
            >
              <X className="w-3 h-3" />
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Selection Actions Bar */}
      {selectedImages.size > 0 && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 mb-4 flex items-center justify-between">
          <span className="text-sm text-emerald-700 font-medium">
            {selectedImages.size} image(s) selected
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowAddTagModal(true)}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg flex items-center gap-1"
            >
              <Tag className="w-4 h-4" />
              Add Tags
            </button>
            <button
              onClick={() => setSelectedImages(new Set())}
              className="px-3 py-1.5 text-gray-600 hover:text-gray-800 text-sm font-medium rounded-lg flex items-center gap-1"
            >
              <X className="w-4 h-4" />
              Clear
            </button>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 glass-strong rounded-2xl shadow-lg overflow-hidden flex flex-col">
        {/* Gallery Header */}
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-gray-50 to-white">
          <div className="flex items-center gap-3">
            <Grid3X3 className="w-5 h-5 text-emerald-600" />
            <span className="font-medium text-gray-700">
              {isLoadingImages ? 'Loading...' : `${total} image(s)`}
            </span>
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
                  Select All
                </>
              )}
            </button>
          )}
        </div>

        {/* Gallery Grid */}
        <div className="flex-1 overflow-y-auto p-4">
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
            <div className="grid grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3">
              {images.map((image) => (
                <div
                  key={image.id}
                  className={`relative group aspect-square rounded-lg overflow-hidden border-2 cursor-pointer transition-all ${
                    selectedImages.has(image.id)
                      ? 'border-emerald-500 ring-2 ring-emerald-500/30'
                      : 'border-gray-200 hover:border-emerald-300'
                  }`}
                  onClick={() => handleToggleImage(image.id)}
                  onDoubleClick={() => setShowImageModal(image)}
                >
                  {/* Thumbnail */}
                  <img
                    src={image.thumbnail_url || '/sample.webp'}
                    alt={image.filename}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />

                  {/* Selection Checkbox */}
                  <div
                    className={`absolute top-1 left-1 w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${
                      selectedImages.has(image.id)
                        ? 'bg-emerald-500 border-emerald-500'
                        : 'bg-white/80 border-gray-300 opacity-0 group-hover:opacity-100'
                    }`}
                  >
                    {selectedImages.has(image.id) && <Check className="w-3 h-3 text-white" />}
                  </div>

                  {/* Tags */}
                  {image.tags.length > 0 && (
                    <div className="absolute top-1 right-1 flex flex-wrap gap-0.5 max-w-[80%] justify-end">
                      {image.tags.slice(0, 3).map((tag) => (
                        <span
                          key={tag.id}
                          className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: tag.color }}
                          title={tag.name}
                        />
                      ))}
                      {image.tags.length > 3 && (
                        <span className="text-[8px] text-white bg-black/50 px-1 rounded">
                          +{image.tags.length - 3}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Filename overlay */}
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <p className="text-[10px] text-white truncate">{image.filename}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between">
            <span className="text-sm text-gray-500">
              Page {page} of {totalPages}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-3 py-1 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
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
      {showAddTagModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">
                Add Tags to {selectedImages.size} Image(s)
              </h3>
              <button
                onClick={() => setShowAddTagModal(false)}
                className="p-1 text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2 max-h-64 overflow-y-auto">
              {allTags.map((tag) => (
                <button
                  key={tag.id}
                  onClick={() => handleBulkAddTags([tag.id])}
                  disabled={bulkTagMutation.isPending}
                  className="w-full px-3 py-2 text-left rounded-lg hover:bg-gray-50 flex items-center gap-2"
                >
                  <span
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: tag.color }}
                  />
                  <span className="text-sm font-medium">{tag.name}</span>
                  {tag.usage_count !== undefined && (
                    <span className="text-xs text-gray-400">({tag.usage_count})</span>
                  )}
                </button>
              ))}
              {allTags.length === 0 && (
                <p className="text-sm text-gray-500 text-center py-4">
                  No tags available. Create one first!
                </p>
              )}
            </div>

            <div className="flex justify-between items-center pt-4 border-t border-gray-100 mt-4">
              <button
                onClick={() => {
                  setShowAddTagModal(false);
                  setShowTagManager(true);
                }}
                className="text-sm text-emerald-600 hover:text-emerald-700 flex items-center gap-1"
              >
                <Plus className="w-4 h-4" />
                Create New Tag
              </button>
              <button
                onClick={() => setShowAddTagModal(false)}
                className="px-4 py-2 text-gray-600 hover:text-gray-800"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Image Detail Modal */}
      {showImageModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl mx-4 max-h-[90vh] overflow-hidden flex flex-col">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900 truncate">
                {showImageModal.filename}
              </h3>
              <button
                onClick={() => setShowImageModal(null)}
                className="p-1 text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Image Preview */}
                <div className="aspect-square bg-gray-100 rounded-xl overflow-hidden">
                  <img
                    src={showImageModal.thumbnail_url || '/sample.webp'}
                    alt={showImageModal.filename}
                    className="w-full h-full object-contain"
                  />
                </div>

                {/* Details */}
                <div className="space-y-4">
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
                    <h4 className="text-sm font-medium text-gray-500 mb-2">Tags</h4>
                    <div className="flex flex-wrap gap-2">
                      {showImageModal.tags.map((tag) => (
                        <span
                          key={tag.id}
                          className="px-3 py-1 rounded-full text-xs font-medium"
                          style={{
                            backgroundColor: `${tag.color}20`,
                            color: tag.color,
                          }}
                        >
                          {tag.name}
                        </span>
                      ))}
                      {showImageModal.tags.length === 0 && (
                        <span className="text-sm text-gray-400">No tags assigned</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-gray-100 flex justify-end">
              <button
                onClick={() => setShowImageModal(null)}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
