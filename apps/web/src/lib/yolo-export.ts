import JSZip from 'jszip'
import type {
  Annotation,
  RectangleAnnotation,
  PolygonAnnotation,
  PointAnnotation,
  ImageData,
  Label,
} from '@/types/annotations'

export type YOLOTask = 'detect' | 'segment'

export interface YOLOExportData {
  classesContent: string
  annotationFiles: Map<string, string> // image filename -> annotation content
  task: YOLOTask
  skippedPoints: number // point annotations dropped in segment mode
}

/**
 * True when the dataset contains at least one polygon, meaning a detect-only
 * export would silently flatten masks into bounding boxes.
 */
export function hasPolygonAnnotations(annotations: Annotation[]): boolean {
  return annotations.some(ann => ann.type === 'polygon' && ann.points.length >= 3)
}

/**
 * Convert annotations to YOLO format
 * detect:  <class-id> <x-center> <y-center> <width> <height>   (normalized 0-1)
 * segment: <class-id> <x1> <y1> <x2> <y2> ...                  (normalized 0-1)
 */
export function exportToYOLO(
  images: ImageData[],
  annotations: Annotation[],
  labels: Label[],
  task: YOLOTask = 'detect'
): YOLOExportData {
  // Create label ID to index mapping
  const labelIdMap = new Map<string, number>()
  labels.forEach((label, index) => {
    labelIdMap.set(label.id, index)
  })

  // Create classes.txt content (one label name per line)
  const classesContent = labels.map(label => label.name).join('\n')

  // Group annotations by image
  const annotationsByImage = new Map<string, Annotation[]>()
  annotations.forEach(ann => {
    const imageAnns = annotationsByImage.get(ann.imageId) || []
    imageAnns.push(ann)
    annotationsByImage.set(ann.imageId, imageAnns)
  })

  // Create annotation files for each image
  const annotationFiles = new Map<string, string>()

  let skippedPoints = 0

  images.forEach(image => {
    const imageAnns = annotationsByImage.get(image.id) || []
    const yoloLines: string[] = []

    imageAnns.forEach(ann => {
      const classId = labelIdMap.get(ann.labelId) ?? 0
      if (task === 'segment' && ann.type === 'point') {
        skippedPoints++
        return
      }
      const yoloLine = task === 'segment'
        ? convertAnnotationToYOLOSeg(ann, image.width, image.height, classId)
        : convertAnnotationToYOLO(ann, image.width, image.height, classId)
      if (yoloLine) {
        yoloLines.push(yoloLine)
      }
    })

    // Use image filename without extension for annotation file
    const imageNameWithoutExt = image.name.replace(/\.[^/.]+$/, '')
    const annotationFileName = `${imageNameWithoutExt}.txt`
    annotationFiles.set(annotationFileName, yoloLines.join('\n'))
  })

  return {
    classesContent,
    annotationFiles,
    task,
    skippedPoints,
  }
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))

/**
 * Convert a single annotation to a YOLO segmentation polygon line.
 * Rectangles are emitted as their four corners so mixed datasets stay usable.
 */
function convertAnnotationToYOLOSeg(
  annotation: Annotation,
  imageWidth: number,
  imageHeight: number,
  classId: number
): string | null {
  let points: Array<{ x: number; y: number }>

  if (annotation.type === 'polygon') {
    points = (annotation as PolygonAnnotation).points
    if (points.length < 3) return null
  } else if (annotation.type === 'rectangle') {
    const rect = annotation as RectangleAnnotation
    // Normalize negative width/height from drags made right-to-left or bottom-to-top
    const x0 = Math.min(rect.x, rect.x + rect.width)
    const x1 = Math.max(rect.x, rect.x + rect.width)
    const y0 = Math.min(rect.y, rect.y + rect.height)
    const y1 = Math.max(rect.y, rect.y + rect.height)
    points = [
      { x: x0, y: y0 },
      { x: x1, y: y0 },
      { x: x1, y: y1 },
      { x: x0, y: y1 },
    ]
  } else {
    return null
  }

  const coords = points
    .map(p => `${clamp01(p.x / imageWidth).toFixed(6)} ${clamp01(p.y / imageHeight).toFixed(6)}`)
    .join(' ')

  return `${classId} ${coords}`
}

/**
 * Convert a single annotation to YOLO format line
 */
function convertAnnotationToYOLO(
  annotation: Annotation,
  imageWidth: number,
  imageHeight: number,
  classId: number
): string | null {
  if (annotation.type === 'rectangle') {
    const rect = annotation as RectangleAnnotation

    // Convert to normalized center coordinates
    const xCenter = (rect.x + rect.width / 2) / imageWidth
    const yCenter = (rect.y + rect.height / 2) / imageHeight
    const width = rect.width / imageWidth
    const height = rect.height / imageHeight

    return `${classId} ${xCenter.toFixed(6)} ${yCenter.toFixed(6)} ${width.toFixed(6)} ${height.toFixed(6)}`
  } else if (annotation.type === 'polygon') {
    const poly = annotation as PolygonAnnotation

    if (poly.points.length === 0) return null

    // Calculate bounding box from polygon points
    const xs = poly.points.map(p => p.x)
    const ys = poly.points.map(p => p.y)

    const minX = Math.min(...xs)
    const maxX = Math.max(...xs)
    const minY = Math.min(...ys)
    const maxY = Math.max(...ys)

    const width = maxX - minX
    const height = maxY - minY

    // Convert to normalized center coordinates
    const xCenter = (minX + width / 2) / imageWidth
    const yCenter = (minY + height / 2) / imageHeight
    const normWidth = width / imageWidth
    const normHeight = height / imageHeight

    return `${classId} ${xCenter.toFixed(6)} ${yCenter.toFixed(6)} ${normWidth.toFixed(6)} ${normHeight.toFixed(6)}`
  } else if (annotation.type === 'point') {
    const point = annotation as PointAnnotation

    // Treat point as a small box (10x10 pixels)
    const boxSize = 10
    const xCenter = point.x / imageWidth
    const yCenter = point.y / imageHeight
    const width = boxSize / imageWidth
    const height = boxSize / imageHeight

    return `${classId} ${xCenter.toFixed(6)} ${yCenter.toFixed(6)} ${width.toFixed(6)} ${height.toFixed(6)}`
  }

  return null
}

/**
 * Download YOLO export as a ZIP file
 */
export async function downloadYOLOFiles(exportData: YOLOExportData) {
  const zip = new JSZip()

  // Add classes.txt to the zip
  zip.file('classes.txt', exportData.classesContent)

  // Create labels folder and add each annotation file
  const labelsFolder = zip.folder('labels')
  if (labelsFolder) {
    exportData.annotationFiles.forEach((content, filename) => {
      labelsFolder.file(filename, content)
    })
  }

  // Generate the zip file
  const zipBlob = await zip.generateAsync({ type: 'blob' })

  // Download the zip file
  const url = URL.createObjectURL(zipBlob)
  const link = document.createElement('a')
  link.href = url
  link.download = `yolo_${exportData.task}_annotations_${Date.now()}.zip`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

/**
 * Download a single YOLO annotation file
 */
export function downloadTextFile(content: string, filename: string) {
  const blob = new Blob([content], { type: 'text/plain' })
  const url = URL.createObjectURL(blob)

  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)

  URL.revokeObjectURL(url)
}

/**
 * Get a preview of YOLO export format
 */
export function getYOLOPreview(
  images: ImageData[],
  annotations: Annotation[],
  labels: Label[],
  maxLines: number = 10,
  task: YOLOTask = 'detect'
): string {
  const exportData = exportToYOLO(images, annotations, labels, task)

  const preview: string[] = []
  preview.push(
    task === 'segment'
      ? '# format: <class-id> <x1> <y1> <x2> <y2> ... (normalized polygon)'
      : '# format: <class-id> <x-center> <y-center> <width> <height> (normalized)'
  )
  if (exportData.skippedPoints > 0) {
    preview.push(`# ${exportData.skippedPoints} point annotation(s) omitted - not representable as masks`)
  }
  preview.push('')
  preview.push('# classes.txt')
  preview.push(exportData.classesContent)
  preview.push('')

  // Show preview of first annotation file
  const firstFile = Array.from(exportData.annotationFiles.entries())[0]
  if (firstFile) {
    const [filename, content] = firstFile
    preview.push(`# ${filename}`)
    const lines = content.split('\n')
    preview.push(...lines.slice(0, maxLines))
    if (lines.length > maxLines) {
      preview.push(`... (${lines.length - maxLines} more lines)`)
    }
  }

  return preview.join('\n')
}
