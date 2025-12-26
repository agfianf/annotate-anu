/**
 * Export History Panel - Lists past exports with status, download, and delete actions.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  Download,
  Trash2,
  RefreshCw,
  Loader2,
  AlertTriangle,
  CheckCircle,
  Clock,
  Tag,
  Box,
  Hexagon,
  FileJson,
  FileSpreadsheet,
  FolderOpen,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Export } from '@/types/export';
import {
  exportsApi,
  downloadExportArtifact,
  formatFileSize,
  getExportModeLabel,
  getOutputFormatLabel,
  getExportStatusColor,
  pollExportStatus,
} from '@/lib/export-client';

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
  const [exports, setExports] = useState<Export[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [pollingIds, setPollingIds] = useState<Set<string>>(new Set());

  const loadExports = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await exportsApi.list(projectId, { pageSize: 50 });
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
  }, [projectId]);

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
        return <Tag className="w-4 h-4" />;
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
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (isLoading) {
    return (
      <div className={`flex items-center justify-center py-12 ${className}`}>
        <Loader2 className="w-6 h-6 animate-spin text-emerald-600" />
        <span className="ml-2 text-gray-600">Loading exports...</span>
      </div>
    );
  }

  return (
    <div className={className}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-gray-900">Export History</h3>
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

      {/* Error */}
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Export List */}
      {exports.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <Download className="w-12 h-12 mx-auto mb-3 text-gray-300" />
          <p>No exports yet</p>
          <p className="text-sm">Create your first export using the Export Wizard</p>
        </div>
      ) : (
        <div className="space-y-3">
          {exports.map((exportData) => (
            <div
              key={exportData.id}
              className="p-4 border border-gray-200 rounded-lg bg-white hover:border-gray-300 transition-colors"
            >
              <div className="flex items-start justify-between">
                {/* Left side - Info */}
                <div className="flex-1 min-w-0">
                  {/* Export name as title */}
                  <div className="font-medium text-gray-900 mb-1">
                    {exportData.name || `${exportData.export_mode} Export`}
                  </div>

                  <div className="flex items-center space-x-2 mb-1">
                    {/* Mode badge */}
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-700">
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

                  {/* Message */}
                  {exportData.message && (
                    <p className="text-sm text-gray-600 truncate">{exportData.message}</p>
                  )}

                  {/* Error message */}
                  {exportData.status === 'failed' && exportData.error_message && (
                    <p className="text-sm text-red-600 truncate">{exportData.error_message}</p>
                  )}

                  {/* Metadata */}
                  <div className="flex items-center space-x-4 mt-2 text-xs text-gray-500">
                    <span>{formatDate(exportData.created_at)}</span>
                    {exportData.summary && (
                      <>
                        <span>
                          {exportData.summary.image_count.toLocaleString()} images
                        </span>
                        <span>
                          {exportData.summary.annotation_count.toLocaleString()} annotations
                        </span>
                      </>
                    )}
                    {exportData.artifact_size_bytes && (
                      <span>{formatFileSize(exportData.artifact_size_bytes)}</span>
                    )}
                  </div>
                </div>

                {/* Right side - Actions */}
                <div className="flex items-center space-x-2 ml-4">
                  {exportData.status === 'completed' && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDownload(exportData)}
                      disabled={downloadingId === exportData.id}
                    >
                      {downloadingId === exportData.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Download className="w-4 h-4" />
                      )}
                    </Button>
                  )}

                  {(exportData.status === 'pending' || exportData.status === 'processing') &&
                    pollingIds.has(exportData.id) && (
                      <span className="text-xs text-gray-500">Processing...</span>
                    )}

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDelete(exportData.id)}
                    disabled={deletingId === exportData.id}
                    className="text-red-600 hover:text-red-700 hover:border-red-300"
                  >
                    {deletingId === exportData.id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Trash2 className="w-4 h-4" />
                    )}
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
