/**
 * Export History Panel - Lists past exports with full metadata, filtering, and sorting.
 * Supports List View and Timeline View with compare mode for diffing exports.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Download,
  Trash2,
  RefreshCw,
  Loader2,
  AlertTriangle,
  CheckCircle,
  Clock,
  Tag as TagIcon,
  Box,
  Hexagon,
  FileJson,
  FileSpreadsheet,
  FolderOpen,
  Copy,
  ExternalLink,
  User,
  Filter,
  Palette,
  List,
  GitBranch,
  ArrowLeftRight,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Export, ExportMode, ExportSortBy, SortOrder } from '@/types/export';
import {
  exportsApi,
  downloadExportArtifact,
  formatFileSize,
  getExportModeLabel,
  getOutputFormatLabel,
  getExportStatusColor,
  pollExportStatus,
  getExportDownloadUrl,
} from '@/lib/export-client';
import { ExportTimelineView } from './ExportTimelineView';
import { ExportDiffModal } from './ExportDiffModal';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { SPRING_CONFIGS } from '@/lib/motion-config';

type ViewMode = 'list' | 'timeline';

interface ExportHistoryPanelProps {
  projectId: number | string;
  className?: string;
  onExportReady?: (exportData: Export) => void;
}

export function ExportHistoryPanel({
  projectId,
  className = '',
  onExportReady,
}: ExportHistoryPanelProps) {
  const prefersReducedMotion = useReducedMotion();
  const [exports, setExports] = useState<Export[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [pollingIds, setPollingIds] = useState<Set<string>>(new Set());
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Filter and sort state
  const [filterMode, setFilterMode] = useState<ExportMode | 'all'>('all');
  const [sortBy, setSortBy] = useState<ExportSortBy>('created_at');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

  // View mode state (persisted in localStorage)
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem('exportHistoryViewMode') as ViewMode) || 'list';
    }
    return 'list';
  });

  // Compare mode state
  const [compareMode, setCompareMode] = useState(false);
  const [selectedExports, setSelectedExports] = useState<Set<string>>(new Set());

  // Diff modal state
  const [diffModalOpen, setDiffModalOpen] = useState(false);
  const [diffExportA, setDiffExportA] = useState<Export | null>(null);
  const [diffExportB, setDiffExportB] = useState<Export | null>(null);

  // Persist view mode preference
  useEffect(() => {
    localStorage.setItem('exportHistoryViewMode', viewMode);
  }, [viewMode]);

  // Get selected exports as array for comparison
  const selectedExportsArray = useMemo(() => {
    return exports.filter((e) => selectedExports.has(e.id));
  }, [exports, selectedExports]);

  // Toggle export selection for compare mode
  const toggleExportSelection = (exportId: string) => {
    setSelectedExports((prev) => {
      const next = new Set(prev);
      if (next.has(exportId)) {
        next.delete(exportId);
      } else if (next.size < 2) {
        next.add(exportId);
      }
      return next;
    });
  };

  // Handle compare button click
  const handleCompare = () => {
    if (selectedExportsArray.length !== 2) return;

    // Sort by created_at to determine which is older
    const sorted = [...selectedExportsArray].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
    setDiffExportA(sorted[0]);
    setDiffExportB(sorted[1]);
    setDiffModalOpen(true);
  };

  // Handle diff click from timeline
  const handleDiffClick = (exportA: Export, exportB: Export) => {
    setDiffExportA(exportA);
    setDiffExportB(exportB);
    setDiffModalOpen(true);
  };

  // Exit compare mode
  const exitCompareMode = () => {
    setCompareMode(false);
    setSelectedExports(new Set());
  };

  const loadExports = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await exportsApi.list(projectId, {
        pageSize: 50,
        exportMode: filterMode === 'all' ? undefined : filterMode,
        sortBy,
        sortOrder,
      });
      setExports(response.exports);

      // Start polling for any pending/processing exports
      const pending = response.exports.filter(
        (e) => e.status === 'pending' || e.status === 'processing'
      );
      pending.forEach((e) => startPolling(e.id));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load exports';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [projectId, filterMode, sortBy, sortOrder]);

  useEffect(() => {
    loadExports();
  }, [loadExports]);

  const startPolling = async (exportId: string) => {
    if (pollingIds.has(exportId)) return;

    setPollingIds((prev) => new Set(prev).add(exportId));

    try {
      const result = await pollExportStatus(projectId, exportId);
      setExports((prev) =>
        prev.map((e) => (e.id === exportId ? result : e))
      );
      if (result.status === 'completed') {
        onExportReady?.(result);
      }
    } catch {
      // Polling timeout or error, just refresh the list
      loadExports();
    } finally {
      setPollingIds((prev) => {
        const next = new Set(prev);
        next.delete(exportId);
        return next;
      });
    }
  };

  const handleDownload = async (exportData: Export) => {
    if (exportData.status !== 'completed') return;

    setDownloadingId(exportData.id);
    try {
      const filename = `export_${exportData.export_mode}_${exportData.id.slice(0, 8)}.zip`;
      await downloadExportArtifact(projectId, exportData.id, filename);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Download failed';
      setError(message);
    } finally {
      setDownloadingId(null);
    }
  };

  const handleCopyLink = async (exportData: Export) => {
    const url = getExportDownloadUrl(projectId, exportData.id);
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(exportData.id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const handleViewFilter = (exportData: Export) => {
    // Encode filter_snapshot as base64 JSON and open Explore tab in new window
    const filterJson = JSON.stringify(exportData.filter_snapshot);
    const filterEncoded = btoa(filterJson);
    const url = `/dashboard/projects/${projectId}?tab=explore&filter=${filterEncoded}`;
    window.open(url, '_blank');
  };

  const handleDelete = async (exportId: string) => {
    if (!confirm('Are you sure you want to delete this export?')) return;

    setDeletingId(exportId);
    try {
      await exportsApi.delete(projectId, exportId);
      setExports((prev) => prev.filter((e) => e.id !== exportId));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Delete failed';
      setError(message);
    } finally {
      setDeletingId(null);
    }
  };

  const getModeIcon = (mode: string) => {
    switch (mode) {
      case 'classification':
        return <TagIcon className="w-4 h-4" />;
      case 'detection':
        return <Box className="w-4 h-4" />;
      case 'segmentation':
        return <Hexagon className="w-4 h-4" />;
      default:
        return null;
    }
  };

  const getFormatIcon = (format: string) => {
    switch (format) {
      case 'coco_json':
        return <FileJson className="w-4 h-4" />;
      case 'manifest_csv':
        return <FileSpreadsheet className="w-4 h-4" />;
      case 'image_folder':
        return <FolderOpen className="w-4 h-4" />;
      default:
        return null;
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending':
        return <Clock className="w-4 h-4 text-yellow-600" />;
      case 'processing':
        return <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />;
      case 'completed':
        return <CheckCircle className="w-4 h-4 text-green-600" />;
      case 'failed':
        return <AlertTriangle className="w-4 h-4 text-red-600" />;
      default:
        return null;
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getSplitDisplay = (splitCounts: Record<string, number> | undefined) => {
    if (!splitCounts) return null;
    const parts: { label: string; count: number; color: string }[] = [];
    if (splitCounts.train) parts.push({ label: 'Train', count: splitCounts.train, color: 'text-green-600' });
    if (splitCounts.val) parts.push({ label: 'Val', count: splitCounts.val, color: 'text-yellow-600' });
    if (splitCounts.test) parts.push({ label: 'Test', count: splitCounts.test, color: 'text-red-600' });
    if (splitCounts.none) parts.push({ label: 'None', count: splitCounts.none, color: 'text-gray-500' });
    return parts;
  };

  if (isLoading && exports.length === 0) {
    return (
      <div className={`flex items-center justify-center py-12 ${className}`}>
        <Loader2 className="w-6 h-6 animate-spin text-emerald-600" />
        <span className="ml-2 text-gray-600">Loading exports...</span>
      </div>
    );
  }

  return (
    <div className={className}>
      {/* Header with Controls */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h3 className="font-semibold text-gray-900">Export History</h3>

          {/* View Mode Toggle */}
          <div className="flex items-center bg-gray-100 rounded-lg p-0.5">
            <button
              onClick={() => setViewMode('list')}
              className={`
                flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors
                ${viewMode === 'list'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
                }
              `}
              title="List View"
            >
              <List className="w-4 h-4" />
              <span className="hidden sm:inline">List</span>
            </button>
            <button
              onClick={() => setViewMode('timeline')}
              className={`
                flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors
                ${viewMode === 'timeline'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
                }
              `}
              title="Timeline View"
            >
              <GitBranch className="w-4 h-4" />
              <span className="hidden sm:inline">Timeline</span>
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Compare Mode Toggle (List view only) */}
          {viewMode === 'list' && exports.length >= 2 && (
            <Button
              variant={compareMode ? 'default' : 'outline'}
              size="sm"
              onClick={() => compareMode ? exitCompareMode() : setCompareMode(true)}
              className={compareMode ? 'bg-emerald-600 hover:bg-emerald-700' : ''}
            >
              <ArrowLeftRight className="w-4 h-4 mr-1" />
              {compareMode ? 'Exit Compare' : 'Compare'}
            </Button>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={loadExports}
            disabled={isLoading}
          >
            <RefreshCw className={`w-4 h-4 mr-1 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Compare Mode Selection Bar */}
      <AnimatePresence>
        {compareMode && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={prefersReducedMotion ? { duration: 0.01 } : SPRING_CONFIGS.gentle}
            className="mb-4"
          >
            <div className="flex items-center justify-between p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
              <div className="flex items-center gap-2 text-sm text-emerald-700">
                <ArrowLeftRight className="w-4 h-4" />
                <span>
                  Select 2 exports to compare
                  {selectedExports.size > 0 && (
                    <span className="ml-1 font-medium">
                      ({selectedExports.size}/2 selected)
                    </span>
                  )}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {selectedExports.size === 2 && (
                  <Button
                    size="sm"
                    onClick={handleCompare}
                    className="bg-emerald-600 hover:bg-emerald-700"
                  >
                    Compare Selected
                  </Button>
                )}
                <button
                  onClick={exitCompareMode}
                  className="p-1 text-emerald-600 hover:text-emerald-800 hover:bg-emerald-100 rounded"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Filter and Sort Controls */}
      <div className="flex items-center gap-3 mb-4">
        {/* Mode Filter */}
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-gray-400" />
          <select
            value={filterMode}
            onChange={(e) => setFilterMode(e.target.value as ExportMode | 'all')}
            className="text-sm border border-gray-300 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            <option value="all">All Modes</option>
            <option value="classification">Classification</option>
            <option value="detection">Detection</option>
            <option value="segmentation">Segmentation</option>
          </select>
        </div>

        {/* Sort (only in list view) */}
        {viewMode === 'list' && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500">Sort:</span>
            <select
              value={`${sortBy}-${sortOrder}`}
              onChange={(e) => {
                const [newSortBy, newSortOrder] = e.target.value.split('-') as [ExportSortBy, SortOrder];
                setSortBy(newSortBy);
                setSortOrder(newSortOrder);
              }}
              className="text-sm border border-gray-300 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="created_at-desc">Newest First</option>
              <option value="created_at-asc">Oldest First</option>
              <option value="version_number-desc">Version (High to Low)</option>
              <option value="version_number-asc">Version (Low to High)</option>
            </select>
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-500 hover:text-red-700">
            &times;
          </button>
        </div>
      )}

      {/* Export List / Timeline View */}
      {exports.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <Download className="w-12 h-12 mx-auto mb-3 text-gray-300" />
          <p>No exports yet</p>
          <p className="text-sm">Create your first export using the Export Wizard</p>
        </div>
      ) : viewMode === 'timeline' ? (
        /* Timeline View */
        <ExportTimelineView
          exports={exports}
          filterMode={filterMode}
          onDiffClick={handleDiffClick}
          onDownload={handleDownload}
          isLoading={isLoading}
        />
      ) : (
        /* List View */
        <div className="space-y-4">
          {exports.map((exportData) => {
            const splits = getSplitDisplay(exportData.summary?.split_counts);
            const isSelected = selectedExports.has(exportData.id);

            return (
              <motion.div
                key={exportData.id}
                layout={!prefersReducedMotion}
                className={`
                  p-4 border rounded-lg bg-white transition-colors
                  ${isSelected
                    ? 'border-emerald-400 ring-2 ring-emerald-100'
                    : 'border-gray-200 hover:border-gray-300'
                  }
                `}
              >
                {/* Header Row: Checkbox + Version Badge + Mode, Actions */}
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    {/* Compare Mode Checkbox */}
                    {compareMode && (
                      <button
                        onClick={() => toggleExportSelection(exportData.id)}
                        className={`
                          flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors
                          ${isSelected
                            ? 'bg-emerald-600 border-emerald-600 text-white'
                            : 'border-gray-300 hover:border-emerald-400'
                          }
                          ${selectedExports.size >= 2 && !isSelected
                            ? 'opacity-50 cursor-not-allowed'
                            : ''
                          }
                        `}
                        disabled={selectedExports.size >= 2 && !isSelected}
                        aria-label={isSelected ? 'Deselect export' : 'Select export for comparison'}
                      >
                        {isSelected && <CheckCircle className="w-3.5 h-3.5" />}
                      </button>
                    )}
                    {/* Version Badge (like a tag) */}
                    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-sm font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
                      v{exportData.version_number || 1}
                    </span>
                    {/* Mode badge */}
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
                      {getModeIcon(exportData.export_mode)}
                      <span className="ml-1">{getExportModeLabel(exportData.export_mode)}</span>
                    </span>
                    {/* Format badge */}
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-700">
                      {getFormatIcon(exportData.output_format)}
                      <span className="ml-1">{getOutputFormatLabel(exportData.output_format)}</span>
                    </span>
                    {/* Status badge */}
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${getExportStatusColor(
                        exportData.status
                      )}`}
                    >
                      {getStatusIcon(exportData.status)}
                      <span className="ml-1 capitalize">{exportData.status}</span>
                    </span>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1">
                    {exportData.status === 'completed' && (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleCopyLink(exportData)}
                          title="Copy download link"
                          className="text-gray-600"
                        >
                          {copiedId === exportData.id ? (
                            <CheckCircle className="w-4 h-4 text-green-600" />
                          ) : (
                            <Copy className="w-4 h-4" />
                          )}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDownload(exportData)}
                          disabled={downloadingId === exportData.id}
                          title="Download"
                        >
                          {downloadingId === exportData.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Download className="w-4 h-4" />
                          )}
                        </Button>
                      </>
                    )}

                    {(exportData.status === 'pending' || exportData.status === 'processing') &&
                      pollingIds.has(exportData.id) && (
                        <span className="text-xs text-blue-600 px-2">Processing...</span>
                      )}

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDelete(exportData.id)}
                      disabled={deletingId === exportData.id}
                      className="text-red-600 hover:text-red-700 hover:border-red-300"
                      title="Delete"
                    >
                      {deletingId === exportData.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Trash2 className="w-4 h-4" />
                      )}
                    </Button>
                  </div>
                </div>

                {/* Description */}
                {exportData.message && (
                  <p className="text-sm text-gray-700 mb-2 line-clamp-2">{exportData.message}</p>
                )}

                {/* Error message */}
                {exportData.status === 'failed' && exportData.error_message && (
                  <p className="text-sm text-red-600 mb-2">{exportData.error_message}</p>
                )}

                {/* Metadata Row: User + Date */}
                <div className="flex items-center gap-4 text-sm text-gray-500 mb-2">
                  {/* User who created */}
                  {exportData.created_by_user ? (
                    <span className="flex items-center gap-1">
                      <User className="w-3.5 h-3.5" />
                      {exportData.created_by_user.full_name || exportData.created_by_user.email}
                    </span>
                  ) : exportData.created_by ? (
                    <span className="flex items-center gap-1 text-gray-400">
                      <User className="w-3.5 h-3.5" />
                      Unknown user
                    </span>
                  ) : null}

                  {/* Date */}
                  <span>{formatDate(exportData.created_at)}</span>

                  {/* Stats */}
                  {exportData.summary && (
                    <>
                      <span>{exportData.summary.image_count.toLocaleString()} images</span>
                      <span>{exportData.summary.annotation_count.toLocaleString()} annotations</span>
                    </>
                  )}
                  {exportData.artifact_size_bytes && (
                    <span>{formatFileSize(exportData.artifact_size_bytes)}</span>
                  )}
                </div>

                {/* Splits Row */}
                {splits && splits.length > 0 && (
                  <div className="flex items-center gap-3 text-sm mb-2">
                    <span className="text-gray-500">Splits:</span>
                    <div className="flex items-center gap-2">
                      {splits.map(({ label, count, color }) => (
                        <span key={label} className={`${color} font-medium`}>
                          {label}: {count.toLocaleString()}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Filter Row - Show tag names from resolved_metadata */}
                <div className="flex items-start gap-2 text-sm mb-2">
                  <TagIcon className="w-3.5 h-3.5 text-gray-400 mt-0.5 flex-shrink-0" />
                  <span className="text-gray-500 flex-shrink-0">Tags:</span>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {/* Included tags from resolved_metadata */}
                    {exportData.resolved_metadata?.tags?.length ? (
                      exportData.resolved_metadata.tags.map((tag) => (
                        <span
                          key={tag.id}
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium bg-gray-100"
                          style={{
                            backgroundColor: `${tag.color}20`,
                            color: tag.color,
                            border: `1px solid ${tag.color}40`
                          }}
                        >
                          <span
                            className="w-2 h-2 rounded-full"
                            style={{ backgroundColor: tag.color }}
                          />
                          {tag.category_name ? `${tag.category_name}:${tag.name}` : tag.name}
                        </span>
                      ))
                    ) : (
                      <span className="text-gray-400">No tags</span>
                    )}
                    {/* Excluded tags from resolved_metadata */}
                    {exportData.resolved_metadata?.excluded_tags?.length ? (
                      <>
                        <span className="text-gray-400 mx-1">|</span>
                        <span className="text-red-500 text-xs">Excluded:</span>
                        {exportData.resolved_metadata.excluded_tags.map((tag) => (
                          <span
                            key={tag.id}
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium line-through opacity-60"
                            style={{
                              backgroundColor: `${tag.color}20`,
                              color: tag.color,
                              border: `1px solid ${tag.color}40`
                            }}
                          >
                            <span
                              className="w-2 h-2 rounded-full"
                              style={{ backgroundColor: tag.color }}
                            />
                            {tag.category_name ? `${tag.category_name}:${tag.name}` : tag.name}
                          </span>
                        ))}
                      </>
                    ) : null}
                    {/* Match mode indicator */}
                    {exportData.resolved_metadata?.tags?.length && exportData.resolved_metadata.tags.length > 1 && (
                      <span className="text-gray-400 text-xs">
                        ({exportData.resolved_metadata.filter_summary?.include_match_mode || 'OR'})
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => handleViewFilter(exportData)}
                    className="inline-flex items-center gap-1 text-emerald-600 hover:text-emerald-700 hover:underline ml-auto flex-shrink-0"
                  >
                    View
                    <ExternalLink className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Labels/Configuration Row - Show label names from resolved_metadata */}
                {(exportData.resolved_metadata?.labels?.length ||
                  exportData.classification_config) && (
                  <div className="flex items-start gap-2 text-sm">
                    <Palette className="w-3.5 h-3.5 text-gray-400 mt-0.5 flex-shrink-0" />
                    <span className="text-gray-500 flex-shrink-0">Labels:</span>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {exportData.resolved_metadata?.labels?.length ? (
                        exportData.resolved_metadata.labels.map((label) => (
                          <span
                            key={label.id}
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium"
                            style={{
                              backgroundColor: `${label.color}20`,
                              color: label.color,
                              border: `1px solid ${label.color}40`
                            }}
                          >
                            <span
                              className="w-2 h-2 rounded-full"
                              style={{ backgroundColor: label.color }}
                            />
                            {label.name}
                          </span>
                        ))
                      ) : exportData.classification_config?.mode === 'categorized' ? (
                        <span className="text-gray-700">Categorized mapping</span>
                      ) : exportData.classification_config?.mode === 'free_form' ? (
                        <span className="text-gray-700">
                          Free-form mapping ({Object.keys(exportData.classification_config.class_mapping || {}).length} classes)
                        </span>
                      ) : (
                        <span className="text-gray-400">All labels</span>
                      )}
                    </div>
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Diff Modal */}
      <ExportDiffModal
        isOpen={diffModalOpen}
        onClose={() => {
          setDiffModalOpen(false);
          setDiffExportA(null);
          setDiffExportB(null);
        }}
        exportA={diffExportA}
        exportB={diffExportB}
      />
    </div>
  );
}
