import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { Modal } from './ui/Modal'
import { Button } from './ui/button'
import type { ImageData, Annotation, Label } from '@/types/annotations'
import { exportToCOCO, downloadCOCO } from '@/lib/coco-export'
import {
  buildYOLODatasetZip,
  downloadBlob,
  DEFAULT_SPLIT_RATIOS,
  splitImages,
  type SplitRatios,
} from '@/lib/yolo-dataset-export'
import { exportToYOLO, downloadYOLOFiles, getYOLOPreview, hasPolygonAnnotations } from '@/lib/yolo-export'
import type { YOLOTask } from '@/lib/yolo-export'
import { Download, Loader2 } from 'lucide-react'

interface ExportModalProps {
  isOpen: boolean
  onClose: () => void
  images: ImageData[]
  annotations: Annotation[]
  labels: Label[]
}

type ExportFormat = 'coco' | 'yolo' | 'dataset'

export function ExportModal({
  isOpen,
  onClose,
  images,
  annotations,
  labels,
}: ExportModalProps) {
  const [format, setFormat] = useState<ExportFormat>('coco')
  const [yoloTask, setYoloTask] = useState<YOLOTask>('detect')
  const [pathPrefix, setPathPrefix] = useState('')
  const [ratios, setRatios] = useState<SplitRatios>(DEFAULT_SPLIT_RATIOS)
  const [seed, setSeed] = useState(42)
  const [datasetName, setDatasetName] = useState('dataset')
  const [includeEmptyImages, setIncludeEmptyImages] = useState(false)
  const [isBuilding, setIsBuilding] = useState(false)

  const hasPolygons = hasPolygonAnnotations(annotations)

  // Polygon datasets default to segmentation so masks are not silently flattened to boxes
  useEffect(() => {
    setYoloTask(hasPolygons ? 'segment' : 'detect')
  }, [hasPolygons])

  const previewSplits = useMemo(() => {
    if (format !== 'dataset') return null
    const annotatedIds = new Set(annotations.map(a => a.imageId))
    const usable = includeEmptyImages ? images : images.filter(i => annotatedIds.has(i.id))
    const split = splitImages(usable, ratios, seed)
    return { usable: usable.length, train: split.train.length, val: split.val.length, test: split.test.length }
  }, [format, images, annotations, ratios, seed, includeEmptyImages])

  const handleExport = async () => {
    if (format === 'dataset') {
      setIsBuilding(true)
      try {
        const { blob, summary } = await buildYOLODatasetZip(images, annotations, labels, {
          task: yoloTask,
          ratios,
          seed,
          datasetName,
          includeEmptyImages,
        })
        downloadBlob(blob, `${datasetName}_yolo_${yoloTask}.zip`)
        toast.success(`Exported ${summary.totalImages} images (${summary.counts.train}/${summary.counts.val}/${summary.counts.test})`)
      } catch (error) {
        console.error('Dataset export failed:', error)
        toast.error(error instanceof Error ? error.message : 'Dataset export failed')
        setIsBuilding(false)
        return
      }
      setIsBuilding(false)
      onClose()
      return
    }

    if (format === 'coco') {
      // Add path prefix to image filenames if provided
      const modifiedImages = pathPrefix
        ? images.map(img => ({ ...img, name: pathPrefix + img.name }))
        : images

      const cocoData = exportToCOCO(modifiedImages, annotations, labels)
      await downloadCOCO(cocoData, 'annotations.json')
    } else {
      const yoloData = exportToYOLO(images, annotations, labels, yoloTask)
      await downloadYOLOFiles(yoloData)
    }

    onClose()
  }

  const getPreview = () => {
    if (format === 'dataset') {
      const names = labels.map((l, i) => `  ${i}: ${l.name}`).join('\n')
      return [
        `# ${datasetName}/data.yaml`,
        'path: .',
        'train: images/train',
        `val: images/${previewSplits && previewSplits.val > 0 ? 'val' : 'train'}`,
        ...(previewSplits && previewSplits.test > 0 ? ['test: images/test'] : []),
        '',
        'names:',
        names,
        '',
        '# structure',
        'images/{train,val,test}/*.jpg',
        'labels/{train,val,test}/*.txt',
        'data.yaml',
        'classes.txt',
      ].join('\n')
    }
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
      return getYOLOPreview(images, annotations, labels, 15, yoloTask)
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

            <label className="flex items-center space-x-3 cursor-pointer">
              <input
                type="radio"
                name="format"
                value="dataset"
                checked={format === 'dataset'}
                onChange={(e) => setFormat(e.target.value as ExportFormat)}
                className="w-4 h-4 text-emerald-600 focus:ring-emerald-500 focus:ring-offset-white"
              />
              <div>
                <div className="text-gray-900 font-medium">Training-ready dataset (YOLO11)</div>
                <div className="text-sm text-gray-700">
                  Images + labels split into train/val/test with data.yaml
                </div>
              </div>
            </label>
          </div>
        </div>

        {format === 'dataset' && (
          <div className="space-y-4 p-4 glass rounded-lg border border-gray-200/50">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-800 mb-1">Dataset name</label>
                <input
                  value={datasetName}
                  onChange={(e) => setDatasetName(e.target.value.replace(/[^\w-]/g, '_') || 'dataset')}
                  className="w-full px-3 py-2 bg-white border border-gray-300 rounded text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-800 mb-1">Shuffle seed</label>
                <input
                  type="number"
                  value={seed}
                  onChange={(e) => setSeed(parseInt(e.target.value, 10) || 0)}
                  className="w-full px-3 py-2 bg-white border border-gray-300 rounded text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-800">Split ratios</label>
              <div className="grid grid-cols-3 gap-3">
                {(['train', 'val', 'test'] as const).map((key) => (
                  <div key={key}>
                    <div className="flex items-center justify-between text-xs text-gray-700 mb-1">
                      <span className="capitalize">{key}</span>
                      <span className="font-mono text-emerald-600">{Math.round(ratios[key] * 100)}%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      value={ratios[key]}
                      onChange={(e) => setRatios({ ...ratios, [key]: parseFloat(e.target.value) })}
                      className="w-full accent-emerald-600"
                    />
                  </div>
                ))}
              </div>
              <p className="text-xs text-gray-600">
                Ratios are normalized, so they do not need to add up to 100%.
              </p>
            </div>

            <label className="flex items-center gap-2 text-sm text-gray-800 cursor-pointer">
              <input
                type="checkbox"
                checked={includeEmptyImages}
                onChange={(e) => setIncludeEmptyImages(e.target.checked)}
                className="w-4 h-4 accent-emerald-600"
              />
              Include images with no annotations as background samples
            </label>

            {previewSplits && (
              <div className="grid grid-cols-4 gap-2 text-center">
                {([['Total', previewSplits.usable], ['Train', previewSplits.train], ['Val', previewSplits.val], ['Test', previewSplits.test]] as const).map(([label, count]) => (
                  <div key={label} className="bg-white/70 rounded p-2 border border-gray-200/50">
                    <div className="text-lg font-bold text-emerald-600">{count}</div>
                    <div className="text-xs text-gray-600">{label}</div>
                  </div>
                ))}
              </div>
            )}

            {previewSplits?.val === 0 && (
              <p className="text-xs text-amber-700">
                No validation images. data.yaml will point val at the train split so training still runs.
              </p>
            )}
          </div>
        )}

        {/* YOLO Task Selection */}
        {(format === 'yolo' || format === 'dataset') && (
          <div>
            <label className="block text-sm font-medium text-gray-800 mb-3">
              YOLO Task
            </label>
            <div className="space-y-2">
              <label className="flex items-center space-x-3 cursor-pointer">
                <input
                  type="radio"
                  name="yoloTask"
                  value="segment"
                  checked={yoloTask === 'segment'}
                  onChange={() => setYoloTask('segment')}
                  className="w-4 h-4 text-emerald-600 focus:ring-emerald-500 focus:ring-offset-white"
                />
                <div>
                  <div className="text-gray-900 font-medium">Segmentation</div>
                  <div className="text-sm text-gray-700">
                    Normalized polygon points. Rectangles export as their four corners; points are omitted.
                  </div>
                </div>
              </label>

              <label className="flex items-center space-x-3 cursor-pointer">
                <input
                  type="radio"
                  name="yoloTask"
                  value="detect"
                  checked={yoloTask === 'detect'}
                  onChange={() => setYoloTask('detect')}
                  className="w-4 h-4 text-emerald-600 focus:ring-emerald-500 focus:ring-offset-white"
                />
                <div>
                  <div className="text-gray-900 font-medium">Detection</div>
                  <div className="text-sm text-gray-700">
                    Bounding boxes only. Polygons are reduced to their bounding box.
                  </div>
                </div>
              </label>
            </div>
            {hasPolygons && yoloTask === 'detect' && (
              <p className="mt-2 text-xs text-amber-700">
                This dataset contains polygons. Detection export will discard their mask geometry.
              </p>
            )}
          </div>
        )}

        {/* Path Prefix */}
        <div className={format === 'dataset' ? 'hidden' : ''}>
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
            disabled={totalAnnotations === 0 || isBuilding}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {isBuilding ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
            {isBuilding
              ? 'Building ZIP...'
              : format === 'dataset'
                ? `Export Dataset (${yoloTask === 'segment' ? 'Seg' : 'Detect'})`
                : format === 'yolo'
                  ? `Export YOLO ${yoloTask === 'segment' ? 'Seg' : 'Detect'}`
                  : 'Export COCO'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
