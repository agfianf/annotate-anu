/**
 * Saved Filters Panel - Manage saved filter presets for exports.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  Filter,
  Plus,
  Edit2,
  Trash2,
  Loader2,
  Save,
  X,
  Check,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { SavedFilter, FilterSnapshot } from '@/types/export';
import { savedFiltersApi } from '@/lib/export-client';

interface SavedFiltersPanelProps {
  projectId: number | string;
  currentFilters?: FilterSnapshot;
  onApplyFilter?: (filter: SavedFilter) => void;
  className?: string;
}

export function SavedFiltersPanel({
  projectId,
  currentFilters,
  onApplyFilter,
  className = '',
}: SavedFiltersPanelProps) {
  const [filters, setFilters] = useState<SavedFilter[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  // Form state
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');

  const loadFilters = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await savedFiltersApi.list(projectId);
      setFilters(data);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load saved filters';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    loadFilters();
  }, [loadFilters]);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    if (!currentFilters || Object.keys(currentFilters).length === 0) {
      setError('No active filters to save. Apply some filters first.');
      return;
    }

    setSavingId('new');
    try {
      const created = await savedFiltersApi.create(projectId, {
        name: newName.trim(),
        description: newDescription.trim() || undefined,
        filter_config: currentFilters,
      });
      setFilters((prev) => [...prev, created]);
      setNewName('');
      setNewDescription('');
      setIsCreating(false);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to create filter';
      setError(message);
    } finally {
      setSavingId(null);
    }
  };

  const handleUpdate = async (filterId: string) => {
    if (!editName.trim()) return;

    setSavingId(filterId);
    try {
      const updated = await savedFiltersApi.update(projectId, filterId, {
        name: editName.trim(),
        description: editDescription.trim() || undefined,
      });
      setFilters((prev) =>
        prev.map((f) => (f.id === filterId ? updated : f))
      );
      setEditingId(null);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to update filter';
      setError(message);
    } finally {
      setSavingId(null);
    }
  };

  const handleDelete = async (filterId: string) => {
    if (!confirm('Are you sure you want to delete this saved filter?')) return;

    setDeletingId(filterId);
    try {
      await savedFiltersApi.delete(projectId, filterId);
      setFilters((prev) => prev.filter((f) => f.id !== filterId));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to delete filter';
      setError(message);
    } finally {
      setDeletingId(null);
    }
  };

  const startEditing = (filter: SavedFilter) => {
    setEditingId(filter.id);
    setEditName(filter.name);
    setEditDescription(filter.description || '');
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditName('');
    setEditDescription('');
  };

  const getFilterSummary = (config: FilterSnapshot) => {
    const parts: string[] = [];
    if (config.tag_ids?.length) parts.push(`${config.tag_ids.length} tags`);
    if (config.excluded_tag_ids?.length) parts.push(`${config.excluded_tag_ids.length} excluded`);
    if (config.task_ids?.length) parts.push(`${config.task_ids.length} tasks`);
    if (config.job_id) parts.push('1 job');
    if (config.is_annotated !== undefined) parts.push(config.is_annotated ? 'annotated' : 'unannotated');
    if (config.image_uids?.length) parts.push(`${config.image_uids.length} images`);
    return parts.length > 0 ? parts.join(', ') : 'All images';
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  if (isLoading) {
    return (
      <div className={`flex items-center justify-center py-8 ${className}`}>
        <Loader2 className="w-5 h-5 animate-spin text-emerald-600" />
        <span className="ml-2 text-gray-600">Loading saved filters...</span>
      </div>
    );
  }

  return (
    <div className={className}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-gray-900">Saved Filters</h3>
        {!isCreating && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsCreating(true)}
          >
            <Plus className="w-4 h-4 mr-1" />
            Save Current
          </Button>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-500 hover:text-red-700">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Create Form */}
      {isCreating && (
        <div className="mb-4 p-4 border border-emerald-200 rounded-lg bg-emerald-50">
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Filter Name
              </label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g., Training Set Filter"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Description (optional)
              </label>
              <input
                type="text"
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                placeholder="Brief description of this filter"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            {currentFilters && Object.keys(currentFilters).length > 0 && (
              <div className="text-sm text-gray-600">
                Current filters: {getFilterSummary(currentFilters)}
              </div>
            )}
            <div className="flex justify-end space-x-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setIsCreating(false);
                  setNewName('');
                  setNewDescription('');
                }}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleCreate}
                disabled={!newName.trim() || savingId === 'new'}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {savingId === 'new' ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <Save className="w-4 h-4 mr-1" />
                    Save
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Filter List */}
      {filters.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          <Filter className="w-10 h-10 mx-auto mb-2 text-gray-300" />
          <p>No saved filters</p>
          <p className="text-sm">Apply filters and save them for quick access</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filters.map((filter) => (
            <div
              key={filter.id}
              className="p-3 border border-gray-200 rounded-lg bg-white hover:border-gray-300 transition-colors"
            >
              {editingId === filter.id ? (
                // Edit mode
                <div className="space-y-3">
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    autoFocus
                  />
                  <input
                    type="text"
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    placeholder="Description (optional)"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                  <div className="flex justify-end space-x-2">
                    <Button variant="outline" size="sm" onClick={cancelEditing}>
                      <X className="w-4 h-4" />
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => handleUpdate(filter.id)}
                      disabled={!editName.trim() || savingId === filter.id}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white"
                    >
                      {savingId === filter.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Check className="w-4 h-4" />
                      )}
                    </Button>
                  </div>
                </div>
              ) : (
                // View mode
                <div className="flex items-start justify-between">
                  <div
                    className="flex-1 cursor-pointer"
                    onClick={() => onApplyFilter?.(filter)}
                  >
                    <div className="font-medium text-gray-900">{filter.name}</div>
                    {filter.description && (
                      <div className="text-sm text-gray-500">{filter.description}</div>
                    )}
                    <div className="flex items-center space-x-3 mt-1 text-xs text-gray-400">
                      <span>{getFilterSummary(filter.filter_config)}</span>
                      <span>Created {formatDate(filter.created_at)}</span>
                    </div>
                  </div>
                  <div className="flex items-center space-x-1 ml-2">
                    <button
                      onClick={() => startEditing(filter)}
                      className="p-1.5 text-gray-400 hover:text-gray-600 rounded"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(filter.id)}
                      disabled={deletingId === filter.id}
                      className="p-1.5 text-gray-400 hover:text-red-500 rounded"
                    >
                      {deletingId === filter.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Trash2 className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
