import type {
  Annotation,
  RectangleAnnotation,
  PolygonAnnotation,
  ImageData,
  Label,
  COCODataset,
  COCOImage,
  COCOAnnotation,
  COCOCategory,
} from '@/types/annotations'

export function exportToCOCO(
  images: ImageData[],
  annotations: Annotation[],
  labels: Label[]
): COCODataset {
  // Convert images
  const cocoImages: COCOImage[] = images.map((img, index) => ({
    id: index + 1,
    file_name: img.name,
    width: img.width,
    height: img.height,
    date_captured: new Date(img.createdAt).toISOString(),
  }))

  // Create image ID mapping
  const imageIdMap = new Map<string, number>()
  images.forEach((img, index) => {
    imageIdMap.set(img.id, index + 1)
  })

  // Create label ID mapping
  const labelIdMap = new Map<string, number>()
  labels.forEach((label, index) => {
    labelIdMap.set(label.id, index + 1)
  })

  // Convert categories
  const cocoCategories: COCOCategory[] = labels.map((label, index) => ({
    id: index + 1,
    name: label.name,
    supercategory: 'object',
  }))

  // Convert annotations
  const cocoAnnotations: COCOAnnotation[] = annotations.map((ann, index) => {
    const imageId = imageIdMap.get(ann.imageId) || 0
    const categoryId = labelIdMap.get(ann.labelId) || 0

    const baseAnnotation = {
      id: index + 1,
      image_id: imageId,
      category_id: categoryId,
      iscrowd: 0 as const,
    }

    if (ann.type === 'rectangle') {
      const rect = ann as RectangleAnnotation
      return {
        ...baseAnnotation,
        bbox: [rect.x, rect.y, rect.width, rect.height] as [number, number, number, number],
        area: rect.width * rect.height,
      }
    } else if (ann.type === 'polygon') {
      const poly = ann as PolygonAnnotation
      const flatPoints = poly.points.flatMap(p => [p.x, p.y])

      // Calculate area using shoelace formula
      let area = 0
      for (let i = 0; i < poly.points.length; i++) {
        const j = (i + 1) % poly.points.length
        area += poly.points[i].x * poly.points[j].y
        area -= poly.points[j].x * poly.points[i].y
      }
      area = Math.abs(area) / 2

      return {
        ...baseAnnotation,
        segmentation: [flatPoints],
        area,
      }
    } else {
      // Point annotation (not standard COCO, but included for completeness)
      return {
        ...baseAnnotation,
        bbox: [ann.x - 5, ann.y - 5, 10, 10] as [number, number, number, number],
        area: 100,
      }
    }
  })

  return {
    images: cocoImages,
    annotations: cocoAnnotations,
    categories: cocoCategories,
  }
}

export function downloadCOCO(dataset: COCODataset, filename: string = 'annotations.json') {
  const json = JSON.stringify(dataset, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)

  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)

  URL.revokeObjectURL(url)
}
