import { useState } from 'react'
import { Modal } from './ui/Modal'
import { Button } from './ui/button'
import type { ImageData, Annotation, Label } from '@/types/annotations'
import { exportToCOCO, downloadCOCO } from '@/lib/coco-export'
import { exportToYOLO, downloadYOLOFiles, getYOLOPreview } from '@/lib/yolo-export'
import { Download } from 'lucide-react'

interface ExportModalProps {
  isOpen: boolean
  onClose: () => void
  images: ImageData[]
  annotations: Annotation[]
  labels: Label[]
}

type ExportFormat = 'coco' | 'yolo'

export function ExportModal({
  isOpen,
  onClose,
  images,
  annotations,
  labels,
}: ExportModalProps) {
  const [format, setFormat] = useState<ExportFormat>('coco')
  const [pathPrefix, setPathPrefix] = useState('')

  const handleExport = async () => {
    if (format === 'coco') {
      // Add path prefix to image filenames if provided
      const modifiedImages = pathPrefix
        ? images.map(img => ({ ...img, name: pathPrefix + img.name }))
        : images

      const cocoData = exportToCOCO(modifiedImages, annotations, labels)
      await downloadCOCO(cocoData, 'annotations.json')
    } else {
      const yoloData = exportToYOLO(images, annotations, labels)
      await downloadYOLOFiles(yoloData)
    }

    onClose()
  }

  const getPreview = () => {
    if (format === 'coco') {
      const modifiedImages = pathPrefix
        ? images.map(img => ({ ...img, name: pathPrefix + img.name }))
        : images

      const cocoData = exportToCOCO(modifiedImages, annotations, labels)

      // Show a preview of the COCO JSON structure
      const preview = {
        info: {
          description: 'SAM3 Annotation Export',
          images_count: cocoData.images.length,
          annotations_count: cocoData.annotations.length,
          categories_count: cocoData.categories.length,
        },
        sample_image: cocoData.images[0] || null,
        sample_annotation: cocoData.annotations[0] || null,
        categories: cocoData.categories,
      }

      return JSON.stringify(preview, null, 2)
    } else {
      return getYOLOPreview(images, annotations, labels, 15)
    }
  }

  const totalAnnotations = annotations.length
  const totalImages = images.length
  const totalLabels = labels.length

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Export Annotations" maxWidth="2xl">
      <div className="space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          <div className="glass rounded-lg p-3 text-center border border-gray-200/30">
            <div className="text-2xl font-bold text-emerald-500">{totalImages}</div>
            <div className="text-sm text-gray-700">Images</div>
          </div>
          <div className="glass rounded-lg p-3 text-center border border-gray-200/30">
            <div className="text-2xl font-bold text-emerald-500">{totalAnnotations}</div>
            <div className="text-sm text-gray-700">Annotations</div>
          </div>
          <div className="glass rounded-lg p-3 text-center border border-gray-200/30">
            <div className="text-2xl font-bold text-emerald-500">{totalLabels}</div>
            <div className="text-sm text-gray-700">Labels</div>
          </div>
        </div>

        {/* Format Selection */}
        <div>
          <label className="block text-sm font-medium text-gray-800 mb-3">
            Export Format
          </label>
          <div className="space-y-2">
            <label className="flex items-center space-x-3 cursor-pointer">
              <input
                type="radio"
                name="format"
                value="coco"
                checked={format === 'coco'}
                onChange={(e) => setFormat(e.target.value as ExportFormat)}
                className="w-4 h-4 text-emerald-600 focus:ring-emerald-500 focus:ring-offset-white"
              />
              <div>
                <div className="text-gray-900 font-medium">COCO JSON</div>
                <div className="text-sm text-gray-700">
                  Common Objects in Context format (single JSON file)
                </div>
              </div>
            </label>

            <label className="flex items-center space-x-3 cursor-pointer">
              <input
                type="radio"
                name="format"
                value="yolo"
                checked={format === 'yolo'}
                onChange={(e) => setFormat(e.target.value as ExportFormat)}
                className="w-4 h-4 text-emerald-600 focus:ring-emerald-500 focus:ring-offset-white"
              />
              <div>
                <div className="text-gray-900 font-medium">YOLO</div>
                <div className="text-sm text-gray-700">
                  One .txt file per image + classes.txt
                </div>
              </div>
            </label>
          </div>
        </div>

        {/* Path Prefix */}
        <div>
          <label htmlFor="pathPrefix" className="block text-sm font-medium text-gray-800 mb-2">
            Image Path Prefix (optional)
          </label>
          <input
            type="text"
            id="pathPrefix"
            value={pathPrefix}
            onChange={(e) => setPathPrefix(e.target.value)}
            placeholder={format === 'coco' ? '/dataset/images/' : ''}
            className="w-full px-3 py-2 bg-white/80 border border-gray-300 rounded-lg text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
          />
          <p className="mt-1 text-xs text-gray-600">
            {format === 'coco'
              ? 'Prefix to add before image filenames in the export (e.g., "/dataset/images/")'
              : 'Path prefix for image references (mainly for documentation)'}
          </p>
        </div>

        {/* Preview */}
        <div>
          <label className="block text-sm font-medium text-gray-800 mb-2">
            Format Preview
          </label>
          <div className="bg-gray-800 rounded-lg p-4 max-h-64 overflow-y-auto border border-gray-300/50">
            <pre className="text-xs text-gray-100 font-mono whitespace-pre-wrap">
              {getPreview()}
            </pre>
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200/50">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={handleExport}
            disabled={totalAnnotations === 0}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            <Download className="w-4 h-4 mr-2" />
            Export {format.toUpperCase()}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
