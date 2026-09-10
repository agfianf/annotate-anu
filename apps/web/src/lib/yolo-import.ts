import type { Annotation, ImageData, Label, PolygonAnnotation, RectangleAnnotation } from '@/types/annotations'

export interface ParsedClasses {
  names: string[]
  source: string
}

export interface ImportPreview {
  classes: string[]
  matchedImages: number
  unmatchedLabelFiles: string[]
  imagesWithoutLabels: string[]
  detectionCount: number
  segmentationCount: number
  invalidLines: number
}

export interface ImportResult {
  labels: Label[]
  annotations: Annotation[]
  preview: ImportPreview
}

const stripExt = (name: string) => name.replace(/\.[^/.]+$/, '')
const baseName = (path: string) => stripExt(path.split('/').pop() || path)

/** Reads class names from a YOLO data.yaml (list or index-map form) or a classes.txt. */
export function parseClassFile(filename: string, content: string): ParsedClasses | null {
  if (/\.ya?ml$/i.test(filename)) {
    const names: Array<{ index: number; name: string }> = []
    const lines = content.split('\n')
    const namesStart = lines.findIndex(l => /^\s*names\s*:/.test(l))
    if (namesStart === -1) return null

    const inline = lines[namesStart].match(/names\s*:\s*\[(.*)\]/)
    if (inline) {
      const parsed = inline[1].split(',').map(s => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean)
      return { names: parsed, source: filename }
    }

    for (let i = namesStart + 1; i < lines.length; i++) {
      const line = lines[i]
      if (line.trim() === '') continue
      if (!/^\s+/.test(line)) break

      const indexed = line.match(/^\s+(\d+)\s*:\s*(.+?)\s*$/)
      if (indexed) {
        names.push({ index: parseInt(indexed[1], 10), name: indexed[2].replace(/^['"]|['"]$/g, '') })
        continue
      }
      const listed = line.match(/^\s+-\s*(.+?)\s*$/)
      if (listed) {
        names.push({ index: names.length, name: listed[1].replace(/^['"]|['"]$/g, '') })
      }
    }
    if (names.length === 0) return null
    names.sort((a, b) => a.index - b.index)
    return { names: names.map(n => n.name), source: filename }
  }

  const names = content.split('\n').map(l => l.trim()).filter(Boolean)
  return names.length > 0 ? { names, source: filename } : null
}

const PALETTE = ['#10B981', '#3B82F6', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#14B8A6', '#F97316', '#6366F1', '#84CC16']

/**
 * Parses YOLO .txt label files against existing images, matching on filename stem.
 * Lines with 5 fields are boxes; more than 5 (odd count) are segmentation polygons.
 */
export function parseYOLOLabels(
  labelFiles: Map<string, string>,
  images: ImageData[],
  classNames: string[],
  existingLabels: Label[]
): ImportResult {
  const imagesByStem = new Map<string, ImageData>()
  images.forEach(img => imagesByStem.set(baseName(img.name), img))

  const labelByName = new Map(existingLabels.map(l => [l.name, l]))
  const createdLabels: Label[] = []
  const now = Date.now()

  const resolveLabel = (classId: number): Label => {
    const name = classNames[classId] ?? `class_${classId}`
    const existing = labelByName.get(name)
    if (existing) return existing
    const label: Label = {
      id: `label-import-${now}-${classId}`,
      name,
      color: PALETTE[classId % PALETTE.length],
      createdAt: now,
      isVisible: true,
    }
    labelByName.set(name, label)
    createdLabels.push(label)
    return label
  }

  const annotations: Annotation[] = []
  const unmatchedLabelFiles: string[] = []
  const matchedStems = new Set<string>()
  let detectionCount = 0
  let segmentationCount = 0
  let invalidLines = 0
  let seq = 0

  labelFiles.forEach((content, filename) => {
    const stem = baseName(filename)
    const image = imagesByStem.get(stem)
    if (!image) {
      unmatchedLabelFiles.push(filename)
      return
    }
    matchedStems.add(stem)

    content.split('\n').forEach(rawLine => {
      const line = rawLine.trim()
      if (!line || line.startsWith('#')) return

      const parts = line.split(/\s+/).map(Number)
      if (parts.some(Number.isNaN) || parts.length < 5) {
        invalidLines++
        return
      }

      const label = resolveLabel(parts[0])
      const values = parts.slice(1)
      const id = `ann-import-${now}-${seq++}`

      if (values.length === 4) {
        const [xc, yc, w, h] = values
        const rect: RectangleAnnotation = {
          id,
          imageId: image.id,
          labelId: label.id,
          type: 'rectangle',
          x: (xc - w / 2) * image.width,
          y: (yc - h / 2) * image.height,
          width: w * image.width,
          height: h * image.height,
          createdAt: now,
          updatedAt: now,
          source: 'import',
        }
        annotations.push(rect)
        detectionCount++
        return
      }

      if (values.length >= 6 && values.length % 2 === 0) {
        const points = []
        for (let i = 0; i < values.length; i += 2) {
          points.push({ x: values[i] * image.width, y: values[i + 1] * image.height })
        }
        const poly: PolygonAnnotation = {
          id,
          imageId: image.id,
          labelId: label.id,
          type: 'polygon',
          points,
          createdAt: now,
          updatedAt: now,
          source: 'import',
        }
        annotations.push(poly)
        segmentationCount++
        return
      }

      invalidLines++
    })
  })

  const imagesWithoutLabels = images.filter(img => !matchedStems.has(baseName(img.name))).map(img => img.name)

  return {
    labels: createdLabels,
    annotations,
    preview: {
      classes: classNames,
      matchedImages: matchedStems.size,
      unmatchedLabelFiles,
      imagesWithoutLabels,
      detectionCount,
      segmentationCount,
      invalidLines,
    },
  }
}
