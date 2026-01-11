/**
 * Modal for batch image classification in Explore gallery
 * Supports uncategorized and categorized label mapping modes
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertCircle, ChevronDown, ChevronUp, FolderPlus, Loader2, Sparkles, Tag, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { classificationApi, type BatchClassifyProgress } from '../../lib/classification-client'
import { tagCategoriesApi, type TagCategory } from '../../lib/data-management-client'
import type { AvailableModel } from '../../types/byom'

interface BatchClassifyModalProps {
  isOpen: boolean
  onClose: () => void
  projectId: number
  selectedImageIds: string[]
  availableModels: AvailableModel[]
}

type JobState = 'idle' | 'starting' | 'running' | 'completed' | 'failed'

// Mapping modes
type MappingMode = 'uncategorized' | 'categorized'
type CategoryMode = 'existing' | 'create'

// Per-class config for uncategorized mode
interface UncategorizedClassConfig {
  action: 'create' | 'existing'
  tagName?: string
  existingTagId?: string
}

export function BatchClassifyModal({
  isOpen,
  onClose,
  projectId,
  selectedImageIds,
  availableModels,
}: BatchClassifyModalProps) {
  const queryClient = useQueryClient()

  // Core state
  const [selectedModelId, setSelectedModelId] = useState<string>('')
  const [createTags, setCreateTags] = useState(true)
  const [jobState, setJobState] = useState<JobState>('idle')
  const [jobId, setJobId] = useState<string | null>(null)
  const [progress, setProgress] = useState<BatchClassifyProgress | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showMapping, setShowMapping] = useState(false)

  // Hierarchical mapping state
  const [mappingMode, setMappingMode] = useState<MappingMode>('uncategorized')
  const [categoryMode, setCategoryMode] = useState<CategoryMode>('create')
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('')
  const [newCategoryName, setNewCategoryName] = useState<string>('AI Predictions')
  const [newCategoryColor, setNewCategoryColor] = useState<string>('#8B5CF6')
  const [uncategorizedConfig, setUncategorizedConfig] = useState<Record<string, UncategorizedClassConfig>>({})
  const [existingCategoryTagMapping, setExistingCategoryTagMapping] = useState<Record<string, string>>({})
  const [newCategoryTagNames, setNewCategoryTagNames] = useState<Record<string, string>>({})

  // Fetch project tags for mapping (with nested tags included)
  const { data: categoriesData } = useQuery({
    queryKey: ['tagCategories', projectId, { includeTags: true }],
    queryFn: () => tagCategoriesApi.list(projectId, { include_tags: true }),
    enabled: isOpen && !!projectId,
  })

  // Get tags for uncategorized category only
  const uncategorizedTags = useMemo(() => {
    if (!categoriesData) return []
    const uncategorized = categoriesData.find(c => c.name === 'uncategorized')
    return uncategorized?.tags || []
  }, [categoriesData])

  // Get tags for selected category
  const selectedCategoryTags = useMemo(() => {
    if (!selectedCategoryId || !categoriesData) return []
    const category = categoriesData.find(c => c.id === selectedCategoryId)
    return category?.tags || []
  }, [selectedCategoryId, categoriesData])

  // Extract categories for dropdown (excluding uncategorized for "create in category" mode)
  const allCategories = useMemo(() => {
    if (!categoriesData) return []
    return categoriesData as TagCategory[]
  }, [categoriesData])

  const selectableCategories = useMemo(() => {
    return allCategories.filter(c => c.name !== 'uncategorized')
  }, [allCategories])

  // Filter to only classification-capable models
  const classificationModels = useMemo(() => {
    return availableModels.filter(
      (m) => m.capabilities?.supports_classification === true
    )
  }, [availableModels])

  // Get selected model's classes
  const selectedModel = useMemo(() => {
    return classificationModels.find((m) => m.id === selectedModelId)
  }, [classificationModels, selectedModelId])

  const modelClasses = useMemo(() => {
    return selectedModel?.capabilities?.classes || []
  }, [selectedModel])

  // Auto-select first classification model
  useEffect(() => {
    if (classificationModels.length > 0 && !selectedModelId) {
      setSelectedModelId(classificationModels[0].id)
    }
  }, [classificationModels, selectedModelId])

  // Reset mapping when model changes
  useEffect(() => {
    setUncategorizedConfig({})
    setExistingCategoryTagMapping({})
    setNewCategoryTagNames({})
  }, [selectedModelId])

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setJobState('idle')
      setJobId(null)
      setProgress(null)
      setError(null)
      setShowMapping(false)
      setMappingMode('uncategorized')
      setCategoryMode('create')
      setSelectedCategoryId('')
      setNewCategoryName('AI Predictions')
      setNewCategoryColor('#8B5CF6')
      setUncategorizedConfig({})
      setExistingCategoryTagMapping({})
      setNewCategoryTagNames({})
    }
  }, [isOpen])

  // Poll for progress when job is running
  useEffect(() => {
    if (jobState !== 'running' || !jobId) return

    const pollInterval = setInterval(async () => {
      try {
        const progressData = await classificationApi.getProgress(jobId)
        setProgress(progressData)

        if (progressData.status === 'completed') {
          setJobState('completed')
          toast.success(
            `Classified ${progressData.processed} images successfully!`
          )
          queryClient.invalidateQueries({ queryKey: ['tags'] })
          queryClient.invalidateQueries({ queryKey: ['tagCategories'] })
          queryClient.invalidateQueries({ queryKey: ['images'] })
          queryClient.invalidateQueries({ queryKey: ['explore'] })
        } else if (progressData.status === 'failed') {
          setJobState('failed')
          setError(progressData.error || 'Classification job failed')
        }
      } catch (err) {
        console.error('Failed to poll progress:', err)
      }
    }, 2000)

    return () => clearInterval(pollInterval)
  }, [jobState, jobId, queryClient])

  // Uncategorized config helpers
  const getUncategorizedConfig = useCallback((className: string): UncategorizedClassConfig => {
    return uncategorizedConfig[className] || { action: 'create', tagName: className }
  }, [uncategorizedConfig])

  const updateUncategorizedConfig = useCallback((className: string, config: Partial<UncategorizedClassConfig>) => {
    setUncategorizedConfig(prev => {
      const existing = prev[className] || { action: 'create', tagName: className }
      return { ...prev, [className]: { ...existing, ...config } }
    })
  }, [])

  // Build final config for API
  const buildLabelMappingConfig = useCallback(() => {
    if (mappingMode === 'uncategorized') {
      const uncatConfig: Record<string, UncategorizedClassConfig> = {}
      for (const className of modelClasses) {
        uncatConfig[className] = getUncategorizedConfig(className)
      }
      return {
        mode: 'uncategorized' as const,
        uncategorized: uncatConfig,
      }
    } else {
      // Categorized mode
      if (categoryMode === 'existing') {
        return {
          mode: 'categorized' as const,
          categoryMode: 'existing' as const,
          existingCategoryId: selectedCategoryId,
          existingCategoryTagMapping,
        }
      } else {
        // Create new category
        const tagNames: Record<string, string> = {}
        for (const className of modelClasses) {
          tagNames[className] = newCategoryTagNames[className] || className
        }
        return {
          mode: 'categorized' as const,
          categoryMode: 'create' as const,
          newCategory: {
            name: newCategoryName,
            color: newCategoryColor,
            tagNames,
          },
        }
      }
    }
  }, [
    mappingMode, categoryMode, modelClasses, getUncategorizedConfig,
    selectedCategoryId, existingCategoryTagMapping,
    newCategoryName, newCategoryColor, newCategoryTagNames
  ])

  const handleStartClassification = useCallback(async () => {
    if (!selectedModelId || selectedImageIds.length === 0) return

    setJobState('starting')
    setError(null)

    try {
      const labelMappingConfig = createTags ? buildLabelMappingConfig() : undefined

      const result = await classificationApi.startBatchJob({
        projectId,
        modelId: selectedModelId,
        imageIds: selectedImageIds,
        createTags,
        labelMappingConfig,
      })

      setJobId(result.job_id)
      setJobState('running')
      setProgress({
        job_id: result.job_id,
        status: 'running',
        processed: 0,
        failed: 0,
        total: result.total,
      })
    } catch (err) {
      setJobState('failed')
      setError(err instanceof Error ? err.message : 'Failed to start classification')
    }
  }, [selectedModelId, selectedImageIds, projectId, createTags, buildLabelMappingConfig])

  const handleClose = useCallback(() => {
    if (jobState === 'running') {
      if (!confirm('Classification is in progress. Close anyway?')) {
        return
      }
    }
    onClose()
  }, [jobState, onClose])

  // Count configured items (must be before early return)
  const configuredCount = useMemo(() => {
    if (mappingMode === 'uncategorized') {
      return Object.keys(uncategorizedConfig).length
    } else if (categoryMode === 'existing') {
      return Object.keys(existingCategoryTagMapping).length
    } else {
      return Object.keys(newCategoryTagNames).length
    }
  }, [mappingMode, categoryMode, uncategorizedConfig, existingCategoryTagMapping, newCategoryTagNames])

  if (!isOpen) return null

  const progressPercent = progress
    ? Math.round((progress.processed / Math.max(progress.total, 1)) * 100)
    : 0

  const isDisabled = jobState !== 'idle'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-xl mx-4 overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-violet-50 to-purple-50 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-violet-100 rounded-lg">
              <Sparkles className="w-5 h-5 text-violet-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">
                AI Classification
              </h2>
              <p className="text-sm text-gray-500">
                Classify {selectedImageIds.length} selected image{selectedImageIds.length !== 1 ? 's' : ''}
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-5 space-y-5 overflow-y-auto flex-1">
          {/* No classification models warning */}
          {classificationModels.length === 0 && (
            <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-lg">
              <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-amber-800">
                  No classification models available
                </p>
                <p className="text-xs text-amber-700 mt-1">
                  Register a classification model in Model Configuration to use this feature.
                </p>
              </div>
            </div>
          )}

          {/* Model selector */}
          {classificationModels.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Classification Model
              </label>
              <select
                value={selectedModelId}
                onChange={(e) => setSelectedModelId(e.target.value)}
                disabled={isDisabled}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm
                         focus:ring-2 focus:ring-violet-500 focus:border-violet-500
                         disabled:bg-gray-100 disabled:cursor-not-allowed"
              >
                {classificationModels.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.name}
                    {model.capabilities?.classes?.length
                      ? ` (${model.capabilities.classes.length} classes)`
                      : ''}
                  </option>
                ))}
              </select>
              {selectedModel?.capabilities?.classes && (
                <p className="mt-2 text-xs text-gray-500">
                  Classes: {selectedModel.capabilities.classes.slice(0, 5).join(', ')}
                  {selectedModel.capabilities.classes.length > 5
                    ? ` +${selectedModel.capabilities.classes.length - 5} more`
                    : ''}
                </p>
              )}
            </div>
          )}

          {/* Create tags option */}
          {classificationModels.length > 0 && (
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="createTags"
                checked={createTags}
                onChange={(e) => setCreateTags(e.target.checked)}
                disabled={isDisabled}
                className="w-4 h-4 text-violet-600 border-gray-300 rounded
                         focus:ring-violet-500 disabled:cursor-not-allowed"
              />
              <label htmlFor="createTags" className="text-sm text-gray-700 select-none">
                Create tags from predictions
              </label>
            </div>
          )}

          {/* Label Mapping Section */}
          {classificationModels.length > 0 && createTags && modelClasses.length > 0 && (
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <button
                type="button"
                onClick={() => setShowMapping(!showMapping)}
                disabled={isDisabled}
                className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100
                         transition-colors text-left disabled:cursor-not-allowed"
              >
                <div>
                  <span className="text-sm font-medium text-gray-700">
                    Label Mapping
                  </span>
                  {configuredCount > 0 && (
                    <span className="ml-2 text-xs text-violet-600">
                      ({configuredCount} configured)
                    </span>
                  )}
                  <p className="text-xs text-gray-500 mt-0.5">
                    Configure how predictions map to tags
                  </p>
                </div>
                {showMapping ? (
                  <ChevronUp className="w-4 h-4 text-gray-500" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-gray-500" />
                )}
              </button>

              {showMapping && (
                <div className="border-t border-gray-200">
                  {/* Mode selector */}
                  <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
                    <div className="flex gap-4">
                      <label className="flex items-center gap-2 text-sm cursor-pointer">
                        <input
                          type="radio"
                          name="mappingMode"
                          checked={mappingMode === 'uncategorized'}
                          onChange={() => setMappingMode('uncategorized')}
                          disabled={isDisabled}
                          className="text-violet-600 focus:ring-violet-500"
                        />
                        <Tag className="w-4 h-4 text-gray-500" />
                        <span className="text-gray-700">Uncategorized</span>
                      </label>
                      <label className="flex items-center gap-2 text-sm cursor-pointer">
                        <input
                          type="radio"
                          name="mappingMode"
                          checked={mappingMode === 'categorized'}
                          onChange={() => setMappingMode('categorized')}
                          disabled={isDisabled}
                          className="text-violet-600 focus:ring-violet-500"
                        />
                        <FolderPlus className="w-4 h-4 text-gray-500" />
                        <span className="text-gray-700">Categorized</span>
                      </label>
                    </div>
                    <p className="text-xs text-gray-500 mt-2">
                      {mappingMode === 'uncategorized'
                        ? 'Tags will be created/mapped in the Uncategorized section'
                        : 'Organize predictions under a specific category'}
                    </p>
                  </div>

                  {/* Uncategorized Mode Content */}
                  {mappingMode === 'uncategorized' && (
                    <div className="px-4 py-3 space-y-3 max-h-48 overflow-y-auto">
                      {modelClasses.map((className) => {
                        const config = getUncategorizedConfig(className)
                        return (
                          <div key={className} className="flex items-center gap-2">
                            <span className="text-xs text-gray-600 w-14 truncate flex-shrink-0" title={className}>
                              {className}
                            </span>
                            <span className="text-gray-400 text-xs">→</span>
                            <select
                              value={config.action}
                              onChange={(e) => {
                                const action = e.target.value as 'create' | 'existing'
                                if (action === 'create') {
                                  updateUncategorizedConfig(className, {
                                    action: 'create',
                                    tagName: className,
                                    existingTagId: undefined
                                  })
                                } else {
                                  updateUncategorizedConfig(className, {
                                    action: 'existing',
                                    tagName: undefined
                                  })
                                }
                              }}
                              disabled={isDisabled}
                              className="w-20 px-1.5 py-1 border border-gray-200 rounded text-xs
                                       focus:ring-1 focus:ring-violet-500 focus:border-violet-500
                                       disabled:bg-gray-100 disabled:cursor-not-allowed"
                            >
                              <option value="create">Create</option>
                              {uncategorizedTags.length > 0 && (
                                <option value="existing">Existing</option>
                              )}
                            </select>
                            {config.action === 'create' ? (
                              <input
                                type="text"
                                value={config.tagName || className}
                                onChange={(e) => updateUncategorizedConfig(className, { tagName: e.target.value })}
                                placeholder={className}
                                disabled={isDisabled}
                                className="flex-1 px-2 py-1 border border-gray-200 rounded text-xs
                                         focus:ring-1 focus:ring-violet-500 focus:border-violet-500
                                         disabled:bg-gray-100 disabled:cursor-not-allowed"
                              />
                            ) : (
                              <select
                                value={config.existingTagId || ''}
                                onChange={(e) => updateUncategorizedConfig(className, { existingTagId: e.target.value })}
                                disabled={isDisabled}
                                className="flex-1 px-2 py-1 border border-gray-200 rounded text-xs
                                         focus:ring-1 focus:ring-violet-500 focus:border-violet-500
                                         disabled:bg-gray-100 disabled:cursor-not-allowed"
                              >
                                <option value="">Select tag...</option>
                                {uncategorizedTags.map((tag) => (
                                  <option key={tag.id} value={tag.id}>
                                    {tag.name}
                                  </option>
                                ))}
                              </select>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {/* Categorized Mode Content */}
                  {mappingMode === 'categorized' && (
                    <div className="px-4 py-3 space-y-4">
                      {/* Category mode selector */}
                      <div className="flex gap-4">
                        <label className="flex items-center gap-2 text-sm cursor-pointer">
                          <input
                            type="radio"
                            name="categoryMode"
                            checked={categoryMode === 'existing'}
                            onChange={() => setCategoryMode('existing')}
                            disabled={isDisabled}
                            className="text-violet-600 focus:ring-violet-500"
                          />
                          <span className="text-gray-700">Use existing category</span>
                        </label>
                        <label className="flex items-center gap-2 text-sm cursor-pointer">
                          <input
                            type="radio"
                            name="categoryMode"
                            checked={categoryMode === 'create'}
                            onChange={() => setCategoryMode('create')}
                            disabled={isDisabled}
                            className="text-violet-600 focus:ring-violet-500"
                          />
                          <span className="text-gray-700">Create new category</span>
                        </label>
                      </div>

                      {/* Use existing category */}
                      {categoryMode === 'existing' && (
                        <div className="space-y-3 p-3 bg-gray-50 rounded-lg">
                          <select
                            value={selectedCategoryId}
                            onChange={(e) => {
                              setSelectedCategoryId(e.target.value)
                              setExistingCategoryTagMapping({})
                            }}
                            disabled={isDisabled}
                            className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm
                                     focus:ring-1 focus:ring-violet-500 focus:border-violet-500
                                     disabled:bg-gray-100 disabled:cursor-not-allowed"
                          >
                            <option value="">Select category...</option>
                            {selectableCategories.map((cat) => (
                              <option key={cat.id} value={cat.id}>
                                {cat.display_name || cat.name}
                              </option>
                            ))}
                          </select>

                          {selectedCategoryId && (
                            <div className="space-y-2 max-h-32 overflow-y-auto">
                              <p className="text-xs text-gray-500">Map predictions to tags:</p>
                              {modelClasses.map((className) => (
                                <div key={className} className="flex items-center gap-2">
                                  <span className="text-xs text-gray-600 w-16 truncate">{className}</span>
                                  <span className="text-gray-400">→</span>
                                  <select
                                    value={existingCategoryTagMapping[className] || ''}
                                    onChange={(e) => setExistingCategoryTagMapping(prev => ({
                                      ...prev,
                                      [className]: e.target.value
                                    }))}
                                    disabled={isDisabled}
                                    className="flex-1 px-2 py-1 border border-gray-200 rounded text-xs
                                             focus:ring-1 focus:ring-violet-500 focus:border-violet-500
                                             disabled:bg-gray-100 disabled:cursor-not-allowed"
                                  >
                                    <option value="">Select tag...</option>
                                    {selectedCategoryTags.map((tag) => (
                                      <option key={tag.id} value={tag.id}>
                                        {tag.name}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Create new category */}
                      {categoryMode === 'create' && (
                        <div className="space-y-3 p-3 bg-gray-50 rounded-lg">
                          <div className="flex gap-2">
                            <input
                              type="text"
                              value={newCategoryName}
                              onChange={(e) => setNewCategoryName(e.target.value)}
                              placeholder="Category name"
                              disabled={isDisabled}
                              className="flex-1 px-2 py-1.5 border border-gray-200 rounded text-sm
                                       focus:ring-1 focus:ring-violet-500 focus:border-violet-500
                                       disabled:bg-gray-100 disabled:cursor-not-allowed"
                            />
                            <div className="flex items-center gap-2">
                              <input
                                type="color"
                                value={newCategoryColor}
                                onChange={(e) => setNewCategoryColor(e.target.value)}
                                disabled={isDisabled}
                                className="w-8 h-8 rounded border border-gray-200 cursor-pointer
                                         disabled:cursor-not-allowed"
                              />
                            </div>
                          </div>

                          <div className="space-y-2 max-h-32 overflow-y-auto">
                            <p className="text-xs text-gray-500">Tag names (customize if needed):</p>
                            {modelClasses.map((className) => (
                              <div key={className} className="flex items-center gap-2">
                                <span className="text-xs text-gray-600 w-16 truncate">{className}</span>
                                <span className="text-gray-400">→</span>
                                <input
                                  type="text"
                                  value={newCategoryTagNames[className] || className}
                                  onChange={(e) => setNewCategoryTagNames(prev => ({
                                    ...prev,
                                    [className]: e.target.value
                                  }))}
                                  placeholder={className}
                                  disabled={isDisabled}
                                  className="flex-1 px-2 py-1 border border-gray-200 rounded text-xs
                                           focus:ring-1 focus:ring-violet-500 focus:border-violet-500
                                           disabled:bg-gray-100 disabled:cursor-not-allowed"
                                />
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Progress bar */}
          {(jobState === 'running' || jobState === 'completed') && progress && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600">
                  {jobState === 'completed' ? 'Completed' : 'Processing...'}
                </span>
                <span className="font-medium text-gray-900">
                  {progress.processed} / {progress.total}
                </span>
              </div>
              <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all duration-300 ${
                    jobState === 'completed' ? 'bg-emerald-500' : 'bg-violet-500'
                  }`}
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              {progress.failed > 0 && (
                <p className="text-xs text-amber-600">
                  {progress.failed} image{progress.failed !== 1 ? 's' : ''} failed
                </p>
              )}
            </div>
          )}

          {/* Error message */}
          {error && (
            <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-lg">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-red-800">Classification failed</p>
                <p className="text-xs text-red-700 mt-1">{error}</p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 bg-gray-50 flex-shrink-0">
          {jobState === 'completed' ? (
            <button
              onClick={handleClose}
              className="px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white
                       rounded-lg text-sm font-medium transition-colors"
            >
              Done
            </button>
          ) : (
            <>
              <button
                onClick={handleClose}
                disabled={jobState === 'starting'}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100
                         rounded-lg text-sm font-medium transition-colors
                         disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
              <button
                onClick={handleStartClassification}
                disabled={
                  jobState !== 'idle' ||
                  classificationModels.length === 0 ||
                  !selectedModelId
                }
                className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-700
                         text-white rounded-lg text-sm font-medium transition-colors
                         disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {jobState === 'starting' || jobState === 'running' ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {jobState === 'starting' ? 'Starting...' : 'Classifying...'}
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    Start Classification
                  </>
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
