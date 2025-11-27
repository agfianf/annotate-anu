import { useState, useEffect, useCallback } from 'react'
import type { ImageData, Annotation, Label } from '@/types/annotations'
import { imageStorage, annotationStorage, labelStorage } from '@/lib/storage'

export function useStorage() {
  const [images, setImages] = useState<ImageData[]>([])
  const [annotations, setAnnotations] = useState<Annotation[]>([])
  const [labels, setLabels] = useState<Label[]>([])
  const [currentImageId, setCurrentImageId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  // Load all data from IndexedDB
  const loadData = useCallback(async () => {
    try {
      setLoading(true)

      // Initialize default labels if needed
      await labelStorage.initializeDefaults()

      const [loadedImages, loadedAnnotations, loadedLabels] = await Promise.all([
        imageStorage.getAll(),
        annotationStorage.getAll(),
        labelStorage.getAll(),
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
  }, [currentImageId])

  // Load data on mount
  useEffect(() => {
    loadData()
  }, [])

  // Image operations
  const addImage = useCallback(async (imageData: ImageData) => {
    await imageStorage.add(imageData)
    setImages(prev => [...prev, imageData])
    if (!currentImageId) {
      setCurrentImageId(imageData.id)
    }
  }, [currentImageId])

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
    await annotationStorage.add(annotation)
    setAnnotations(prev => [...prev, annotation])
  }, [])

  const addManyAnnotations = useCallback(async (annotations: Annotation[]) => {
    // Batch write to IndexedDB in single transaction
    await annotationStorage.addMany(annotations)
    // Update React state in single operation
    setAnnotations(prev => [...prev, ...annotations])
  }, [])

  const updateAnnotation = useCallback(async (annotation: Annotation) => {
    await annotationStorage.update(annotation)
    setAnnotations(prev =>
      prev.map(ann => ann.id === annotation.id ? annotation : ann)
    )
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
    await labelStorage.add(label)
    setLabels(prev => [...prev, label])
  }, [])

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
        await annotationStorage.clear()
      }

      // Conditionally clear labels
      if (clearLabels) {
        await labelStorage.clear()
      }

      // Conditionally clear images
      if (clearImages) {
        await imageStorage.clear()
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
  }, [loadData])

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
