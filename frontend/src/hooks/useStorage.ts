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
    updateAnnotation,
    removeAnnotation,
    addLabel,
    updateLabel,
    removeLabel,
    reload: loadData,
  }
}
