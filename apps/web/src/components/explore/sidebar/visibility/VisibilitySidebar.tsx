import { useQuery } from '@tanstack/react-query';
import { Database, Eye, EyeOff, RefreshCw, Tag } from 'lucide-react';
import { useState } from 'react';
import type { UseExploreVisibilityReturn } from '@/hooks/useExploreVisibility';
import type { MetadataFieldKey } from '@/hooks/useExploreVisibility';
import { tagCategoriesApi, attributeSchemasApi } from '@/lib/data-management-client';
import { VisibilityItem } from './VisibilityItem';
import { VisibilitySection } from './VisibilitySection';
import { ColorPickerPopup } from '@/components/ui/ColorPickerPopup';

interface VisibilitySidebarProps {
  projectId: string;
  visibility: UseExploreVisibilityReturn;
  onAddCategory?: () => void;
}

export function VisibilitySidebar({
  projectId,
  visibility,
  onAddCategory,
}: VisibilitySidebarProps) {
  // Color picker state
  const [colorPickerField, setColorPickerField] = useState<MetadataFieldKey | null>(null);
  const [colorPickerAnchor, setColorPickerAnchor] = useState<HTMLElement | null>(null);

  // Fetch tag categories with nested tags for the project
  const {
    data: tagCategories,
    isLoading: categoriesLoading,
    refetch: refetchCategories,
    isRefetching: categoriesRefetching,
  } = useQuery({
    queryKey: ['project-tag-categories', projectId],
    queryFn: () => tagCategoriesApi.list(Number(projectId), { include_tags: true }),
    staleTime: 30000,
  });

  // Fetch attribute schemas (categories)
  const {
    data: schemas,
    isLoading: schemasLoading,
    refetch: refetchSchemas,
    isRefetching: schemasRefetching,
  } = useQuery({
    queryKey: ['attribute-schemas', projectId],
    queryFn: () => attributeSchemasApi.list(projectId),
    staleTime: 30000,
  });

  const isLoading = categoriesLoading || schemasLoading;
  const isRefetching = categoriesRefetching || schemasRefetching;

  const handleRefresh = () => {
    refetchCategories();
    refetchSchemas();
  };

  // Get categorical attribute schemas for ATTRIBUTES section
  const categoricalSchemas = schemas?.filter((s) => s.field_type === 'categorical') || [];

  // Count total tags across all categories
  const totalTags = tagCategories?.reduce((sum, cat) => sum + (cat.tags?.length || 0), 0) || 0;

  // Collect all tag and category IDs for bulk operations
  const handleShowAll = () => {
    const allTagIds: string[] = [];
    const allCategoryIds: string[] = [];

    // Collect tag categories and their tags
    if (tagCategories) {
      tagCategories.forEach(category => {
        if (category.id) {
          allCategoryIds.push(category.id);
        }
        if (category.tags) {
          allTagIds.push(...category.tags.map(tag => tag.id));
        }
      });
    }

    // Collect attribute schemas
    if (categoricalSchemas) {
      allCategoryIds.push(...categoricalSchemas.map(schema => schema.id));
    }

    visibility.showAll(allTagIds, allCategoryIds);
  };

  const handleHideAll = () => {
    const allTagIds: string[] = [];
    const allCategoryIds: string[] = [];

    // Collect tag categories and their tags
    if (tagCategories) {
      tagCategories.forEach(category => {
        if (category.id) {
          allCategoryIds.push(category.id);
        }
        if (category.tags) {
          allTagIds.push(...category.tags.map(tag => tag.id));
        }
      });
    }

    // Collect attribute schemas
    if (categoricalSchemas) {
      allCategoryIds.push(...categoricalSchemas.map(schema => schema.id));
    }

    visibility.hideAll(allTagIds, allCategoryIds);
  };

  // Color picker handlers
  const handleMetadataColorClick = (field: MetadataFieldKey) => (e: React.MouseEvent<HTMLButtonElement>) => {
    setColorPickerField(field);
    setColorPickerAnchor(e.currentTarget);
  };

  const handleColorChange = (color: string) => {
    if (colorPickerField) {
      visibility.setMetadataColor(colorPickerField, color);
    }
  };

  const handleColorPickerClose = () => {
    setColorPickerField(null);
    setColorPickerAnchor(null);
  };

  return (
    <div className="h-full flex flex-col bg-white/80 backdrop-blur-xl border-r border-emerald-100 w-72 shadow-2xl font-sans text-sm text-slate-700">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-emerald-100 bg-emerald-50/30 backdrop-blur-xl">
        <div className="flex items-center gap-2">
          <div className="p-1 border border-emerald-200 bg-white/50 rounded-sm">
            <Eye className="h-3 w-3 text-emerald-600" />
          </div>
          <h2 className="font-mono text-xs font-bold text-emerald-900 tracking-widest uppercase">
            Visibility
          </h2>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleRefresh}
            disabled={isRefetching}
            className="p-1.5 text-emerald-600/60 hover:text-emerald-700 hover:bg-emerald-100 rounded-sm transition-all disabled:opacity-50"
            title="Refresh"
          >
            <RefreshCw className={`h-3 w-3 ${isRefetching ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={handleShowAll}
            className="p-1.5 text-emerald-600/60 hover:text-emerald-700 hover:bg-emerald-100 rounded-sm transition-all"
            title="Show all"
          >
            <Eye className="h-3 w-3" />
          </button>
          <button
            onClick={handleHideAll}
            className="p-1.5 text-emerald-600/60 hover:text-emerald-700 hover:bg-emerald-100 rounded-sm transition-all"
            title="Hide all"
          >
            <EyeOff className="h-3 w-3" />
          </button>
        </div>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-emerald-200 scrollbar-track-transparent">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <RefreshCw className="h-4 w-4 text-emerald-300 animate-spin" />
          </div>
        ) : (
          <div className="divide-y divide-emerald-50">
            {/* TAGS Section (Hierarchical with Categories) */}
            <VisibilitySection
              title="Tags"
              icon={<Tag className="h-3.5 w-3.5 text-orange-500" />}
              count={totalTags}
              color="#F97316"
              showAddButton
              onAddClick={onAddCategory}
            >
              {tagCategories && tagCategories.length > 0 ? (
                <div className="space-y-0.5 max-h-96 overflow-y-auto">
                  {tagCategories.map((category) => (
                    <div key={category.id || 'uncategorized'} className="space-y-0.5">
                      {/* Category header (collapsible) */}
                      <VisibilityItem
                        name={category.display_name || category.name}
                        checked={category.id ? visibility.isCategoryVisible(category.id) : true}
                        color={category.color}
                        onToggle={() => category.id && visibility.toggleCategory(category.id)}
                        expandable={Boolean(category.tags && category.tags.length > 0)}
                      >
                        {/* Nested tags under category */}
                        {category.tags?.map((tag) => (
                          <VisibilityItem
                            key={tag.id}
                            name={tag.name}
                            checked={visibility.isTagVisible(tag.id)}
                            color={category.color}
                            onToggle={() => visibility.toggleTag(tag.id)}
                            indent={1}
                          />
                        ))}
                      </VisibilityItem>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-emerald-900/50 py-2 px-3">No tag categories defined</p>
              )}
            </VisibilitySection>

            {/* METADATA Section */}
            <VisibilitySection
              title="Metadata"
              icon={<Database className="h-3.5 w-3.5 text-emerald-500" />}
              color="#10B981"
            >
              <div className="space-y-0.5">
                <VisibilityItem
                  name="filename"
                  checked={visibility.isMetadataVisible('filename')}
                  color={visibility.getMetadataColor('filename')}
                  onToggle={() => visibility.toggleMetadata('filename')}
                  onColorClick={handleMetadataColorClick('filename')}
                />
                <VisibilityItem
                  name="filepath"
                  checked={visibility.isMetadataVisible('filepath')}
                  color={visibility.getMetadataColor('filepath')}
                  onToggle={() => visibility.toggleMetadata('filepath')}
                  onColorClick={handleMetadataColorClick('filepath')}
                />
                <VisibilityItem
                  name="imageUids"
                  checked={visibility.isMetadataVisible('imageUids')}
                  color={visibility.getMetadataColor('imageUids')}
                  onToggle={() => visibility.toggleMetadata('imageUids')}
                  onColorClick={handleMetadataColorClick('imageUids')}
                />
                <VisibilityItem
                  name="width"
                  checked={visibility.isMetadataVisible('width')}
                  color={visibility.getMetadataColor('width')}
                  onToggle={() => visibility.toggleMetadata('width')}
                  onColorClick={handleMetadataColorClick('width')}
                />
                <VisibilityItem
                  name="height"
                  checked={visibility.isMetadataVisible('height')}
                  color={visibility.getMetadataColor('height')}
                  onToggle={() => visibility.toggleMetadata('height')}
                  onColorClick={handleMetadataColorClick('height')}
                />
                <VisibilityItem
                  name="fileSize"
                  checked={visibility.isMetadataVisible('fileSize')}
                  color={visibility.getMetadataColor('fileSize')}
                  onToggle={() => visibility.toggleMetadata('fileSize')}
                  onColorClick={handleMetadataColorClick('fileSize')}
                />
              </div>
            </VisibilitySection>

            {/* ATTRIBUTES Section (Categorical schemas) */}
            {categoricalSchemas.length > 0 && (
              <VisibilitySection
                title="Attributes"
                icon={<Database className="h-3.5 w-3.5 text-blue-500" />}
                count={categoricalSchemas.length}
                color="#3B82F6"
                showAddButton
                onAddClick={onAddCategory}
              >
                <div className="space-y-0.5 max-h-64 overflow-y-auto">
                  {categoricalSchemas.map((schema) => (
                    <VisibilityItem
                      key={schema.id}
                      name={schema.display_name || schema.name}
                      checked={visibility.isCategoryVisible(schema.id)}
                      color={schema.color || '#6B7280'}
                      onToggle={() => visibility.toggleCategory(schema.id)}
                      expandable={Boolean(
                        schema.allowed_values && schema.allowed_values.length > 0
                      )}
                    >
                      {/* Show allowed values as nested items */}
                      {schema.allowed_values?.map((value: string) => (
                        <VisibilityItem
                          key={`${schema.id}-${value}`}
                          name={value}
                          checked={visibility.isCategoryVisible(schema.id)}
                          color={schema.color || '#6B7280'}
                          onToggle={() => visibility.toggleCategory(schema.id)}
                          indent={1}
                        />
                      ))}
                    </VisibilityItem>
                  ))}
                </div>
              </VisibilitySection>
            )}
          </div>
        )}
      </div>

      {/* Footer info */}
      <div className="px-4 py-2 border-t border-emerald-100 bg-emerald-50/20">
        <p className="text-[10px] text-emerald-600/60 font-mono text-center">
          Toggle visibility of tags on thumbnails
        </p>
      </div>

      {/* Color Picker Popup */}
      <ColorPickerPopup
        selectedColor={colorPickerField ? visibility.getMetadataColor(colorPickerField) : '#10B981'}
        onColorChange={handleColorChange}
        isOpen={colorPickerField !== null}
        onClose={handleColorPickerClose}
        anchorEl={colorPickerAnchor}
      />
    </div>
  );
}
