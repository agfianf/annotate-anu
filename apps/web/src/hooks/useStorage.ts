import { useState, useEffect, useCallback } from 'react'
import type { ImageData, Annotation, Label } from '@/types/annotations'
import { imageStorage, annotationStorage, labelStorage, projectStorage, DEFAULT_PROJECT_ID } from '@/lib/storage'

export function useStorage(projectId?: string) {
  const scopeId = projectId || DEFAULT_PROJECT_ID
  const [images, setImages] = useState<ImageData[]>([])
  const [annotations, setAnnotations] = useState<Annotation[]>([])
  const [labels, setLabels] = useState<Label[]>([])
  const [currentImageId, setCurrentImageId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  // Load all data from IndexedDB
  const loadData = useCallback(async () => {
    try {
      setLoading(true)

      await projectStorage.ensureDefault()

      const [loadedImages, loadedAnnotations, loadedLabels] = await Promise.all([
        imageStorage.getAllByProject(scopeId),
        annotationStorage.getAllByProject(scopeId),
        labelStorage.getAllByProject(scopeId),
      ])

      setImages(loadedImages)
      setAnnotations(loadedAnnotations)
      setLabels(loadedLabels)

      // Set current image to first image if available
      if (loadedImages.length > 0 && !currentImageId) {
        setCurrentImageId(loadedImages[0].id)
      }
    } catch (error) {
      console.error('Failed to load data from IndexedDB:', error)
    } finally {
      setLoading(false)
    }
  }, [currentImageId, scopeId])

  // Reload whenever the active project changes
  useEffect(() => {
    setCurrentImageId(null)
    loadData()
  }, [scopeId])

  // Image operations
  const addImage = useCallback(async (imageData: ImageData) => {
    const scoped = { ...imageData, projectId: scopeId }
    await imageStorage.add(scoped)
    await projectStorage.touch(scopeId)
    setImages(prev => [...prev, scoped])
    if (!currentImageId) {
      setCurrentImageId(scoped.id)
    }
  }, [currentImageId, scopeId])

  const removeImage = useCallback(async (id: string) => {
    await imageStorage.remove(id)
    await annotationStorage.removeByImageId(id)
    setImages(prev => prev.filter(img => img.id !== id))
    setAnnotations(prev => prev.filter(ann => ann.imageId !== id))
    if (currentImageId === id) {
      const remaining = images.filter(img => img.id !== id)
      setCurrentImageId(remaining.length > 0 ? remaining[0].id : null)
    }
  }, [images, currentImageId])

  // Annotation operations
  const addAnnotation = useCallback(async (annotation: Annotation) => {
    const scoped = { ...annotation, projectId: scopeId }
    await annotationStorage.add(scoped)
    await projectStorage.touch(scopeId)
    setAnnotations(prev => [...prev, scoped])
  }, [scopeId])

  const addManyAnnotations = useCallback(async (annotations: Annotation[]) => {
    const scoped = annotations.map(a => ({ ...a, projectId: scopeId }))
    await annotationStorage.addMany(scoped)
    await projectStorage.touch(scopeId)
    setAnnotations(prev => [...prev, ...scoped])
  }, [scopeId])

  const updateAnnotation = useCallback(async (annotation: Annotation) => {
    await annotationStorage.update(annotation)
    setAnnotations(prev =>
      prev.map(ann => ann.id === annotation.id ? annotation : ann)
    )
  }, [])

  const updateManyAnnotations = useCallback(async (annotationsToUpdate: Annotation[]) => {
    if (annotationsToUpdate.length === 0) return
    await annotationStorage.updateMany(annotationsToUpdate)
    setAnnotations(prev => {
      const updateMap = new Map(annotationsToUpdate.map(a => [a.id, a]))
      return prev.map(ann => updateMap.has(ann.id) ? updateMap.get(ann.id)! : ann)
    })
  }, [])

  const removeAnnotation = useCallback(async (id: string) => {
    await annotationStorage.remove(id)
    setAnnotations(prev => prev.filter(ann => ann.id !== id))
  }, [])

  const removeManyAnnotations = useCallback(async (ids: string[]) => {
    await annotationStorage.removeMany(ids)
    setAnnotations(prev => prev.filter(ann => !ids.includes(ann.id)))
  }, [])

  const bulkToggleAnnotationVisibility = useCallback(async (ids: string[]) => {
    // Perform bulk toggle in storage (single transaction)
    await annotationStorage.bulkToggleVisibility(ids)

    // Update state in single operation
    setAnnotations(prev =>
      prev.map(ann =>
        ids.includes(ann.id)
          ? { ...ann, isVisible: !(ann.isVisible ?? true), updatedAt: Date.now() }
          : ann
      )
    )
  }, [])

  // Label operations
  const addLabel = useCallback(async (label: Label) => {
    const scoped = { ...label, projectId: scopeId }
    await labelStorage.add(scoped)
    setLabels(prev => [...prev, scoped])
  }, [scopeId])

  const updateLabel = useCallback(async (label: Label) => {
    await labelStorage.update(label)
    setLabels(prev => prev.map(lbl => lbl.id === label.id ? label : lbl))
  }, [])

  const removeLabel = useCallback(async (id: string) => {
    await labelStorage.remove(id)
    setLabels(prev => prev.filter(lbl => lbl.id !== id))
    // Optionally: remove annotations with this label or reassign them
  }, [])

  // Reset all data
  const resetAll = useCallback(async (options: {
    clearAnnotations?: boolean
    clearLabels?: boolean
    clearImages?: boolean
    clearToolConfig?: boolean
  } = {}) => {
    try {
      // Default to clearing everything if no options provided (backward compatibility)
      const {
        clearAnnotations = true,
        clearLabels = true,
        clearImages = false,
        clearToolConfig = false,
      } = options

      // Conditionally clear annotations
      if (clearAnnotations) {
        await annotationStorage.clearByProject(scopeId)
      }

      if (clearLabels) {
        await labelStorage.clearByProject(scopeId)
      }

      if (clearImages) {
        await imageStorage.clearByProject(scopeId)
      }

      // Conditionally clear tool configuration from localStorage
      if (clearToolConfig) {
        localStorage.removeItem('promptMode')
        localStorage.removeItem('textPrompt')
        localStorage.removeItem('GROUP_EXPANDED_STATES')
      }

      // Reload data (this will also reinitialize default labels if they were cleared)
      await loadData()
    } catch (error) {
      console.error('Failed to reset data:', error)
    }
  }, [loadData, scopeId])

  // Get current image
  const currentImage = images.find(img => img.id === currentImageId)

  // Get annotations for current image
  const currentAnnotations = annotations.filter(ann => ann.imageId === currentImageId)

  return {
    // State
    images,
    annotations,
    labels,
    currentImageId,
    currentImage,
    currentAnnotations,
    loading,

    // Actions
    setCurrentImageId,
    addImage,
    removeImage,
    addAnnotation,
    addManyAnnotations,
    updateAnnotation,
    updateManyAnnotations,
    removeAnnotation,
    removeManyAnnotations,
    bulkToggleAnnotationVisibility,
    addLabel,
    updateLabel,
    removeLabel,
    reload: loadData,
    resetAll,
  }
}
