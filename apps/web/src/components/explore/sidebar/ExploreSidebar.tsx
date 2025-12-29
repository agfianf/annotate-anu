import { useSidebarAggregations, type ExploreFiltersState } from '@/hooks/useExploreFilters';
import { ArrowRight, Database, Filter, Layers, RefreshCw, X } from 'lucide-react';
import { CategoricalFilter } from './CategoricalFilter';
import { FilepathFilter } from './FilepathFilter';
import { NumericRangeFilter } from './NumericRangeFilter';
import { QuickFilters } from './QuickFilters';
import { SidebarSection } from './SidebarSection';
import { TagFilterSection } from './TagFilterSection';

interface ExploreSidebarProps {
  projectId: string;
  filters: ExploreFiltersState;
  onToggleTag: (tagId: string) => void;
  onToggleAttributeValue: (schemaId: string, value: string) => void;
  onSetNumericRange: (schemaId: string, min: number, max: number) => void;
  onToggleSizeFilter: (size: 'small' | 'medium' | 'large') => void;
  onSetWidthRange: (min: number, max: number) => void;
  onSetHeightRange: (min: number, max: number) => void;
  onSetSizeRange: (min: number, max: number) => void;
  onSetFilepathFilter: (pattern: string) => void;
  onApplyFilters: () => void;
  onClearFilters: () => void;
  hasActiveFilters: boolean;
  hasPendingChanges?: boolean;
}

export function ExploreSidebar({
  projectId,
  filters,
  onToggleTag,
  onToggleAttributeValue,
  onSetNumericRange,
  onToggleSizeFilter,
  onSetWidthRange,
  onSetHeightRange,
  onSetSizeRange,
  onSetFilepathFilter,
  onApplyFilters,
  onClearFilters,
  hasActiveFilters,
  hasPendingChanges = false,
}: ExploreSidebarProps) {
  const { data: aggregations, isLoading, refetch, isRefetching } = useSidebarAggregations(
    projectId,
    filters
  );

  return (
    <div className="h-full flex flex-col bg-white/80 backdrop-blur-xl border-r border-emerald-100 w-80 shadow-2xl font-sans text-sm text-slate-700">
      {/* Header - Pixelated/Frosted Style */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-emerald-100 bg-emerald-50/30 backdrop-blur-xl">
        <div className="flex items-center gap-2">
          <div className="p-1 border border-emerald-200 bg-white/50 rounded-sm">
            <Filter className="h-3 w-3 text-emerald-600" />
          </div>
          <h2 className="font-mono text-xs font-bold text-emerald-900 tracking-widest uppercase">Filters</h2>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => refetch()}
            disabled={isRefetching}
            className="p-1.5 text-emerald-600/60 hover:text-emerald-700 hover:bg-emerald-100 rounded-sm transition-all disabled:opacity-50"
            title="Refresh"
          >
            <RefreshCw className={`h-3 w-3 ${isRefetching ? 'animate-spin' : ''}`} />
          </button>
          {hasActiveFilters && (
            <button
              onClick={onClearFilters}
              className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-sm transition-all"
              title="Clear all filters"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      {/* Filter Stats */}
      {aggregations && (
        <div className="px-4 py-2 border-b border-emerald-100 bg-emerald-50/30">
          <div className="flex items-center justify-between font-mono text-[10px]">
            <div>
              <span className="text-emerald-900 font-bold">{aggregations.filtered_images.toLocaleString()}</span>
              <span className="text-emerald-400"> / </span>
              <span className="text-emerald-700/50">{aggregations.total_images.toLocaleString()}</span>
              <span className="text-emerald-400 ml-1">imgs</span>
            </div>
            {hasActiveFilters && (
              <span className="text-[9px] px-1.5 py-px border border-amber-500/30 text-amber-500 bg-amber-500/10 rounded-sm">
                FILTERED
              </span>
            )}
          </div>
        </div>
      )}

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-emerald-200 scrollbar-track-transparent">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <RefreshCw className="h-4 w-4 text-emerald-300 animate-spin" />
          </div>
        ) : aggregations ? (
          <div className="divide-y divide-emerald-50">
            {/* Tags Filter */}
            <TagFilterSection
              tags={aggregations.tags}
              selectedTagIds={(filters as any).selectedTagIds || []}
              onToggleTag={onToggleTag}
            />

            {/* Metadata Group */}
            <SidebarSection 
              title="METADATA" 
              icon={<Database className="h-3.5 w-3.5 text-emerald-500" />} 
              defaultExpanded={true}
              color="#10B981"
            >
               <div className="space-y-6 pt-2">
                 {/* Filepath Filter */}
                 <div className="pl-2 border-l border-emerald-100 ml-1">
                    <FilepathFilter
                      projectId={projectId}
                      selectedPaths={filters.filepathPaths || []}
                      onSelectionChange={(paths) => {
                        // Legacy compatibility: convert paths to pattern
                        // The new FilepathFilter uses paths array but this legacy component
                        // might still expect pattern-based filtering
                        if (paths.length > 0) {
                          onSetFilepathFilter(paths[0]);
                        } else {
                          onSetFilepathFilter('');
                        }
                      }}
                    />
                 </div>

                 {/* Width Filter */}
                 {aggregations.computed.width_stats && (
                    <div className="pl-2 border-l border-emerald-100 ml-1">
                      <NumericRangeFilter
                        aggregation={aggregations.computed.width_stats}
                        currentRange={filters.widthRange || null}
                        onRangeChange={onSetWidthRange}
                        unit="px"
                      />
                    </div>
                 )}

                 {/* Height Filter */}
                 {aggregations.computed.height_stats && (
                    <div className="pl-2 border-l border-emerald-100 ml-1">
                      <NumericRangeFilter
                        aggregation={aggregations.computed.height_stats}
                        currentRange={filters.heightRange || null}
                        onRangeChange={onSetHeightRange}
                        unit="px"
                      />
                    </div>
                 )}
                 
                 {/* File Size Filter */}
                 {aggregations.computed.file_size_stats && (
                    <div className="pl-2 border-l border-emerald-100 ml-1">
                      <NumericRangeFilter
                        aggregation={aggregations.computed.file_size_stats}
                        currentRange={filters.sizeRange || null}
                        onRangeChange={onSetSizeRange}
                        unit="B"
                      />
                    </div>
                 )}
                 
                 {/* Size Distribution (MP) */}
                  <div className="pl-2 border-l border-emerald-100 ml-1">
                    <div className="mb-2 px-3 text-[10px] font-mono text-emerald-600/70 uppercase tracking-wider">Image Size (MP)</div>
                     <QuickFilters
                       sizeDistribution={aggregations.computed.size_distribution}
                       selectedSizes={filters.sizeFilter}
                       onToggleSize={onToggleSizeFilter}
                     />
                  </div>
               </div>
            </SidebarSection>
            
            {/* Custom Attributes Group */}
            {aggregations.categorical_attributes.length > 0 || aggregations.numeric_attributes.length > 0 ? (
               <SidebarSection 
                 title="ATTRIBUTES" 
                 icon={<Layers className="h-3.5 w-3.5 text-blue-500" />} 
                 defaultExpanded={true}
                 color="#3B82F6"
               >
                 <div className="space-y-4 pt-2">
                    {/* Categorical Attributes */}
                    {aggregations.categorical_attributes.map((attr) => (
                      <div key={attr.schema_id} className="pl-2 border-l border-emerald-100 ml-1">
                        <CategoricalFilter
                          aggregation={attr}
                          selectedValues={filters.selectedAttributes[attr.schema_id] || []}
                          onToggleValue={(value) => onToggleAttributeValue(attr.schema_id, value)}
                        />
                      </div>
                    ))}

                    {/* Numeric Attributes */}
                    {aggregations.numeric_attributes.map((attr) => (
                      <div key={attr.schema_id} className="pl-2 border-l border-emerald-100 ml-1">
                        <NumericRangeFilter
                          aggregation={attr}
                          currentRange={filters.numericRanges[attr.schema_id] || null}
                          onRangeChange={(min, max) => onSetNumericRange(attr.schema_id, min, max)}
                        />
                      </div>
                    ))}
                 </div>
               </SidebarSection>
            ) : null}

          </div>
        ) : (
          <div className="px-4 py-8 text-center text-emerald-900/30 text-xs font-mono">
            FAILED TO LOAD FILTERS
          </div>
        )}
      </div>

      {/* Apply Filters Button - Fixed at Bottom */}
      <div className="p-3 border-t border-emerald-100 bg-white/50 backdrop-blur-xl">
        <button
          onClick={onApplyFilters}
          disabled={!hasPendingChanges}
          className={`w-full py-2 px-4 rounded-sm font-mono text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all border ${
            hasPendingChanges
              ? 'bg-emerald-500 text-white border-emerald-600 hover:bg-emerald-600 shadow-[0_4px_12px_rgba(16,185,129,0.3)]'
              : 'bg-emerald-50 text-emerald-300 border-emerald-100 cursor-not-allowed'
          }`}
        >
          <span>Apply Filters</span>
          <ArrowRight className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}
