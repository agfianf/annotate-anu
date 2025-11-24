import { useState } from 'react'
import { Modal } from './Modal'
import type { ImageData } from '@/types/annotations'
import { Check } from 'lucide-react'

interface ImageSelectorModalProps {
  isOpen: boolean
  onClose: () => void
  images: ImageData[]
  onConfirm: (selectedImageIds: string[]) => void
  title?: string
}

export function ImageSelectorModal({
  isOpen,
  onClose,
  images,
  onConfirm,
  title = 'Select Images to Process',
}: ImageSelectorModalProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set(images.map((img) => img.id)))

  const toggleImage = (id: string) => {
    const newSelected = new Set(selectedIds)
    if (newSelected.has(id)) {
      newSelected.delete(id)
    } else {
      newSelected.add(id)
    }
    setSelectedIds(newSelected)
  }

  const selectAll = () => {
    setSelectedIds(new Set(images.map((img) => img.id)))
  }

  const selectNone = () => {
    setSelectedIds(new Set())
  }

  const handleConfirm = () => {
    onConfirm(Array.from(selectedIds))
    onClose()
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} maxWidth="lg">
      <div className="space-y-4">
        {/* Action buttons */}
        <div className="flex items-center justify-between">
          <div className="flex gap-2">
            <button
              onClick={selectAll}
              className="px-3 py-1.5 text-sm bg-gray-700 hover:bg-gray-600 text-white rounded transition-colors"
            >
              Select All
            </button>
            <button
              onClick={selectNone}
              className="px-3 py-1.5 text-sm bg-gray-700 hover:bg-gray-600 text-white rounded transition-colors"
            >
              Select None
            </button>
          </div>
          <div className="text-sm text-gray-400">
            {selectedIds.size} of {images.length} selected
          </div>
        </div>

        {/* Image list */}
        <div className="max-h-96 overflow-y-auto space-y-2 border border-gray-700 rounded p-3">
          {images.map((image) => {
            const isSelected = selectedIds.has(image.id)
            const imageUrl = URL.createObjectURL(image.blob)

            return (
              <div
                key={image.id}
                onClick={() => toggleImage(image.id)}
                className={`flex items-center gap-3 p-2 rounded cursor-pointer transition-colors ${
                  isSelected
                    ? 'bg-orange-600/20 border border-orange-600/50'
                    : 'bg-gray-800 border border-gray-700 hover:bg-gray-700'
                }`}
              >
                <div className={`flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center ${
                  isSelected ? 'bg-orange-600 border-orange-600' : 'border-gray-500'
                }`}>
                  {isSelected && <Check className="w-3 h-3 text-white" />}
                </div>
                <img
                  src={imageUrl}
                  alt={image.name}
                  className="w-12 h-12 object-cover rounded bg-gray-900"
                  onLoad={() => URL.revokeObjectURL(imageUrl)}
                />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-white truncate">{image.name}</div>
                  <div className="text-xs text-gray-400">
                    {image.width} × {image.height}
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* Confirm/Cancel buttons */}
        <div className="flex justify-end gap-3 pt-2">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={selectedIds.size === 0}
            className="px-4 py-2 bg-orange-600 hover:bg-orange-700 disabled:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded transition-colors"
          >
            Process {selectedIds.size} Image{selectedIds.size !== 1 ? 's' : ''}
          </button>
        </div>
      </div>
    </Modal>
  )
}
