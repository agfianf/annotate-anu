/**
 * FilepathFilter - Searchable dropdown for filtering by file paths/directories
 * Extracts unique directory paths from images for easy selection
 */

import { useQuery } from '@tanstack/react-query';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Check, Eye, EyeOff, FolderOpen, Search, X } from 'lucide-react';
import { useMemo, useRef, useState, useEffect } from 'react';
import { projectImagesApi, type SharedImage } from '@/lib/data-management-client';
import { ColorBorderWrapper } from '@/components/ui/ColorBorderWrapper';

interface FilepathFilterProps {
  projectId: string;
  selectedPaths: string[];
  onSelectionChange: (paths: string[]) => void;
  // Visibility control props
  isVisible?: boolean;
  onToggleVisibility?: () => void;
  displayColor?: string;
  onColorChange?: (color: string) => void;
}

/**
 * Extract unique directory paths from file paths
 */
function extractUniquePaths(images: SharedImage[]): string[] {
  const pathSet = new Set<string>();

  images.forEach((img) => {
    if (img.file_path) {
      // Get the directory path (everything before the last /)
      const lastSlash = img.file_path.lastIndexOf('/');
      if (lastSlash > 0) {
        const dirPath = img.file_path.substring(0, lastSlash);
        pathSet.add(dirPath);

        // Also add parent directories for hierarchical selection
        const parts = dirPath.split('/').filter(Boolean);
        let current = '';
        for (const part of parts) {
          current = current ? `${current}/${part}` : `/${part}`;
          pathSet.add(current);
        }
      }
    }
  });

  // Sort paths alphabetically
  return Array.from(pathSet).sort();
}

export function FilepathFilter({
  projectId,
  selectedPaths,
  onSelectionChange,
  isVisible = true,
  onToggleVisibility,
  displayColor = '#10B981',
  onColorChange,
}: FilepathFilterProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const parentRef = useRef<HTMLDivElement>(null);

  // Fetch all images to extract paths (paginated - backend max is 200)
  const { data: imagesResponse, isLoading } = useQuery({
    queryKey: ['project-images-paths', projectId],
    queryFn: async () => {
      // First request to get total count
      const firstPage = await projectImagesApi.list(projectId, { page: 1, page_size: 200 });
      const total = firstPage.total;

      if (total <= 200) {
        return firstPage;
      }

      // Fetch remaining pages in parallel
      const totalPages = Math.ceil(total / 200);
      const pagePromises = [];
      for (let page = 2; page <= totalPages; page++) {
        pagePromises.push(projectImagesApi.list(projectId, { page, page_size: 200 }));
      }

      const additionalPages = await Promise.all(pagePromises);
      const allImages = [
        ...firstPage.images,
        ...additionalPages.flatMap((p) => p.images),
      ];

      return { ...firstPage, images: allImages };
    },
    staleTime: 60000, // 1 minute
    enabled: isOpen, // Only fetch when dropdown is open
  });

  const images = imagesResponse?.images || [];

  // Extract unique paths from images
  const uniquePaths = useMemo(() => {
    return extractUniquePaths(images);
  }, [images]);

  // Filter paths based on search query
  const filteredPaths = useMemo(() => {
    if (!searchQuery) return uniquePaths;
    const query = searchQuery.toLowerCase();
    return uniquePaths.filter((path) => path.toLowerCase().includes(query));
  }, [uniquePaths, searchQuery]);

  // Virtualizer for efficient rendering
  const virtualizer = useVirtualizer({
    count: filteredPaths.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 32, // 32px per row
    overscan: 5,
  });

  const handleTogglePath = (path: string) => {
    if (selectedPaths.includes(path)) {
      onSelectionChange(selectedPaths.filter((p) => p !== path));
    } else {
      onSelectionChange([...selectedPaths, path]);
    }
  };

  const handleSelectAll = () => {
    onSelectionChange(filteredPaths);
  };

  const handleClearAll = () => {
    onSelectionChange([]);
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (parentRef.current && !parentRef.current.contains(event.target as Node)) {
        // Don't close if clicking inside the dropdown container
        const target = event.target as HTMLElement;
        if (target.closest('.filepath-dropdown-container')) {
          return;
        }
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  return (
    <ColorBorderWrapper
      color={displayColor}
      onColorChange={onColorChange || (() => {})}
      title="File Paths"
      className="space-y-2 filepath-dropdown-container"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <label className="text-[10px] text-emerald-900/70 font-mono uppercase tracking-wider flex items-center gap-1">
          <FolderOpen className="h-3 w-3" />
          File Paths
        </label>
        <div className="flex items-center gap-2">
          {selectedPaths.length > 0 && (
            <span className="text-[9px] text-emerald-600 font-mono">
              {selectedPaths.length} selected
            </span>
          )}
          {/* Visibility Toggle */}
          {onToggleVisibility && (
            <button
              onClick={onToggleVisibility}
              className={`p-0.5 rounded transition-colors ${
                isVisible
                  ? 'text-emerald-600 hover:bg-emerald-100'
                  : 'text-gray-400 hover:bg-gray-100'
              }`}
              title={isVisible ? 'Section visible' : 'Section hidden'}
            >
              {isVisible ? (
                <Eye className="h-3 w-3" />
              ) : (
                <EyeOff className="h-3 w-3" />
              )}
            </button>
          )}
        </div>
      </div>

      {/* Dropdown Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full bg-white border border-emerald-200 px-3 py-2 text-left text-xs text-emerald-900 hover:border-emerald-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500/50 transition-all font-mono flex items-center justify-between"
      >
        <span className="truncate">
          {selectedPaths.length > 0
            ? `${selectedPaths.length} path${selectedPaths.length !== 1 ? 's' : ''} selected`
            : 'Select paths...'}
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
        <div className="border border-emerald-200 bg-white shadow-lg max-h-80 flex flex-col">
          {/* Search */}
          <div className="p-2 border-b border-emerald-100">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-emerald-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search paths..."
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
              Select All ({filteredPaths.length})
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
            style={{ maxHeight: '200px' }}
          >
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-emerald-500 border-t-transparent" />
              </div>
            ) : filteredPaths.length === 0 ? (
              <div className="text-center py-8 text-[10px] text-emerald-400 font-mono">
                No paths found
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
                  const path = filteredPaths[virtualRow.index];
                  const isSelected = selectedPaths.includes(path);
                  // Calculate indentation based on path depth
                  const depth = (path.match(/\//g) || []).length;
                  const indent = Math.min(depth, 4) * 8; // Max 4 levels of indentation

                  return (
                    <div
                      key={path}
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
                        onClick={() => handleTogglePath(path)}
                        className={`w-full h-full flex items-center gap-2 px-2 py-1 hover:bg-emerald-50 transition-colors ${
                          isSelected ? 'bg-emerald-100' : ''
                        }`}
                        style={{ paddingLeft: `${8 + indent}px` }}
                      >
                        {/* Checkbox */}
                        <div
                          className={`flex-shrink-0 w-3.5 h-3.5 border ${
                            isSelected
                              ? 'bg-emerald-500 border-emerald-500'
                              : 'bg-white border-emerald-300'
                          } flex items-center justify-center transition-colors`}
                        >
                          {isSelected && <Check className="w-2.5 h-2.5 text-white" />}
                        </div>

                        {/* Folder Icon */}
                        <FolderOpen className="flex-shrink-0 w-3 h-3 text-emerald-400" />

                        {/* Path */}
                        <span className="flex-1 min-w-0 text-left text-[10px] text-emerald-900 font-mono truncate">
                          {path}
                        </span>
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </ColorBorderWrapper>
  );
}
