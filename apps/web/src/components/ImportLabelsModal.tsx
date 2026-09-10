import { useMemo, useState } from 'react'
import { AlertTriangle, FolderOpen, Loader2, Upload } from 'lucide-react'
import toast from 'react-hot-toast'
import { Modal } from './ui/Modal'
import { Button } from './ui/button'
import { parseClassFile, parseYOLOLabels, type ImportResult } from '@/lib/yolo-import'
import type { Annotation, ImageData, Label } from '@/types/annotations'

interface ImportLabelsModalProps {
  isOpen: boolean
  onClose: () => void
  images: ImageData[]
  labels: Label[]
  onImport: (labels: Label[], annotations: Annotation[]) => Promise<void>
}

export function ImportLabelsModal({ isOpen, onClose, images, labels, onImport }: ImportLabelsModalProps) {
  const [labelFiles, setLabelFiles] = useState<Map<string, string>>(new Map())
  const [classNames, setClassNames] = useState<string[]>([])
  const [classSource, setClassSource] = useState<string | null>(null)
  const [isReading, setIsReading] = useState(false)
  const [isImporting, setIsImporting] = useState(false)

  const reset = () => {
    setLabelFiles(new Map())
    setClassNames([])
    setClassSource(null)
  }

  const handleClose = () => {
    reset()
    onClose()
  }

  // A folder drop may contain the .txt labels and the class file together
  const handleFiles = async (files: FileList) => {
    setIsReading(true)
    try {
      const nextLabels = new Map(labelFiles)
      let foundClasses: string[] | null = null
      let foundSource: string | null = null

      for (const file of Array.from(files)) {
        const text = await file.text()
        if (/\.(ya?ml)$/i.test(file.name) || /^classes\.txt$/i.test(file.name)) {
          const parsed = parseClassFile(file.name, text)
          if (parsed) {
            foundClasses = parsed.names
            foundSource = parsed.source
          }
          continue
        }
        if (/\.txt$/i.test(file.name)) {
          nextLabels.set(file.name, text)
        }
      }

      setLabelFiles(nextLabels)
      if (foundClasses) {
        setClassNames(foundClasses)
        setClassSource(foundSource)
      }
    } catch (error) {
      console.error('Failed to read files:', error)
      toast.error('Failed to read the selected files')
    } finally {
      setIsReading(false)
    }
  }

  const result: ImportResult | null = useMemo(() => {
    if (labelFiles.size === 0) return null
    return parseYOLOLabels(labelFiles, images, classNames, labels)
  }, [labelFiles, images, classNames, labels])

  const handleImport = async () => {
    if (!result) return
    setIsImporting(true)
    try {
      await onImport(result.labels, result.annotations)
      toast.success(`Imported ${result.annotations.length} annotations across ${result.preview.matchedImages} images`)
      handleClose()
    } catch (error) {
      console.error('Import failed:', error)
      toast.error(error instanceof Error ? error.message : 'Import failed')
    } finally {
      setIsImporting(false)
    }
  }

  const preview = result?.preview

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Import YOLO Labels" maxWidth="2xl">
      <div className="space-y-5">
        <p className="text-sm text-gray-700">
          Select your labels folder (the .txt files) together with a data.yaml or classes.txt.
          Label files are matched to images already in this project by filename.
        </p>

        <div className="grid grid-cols-2 gap-3">
          <label className="cursor-pointer">
            <div className="h-24 border-2 border-dashed border-gray-300 hover:border-emerald-500 rounded-lg flex flex-col items-center justify-center gap-1 transition-colors bg-white hover:bg-emerald-50">
              <FolderOpen className="w-5 h-5 text-gray-400" />
              <span className="text-sm text-gray-700">Select folder</span>
            </div>
            <input
              type="file"
              className="hidden"
              {...({ webkitdirectory: '', directory: '' } as any)}
              onChange={(e) => e.target.files && handleFiles(e.target.files)}
            />
          </label>

          <label className="cursor-pointer">
            <div className="h-24 border-2 border-dashed border-gray-300 hover:border-emerald-500 rounded-lg flex flex-col items-center justify-center gap-1 transition-colors bg-white hover:bg-emerald-50">
              <Upload className="w-5 h-5 text-gray-400" />
              <span className="text-sm text-gray-700">Select files</span>
            </div>
            <input
              type="file"
              multiple
              accept=".txt,.yaml,.yml"
              className="hidden"
              onChange={(e) => e.target.files && handleFiles(e.target.files)}
            />
          </label>
        </div>

        {isReading && (
          <div className="flex items-center gap-2 text-sm text-gray-700">
            <Loader2 className="w-4 h-4 animate-spin" /> Reading files...
          </div>
        )}

        {labelFiles.size > 0 && (
          <div className="space-y-3">
            <div className="grid grid-cols-4 gap-2 text-center">
              {([
                ['Label files', labelFiles.size],
                ['Matched images', preview?.matchedImages ?? 0],
                ['Boxes', preview?.detectionCount ?? 0],
                ['Polygons', preview?.segmentationCount ?? 0],
              ] as const).map(([label, count]) => (
                <div key={label} className="glass rounded p-2 border border-gray-200/50">
                  <div className="text-lg font-bold text-emerald-600">{count}</div>
                  <div className="text-xs text-gray-600">{label}</div>
                </div>
              ))}
            </div>

            <div className="text-sm text-gray-700">
              {classSource ? (
                <>Classes from <span className="font-mono text-xs">{classSource}</span>: {classNames.join(', ')}</>
              ) : (
                <span className="text-amber-700 flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4" />
                  No data.yaml or classes.txt found. Classes will be named class_0, class_1, ...
                </span>
              )}
            </div>

            {preview && preview.unmatchedLabelFiles.length > 0 && (
              <div className="text-sm text-amber-700">
                {preview.unmatchedLabelFiles.length} label file(s) have no matching image and will be skipped
                (e.g. {preview.unmatchedLabelFiles.slice(0, 3).join(', ')}).
              </div>
            )}

            {preview && preview.invalidLines > 0 && (
              <div className="text-sm text-amber-700">{preview.invalidLines} malformed line(s) will be skipped.</div>
            )}

            {result && result.labels.length > 0 && (
              <div className="text-sm text-gray-700">
                {result.labels.length} new label(s) will be created: {result.labels.map(l => l.name).join(', ')}
              </div>
            )}
          </div>
        )}

        <div className="flex justify-end gap-3 pt-2 border-t border-gray-200/50">
          <Button variant="outline" onClick={handleClose}>Cancel</Button>
          <Button
            onClick={handleImport}
            disabled={!result || result.annotations.length === 0 || isImporting}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {isImporting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Import {result?.annotations.length ?? 0} Annotations
          </Button>
        </div>
      </div>
    </Modal>
  )
}
