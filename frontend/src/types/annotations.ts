// Tool types
export type Tool = 'select' | 'rectangle' | 'polygon' | 'point'

// Annotation types
export type AnnotationType = 'rectangle' | 'polygon' | 'point'

// Label definition
export interface Label {
  id: string
  name: string
  color: string
  createdAt: number
}

// Base annotation interface
export interface BaseAnnotation {
  id: string
  imageId: string
  labelId: string
  type: AnnotationType
  createdAt: number
  updatedAt: number
}

// Rectangle annotation
export interface RectangleAnnotation extends BaseAnnotation {
  type: 'rectangle'
  x: number
  y: number
  width: number
  height: number
}

// Polygon annotation
export interface PolygonAnnotation extends BaseAnnotation {
  type: 'polygon'
  points: Array<{ x: number; y: number }>
}

// Point annotation
export interface PointAnnotation extends BaseAnnotation {
  type: 'point'
  x: number
  y: number
}

// Union type for all annotations
export type Annotation = RectangleAnnotation | PolygonAnnotation | PointAnnotation

// Image metadata
export interface ImageData {
  id: string
  name: string
  width: number
  height: number
  blob: Blob
  createdAt: number
}

// Project (collection of images and annotations)
export interface Project {
  id: string
  name: string
  createdAt: number
  updatedAt: number
}

// Edit mode state
export interface EditMode {
  annotationId: string
  type: AnnotationType
}

// COCO Export types
export interface COCOImage {
  id: number
  file_name: string
  width: number
  height: number
  date_captured?: string
}

export interface COCOCategory {
  id: number
  name: string
  supercategory: string
}

export interface COCOAnnotation {
  id: number
  image_id: number
  category_id: number
  bbox?: [number, number, number, number] // [x, y, width, height]
  segmentation?: number[][] // polygon points
  area?: number
  iscrowd: 0 | 1
}

export interface COCODataset {
  images: COCOImage[]
  annotations: COCOAnnotation[]
  categories: COCOCategory[]
}

// SAM3 types
export interface SAM3TextPromptRequest {
  image: File
  text_prompt: string
  threshold?: number
  return_visualization?: boolean
}

export interface SAM3BboxPromptRequest {
  image: File
  bounding_boxes: Array<[number, number, number, number, number]> // [x1, y1, x2, y2, label]
  threshold?: number
  return_visualization?: boolean
}

export interface SAM3Mask {
  polygons: Array<Array<[number, number]>>
  area: number
}

export interface SAM3Response {
  data: {
    num_objects: number
    boxes: Array<[number, number, number, number]>
    scores: number[]
    masks: SAM3Mask[]
    processing_time_ms: number
    visualization_base64?: string
  }
  message: string
  status_code: number
}
