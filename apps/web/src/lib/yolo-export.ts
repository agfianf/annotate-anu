import JSZip from 'jszip'
import type {
  Annotation,
  RectangleAnnotation,
  PolygonAnnotation,
  PointAnnotation,
  ImageData,
  Label,
} from '@/types/annotations'

export interface YOLOExportData {
  classesContent: string
  annotationFiles: Map<string, string> // image filename -> annotation content
}

/**
 * Convert annotations to YOLO format
 * YOLO format: <class-id> <x-center> <y-center> <width> <height> (all normalized 0-1)
 */
export function exportToYOLO(
  images: ImageData[],
  annotations: Annotation[],
  labels: Label[]
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

  images.forEach(image => {
    const imageAnns = annotationsByImage.get(image.id) || []
    const yoloLines: string[] = []

    imageAnns.forEach(ann => {
      const classId = labelIdMap.get(ann.labelId) ?? 0
      const yoloLine = convertAnnotationToYOLO(ann, image.width, image.height, classId)
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
  }
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

    // YOLO segmentation format: <class-id> <x1> <y1> <x2> <y2> ... <xn> <yn> (all normalized 0-1)
    // Export polygon points as normalized coordinates for segmentation
    const normalizedPoints = poly.points
      .map(p => {
        const normX = (p.x / imageWidth).toFixed(6)
        const normY = (p.y / imageHeight).toFixed(6)
        return `${normX} ${normY}`
      })
      .join(' ')

    return `${classId} ${normalizedPoints}`
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
 * Download YOLO export as a ZIP file with train/val/test split
 */
export async function downloadYOLOFiles(
  exportData: YOLOExportData,
  images: ImageData[],
  splitConfig: { train: number; val: number; test: number }
) {
  const zip = new JSZip()

  // Add classes.txt to the root
  zip.file('classes.txt', exportData.classesContent)

  // Shuffle images for random split
  const shuffledImages = [...images].sort(() => Math.random() - 0.5)

  const trainCount = Math.floor(shuffledImages.length * splitConfig.train)
  const valCount = Math.floor(shuffledImages.length * splitConfig.val)

  const trainImages = shuffledImages.slice(0, trainCount)
  const valImages = shuffledImages.slice(trainCount, trainCount + valCount)
  const testImages = shuffledImages.slice(trainCount + valCount)

  // Helper function to add images and labels for a split
  const addSplit = async (splitName: string, imageList: ImageData[]) => {
    if (imageList.length === 0) return

    const imagesFolder = zip.folder(`${splitName}/images`)
    const labelsFolder = zip.folder(`${splitName}/labels`)

    if (imagesFolder && labelsFolder) {
      for (const img of imageList) {
        // Add image
        const arrayBuffer = await img.blob.arrayBuffer()
        imagesFolder.file(img.name, arrayBuffer)

        // Add corresponding label file
        const imageNameWithoutExt = img.name.replace(/\.[^/.]+$/, '')
        const labelFileName = `${imageNameWithoutExt}.txt`
        const labelContent = exportData.annotationFiles.get(labelFileName) || ''
        labelsFolder.file(labelFileName, labelContent)
      }
    }
  }

  // Add all splits
  await addSplit('train', trainImages)
  await addSplit('val', valImages)
  await addSplit('test', testImages)

  // Create data.yaml file
  const classNames = exportData.classesContent.split('\n').filter(name => name.trim() !== '')
  const dataYaml = `# YOLO Dataset Configuration
# Generated by AnnotateANU

train: train/images
val: val/images
test: test/images

nc: ${classNames.length}
names: [${classNames.map(name => `'${name}'`).join(', ')}]
`

  zip.file('data.yaml', dataYaml)
  
  // Also create a README with instructions
  const readme = `# YOLO Dataset Export from AnnotateANU

## Dataset Structure
\`\`\`
dataset/
├── train/
│   ├── images/
│   └── labels/
├── val/
│   ├── images/
│   └── labels/
├── test/
│   ├── images/
│   └── labels/
├── data.yaml
├── classes.txt
└── README.md
\`\`\`

## Usage Instructions

### 1. Extract this zip file
\`\`\`bash
unzip yolo_dataset_*.zip -d /path/to/your/dataset
cd /path/to/your/dataset
\`\`\`

### 2. Train your model
\`\`\`bash
# Run from the dataset directory
yolo segment train data=data.yaml model=yolo11m-seg.pt epochs=100 device=0

# Or specify absolute path
yolo segment train data=/absolute/path/to/dataset/data.yaml model=yolo11m-seg.pt epochs=100 device=0
\`\`\`

## Dataset Split
- Train: ${trainImages.length} images (${Math.round(splitConfig.train * 100)}%)
- Val: ${valImages.length} images (${Math.round(splitConfig.val * 100)}%)
- Test: ${testImages.length} images (${Math.round(splitConfig.test * 100)}%)

**Total: ${images.length} images**

## Classes (${classNames.length} total)
${classNames.map((name, idx) => `${idx}: ${name}`).join('\n')}

## Notes
- All annotations are in YOLO segmentation format (polygon coordinates)
- Images and labels are automatically paired by filename
- Coordinates are normalized (0-1 range)
`

  zip.file('README.md', readme)

  // Generate the zip file
  const zipBlob = await zip.generateAsync({ type: 'blob' })

  // Download the zip file
  const url = URL.createObjectURL(zipBlob)
  const link = document.createElement('a')
  link.href = url
  link.download = `yolo_dataset_${Date.now()}.zip`
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
  maxLines: number = 10
): string {
  const exportData = exportToYOLO(images, annotations, labels)

  const preview: string[] = []
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
