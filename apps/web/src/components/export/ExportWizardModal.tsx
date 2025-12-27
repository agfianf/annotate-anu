/**
 * Export Wizard Modal - Multi-step wizard for configuring and creating exports.
 */

import { useState, useEffect, useCallback } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/button';
import {
  Tag,
  Box,
  Hexagon,
  ChevronRight,
  ChevronLeft,
  Loader2,
  AlertTriangle,
  CheckCircle,
  Download,
} from 'lucide-react';
import type {
  ExportMode,
  ExportOutputFormat,
  ExportWizardState,
  ExportPreview,
  FilterSnapshot,
  TagCategoryForExport,
  LabelForExport,
} from '@/types/export';
import { initialExportWizardState } from '@/types/export';
import type { Export } from '@/types/export';
import { exportsApi, getExportModeLabel, getOutputFormatLabel, pollExportStatus, downloadExportArtifact, formatFileSize } from '@/lib/export-client';
import { ClassificationMappingUI } from './ClassificationMappingUI';

interface ExportWizardModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: number | string;
  currentFilters?: FilterSnapshot;
  onExportCreated?: (exportId: string) => void;
}

const STEPS = ['Mode', 'Configure', 'Options', 'Preview', 'Complete'];

export function ExportWizardModal({
  isOpen,
  onClose,
  projectId,
  currentFilters,
  onExportCreated,
}: ExportWizardModalProps) {
  const [state, setState] = useState<ExportWizardState>({
    ...initialExportWizardState,
    step: 1,
  });
  const [categories, setCategories] = useState<TagCategoryForExport[]>([]);
  const [labels, setLabels] = useState<LabelForExport[]>([]);
  const [preview, setPreview] = useState<ExportPreview | null>(null);
  const [isLoadingOptions, setIsLoadingOptions] = useState(false);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Post-creation states
  const [createdExport, setCreatedExport] = useState<Export | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setState({
        ...initialExportWizardState,
        step: 1,
        filterSnapshot: currentFilters || {},
      });
      setPreview(null);
      setError(null);
      setCreatedExport(null);
      setIsPolling(false);
      setIsDownloading(false);
      loadClassificationOptions();
    }
  }, [isOpen, currentFilters]);

  const loadClassificationOptions = async () => {
    setIsLoadingOptions(true);
    try {
      const options = await exportsApi.getClassificationOptions(projectId);
      setCategories(options.categories);
      setLabels(options.labels);
    } catch (err) {
      console.error('Failed to load classification options:', err);
    } finally {
      setIsLoadingOptions(false);
    }
  };

  const loadPreview = useCallback(async () => {
    if (!state.exportMode) return;

    setIsLoadingPreview(true);
    setError(null);
    try {
      const previewData = await exportsApi.preview(projectId, {
        export_mode: state.exportMode,
        output_format: state.outputFormat,
        include_images: state.includeImages,
        filter_snapshot: state.filterSnapshot,
        classification_config: state.classificationConfig,
        mode_options: state.modeOptions,
        version_mode: state.versionMode,
        version_value: state.versionValue,
      });
      setPreview(previewData);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load preview';
      setError(message);
    } finally {
      setIsLoadingPreview(false);
    }
  }, [projectId, state]);

  // Load preview when reaching step 4
  useEffect(() => {
    if (state.step === 4) {
      loadPreview();
    }
  }, [state.step, loadPreview]);

  const handleCreate = async () => {
    if (!state.exportMode) return;

    setIsCreating(true);
    setError(null);
    try {
      const exportData = await exportsApi.create(projectId, {
        export_mode: state.exportMode,
        output_format: state.outputFormat,
        include_images: state.includeImages,
        filter_snapshot: state.filterSnapshot,
        classification_config: state.classificationConfig,
        mode_options: state.modeOptions,
        version_mode: state.versionMode,
        version_value: state.versionValue,
        message: state.message,
      });

      // Move to step 5 (completion) and start polling
      setState((s) => ({ ...s, step: 5 }));
      setCreatedExport(exportData);
      setIsCreating(false);
      setIsPolling(true);

      // Poll for completion
      try {
        const completedExport = await pollExportStatus(projectId, exportData.id, 1000, 300);
        setCreatedExport(completedExport);
        onExportCreated?.(exportData.id);
      } catch {
        // Polling timeout - user can still close or try to refresh
        const currentExport = await exportsApi.get(projectId, exportData.id);
        setCreatedExport(currentExport);
      } finally {
        setIsPolling(false);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to create export';
      setError(message);
      setIsCreating(false);
    }
  };

  const handleDownload = async () => {
    if (!createdExport || createdExport.status !== 'completed') return;

    setIsDownloading(true);
    try {
      const filename = `export_${createdExport.export_mode}_${createdExport.id.slice(0, 8)}.zip`;
      await downloadExportArtifact(projectId, createdExport.id, filename);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Download failed';
      setError(message);
    } finally {
      setIsDownloading(false);
    }
  };

  const canProceed = () => {
    switch (state.step) {
      case 1:
        return !!state.exportMode;
      case 2:
        if (state.exportMode === 'classification') {
          const config = state.classificationConfig;
          if (!config?.mode) return false;
          if (config.mode === 'categorized') return !!config.category_id;
          if (config.mode === 'free_form') {
            return Object.keys(config.class_mapping || {}).length > 0;
          }
        }
        return true;
      case 3:
        return true;
      case 4:
        return preview && preview.image_count > 0;
      default:
        return false;
    }
  };

  const handleNext = () => {
    if (state.step < 4) {
      setState((s) => ({ ...s, step: s.step + 1 }));
    }
  };

  const handleBack = () => {
    if (state.step > 1) {
      setState((s) => ({ ...s, step: s.step - 1 }));
    }
  };

  const setExportMode = (mode: ExportMode) => {
    setState((s) => ({
      ...s,
      exportMode: mode,
      outputFormat: mode === 'classification' ? 'manifest_csv' : 'coco_json',
      classificationConfig: mode === 'classification' ? { mode: 'categorized' } : undefined,
      modeOptions: {},
    }));
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Export Dataset" maxWidth="3xl">
      <div className="space-y-6">
        {/* Step Indicator */}
        <div className="flex items-center justify-center">
          {STEPS.map((step, index) => (
            <div key={step} className="flex items-center">
              <div
                className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-medium transition-colors ${
                  state.step > index + 1
                    ? 'bg-emerald-600 text-white'
                    : state.step === index + 1
                    ? 'bg-emerald-100 text-emerald-700 ring-2 ring-emerald-600'
                    : 'bg-gray-100 text-gray-400'
                }`}
              >
                {state.step > index + 1 ? <CheckCircle className="w-4 h-4" /> : index + 1}
              </div>
              <span
                className={`ml-1.5 text-xs ${
                  state.step === index + 1 ? 'text-gray-900 font-medium' : 'text-gray-400'
                }`}
              >
                {step}
              </span>
              {index < STEPS.length - 1 && (
                <ChevronRight className="w-4 h-4 mx-2 text-gray-300" />
              )}
            </div>
          ))}
        </div>

        {/* Content */}
        <div className="min-h-[420px]">
          {/* Step 1: Mode Selection */}
          {state.step === 1 && (
            <div className="space-y-3">
              <p className="text-sm text-gray-600">
                Select the type of annotations to export.
              </p>

              {[
                {
                  mode: 'classification' as ExportMode,
                  icon: Tag,
                  color: 'emerald',
                  title: 'Classification',
                  desc: 'Export image-level class labels as CSV manifest',
                },
                {
                  mode: 'detection' as ExportMode,
                  icon: Box,
                  color: 'blue',
                  title: 'Detection',
                  desc: 'Export bounding box annotations as COCO JSON',
                },
                {
                  mode: 'segmentation' as ExportMode,
                  icon: Hexagon,
                  color: 'purple',
                  title: 'Segmentation',
                  desc: 'Export polygon/mask annotations as COCO JSON',
                },
              ].map(({ mode, icon: Icon, color, title, desc }) => (
                <label
                  key={mode}
                  className={`flex items-center p-4 border rounded-lg cursor-pointer transition-all ${
                    state.exportMode === mode
                      ? 'border-emerald-500 bg-emerald-50 ring-1 ring-emerald-500'
                      : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <input
                    type="radio"
                    name="exportMode"
                    value={mode}
                    checked={state.exportMode === mode}
                    onChange={() => setExportMode(mode)}
                    className="sr-only"
                  />
                  <div
                    className={`flex items-center justify-center w-10 h-10 rounded-lg mr-4 ${
                      state.exportMode === mode
                        ? `bg-${color}-600 text-white`
                        : `bg-${color}-50 text-${color}-600`
                    }`}
                    style={{
                      backgroundColor: state.exportMode === mode
                        ? color === 'emerald' ? '#059669' : color === 'blue' ? '#2563eb' : '#9333ea'
                        : color === 'emerald' ? '#ecfdf5' : color === 'blue' ? '#eff6ff' : '#faf5ff',
                      color: state.exportMode === mode
                        ? 'white'
                        : color === 'emerald' ? '#059669' : color === 'blue' ? '#2563eb' : '#9333ea',
                    }}
                  >
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="flex-1">
                    <div className="font-medium text-gray-900">{title}</div>
                    <div className="text-sm text-gray-500">{desc}</div>
                  </div>
                </label>
              ))}
            </div>
          )}

          {/* Step 2: Mode Configuration */}
          {state.step === 2 && (
            <div className="space-y-4">
              {state.exportMode === 'classification' && (
                <>
                  <p className="text-sm text-gray-600">
                    Configure how tags map to classification labels.
                  </p>
                  {isLoadingOptions ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="w-5 h-5 animate-spin text-emerald-600" />
                    </div>
                  ) : (
                    <ClassificationMappingUI
                      categories={categories}
                      config={state.classificationConfig}
                      onChange={(config) =>
                        setState((s) => ({ ...s, classificationConfig: config }))
                      }
                    />
                  )}
                </>
              )}

              {state.exportMode === 'detection' && (
                <>
                  <p className="text-sm text-gray-600">Configure detection export options.</p>

                  <label className="flex items-start space-x-3 p-3 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50">
                    <input
                      type="checkbox"
                      checked={state.modeOptions.include_bbox_from_segmentation || false}
                      onChange={(e) =>
                        setState((s) => ({
                          ...s,
                          modeOptions: {
                            ...s.modeOptions,
                            include_bbox_from_segmentation: e.target.checked,
                          },
                        }))
                      }
                      className="w-4 h-4 text-emerald-600 rounded mt-0.5"
                    />
                    <div>
                      <div className="font-medium text-gray-900">
                        Include bounding boxes from segmentations
                      </div>
                      <div className="text-sm text-gray-500">
                        Convert segmentation polygons to bounding boxes
                      </div>
                    </div>
                  </label>

                  {labels.length > 0 && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Filter by labels (optional)
                      </label>
                      <div className="flex flex-wrap gap-2">
                        {labels.map((label) => {
                          const isSelected = state.modeOptions.label_filter?.includes(label.id);
                          return (
                            <button
                              key={label.id}
                              type="button"
                              onClick={() => {
                                const current = state.modeOptions.label_filter || [];
                                const updated = isSelected
                                  ? current.filter((id) => id !== label.id)
                                  : [...current, label.id];
                                setState((s) => ({
                                  ...s,
                                  modeOptions: {
                                    ...s.modeOptions,
                                    label_filter: updated.length > 0 ? updated : undefined,
                                  },
                                }));
                              }}
                              className={`inline-flex items-center px-3 py-1.5 text-sm rounded-full border transition-all ${
                                isSelected
                                  ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                                  : 'border-gray-200 text-gray-600 hover:border-gray-300'
                              }`}
                            >
                              <span
                                className="w-2 h-2 rounded-full mr-1.5"
                                style={{ backgroundColor: label.color }}
                              />
                              {label.name}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </>
              )}

              {state.exportMode === 'segmentation' && (
                <>
                  <p className="text-sm text-gray-600">Configure segmentation export options.</p>

                  <div className="space-y-3">
                    <label className="flex items-start space-x-3 p-3 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50">
                      <input
                        type="checkbox"
                        checked={state.modeOptions.include_bbox_alongside_segmentation || false}
                        onChange={(e) =>
                          setState((s) => ({
                            ...s,
                            modeOptions: {
                              ...s.modeOptions,
                              include_bbox_alongside_segmentation: e.target.checked,
                            },
                          }))
                        }
                        className="w-4 h-4 text-emerald-600 rounded mt-0.5"
                      />
                      <div>
                        <div className="font-medium text-gray-900">
                          Include bounding boxes alongside segmentations
                        </div>
                        <div className="text-sm text-gray-500">
                          Add bbox field to each segmentation annotation
                        </div>
                      </div>
                    </label>

                    <label className="flex items-start space-x-3 p-3 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50">
                      <input
                        type="checkbox"
                        checked={state.modeOptions.convert_bbox_to_segmentation || false}
                        onChange={(e) =>
                          setState((s) => ({
                            ...s,
                            modeOptions: {
                              ...s.modeOptions,
                              convert_bbox_to_segmentation: e.target.checked,
                            },
                          }))
                        }
                        className="w-4 h-4 text-emerald-600 rounded mt-0.5"
                      />
                      <div>
                        <div className="font-medium text-gray-900">
                          Convert bounding boxes to polygons
                        </div>
                        <div className="text-sm text-gray-500">
                          Include detection boxes as rectangular polygons
                        </div>
                      </div>
                    </label>
                  </div>

                  {labels.length > 0 && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Filter by labels (optional)
                      </label>
                      <div className="flex flex-wrap gap-2">
                        {labels.map((label) => {
                          const isSelected = state.modeOptions.label_filter?.includes(label.id);
                          return (
                            <button
                              key={label.id}
                              type="button"
                              onClick={() => {
                                const current = state.modeOptions.label_filter || [];
                                const updated = isSelected
                                  ? current.filter((id) => id !== label.id)
                                  : [...current, label.id];
                                setState((s) => ({
                                  ...s,
                                  modeOptions: {
                                    ...s.modeOptions,
                                    label_filter: updated.length > 0 ? updated : undefined,
                                  },
                                }));
                              }}
                              className={`inline-flex items-center px-3 py-1.5 text-sm rounded-full border transition-all ${
                                isSelected
                                  ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                                  : 'border-gray-200 text-gray-600 hover:border-gray-300'
                              }`}
                            >
                              <span
                                className="w-2 h-2 rounded-full mr-1.5"
                                style={{ backgroundColor: label.color }}
                              />
                              {label.name}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Step 3: Export Options */}
          {state.step === 3 && (
            <div className="space-y-5">
              {/* Export Description - More Prominent */}
              <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-lg">
                <label className="block text-sm font-medium text-emerald-800 mb-2">
                  Export Description
                </label>
                <textarea
                  value={state.message}
                  onChange={(e) => setState((s) => ({ ...s, message: e.target.value }))}
                  placeholder="Describe what this export contains and its purpose. For example: 'Training dataset for YOLOv8 object detection model - contains verified annotations only'"
                  rows={3}
                  maxLength={1000}
                  className="w-full px-3 py-2 border border-emerald-300 rounded-lg text-gray-900 placeholder-gray-400 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent resize-none"
                />
                <div className="flex justify-between items-center mt-1">
                  <span className="text-xs text-emerald-600">
                    A good description helps track export history
                  </span>
                  <span className="text-xs text-gray-400">
                    {state.message.length}/1000
                  </span>
                </div>
              </div>

              {/* Output Format */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Output Format
                </label>
                <select
                  value={state.outputFormat}
                  onChange={(e) =>
                    setState((s) => ({
                      ...s,
                      outputFormat: e.target.value as ExportOutputFormat,
                    }))
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                >
                  {state.exportMode === 'classification' ? (
                    <>
                      <option value="manifest_csv">CSV Manifest</option>
                      <option value="image_folder">Image Folder Structure</option>
                    </>
                  ) : (
                    <option value="coco_json">COCO JSON</option>
                  )}
                </select>
              </div>

              {/* Include Images */}
              <label className="flex items-start space-x-3 p-3 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50">
                <input
                  type="checkbox"
                  checked={state.includeImages}
                  onChange={(e) =>
                    setState((s) => ({ ...s, includeImages: e.target.checked }))
                  }
                  className="w-4 h-4 text-emerald-600 rounded mt-0.5"
                />
                <div>
                  <div className="font-medium text-gray-900">Include images in export</div>
                  <div className="text-sm text-gray-500">
                    Bundle image files with the annotation data (larger file size)
                  </div>
                </div>
              </label>
            </div>
          )}

          {/* Step 4: Preview & Export */}
          {state.step === 4 && (
            <div className="space-y-4">
              {isLoadingPreview ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-6 h-6 animate-spin text-emerald-600" />
                  <span className="ml-2 text-gray-600">Generating preview...</span>
                </div>
              ) : error ? (
                <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                  <div className="flex items-center text-red-700">
                    <AlertTriangle className="w-5 h-5 mr-2 flex-shrink-0" />
                    <span>{error}</span>
                  </div>
                </div>
              ) : preview ? (
                <>
                  {/* Prominent Export Summary Banner */}
                  <div className="bg-gradient-to-r from-emerald-50 to-emerald-100 border border-emerald-200 rounded-xl p-5 mb-4">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center justify-center w-12 h-12 bg-emerald-500 rounded-full">
                        <Download className="w-6 h-6 text-white" />
                      </div>
                      <div>
                        <div className="text-2xl font-bold text-emerald-800">
                          Exporting {preview.image_count.toLocaleString()} images
                        </div>
                        <div className="text-sm text-emerald-600">
                          {Object.keys(state.filterSnapshot || {}).length > 0
                            ? 'Based on your current filter selection'
                            : 'All images in project'}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Stats Grid */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="text-center p-4 bg-gray-50 rounded-lg">
                      <div className="text-2xl font-bold text-gray-900">
                        {preview.image_count.toLocaleString()}
                      </div>
                      <div className="text-sm text-gray-500">Images</div>
                    </div>
                    <div className="text-center p-4 bg-gray-50 rounded-lg">
                      <div className="text-2xl font-bold text-gray-900">
                        {Object.values(preview.annotation_counts).reduce((a, b) => a + b, 0).toLocaleString()}
                      </div>
                      <div className="text-sm text-gray-500">Annotations</div>
                    </div>
                  </div>

                  {/* Splits */}
                  {Object.values(preview.split_counts).some((c) => c > 0) && (
                    <div className="p-3 bg-gray-50 rounded-lg">
                      <div className="text-sm font-medium text-gray-700 mb-2">Splits</div>
                      <div className="flex flex-wrap gap-2">
                        {Object.entries(preview.split_counts)
                          .filter(([, count]) => count > 0)
                          .map(([split, count]) => (
                            <span key={split} className="px-2 py-1 bg-white border rounded text-sm">
                              {split}: {count}
                            </span>
                          ))}
                      </div>
                    </div>
                  )}

                  {/* Classes */}
                  {Object.keys(preview.class_counts).length > 0 && (
                    <div className="p-3 bg-gray-50 rounded-lg">
                      <div className="text-sm font-medium text-gray-700 mb-2">Classes</div>
                      <div className="flex flex-wrap gap-2 max-h-24 overflow-y-auto">
                        {Object.entries(preview.class_counts)
                          .sort(([, a], [, b]) => b - a)
                          .slice(0, 12)
                          .map(([cls, count]) => (
                            <span key={cls} className="px-2 py-1 bg-white border rounded text-sm">
                              {cls}: {count}
                            </span>
                          ))}
                        {Object.keys(preview.class_counts).length > 12 && (
                          <span className="px-2 py-1 text-sm text-gray-500">
                            +{Object.keys(preview.class_counts).length - 12} more
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Warnings */}
                  {preview.warnings.length > 0 && (
                    <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                      <div className="text-sm text-yellow-700">
                        {preview.warnings.map((w, i) => (
                          <div key={i} className="flex items-start">
                            <AlertTriangle className="w-4 h-4 mr-1.5 mt-0.5 flex-shrink-0" />
                            {w}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Config Summary */}
                  <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
                    <div className="text-sm text-emerald-700">
                      <strong>Mode:</strong> {getExportModeLabel(state.exportMode!)} &bull;{' '}
                      <strong>Format:</strong> {getOutputFormatLabel(state.outputFormat)} &bull;{' '}
                      <strong>Images:</strong> {state.includeImages ? 'Included' : 'Annotations only'}
                    </div>
                  </div>
                </>
              ) : null}
            </div>
          )}

          {/* Step 5: Export Progress/Completion */}
          {state.step === 5 && (
            <div className="space-y-6">
              {/* Status Header */}
              <div className="text-center py-4">
                {isPolling || createdExport?.status === 'pending' || createdExport?.status === 'processing' ? (
                  <>
                    <Loader2 className="w-12 h-12 mx-auto mb-4 text-emerald-600 animate-spin" />
                    <h3 className="text-lg font-semibold text-gray-900">
                      {createdExport?.status === 'processing' ? 'Processing Export...' : 'Creating Export...'}
                    </h3>
                    <p className="text-sm text-gray-500 mt-1">
                      This may take a few moments depending on the dataset size.
                    </p>
                  </>
                ) : createdExport?.status === 'completed' ? (
                  <>
                    <div className="w-12 h-12 mx-auto mb-4 bg-emerald-100 rounded-full flex items-center justify-center">
                      <CheckCircle className="w-7 h-7 text-emerald-600" />
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900">Export Complete!</h3>
                    <p className="text-sm text-gray-500 mt-1">
                      Your export is ready for download.
                    </p>
                  </>
                ) : createdExport?.status === 'failed' ? (
                  <>
                    <div className="w-12 h-12 mx-auto mb-4 bg-red-100 rounded-full flex items-center justify-center">
                      <AlertTriangle className="w-7 h-7 text-red-600" />
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900">Export Failed</h3>
                    <p className="text-sm text-red-600 mt-1">
                      {createdExport?.error_message || 'An error occurred during export.'}
                    </p>
                  </>
                ) : null}
              </div>

              {/* Export Summary (when completed) */}
              {createdExport?.status === 'completed' && createdExport.summary && (
                <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                  <h4 className="font-medium text-gray-900">Export Summary</h4>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-gray-500">Images:</span>{' '}
                      <span className="font-medium">{createdExport.summary.image_count.toLocaleString()}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">Annotations:</span>{' '}
                      <span className="font-medium">{createdExport.summary.annotation_count.toLocaleString()}</span>
                    </div>
                    {createdExport.artifact_size_bytes && (
                      <div>
                        <span className="text-gray-500">File Size:</span>{' '}
                        <span className="font-medium">{formatFileSize(createdExport.artifact_size_bytes)}</span>
                      </div>
                    )}
                    <div>
                      <span className="text-gray-500">Format:</span>{' '}
                      <span className="font-medium">{getOutputFormatLabel(createdExport.output_format)}</span>
                    </div>
                  </div>

                  {/* Class distribution */}
                  {Object.keys(createdExport.summary.class_counts).length > 0 && (
                    <div>
                      <span className="text-sm text-gray-500">Classes:</span>
                      <div className="flex flex-wrap gap-2 mt-1">
                        {Object.entries(createdExport.summary.class_counts)
                          .sort(([, a], [, b]) => b - a)
                          .slice(0, 8)
                          .map(([cls, count]) => (
                            <span key={cls} className="px-2 py-1 bg-white border rounded text-xs">
                              {cls}: {count}
                            </span>
                          ))}
                        {Object.keys(createdExport.summary.class_counts).length > 8 && (
                          <span className="px-2 py-1 text-xs text-gray-500">
                            +{Object.keys(createdExport.summary.class_counts).length - 8} more
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Error display */}
              {error && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                  <div className="flex items-center text-red-700">
                    <AlertTriangle className="w-5 h-5 mr-2 flex-shrink-0" />
                    <span>{error}</span>
                  </div>
                </div>
              )}

              {/* Download Button (when completed) */}
              {createdExport?.status === 'completed' && (
                <div className="flex justify-center">
                  <Button
                    onClick={handleDownload}
                    disabled={isDownloading}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-2"
                  >
                    {isDownloading ? (
                      <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    ) : (
                      <Download className="w-5 h-5 mr-2" />
                    )}
                    {isDownloading ? 'Downloading...' : 'Download Export'}
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-4 border-t border-gray-200">
          {state.step === 5 ? (
            <>
              {/* Empty div for spacing */}
              <div />
              <Button
                variant="outline"
                onClick={onClose}
                disabled={isPolling}
              >
                {isPolling ? 'Please wait...' : 'Done'}
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="outline"
                onClick={state.step === 1 ? onClose : handleBack}
                disabled={isCreating}
              >
                <ChevronLeft className="w-4 h-4 mr-1" />
                {state.step === 1 ? 'Cancel' : 'Back'}
              </Button>

              {state.step < 4 ? (
                <Button
                  onClick={handleNext}
                  disabled={!canProceed()}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  Next
                  <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              ) : (
                <Button
                  onClick={handleCreate}
                  disabled={isCreating || isLoadingPreview || !preview || preview.image_count === 0}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  {isCreating ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Download className="w-4 h-4 mr-2" />
                  )}
                  {isCreating ? 'Creating...' : 'Create Export'}
                </Button>
              )}
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}
