/**
 * AnnotationsSidebar Component
 * Main container for the annotations sidebar with resizable width
 */

import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Shapes,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { AnnotationsTable } from './AnnotationsTable';
import { FilterTabs } from './FilterTabs';
import { BulkActionsPanel } from './BulkActionsPanel';
import { AppearanceSection } from './AppearanceSection';
import { AttributesEditor } from './AttributesEditor';
import type {
  AnnotationsSidebarProps,
  AnnotationTableRow,
  FilterMode,
  AppearanceSettings,
} from './types';
import {
  FALLBACK_APPEARANCE_DEFAULTS,
  MIN_SIDEBAR_WIDTH,
  MAX_SIDEBAR_WIDTH,
  DEFAULT_SIDEBAR_WIDTH,
  COLLAPSED_SIDEBAR_WIDTH,
  SIDEBAR_WIDTH_KEY,
  SIDEBAR_SECTIONS_KEY,
} from './types';
import type { Annotation, RectangleAnnotation, PolygonAnnotation, PointAnnotation } from '@/types/annotations';

// Helper: Get dimensions string for an annotation (WxH for rectangles only)
function getDimensionsString(annotation: Annotation): string {
  switch (annotation.type) {
    case 'rectangle': {
      const rect = annotation as RectangleAnnotation;
      return `${Math.round(rect.width)}×${Math.round(rect.height)}`;
    }
    case 'point': {
      const pt = annotation as PointAnnotation;
      return `(${Math.round(pt.x)}, ${Math.round(pt.y)})`;
    }
    default:
      return '-';
  }
}

// Helper: Get point count for polygons
function getPointCount(annotation: Annotation): number {
  if (annotation.type === 'polygon') {
    return (annotation as PolygonAnnotation).points.length;
  }
  return 0;
}

// Helper: Get area for sorting
function getAnnotationArea(annotation: Annotation): number {
  switch (annotation.type) {
    case 'rectangle': {
      const rect = annotation as RectangleAnnotation;
      return rect.width * rect.height;
    }
    case 'polygon': {
      const poly = annotation as PolygonAnnotation;
      // Use shoelace formula for polygon area
      let area = 0;
      for (let i = 0; i < poly.points.length; i++) {
        const j = (i + 1) % poly.points.length;
        area += poly.points[i].x * poly.points[j].y;
        area -= poly.points[j].x * poly.points[i].y;
      }
      return Math.abs(area) / 2;
    }
    case 'point':
      return 0;
    default:
      return 0;
  }
}

// Helper: Calculate area percentage of image
function getAreaPercentage(annotation: Annotation, imageWidth?: number, imageHeight?: number): number {
  if (!imageWidth || !imageHeight) return 0;
  const imageArea = imageWidth * imageHeight;
  if (imageArea === 0) return 0;
  const annotationArea = getAnnotationArea(annotation);
  return (annotationArea / imageArea) * 100;
}

export function AnnotationsSidebar({
  annotations,
  labels,
  selectedAnnotations,
  selectedLabelId,
  onSelectAnnotations,
  onSelectLabel,
  onDeleteAnnotation,
  onBulkDeleteAnnotations,
  onBulkChangeLabel,
  onLabelChange,
  onToggleAnnotationVisibility,
  onBulkToggleVisibility,
  onUpdateAnnotationAttributes,
  isCollapsed,
  onToggleCollapse,
  imageWidth,
  imageHeight,
  appearanceSettings,
  onAppearanceChange,
  appearanceDefaults,
}: AnnotationsSidebarProps) {
  // Sidebar resize state
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    return saved ? parseInt(saved, 10) : DEFAULT_SIDEBAR_WIDTH;
  });
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);

  // Section collapsed state
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>(() => {
    const saved = localStorage.getItem(SIDEBAR_SECTIONS_KEY);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        // Ignore parse errors
      }
    }
    return {
      objects: false,      // Expanded by default (most used)
      filters: true,       // Collapsed by default
      appearance: true,    // Collapsed by default
    };
  });

  // Filter mode
  const [filterMode, setFilterMode] = useState<FilterMode>('all');

  // Internal selection state (sync with canvas)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Modal states
  const [showDeleteAllConfirm, setShowDeleteAllConfirm] = useState(false);
  const [showThresholdModal, setShowThresholdModal] = useState(false);
  const [confidenceThreshold, setConfidenceThreshold] = useState(0.5);

  // Attributes editor state
  const [editingAttributesId, setEditingAttributesId] = useState<string | null>(null);
  const [attributesAnchorEl, setAttributesAnchorEl] = useState<HTMLElement | null>(null);

  // Resolved appearance settings
  const resolvedAppearance = appearanceSettings ?? appearanceDefaults ?? FALLBACK_APPEARANCE_DEFAULTS;
  const resetAppearanceDefaults = appearanceDefaults ?? FALLBACK_APPEARANCE_DEFAULTS;

  // Get label by ID
  const getLabel = useCallback((labelId: string) => {
    return labels.find((l) => l.id === labelId);
  }, [labels]);

  // Sync sidebar selection with canvas selection
  useEffect(() => {
    const canvasSelection = new Set(selectedAnnotations);
    const currentIds = Array.from(selectedIds);
    const isSame =
      currentIds.length === selectedAnnotations.length &&
      currentIds.every((id) => canvasSelection.has(id));

    if (!isSame) {
      setSelectedIds(canvasSelection);
    }
  }, [selectedAnnotations]);

  // Save sidebar width to localStorage
  useEffect(() => {
    localStorage.setItem(SIDEBAR_WIDTH_KEY, sidebarWidth.toString());
  }, [sidebarWidth]);

  // Save section state to localStorage
  useEffect(() => {
    localStorage.setItem(SIDEBAR_SECTIONS_KEY, JSON.stringify(collapsedSections));
  }, [collapsedSections]);

  // Mouse handlers for resizing
  const startResizing = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  const stopResizing = useCallback(() => {
    setIsResizing(false);
  }, []);

  const resize = useCallback(
    (e: MouseEvent) => {
      if (isResizing && sidebarRef.current) {
        const rect = sidebarRef.current.getBoundingClientRect();
        // For right sidebar, width is from right edge
        const newWidth = rect.right - e.clientX;
        if (newWidth >= MIN_SIDEBAR_WIDTH && newWidth <= MAX_SIDEBAR_WIDTH) {
          setSidebarWidth(newWidth);
        }
      }
    },
    [isResizing]
  );

  useEffect(() => {
    if (isResizing) {
      window.addEventListener('mousemove', resize);
      window.addEventListener('mouseup', stopResizing);
    }
    return () => {
      window.removeEventListener('mousemove', resize);
      window.removeEventListener('mouseup', stopResizing);
    };
  }, [isResizing, resize, stopResizing]);

  // Toggle section collapsed state
  const toggleSection = (section: string) => {
    setCollapsedSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

  // Filter annotations
  const filteredAnnotations = useMemo(() => {
    return annotations.filter((ann) => {
      if (filterMode === 'manual') return !ann.isAutoGenerated;
      if (filterMode === 'auto') return ann.isAutoGenerated;
      return true;
    });
  }, [annotations, filterMode]);

  // Transform annotations to table rows
  const tinyThreshold = resolvedAppearance.tinyThreshold ?? 2;
  const tableData: AnnotationTableRow[] = useMemo(() => {
    return filteredAnnotations.map((ann, idx) => {
      const label = getLabel(ann.labelId);
      const areaPercentage = getAreaPercentage(ann, imageWidth, imageHeight);
      return {
        id: ann.id,
        index: idx + 1,
        type: ann.type,
        labelId: ann.labelId,
        labelName: label?.name || 'Unknown',
        labelColor: label?.color || '#888888',
        confidence: ann.confidence,
        isAutoGenerated: ann.isAutoGenerated || false,
        isVisible: ann.isVisible ?? true,
        dimensions: getDimensionsString(ann),
        pointCount: getPointCount(ann),
        area: getAnnotationArea(ann),
        areaPercentage,
        isTiny: areaPercentage > 0 && areaPercentage < tinyThreshold,
        hasAttributes: !!(ann.attributes && Object.keys(ann.attributes).length > 0),
        createdAt: ann.createdAt,
        originalAnnotation: ann,
      };
    });
  }, [filteredAnnotations, getLabel, imageWidth, imageHeight, tinyThreshold]);

  // Filter counts
  const filterCounts = useMemo(() => ({
    all: annotations.length,
    manual: annotations.filter((a) => !a.isAutoGenerated).length,
    auto: annotations.filter((a) => a.isAutoGenerated).length,
  }), [annotations]);

  // Low confidence count
  const lowConfidenceCount = useMemo(() => {
    return annotations.filter(
      (a) => a.isAutoGenerated && (a.confidence ?? 0) < confidenceThreshold
    ).length;
  }, [annotations, confidenceThreshold]);

  // Handle row click (with multi-select support)
  // In table: clicking toggles selection without modifier keys
  // Shift+click still does range selection
  const handleRowClick = useCallback(
    (id: string, event: React.MouseEvent) => {
      if (event.shiftKey && selectedIds.size > 0) {
        // Range selection (Shift+click)
        const sortedIds = tableData.map((row) => row.id);
        const lastSelected = Array.from(selectedIds)[selectedIds.size - 1];
        const lastIndex = sortedIds.indexOf(lastSelected);
        const currentIndex = sortedIds.indexOf(id);

        if (lastIndex !== -1 && currentIndex !== -1) {
          const start = Math.min(lastIndex, currentIndex);
          const end = Math.max(lastIndex, currentIndex);
          const rangeIds = sortedIds.slice(start, end + 1);
          const newSelection = new Set([...selectedIds, ...rangeIds]);
          setSelectedIds(newSelection);
          onSelectAnnotations(Array.from(newSelection));
        }
      } else {
        // Toggle selection (default behavior - no modifier needed)
        const newSelection = new Set(selectedIds);
        if (newSelection.has(id)) {
          newSelection.delete(id);
        } else {
          newSelection.add(id);
        }
        setSelectedIds(newSelection);
        onSelectAnnotations(Array.from(newSelection));
      }
    },
    [selectedIds, tableData, onSelectAnnotations]
  );

  // Handle bulk operations
  const handleBulkChangeLabel = useCallback(
    (newLabelId: string) => {
      if (selectedIds.size > 0) {
        onBulkChangeLabel(Array.from(selectedIds), newLabelId);
        setSelectedIds(new Set());
        onSelectAnnotations([]);
      }
    },
    [selectedIds, onBulkChangeLabel, onSelectAnnotations]
  );

  const handleBulkDelete = useCallback(() => {
    if (selectedIds.size > 0) {
      onBulkDeleteAnnotations(Array.from(selectedIds));
      setSelectedIds(new Set());
      onSelectAnnotations([]);
    }
  }, [selectedIds, onBulkDeleteAnnotations, onSelectAnnotations]);

  const handleClearSelection = useCallback(() => {
    setSelectedIds(new Set());
    onSelectAnnotations([]);
  }, [onSelectAnnotations]);

  const handleBulkToggleVisibility = useCallback(() => {
    if (selectedIds.size > 0) {
      onBulkToggleVisibility(Array.from(selectedIds));
    }
  }, [selectedIds, onBulkToggleVisibility]);

  // Handle opening attributes editor
  const handleEditAttributes = useCallback((annotationId: string) => {
    // Find the button that was clicked to anchor the popover
    const button = document.querySelector(`[data-annotation-id="${annotationId}"]`) as HTMLElement;
    setEditingAttributesId(annotationId);
    setAttributesAnchorEl(button);
  }, []);

  // Handle saving attributes
  const handleSaveAttributes = useCallback((newAttributes: Record<string, string | number | boolean>) => {
    if (editingAttributesId && onUpdateAnnotationAttributes) {
      onUpdateAnnotationAttributes(editingAttributesId, newAttributes);
    }
    setEditingAttributesId(null);
    setAttributesAnchorEl(null);
  }, [editingAttributesId, onUpdateAnnotationAttributes]);

  // Handle closing attributes editor
  const handleCloseAttributesEditor = useCallback(() => {
    setEditingAttributesId(null);
    setAttributesAnchorEl(null);
  }, []);

  // Get current editing annotation
  const editingAnnotation = useMemo(() => {
    if (!editingAttributesId) return null;
    return annotations.find((a) => a.id === editingAttributesId);
  }, [editingAttributesId, annotations]);

  // Handle delete all
  const handleDeleteAll = () => {
    if (annotations.length > 0) {
      onBulkDeleteAnnotations(annotations.map((a) => a.id));
      setSelectedIds(new Set());
      setShowDeleteAllConfirm(false);
    }
  };

  // Handle remove low confidence
  const handleRemoveLowConfidence = () => {
    const lowConfidenceIds = annotations
      .filter((a) => a.isAutoGenerated && (a.confidence ?? 0) < confidenceThreshold)
      .map((a) => a.id);

    if (lowConfidenceIds.length > 0) {
      onBulkDeleteAnnotations(lowConfidenceIds);
      setShowThresholdModal(false);
    }
  };

  // Collapsed view
  if (isCollapsed) {
    return (
      <div className="w-12 glass border-l border-gray-200 flex flex-col items-center py-3 gap-3 transition-all duration-300">
        {/* Expand Button */}
        <button
          onClick={onToggleCollapse}
          className="p-2 hover:bg-gray-100 rounded transition-colors text-gray-600 hover:text-gray-900"
          title="Expand Sidebar (Ctrl+B)"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>

        {/* Annotations Icon with Count Badge */}
        <div className="relative">
          <Shapes className="w-5 h-5 text-gray-600" />
          {annotations.length > 0 && (
            <div className="absolute -top-1 -right-1 w-4 h-4 bg-emerald-500 text-gray-900 text-[10px] rounded-full flex items-center justify-center font-medium">
              {annotations.length > 9 ? '9+' : annotations.length}
            </div>
          )}
        </div>

        {/* Selected count */}
        {selectedIds.size > 0 && (
          <div className="text-xs text-emerald-600 font-medium">
            {selectedIds.size}
          </div>
        )}
      </div>
    );
  }

  // Expanded view
  return (
    <>
      <div
        ref={sidebarRef}
        className="glass-strong border-l border-gray-200 flex flex-col transition-all duration-300 relative"
        style={{ width: sidebarWidth }}
      >
        {/* Resize Handle */}
        <div
          className="absolute left-0 top-0 bottom-0 w-1 cursor-ew-resize hover:bg-emerald-500/50 transition-colors z-10"
          onMouseDown={startResizing}
          title="Drag to resize"
        />

        {/* Header */}
        <div className="px-4 py-3 border-b border-gray-200 flex-shrink-0">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <Shapes className="w-5 h-5" />
              Annotations
            </h2>
            <div className="flex items-center gap-2">
              <div className="text-sm text-gray-600">
                {annotations.length} total
                {filterCounts.auto > 0 && ` • ${filterCounts.auto} auto`}
              </div>
              <button
                onClick={onToggleCollapse}
                className="p-1 hover:bg-gray-100 rounded transition-colors text-gray-600 hover:text-gray-900"
                title="Collapse Sidebar (Ctrl+B)"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Objects Section (Most Used - Top) */}
        <div className="border-b border-gray-200 flex flex-col">
          <button
            onClick={() => toggleSection('objects')}
            className="w-full px-3 py-2.5 flex items-center justify-between hover:bg-gray-50 transition-colors"
          >
            <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
              <Shapes className="w-4 h-4" />
              Objects
              <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-700 text-xs rounded-full">
                {tableData.length}
              </span>
              {selectedIds.size > 0 && (
                <span className="px-1.5 py-0.5 bg-emerald-500 text-white text-xs rounded-full">
                  {selectedIds.size} sel
                </span>
              )}
            </div>
            <ChevronDown
              className={`w-4 h-4 text-gray-500 transition-transform ${
                collapsedSections.objects ? '-rotate-90' : ''
              }`}
            />
          </button>

          {/* Table Content + Quick Edit Panel */}
          {!collapsedSections.objects && (
            <>
              {/* Filter Tabs + Actions (above table) */}
              {annotations.length > 0 && (
                <div className="px-3 py-2 border-b border-gray-100 space-y-2">
                  <FilterTabs
                    filterMode={filterMode}
                    onFilterChange={setFilterMode}
                    counts={filterCounts}
                  />
                  {/* Quick actions row */}
                  <div className="flex gap-1.5">
                    {filterCounts.auto > 0 && (
                      <button
                        onClick={() => setShowThresholdModal(true)}
                        className="flex-1 px-2 py-1 bg-white hover:bg-gray-100 text-gray-600 text-[10px] rounded border border-gray-200 transition-colors flex items-center justify-center gap-1"
                        title="Remove low confidence annotations"
                      >
                        <Sparkles className="w-3 h-3" />
                        Low ({lowConfidenceCount})
                      </button>
                    )}
                    <button
                      onClick={() => setShowDeleteAllConfirm(true)}
                      className="flex-1 px-2 py-1 bg-red-50 hover:bg-red-100 text-red-600 text-[10px] rounded border border-red-200 transition-colors flex items-center justify-center gap-1"
                      title="Delete all annotations"
                    >
                      <Trash2 className="w-3 h-3" />
                      Clear All
                    </button>
                  </div>
                </div>
              )}

              {/* Table */}
              <AnnotationsTable
                data={tableData}
                labels={labels}
                selectedIds={selectedIds}
                tinyThreshold={tinyThreshold}
                onRowClick={handleRowClick}
                onSelectionChange={(ids) => {
                  setSelectedIds(new Set(ids));
                  onSelectAnnotations(ids);
                }}
                onLabelChange={onLabelChange}
                onToggleVisibility={onToggleAnnotationVisibility}
                onDelete={onDeleteAnnotation}
                onBulkToggleVisibility={onBulkToggleVisibility}
                onEditAttributes={handleEditAttributes}
              />

              {/* Quick Edit Panel (at bottom of table when items selected) */}
              <BulkActionsPanel
                selectedCount={selectedIds.size}
                labels={labels}
                onBulkChangeLabel={handleBulkChangeLabel}
                onBulkDelete={handleBulkDelete}
                onClearSelection={handleClearSelection}
                onBulkToggleVisibility={handleBulkToggleVisibility}
              />
            </>
          )}
        </div>

        {/* Spacer to push appearance to bottom */}
        <div className="flex-1" />

        {/* Appearance Section (Bottom) */}
        <AppearanceSection
          settings={resolvedAppearance}
          defaults={resetAppearanceDefaults}
          onChange={(settings) => onAppearanceChange?.(settings)}
          isExpanded={!collapsedSections.appearance}
          onToggle={() => toggleSection('appearance')}
        />
      </div>

      {/* Delete All Confirmation Modal */}
      {createPortal(
        <Modal
          isOpen={showDeleteAllConfirm}
          onClose={() => setShowDeleteAllConfirm(false)}
          title="Delete All Annotations"
          maxWidth="md"
        >
          <div className="space-y-4">
            <p className="text-gray-800">
              Are you sure you want to delete all {annotations.length} annotations?
            </p>
            <p className="text-red-600 text-sm font-medium">
              This action cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowDeleteAllConfirm(false)}
                className="px-4 py-2 glass hover:glass-strong text-gray-900 rounded transition-colors border border-gray-300"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteAll}
                className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded transition-colors"
              >
                Delete All
              </button>
            </div>
          </div>
        </Modal>,
        document.body
      )}

      {/* Low Confidence Threshold Modal */}
      {createPortal(
        <Modal
          isOpen={showThresholdModal}
          onClose={() => setShowThresholdModal(false)}
          title="Remove Low Confidence Annotations"
          maxWidth="md"
        >
          <div className="space-y-4">
            <p className="text-gray-800">
              Remove auto-generated annotations with confidence below the threshold.
            </p>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-gray-800">
                  Confidence Threshold
                </label>
                <span className="text-emerald-600 font-medium">
                  {Math.round(confidenceThreshold * 100)}%
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={confidenceThreshold}
                onChange={(e) => setConfidenceThreshold(parseFloat(e.target.value))}
                className="w-full"
              />
              <div className="flex justify-between text-xs text-gray-700">
                <span>0%</span>
                <span>50%</span>
                <span>100%</span>
              </div>
            </div>

            <div className="glass rounded p-3 border border-gray-200/30">
              <p className="text-sm text-gray-800">
                <span className="font-medium text-red-500">{lowConfidenceCount}</span>{' '}
                annotations will be removed (below {Math.round(confidenceThreshold * 100)}%)
              </p>
            </div>

            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowThresholdModal(false)}
                className="px-4 py-2 glass hover:glass-strong text-gray-900 rounded transition-colors border border-gray-300"
              >
                Cancel
              </button>
              <button
                onClick={handleRemoveLowConfidence}
                disabled={lowConfidenceCount === 0}
                className="px-4 py-2 bg-red-500 hover:bg-red-600 disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded transition-colors"
              >
                Remove {lowConfidenceCount}
              </button>
            </div>
          </div>
        </Modal>,
        document.body
      )}

      {/* Attributes Editor Popover */}
      <AttributesEditor
        attributes={editingAnnotation?.attributes ?? {}}
        onSave={handleSaveAttributes}
        isOpen={editingAttributesId !== null}
        onClose={handleCloseAttributesEditor}
        anchorEl={attributesAnchorEl}
      />
    </>
  );
}

export default AnnotationsSidebar;
