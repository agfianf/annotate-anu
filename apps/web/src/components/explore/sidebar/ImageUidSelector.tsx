/**
 * ImageUidSelector - Multi-select dropdown for filtering by specific image UIDs
 * Features virtualized list, search, and thumbnails
 */

import { useQuery } from '@tanstack/react-query';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Check, Search, X } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { projectImagesApi, getAbsoluteThumbnailUrl, type SharedImage } from '@/lib/data-management-client';

interface ImageUidSelectorProps {
  projectId: string;
  selectedImageIds: string[];
  onSelectionChange: (imageIds: string[]) => void;
}

export function ImageUidSelector({
  projectId,
  selectedImageIds,
  onSelectionChange,
}: ImageUidSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const parentRef = useRef<HTMLDivElement>(null);

  // Fetch all images for this project
  const { data: imagesResponse, isLoading } = useQuery({
    queryKey: ['project-images-list', projectId],
    queryFn: () => projectImagesApi.list(projectId, { page: 1, page_size: 10000 }),
    staleTime: 60000, // 1 minute
    enabled: isOpen, // Only fetch when dropdown is open
  });

  const images = imagesResponse?.images || [];

  // Filter images based on search query
  const filteredImages = useMemo(() => {
    if (!searchQuery) return images;
    const query = searchQuery.toLowerCase();
    return images.filter(
      (img: SharedImage) =>
        img.filename.toLowerCase().includes(query) ||
        img.id.toLowerCase().includes(query)
    );
  }, [images, searchQuery]);

  // Virtualizer for efficient rendering
  const virtualizer = useVirtualizer({
    count: filteredImages.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 48, // 48px per row
    overscan: 5,
  });

  const handleToggleImage = (imageId: string) => {
    if (selectedImageIds.includes(imageId)) {
      onSelectionChange(selectedImageIds.filter((id) => id !== imageId));
    } else {
      onSelectionChange([...selectedImageIds, imageId]);
    }
  };

  const handleSelectAll = () => {
    onSelectionChange(filteredImages.map((img: SharedImage) => img.id));
  };

  const handleClearAll = () => {
    onSelectionChange([]);
  };

  return (
    <div className="space-y-2">
      {/* Header */}
      <div className="flex items-center justify-between">
        <label className="text-[10px] text-emerald-900/70 font-mono uppercase tracking-wider">
          Select Images
        </label>
        {selectedImageIds.length > 0 && (
          <span className="text-[9px] text-emerald-600 font-mono">
            {selectedImageIds.length} selected
          </span>
        )}
      </div>

      {/* Dropdown Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full bg-white border border-emerald-200 px-3 py-2 text-left text-xs text-emerald-900 hover:border-emerald-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500/50 transition-all font-mono flex items-center justify-between"
      >
        <span className="truncate">
          {selectedImageIds.length > 0
            ? `${selectedImageIds.length} image${selectedImageIds.length !== 1 ? 's' : ''} selected`
            : 'Select images...'}
        </span>
        <svg
          className={`h-4 w-4 text-emerald-500 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown Panel */}
      {isOpen && (
        <div className="border border-emerald-200 bg-white shadow-lg max-h-96 flex flex-col">
          {/* Search */}
          <div className="p-2 border-b border-emerald-100">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-emerald-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search filename or ID..."
                className="w-full bg-emerald-50/50 border border-emerald-200 pl-8 pr-7 py-1.5 text-[10px] text-emerald-900 placeholder-emerald-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500/50 transition-all font-mono"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-emerald-400 hover:text-emerald-600"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 px-2 py-1.5 border-b border-emerald-100 bg-emerald-50/30">
            <button
              onClick={handleSelectAll}
              className="text-[9px] text-emerald-600 hover:text-emerald-500 font-mono"
            >
              Select All ({filteredImages.length})
            </button>
            <span className="text-emerald-200">|</span>
            <button
              onClick={handleClearAll}
              className="text-[9px] text-emerald-600 hover:text-emerald-500 font-mono"
            >
              Clear
            </button>
          </div>

          {/* Virtualized List */}
          <div
            ref={parentRef}
            className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-emerald-200 scrollbar-track-transparent"
            style={{ maxHeight: '240px' }}
          >
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-emerald-500 border-t-transparent" />
              </div>
            ) : filteredImages.length === 0 ? (
              <div className="text-center py-8 text-[10px] text-emerald-400 font-mono">
                No images found
              </div>
            ) : (
              <div
                style={{
                  height: `${virtualizer.getTotalSize()}px`,
                  width: '100%',
                  position: 'relative',
                }}
              >
                {virtualizer.getVirtualItems().map((virtualRow) => {
                  const image = filteredImages[virtualRow.index];
                  const isSelected = selectedImageIds.includes(image.id);
                  const thumbnailUrl = image.thumbnail_url
                    ? getAbsoluteThumbnailUrl(image.thumbnail_url)
                    : null;

                  return (
                    <div
                      key={image.id}
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: `${virtualRow.size}px`,
                        transform: `translateY(${virtualRow.start}px)`,
                      }}
                    >
                      <button
                        onClick={() => handleToggleImage(image.id)}
                        className={`w-full h-full flex items-center gap-2 px-2 py-1.5 hover:bg-emerald-50 transition-colors ${
                          isSelected ? 'bg-emerald-100' : ''
                        }`}
                      >
                        {/* Checkbox */}
                        <div
                          className={`flex-shrink-0 w-4 h-4 border ${
                            isSelected
                              ? 'bg-emerald-500 border-emerald-500'
                              : 'bg-white border-emerald-300'
                          } flex items-center justify-center transition-colors`}
                        >
                          {isSelected && <Check className="w-3 h-3 text-white" />}
                        </div>

                        {/* Thumbnail */}
                        {thumbnailUrl && (
                          <div className="flex-shrink-0 w-8 h-8 bg-emerald-100 border border-emerald-200 overflow-hidden">
                            <img
                              src={thumbnailUrl}
                              alt=""
                              className="w-full h-full object-cover"
                              loading="lazy"
                            />
                          </div>
                        )}

                        {/* Info */}
                        <div className="flex-1 min-w-0 text-left">
                          <div className="text-[10px] text-emerald-900 font-mono truncate">
                            {image.filename}
                          </div>
                          <div className="text-[8px] text-emerald-500 font-mono truncate">
                            {image.id.slice(0, 8)}...
                          </div>
                        </div>
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
