import type { ImageData, Annotation, Label } from '@/types/annotations'

const DB_NAME = 'sam3-annotation-db'
const DB_VERSION = 1

// Object store names
const STORES = {
  IMAGES: 'images',
  ANNOTATIONS: 'annotations',
  LABELS: 'labels',
}

// Initialize IndexedDB
export function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result

      // Create images store
      if (!db.objectStoreNames.contains(STORES.IMAGES)) {
        const imagesStore = db.createObjectStore(STORES.IMAGES, { keyPath: 'id' })
        imagesStore.createIndex('createdAt', 'createdAt', { unique: false })
      }

      // Create annotations store
      if (!db.objectStoreNames.contains(STORES.ANNOTATIONS)) {
        const annotationsStore = db.createObjectStore(STORES.ANNOTATIONS, { keyPath: 'id' })
        annotationsStore.createIndex('imageId', 'imageId', { unique: false })
        annotationsStore.createIndex('labelId', 'labelId', { unique: false })
      }

      // Create labels store
      if (!db.objectStoreNames.contains(STORES.LABELS)) {
        const labelsStore = db.createObjectStore(STORES.LABELS, { keyPath: 'id' })
        labelsStore.createIndex('name', 'name', { unique: true })
      }
    }
  })
}

// Generic CRUD operations
async function getAll<T>(storeName: string): Promise<T[]> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readonly')
    const store = transaction.objectStore(storeName)
    const request = store.getAll()

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function getById<T>(storeName: string, id: string): Promise<T | undefined> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readonly')
    const store = transaction.objectStore(storeName)
    const request = store.get(id)

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function add<T>(storeName: string, item: T): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readwrite')
    const store = transaction.objectStore(storeName)
    const request = store.add(item)

    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
}

async function update<T>(storeName: string, item: T): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readwrite')
    const store = transaction.objectStore(storeName)
    const request = store.put(item)

    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
}

async function remove(storeName: string, id: string): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readwrite')
    const store = transaction.objectStore(storeName)
    const request = store.delete(id)

    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
}

// Image operations
export const imageStorage = {
  getAll: () => getAll<ImageData>(STORES.IMAGES),
  getById: (id: string) => getById<ImageData>(STORES.IMAGES, id),
  add: (image: ImageData) => add(STORES.IMAGES, image),
  update: (image: ImageData) => update(STORES.IMAGES, image),
  remove: (id: string) => remove(STORES.IMAGES, id),
}

// Annotation operations
export const annotationStorage = {
  getAll: () => getAll<Annotation>(STORES.ANNOTATIONS),
  getById: (id: string) => getById<Annotation>(STORES.ANNOTATIONS, id),
  getByImageId: async (imageId: string): Promise<Annotation[]> => {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORES.ANNOTATIONS, 'readonly')
      const store = transaction.objectStore(STORES.ANNOTATIONS)
      const index = store.index('imageId')
      const request = index.getAll(imageId)

      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  },
  add: (annotation: Annotation) => add(STORES.ANNOTATIONS, annotation),
  update: (annotation: Annotation) => update(STORES.ANNOTATIONS, annotation),
  remove: (id: string) => remove(STORES.ANNOTATIONS, id),
  removeByImageId: async (imageId: string): Promise<void> => {
    const annotations = await annotationStorage.getByImageId(imageId)
    await Promise.all(annotations.map(a => annotationStorage.remove(a.id)))
  },
}

// Label operations
export const labelStorage = {
  getAll: () => getAll<Label>(STORES.LABELS),
  getById: (id: string) => getById<Label>(STORES.LABELS, id),
  add: (label: Label) => add(STORES.LABELS, label),
  update: (label: Label) => update(STORES.LABELS, label),
  remove: (id: string) => remove(STORES.LABELS, id),

  // Initialize default labels if none exist
  initializeDefaults: async (): Promise<void> => {
    const labels = await labelStorage.getAll()
    if (labels.length === 0) {
      const defaultLabels: Label[] = [
        { id: '1', name: 'Object', color: '#f97316', createdAt: Date.now() },
        { id: '2', name: 'Person', color: '#3b82f6', createdAt: Date.now() },
        { id: '3', name: 'Vehicle', color: '#10b981', createdAt: Date.now() },
        { id: '4', name: 'Animal', color: '#8b5cf6', createdAt: Date.now() },
        { id: '5', name: 'Background', color: '#6b7280', createdAt: Date.now() },
      ]
      await Promise.all(defaultLabels.map(label => labelStorage.add(label)))
    }
  },
}
