/**
 * Classification Mapping UI - Handles categorized and free-form class mapping for export.
 */

import { useState } from 'react';
import { Plus, X, ChevronDown } from 'lucide-react';
import type {
  ClassificationMappingConfig,
  TagCategoryForExport,
} from '@/types/export';

interface ClassificationMappingUIProps {
  categories: TagCategoryForExport[];
  config?: ClassificationMappingConfig;
  onChange: (config: ClassificationMappingConfig) => void;
}

export function ClassificationMappingUI({
  categories,
  config,
  onChange,
}: ClassificationMappingUIProps) {
  const [newClassName, setNewClassName] = useState('');

  const mode = config?.mode || 'categorized';
  const categoryId = config?.category_id;
  const classMapping = config?.class_mapping || {};

  const handleModeChange = (newMode: 'categorized' | 'free_form') => {
    onChange({
      mode: newMode,
      category_id: newMode === 'categorized' ? categoryId : undefined,
      class_mapping: newMode === 'free_form' ? classMapping : undefined,
    });
  };

  const handleCategoryChange = (catId: string) => {
    onChange({
      mode: 'categorized',
      category_id: catId,
    });
  };

  const handleAddClass = () => {
    if (!newClassName.trim()) return;
    const trimmed = newClassName.trim();
    if (classMapping[trimmed]) return; // Already exists

    onChange({
      mode: 'free_form',
      class_mapping: {
        ...classMapping,
        [trimmed]: [],
      },
    });
    setNewClassName('');
  };

  const handleRemoveClass = (className: string) => {
    const updated = { ...classMapping };
    delete updated[className];
    onChange({
      mode: 'free_form',
      class_mapping: updated,
    });
  };

  const handleToggleTag = (className: string, tagId: string) => {
    const current = classMapping[className] || [];
    const updated = current.includes(tagId)
      ? current.filter((id) => id !== tagId)
      : [...current, tagId];

    onChange({
      mode: 'free_form',
      class_mapping: {
        ...classMapping,
        [className]: updated,
      },
    });
  };

  // Flatten all tags from all categories for free-form mode
  const allTags = categories.flatMap((cat) =>
    cat.tags.map((tag) => ({
      ...tag,
      categoryName: cat.display_name || cat.name,
      categoryColor: cat.color,
    }))
  );

  return (
    <div className="space-y-4">
      {/* Mode Selection */}
      <div className="flex space-x-4">
        <label className="flex items-center space-x-2 cursor-pointer">
          <input
            type="radio"
            checked={mode === 'categorized'}
            onChange={() => handleModeChange('categorized')}
            className="w-4 h-4 text-emerald-600"
          />
          <span className="text-gray-900">Categorized</span>
        </label>
        <label className="flex items-center space-x-2 cursor-pointer">
          <input
            type="radio"
            checked={mode === 'free_form'}
            onChange={() => handleModeChange('free_form')}
            className="w-4 h-4 text-emerald-600"
          />
          <span className="text-gray-900">Free-form</span>
        </label>
      </div>

      {/* Categorized Mode */}
      {mode === 'categorized' && (
        <div className="space-y-3">
          <p className="text-sm text-gray-500">
            Select a tag category. Each tag in the category becomes a class.
          </p>

          {categories.length === 0 ? (
            <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-700">
              No tag categories found. Create tag categories in the project settings first.
            </div>
          ) : (
            <div className="relative">
              <select
                value={categoryId || ''}
                onChange={(e) => handleCategoryChange(e.target.value)}
                className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-lg text-gray-900 bg-white appearance-none focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="">Select a category...</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.display_name || cat.name} ({cat.tags.length} tags)
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            </div>
          )}

          {/* Preview selected category tags */}
          {categoryId && (
            <div className="mt-3">
              <p className="text-sm font-medium text-gray-700 mb-2">Classes from this category:</p>
              <div className="flex flex-wrap gap-2">
                {categories
                  .find((c) => c.id === categoryId)
                  ?.tags.map((tag) => (
                    <span
                      key={tag.id}
                      className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium"
                      style={{
                        backgroundColor: `${tag.color}20`,
                        color: tag.color,
                        border: `1px solid ${tag.color}40`,
                      }}
                    >
                      <span
                        className="w-2 h-2 rounded-full mr-1.5"
                        style={{ backgroundColor: tag.color }}
                      />
                      {tag.name}
                    </span>
                  ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Free-form Mode */}
      {mode === 'free_form' && (
        <div className="space-y-4">
          <p className="text-sm text-gray-500">
            Define custom class names and map tags to each class.
          </p>

          {/* Add new class */}
          <div className="flex space-x-2">
            <input
              type="text"
              value={newClassName}
              onChange={(e) => setNewClassName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddClass()}
              placeholder="Enter class name..."
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
            <button
              onClick={handleAddClass}
              disabled={!newClassName.trim()}
              className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
            >
              <Plus className="w-4 h-4 mr-1" />
              Add
            </button>
          </div>

          {/* Class mappings */}
          {Object.keys(classMapping).length === 0 ? (
            <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-500 text-center">
              No classes defined yet. Add a class name above.
            </div>
          ) : (
            <div className="space-y-3">
              {Object.entries(classMapping).map(([className, tagIds]) => (
                <div
                  key={className}
                  className="p-3 border border-gray-200 rounded-lg bg-white"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium text-gray-900">{className}</span>
                    <button
                      onClick={() => handleRemoveClass(className)}
                      className="p-1 text-gray-400 hover:text-red-500 rounded"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Tag selection */}
                  <div className="flex flex-wrap gap-1.5">
                    {allTags.length === 0 ? (
                      <span className="text-sm text-gray-400">No tags available</span>
                    ) : (
                      allTags.map((tag) => {
                        const isSelected = tagIds.includes(tag.id);
                        return (
                          <button
                            key={tag.id}
                            onClick={() => handleToggleTag(className, tag.id)}
                            className={`inline-flex items-center px-2 py-1 rounded text-xs transition-all ${
                              isSelected
                                ? 'ring-2 ring-offset-1'
                                : 'opacity-60 hover:opacity-100'
                            }`}
                            style={{
                              backgroundColor: `${tag.color}20`,
                              color: tag.color,
                              borderColor: tag.color,
                              ...(isSelected && { ringColor: tag.color }),
                            }}
                            title={`${tag.categoryName}: ${tag.name}`}
                          >
                            <span
                              className="w-2 h-2 rounded-full mr-1"
                              style={{ backgroundColor: tag.color }}
                            />
                            {tag.name}
                          </button>
                        );
                      })
                    )}
                  </div>

                  {tagIds.length === 0 && (
                    <p className="text-xs text-gray-400 mt-2">
                      Click tags above to map them to this class
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Summary */}
          {Object.keys(classMapping).length > 0 && (
            <div className="text-sm text-gray-500">
              {Object.keys(classMapping).length} class(es) defined,{' '}
              {Object.values(classMapping).flat().length} tag(s) mapped
            </div>
          )}
        </div>
      )}
    </div>
  );
}
