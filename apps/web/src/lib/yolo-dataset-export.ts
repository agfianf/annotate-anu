import JSZip from 'jszip'
import type { Annotation, ImageData, Label } from '@/types/annotations'
import { exportToYOLO, type YOLOTask } from './yolo-export'

export type SplitName = 'train' | 'val' | 'test'

export interface SplitRatios {
  train: number
  val: number
  test: number
}

export interface DatasetExportOptions {
  task: YOLOTask
  ratios: SplitRatios
  seed: number
  datasetName: string
  includeEmptyImages: boolean // images with no annotations become background samples
}

export interface DatasetExportSummary {
  counts: Record<SplitName, number>
  totalImages: number
  totalAnnotations: number
  skippedPoints: number
  classes: string[]
}

export const DEFAULT_SPLIT_RATIOS: SplitRatios = { train: 0.7, val: 0.2, test: 0.1 }

// Deterministic PRNG so the same seed always reproduces the same split
function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function shuffled<T>(items: T[], seed: number): T[] {
  const rand = mulberry32(seed)
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/**
 * Largest-remainder allocation so the split counts always sum to the total
 * and every non-zero ratio gets at least one image when there are enough.
 */
export function splitImages(
  images: ImageData[],
  ratios: SplitRatios,
  seed: number
): Record<SplitName, ImageData[]> {
  const order = shuffled(images, seed)
  const total = order.length
  const names: SplitName[] = ['train', 'val', 'test']
  const sum = ratios.train + ratios.val + ratios.test
  const result: Record<SplitName, ImageData[]> = { train: [], val: [], test: [] }
  if (total === 0 || sum <= 0) return result

  const exact = names.map(n => (ratios[n] / sum) * total)
  const counts = exact.map(Math.floor)
  let remaining = total - counts.reduce((a, b) => a + b, 0)

  const byRemainder = names
    .map((n, i) => ({ i, frac: exact[i] - counts[i] }))
    .sort((a, b) => b.frac - a.frac)
  for (let k = 0; remaining > 0; k++, remaining--) {
    counts[byRemainder[k % names.length].i]++
  }

  let cursor = 0
  names.forEach((name, i) => {
    result[name] = order.slice(cursor, cursor + counts[i])
    cursor += counts[i]
  })
  return result
}

function buildDataYaml(datasetName: string, labels: Label[], splits: Record<SplitName, ImageData[]>): string {
  const lines = [
    `# ${datasetName}`,
    'path: .',
    'train: images/train',
    `val: images/${splits.val.length > 0 ? 'val' : 'train'}`,
  ]
  if (splits.test.length > 0) lines.push('test: images/test')
  lines.push('', 'names:')
  labels.forEach((label, i) => lines.push(`  ${i}: ${label.name}`))
  lines.push('')
  return lines.join('\n')
}

const stripExt = (name: string) => name.replace(/\.[^/.]+$/, '')

export async function buildYOLODatasetZip(
  images: ImageData[],
  annotations: Annotation[],
  labels: Label[],
  options: DatasetExportOptions
): Promise<{ blob: Blob; summary: DatasetExportSummary }> {
  const annotatedIds = new Set(annotations.map(a => a.imageId))
  const usable = options.includeEmptyImages ? images : images.filter(img => annotatedIds.has(img.id))

  const splits = splitImages(usable, options.ratios, options.seed)
  const zip = new JSZip()

  let skippedPoints = 0
  let totalAnnotations = 0

  for (const name of ['train', 'val', 'test'] as SplitName[]) {
    const splitImagesList = splits[name]
    if (splitImagesList.length === 0) continue

    const splitIds = new Set(splitImagesList.map(i => i.id))
    const splitAnns = annotations.filter(a => splitIds.has(a.imageId))
    const exported = exportToYOLO(splitImagesList, splitAnns, labels, options.task)
    skippedPoints += exported.skippedPoints
    totalAnnotations += splitAnns.length

    const imagesFolder = zip.folder(`images/${name}`)!
    const labelsFolder = zip.folder(`labels/${name}`)!

    for (const image of splitImagesList) {
      imagesFolder.file(image.name, image.blob)
      labelsFolder.file(`${stripExt(image.name)}.txt`, exported.annotationFiles.get(`${stripExt(image.name)}.txt`) ?? '')
    }
  }

  zip.file('data.yaml', buildDataYaml(options.datasetName, labels, splits))
  zip.file('classes.txt', labels.map(l => l.name).join('\n'))

  const blob = await zip.generateAsync({ type: 'blob' })
  return {
    blob,
    summary: {
      counts: { train: splits.train.length, val: splits.val.length, test: splits.test.length },
      totalImages: usable.length,
      totalAnnotations,
      skippedPoints,
      classes: labels.map(l => l.name),
    },
  }
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
