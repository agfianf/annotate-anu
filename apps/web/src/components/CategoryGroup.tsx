/**
 * CategoryGroup Component
 * Collapsible category with nested tags for tag selection modals
 */

import { Check, ChevronDown, ChevronRight } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { TagCategory } from '../lib/data-management-client';
import { getCategorySelectionState } from '../lib/tag-utils';

interface CategoryGroupProps {
  category: TagCategory;
  selectedTagIds: string[];
  onToggleTag: (tagId: string) => void;
  onSelectAll: (categoryId: string) => void;
  showUsageCount?: boolean;
  searchQuery?: string;
}

export default function CategoryGroup({
  category,
  selectedTagIds,
  onToggleTag,
  onSelectAll,
  showUsageCount = false,
}: CategoryGroupProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const checkboxRef = useRef<HTMLInputElement>(null);

  const categoryTags = category.tags || [];
  const selectionState = getCategorySelectionState(category, selectedTagIds);

  // Update checkbox indeterminate state
  useEffect(() => {
    if (checkboxRef.current) {
      checkboxRef.current.indeterminate = selectionState.some;
    }
  }, [selectionState.some]);

  const handleHeaderClick = () => {
    setIsExpanded(!isExpanded);
  };

  const handleToggleTag = (tagId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    onToggleTag(tagId);
  };

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      {/* Category Header */}
      <div
        className="flex items-center gap-2 px-3 py-2 bg-white hover:bg-orange-50/40 cursor-pointer transition-colors border-b border-gray-100"
        onClick={handleHeaderClick}
      >
        {/* Expand/Collapse Chevron */}
        <button
          type="button"
          className="p-0.5 text-gray-400 hover:text-gray-600 transition-colors"
          onClick={handleHeaderClick}
        >
          {isExpanded ? (
            <ChevronDown className="w-4 h-4" />
          ) : (
            <ChevronRight className="w-4 h-4" />
          )}
        </button>

        {/* Select All Checkbox */}
        <input
          ref={checkboxRef}
          type="checkbox"
          checked={selectionState.all}
          onChange={(e) => {
            e.stopPropagation();
            if (category.id) {
              onSelectAll(category.id);
            }
          }}
          className="w-4 h-4 text-orange-600 border-gray-300 rounded focus:ring-orange-500 cursor-pointer"
        />

        {/* Category Color Indicator */}
        <span
          className="w-3 h-3 rounded-full flex-shrink-0"
          style={{ backgroundColor: category.color }}
        />

        {/* Category Name */}
        <span className="text-sm font-semibold text-gray-800 flex-1">
          {category.display_name || category.name}
        </span>

        {/* Tag Count */}
        {categoryTags.length > 0 && (
          <span className="text-xs text-gray-400 font-mono">({categoryTags.length})</span>
        )}
      </div>

      {/* Nested Tags List */}
      {isExpanded && (
        <div className="bg-gray-50/50">
          {categoryTags.length === 0 ? (
            <div className="px-6 py-3 text-sm text-gray-400 text-center">
              No tags in this category
            </div>
          ) : (
            <div className="space-y-0.5 p-1">
              {categoryTags.map((tag) => {
                const isSelected = selectedTagIds.includes(tag.id);
                return (
                  <label
                    key={tag.id}
                    className="flex items-center gap-3 px-6 py-2 hover:bg-white rounded cursor-pointer transition-colors group"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={(e) => handleToggleTag(tag.id, e as unknown as React.MouseEvent)}
                      className="w-4 h-4 text-emerald-600 border-gray-300 rounded focus:ring-emerald-500"
                    />
                    <span
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: tag.color || category.color }}
                    />
                    <span className="text-sm text-gray-700 flex-1 font-medium">
                      {tag.name}
                    </span>
                    {showUsageCount && tag.usage_count !== undefined && (
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
          )}
        </div>
      )}
    </div>
  );
}
