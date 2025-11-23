import { useState, useEffect } from 'react'
import Toolbar from './components/Toolbar'
import Canvas from './components/Canvas'
import Sidebar from './components/Sidebar'
import { useStorage } from './hooks/useStorage'
import type { Tool, Annotation, ImageData } from './types/annotations'
import './App.css'

function App() {
  const [selectedTool, setSelectedTool] = useState<Tool>('select')
  const [selectedAnnotation, setSelectedAnnotation] = useState<string | null>(null)
  const [selectedLabelId, setSelectedLabelId] = useState<string | null>(null)
  const [showLabelManager, setShowLabelManager] = useState(false)

  const {
    images,
    labels,
    currentImage,
    currentImageId,
    currentAnnotations,
    loading,
    setCurrentImageId,
    addImage,
    addAnnotation,
    updateAnnotation,
    removeAnnotation,
    addLabel,
    removeLabel,
  } = useStorage()

  // Set default selected label when labels are loaded
  useEffect(() => {
    if (labels.length > 0 && !selectedLabelId) {
      setSelectedLabelId(labels[0].id)
    }
  }, [labels, selectedLabelId])

  const handleImageUpload = async (files: FileList) => {
    for (let i = 0; i < files.length; i++) {
      const file = files[i]

      // Create image element to get dimensions
      const img = new Image()
      const objectUrl = URL.createObjectURL(file)

      await new Promise<void>((resolve) => {
        img.onload = async () => {
          const imageData: ImageData = {
            id: `${Date.now()}-${i}`,
            name: file.name,
            width: img.width,
            height: img.height,
            blob: file,
            createdAt: Date.now(),
          }

          await addImage(imageData)
          URL.revokeObjectURL(objectUrl)
          resolve()
        }
        img.src = objectUrl
      })
    }
  }

  const handleAddAnnotation = async (annotation: Omit<Annotation, 'imageId' | 'labelId' | 'createdAt' | 'updatedAt'>) => {
    if (!currentImageId || !selectedLabelId) return

    const now = Date.now()
    const fullAnnotation: Annotation = {
      ...annotation,
      imageId: currentImageId,
      labelId: selectedLabelId,
      createdAt: now,
      updatedAt: now,
    } as Annotation

    await addAnnotation(fullAnnotation)
  }

  const handleUpdateAnnotation = async (annotation: Annotation) => {
    const updatedAnnotation = {
      ...annotation,
      updatedAt: Date.now(),
    }
    await updateAnnotation(updatedAnnotation)
  }

  const handleDeleteAnnotation = async (id: string) => {
    await removeAnnotation(id)
    if (selectedAnnotation === id) {
      setSelectedAnnotation(null)
    }
  }

  // Get current image as data URL for canvas
  const [currentImageUrl, setCurrentImageUrl] = useState<string | null>(null)

  useEffect(() => {
    if (currentImage) {
      const url = URL.createObjectURL(currentImage.blob)
      setCurrentImageUrl(url)
      return () => URL.revokeObjectURL(url)
    } else {
      setCurrentImageUrl(null)
    }
    // Clear selection when image changes
    setSelectedAnnotation(null)
  }, [currentImage])

  // Clear selection when navigating between images
  useEffect(() => {
    setSelectedAnnotation(null)
  }, [currentImageId])

  // Get current image index for display
  const currentImageIndex = images.findIndex(img => img.id === currentImageId)
  const currentImageNumber = currentImageIndex >= 0 ? currentImageIndex + 1 : 0

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-900">
        <div className="text-white text-lg">Loading...</div>
      </div>
    )
  }

  return (
    <div className="h-screen flex flex-col bg-gray-900">
      {/* Header */}
      <header className="bg-gray-800 border-b border-gray-700 px-4 py-3 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-white">SAM3 Annotation Platform</h1>
        <div className="flex items-center gap-4">
          {images.length > 0 && (
            <span className="text-gray-400 text-sm">
              Image {currentImageNumber} of {images.length} • {currentAnnotations.length} annotations
            </span>
          )}
          <button
            onClick={() => setShowLabelManager(true)}
            className="px-3 py-1.5 bg-orange-600 hover:bg-orange-700 text-white text-sm rounded transition-colors"
          >
            Manage Labels
          </button>
        </div>
      </header>

      {/* Main Layout */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex-1 flex overflow-hidden">
          {/* Toolbar */}
          <Toolbar
            selectedTool={selectedTool}
            onToolChange={setSelectedTool}
            onImageUpload={handleImageUpload}
          />

          {/* Canvas */}
          <div className="flex-1 bg-gray-950 overflow-hidden">
            <Canvas
              image={currentImageUrl}
              selectedTool={selectedTool}
              annotations={currentAnnotations}
              labels={labels}
              onAddAnnotation={handleAddAnnotation}
              onUpdateAnnotation={handleUpdateAnnotation}
              selectedAnnotation={selectedAnnotation}
              onSelectAnnotation={setSelectedAnnotation}
            />
          </div>

          {/* Sidebar */}
          <Sidebar
            annotations={currentAnnotations}
            labels={labels}
            selectedAnnotation={selectedAnnotation}
            selectedLabelId={selectedLabelId}
            onSelectAnnotation={setSelectedAnnotation}
            onSelectLabel={setSelectedLabelId}
            onDeleteAnnotation={handleDeleteAnnotation}
          />
        </div>

        {/* Image Gallery - Bottom strip */}
        {images.length > 0 && (
          <div className="h-28 bg-gray-800 border-t border-gray-700 flex items-center px-4 gap-3">
            {/* Previous button */}
            <button
              onClick={() => {
                const prevIndex = currentImageIndex - 1
                if (prevIndex >= 0) {
                  setCurrentImageId(images[prevIndex].id)
                }
              }}
              disabled={currentImageIndex <= 0}
              className="p-2 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>

            {/* Thumbnails */}
            <div className="flex-1 flex gap-2 overflow-x-auto py-2">
              {images.map((image) => {
                const imageUrl = URL.createObjectURL(image.blob)
                // Count annotations for this specific image (not just current image's annotations)
                const imageAnnotationCount = currentAnnotations.length > 0 && currentImageId === image.id ? currentAnnotations.length : 0

                return (
                  <div
                    key={image.id}
                    onClick={() => setCurrentImageId(image.id)}
                    className={`relative flex-shrink-0 cursor-pointer rounded overflow-hidden border-2 transition-all ${
                      currentImageId === image.id
                        ? 'border-orange-500 ring-2 ring-orange-500/50'
                        : 'border-gray-600 hover:border-gray-500'
                    }`}
                  >
                    <img
                      src={imageUrl}
                      alt={image.name}
                      className="h-20 w-auto object-contain bg-gray-900"
                      onLoad={() => URL.revokeObjectURL(imageUrl)}
                    />
                    {imageAnnotationCount > 0 && (
                      <div className="absolute top-1 right-1 bg-orange-600 text-white text-xs px-1.5 py-0.5 rounded">
                        {imageAnnotationCount}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Next button */}
            <button
              onClick={() => {
                const nextIndex = currentImageIndex + 1
                if (nextIndex < images.length) {
                  setCurrentImageId(images[nextIndex].id)
                }
              }}
              disabled={currentImageIndex >= images.length - 1}
              className="p-2 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        )}
      </div>

      {/* Label Manager Modal */}
      {showLabelManager && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[80vh] overflow-hidden flex flex-col">
            <div className="px-6 py-4 border-b border-gray-700 flex items-center justify-between">
              <h2 className="text-xl font-semibold text-white">Label Management</h2>
              <button
                onClick={() => setShowLabelManager(false)}
                className="text-gray-400 hover:text-white"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-6 overflow-y-auto flex-1">
              <div className="space-y-3">
                {labels.map(label => (
                  <div
                    key={label.id}
                    className="flex items-center gap-3 p-3 bg-gray-700 rounded-lg"
                  >
                    <div
                      className="w-6 h-6 rounded"
                      style={{ backgroundColor: label.color }}
                    />
                    <span className="flex-1 text-white">{label.name}</span>
                    <button
                      onClick={() => removeLabel(label.id)}
                      className="text-red-400 hover:text-red-300 text-sm"
                    >
                      Delete
                    </button>
                  </div>
                ))}
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  const formData = new FormData(e.currentTarget)
                  const name = formData.get('name') as string
                  const color = formData.get('color') as string

                  if (name && color) {
                    const newLabel = {
                      id: Date.now().toString(),
                      name,
                      color,
                      createdAt: Date.now(),
                    }
                    addLabel(newLabel)
                    e.currentTarget.reset()
                  }
                }}
                className="mt-6 space-y-3"
              >
                <h3 className="text-white font-medium">Add New Label</h3>
                <input
                  type="text"
                  name="name"
                  placeholder="Label name"
                  required
                  className="w-full px-3 py-2 bg-gray-700 text-white rounded border border-gray-600 focus:border-orange-500 focus:outline-none"
                />
                <div className="flex gap-2">
                  <input
                    type="color"
                    name="color"
                    defaultValue="#f97316"
                    className="w-16 h-10 bg-gray-700 rounded border border-gray-600"
                  />
                  <button
                    type="submit"
                    className="flex-1 px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded transition-colors"
                  >
                    Add Label
                  </button>
                </div>
                <div className="flex gap-2 mt-2">
                  <button
                    type="button"
                    onClick={(e) => {
                      const form = e.currentTarget.closest('form')
                      const colorInput = form?.querySelector('input[name="color"]') as HTMLInputElement
                      if (colorInput) colorInput.value = '#f97316'
                    }}
                    className="px-3 py-1 text-xs bg-orange-600 hover:bg-orange-700 text-white rounded"
                  >
                    Orange
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      const form = e.currentTarget.closest('form')
                      const colorInput = form?.querySelector('input[name="color"]') as HTMLInputElement
                      if (colorInput) colorInput.value = '#6b7280'
                    }}
                    className="px-3 py-1 text-xs bg-gray-600 hover:bg-gray-500 text-white rounded"
                  >
                    Gray
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      const form = e.currentTarget.closest('form')
                      const colorInput = form?.querySelector('input[name="color"]') as HTMLInputElement
                      if (colorInput) colorInput.value = '#111827'
                    }}
                    className="px-3 py-1 text-xs bg-gray-900 hover:bg-gray-800 text-white rounded border border-gray-700"
                  >
                    Dark
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
