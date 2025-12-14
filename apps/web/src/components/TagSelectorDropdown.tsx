/**
 * TagSelectorDropdown Component
 * A reusable floating dropdown for selecting and adding tags with multi-select support
 *
 * Features:
 * - Portal-based floating positioning with smart flip logic
 * - Search/filter functionality
 * - Multi-select with checkboxes
 * - Auto-focus on open
 * - Click-outside and escape key to close
 * - Responsive positioning (resize/scroll listeners)
 */

import { Check, Loader2, Plus, Search, Tag } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Tag as TagType } from '../lib/data-management-client';

export interface TagSelectorDropdownProps {
  // Core functionality
  tags: TagType[];
  excludeTagIds?: string[];
  onAddTags: (tagIds: string[]) => void;

  // UI customization
  buttonText?: string;
  placeholder?: string;
  disabled?: boolean;
  size?: 'sm' | 'md' | 'lg';

  // Optional features
  showUsageCount?: boolean;
  isSubmitting?: boolean;
}

interface DropdownPosition {
  top: number;
  left: number;
  width: number;
  showAbove: boolean;
}

export default function TagSelectorDropdown({
  tags,
  excludeTagIds = [],
  onAddTags,
  buttonText = 'Add Tags',
  placeholder = 'Search tags...',
  disabled = false,
  size = 'sm',
  showUsageCount = false,
  isSubmitting = false,
}: TagSelectorDropdownProps) {
  // State
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [dropdownPosition, setDropdownPosition] = useState<DropdownPosition | null>(null);

  // Refs
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Size classes for button
  const sizeClasses = {
    sm: 'px-3 py-1.5 text-xs',
    md: 'px-4 py-2 text-sm',
    lg: 'px-5 py-2.5 text-base',
  };

  // Calculate dropdown position with smart flip logic
  const calculatePosition = (): DropdownPosition | null => {
    if (!buttonRef.current) return null;

    const buttonRect = buttonRef.current.getBoundingClientRect();
    const dropdownHeight = 320; // Estimated max height

    // Default: show below
    let top = buttonRect.bottom + 4;
    let showAbove = false;

    // Check if dropdown would go off-screen at bottom
    if (top + dropdownHeight > window.innerHeight) {
      const spaceAbove = buttonRect.top;
      const spaceBelow = window.innerHeight - buttonRect.bottom;

      if (spaceAbove > spaceBelow) {
        // Flip to above
        top = buttonRect.top - dropdownHeight - 4;
        showAbove = true;
      }
    }

    // Horizontal positioning with edge detection
    let left = buttonRect.left;
    const dropdownWidth = Math.max(buttonRect.width, 280);

    // Check right edge
    if (left + dropdownWidth > window.innerWidth) {
      left = window.innerWidth - dropdownWidth - 8;
    }

    // Check left edge
    if (left < 8) {
      left = 8;
    }

    return { top, left, width: dropdownWidth, showAbove };
  };

  // Filter and sort available tags
  const availableTags = useMemo(() => {
    // Exclude already-attached tags
    let filtered = excludeTagIds.length > 0
      ? tags.filter(tag => !excludeTagIds.includes(tag.id))
      : tags;

    // Apply search filter
    if (search.trim()) {
      const searchLower = search.toLowerCase();
      filtered = filtered.filter(tag =>
        tag.name.toLowerCase().includes(searchLower)
      );
    }

    // Sort by usage_count (descending), then alphabetically
    return filtered.sort((a, b) => {
      if (a.usage_count !== undefined && b.usage_count !== undefined) {
        if (a.usage_count !== b.usage_count) {
          return b.usage_count - a.usage_count;
        }
      }
      return a.name.localeCompare(b.name);
    });
  }, [tags, excludeTagIds, search]);

  // Handlers
  const handleToggle = () => {
    if (disabled || isSubmitting) return;

    if (!isOpen) {
      const position = calculatePosition();
      if (position) {
        setDropdownPosition(position);
        setIsOpen(true);
      }
    } else {
      handleClose();
    }
  };

  const handleClose = () => {
    setIsOpen(false);
    setSearch('');
    setSelectedTagIds([]);
    setDropdownPosition(null);
  };

  const handleToggleTag = (tagId: string) => {
    setSelectedTagIds(prev =>
      prev.includes(tagId)
        ? prev.filter(id => id !== tagId)
        : [...prev, tagId]
    );
  };

  const handleAddTags = () => {
    if (selectedTagIds.length === 0) return;

    onAddTags(selectedTagIds);
    handleClose();
  };

  // Auto-focus search input when dropdown opens
  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      requestAnimationFrame(() => {
        searchInputRef.current?.focus();
      });
    }
  }, [isOpen]);

  // Update position on resize/scroll
  useEffect(() => {
    if (!isOpen) return;

    const updatePosition = () => {
      const newPosition = calculatePosition();
      if (newPosition) {
        setDropdownPosition(newPosition);
      }
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);

    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [isOpen]);

  // Click outside to close
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        handleClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Escape key to close
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen]);

  return (
    <>
      {/* Trigger Button */}
      <button
        ref={buttonRef}
        onClick={handleToggle}
        disabled={disabled || isSubmitting}
        className={`
          ${sizeClasses[size]}
          border border-emerald-500 text-emerald-600 rounded-lg bg-white
          hover:bg-emerald-50 focus:outline-none focus:ring-2 focus:ring-emerald-500
          disabled:opacity-50 disabled:cursor-not-allowed
          transition-colors flex items-center gap-1
        `}
      >
        {isSubmitting ? (
          <>
            <Loader2 className="w-3 h-3 animate-spin" />
            Adding...
          </>
        ) : (
          <>
            <Plus className="w-3 h-3" />
            {buttonText}
          </>
        )}
      </button>

      {/* Dropdown Portal */}
      {isOpen &&
        dropdownPosition &&
        createPortal(
          <div
            ref={dropdownRef}
            style={{
              position: 'fixed',
              top: dropdownPosition.top,
              left: dropdownPosition.left,
              width: dropdownPosition.width,
              zIndex: 9999,
            }}
            className="bg-white rounded-xl border border-gray-200 shadow-xl overflow-hidden"
          >
            {/* Search Section */}
            <div className="p-2 border-b border-gray-100">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={placeholder}
                  className="w-full pl-9 pr-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                />
              </div>
            </div>

            {/* Tags List */}
            <div className="max-h-64 overflow-y-auto">
              {availableTags.length === 0 ? (
                <div className="py-8 text-center">
                  {search.trim() ? (
                    <>
                      <Search className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                      <p className="text-sm text-gray-500">No tags match &quot;{search}&quot;</p>
                      <button
                        onClick={() => setSearch('')}
                        className="text-xs text-emerald-600 hover:text-emerald-700 mt-2"
                      >
                        Clear search
                      </button>
                    </>
                  ) : excludeTagIds.length > 0 && tags.length > 0 ? (
                    <>
                      <Tag className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                      <p className="text-sm text-gray-500">All tags already added</p>
                    </>
                  ) : (
                    <>
                      <Tag className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                      <p className="text-sm text-gray-500">No tags available</p>
                    </>
                  )}
                </div>
              ) : (
                <div className="py-1">
                  {availableTags.map((tag) => {
                    const isSelected = selectedTagIds.includes(tag.id);
                    return (
                      <label
                        key={tag.id}
                        className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 cursor-pointer transition-colors"
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
                        <span className="text-sm text-gray-700 flex-1 truncate" title={tag.name}>
                          {tag.name}
                        </span>
                        {showUsageCount && tag.usage_count !== undefined && (
                          <span className="text-xs text-gray-400">
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
              )}
            </div>

            {/* Footer Actions */}
            <div className="px-3 py-2 border-t border-gray-100 bg-gray-50 flex gap-2">
              <button
                onClick={handleAddTags}
                disabled={selectedTagIds.length === 0}
                className="flex-1 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-300 text-white text-xs font-medium rounded-lg transition-colors"
              >
                Add {selectedTagIds.length > 0 && `(${selectedTagIds.length})`}
              </button>
              <button
                onClick={handleClose}
                className="px-3 py-1.5 text-gray-600 hover:text-gray-800 text-xs font-medium rounded-lg"
              >
                Cancel
              </button>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
