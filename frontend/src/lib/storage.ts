import type { ImageData, Annotation, Label, LabelGroup } from '@/types/annotations'

const DB_NAME = 'sam3-annotation-db'
const DB_VERSION = 2 // Incremented for label groups feature

// Object store names
const STORES = {
  IMAGES: 'images',
  ANNOTATIONS: 'annotations',
  LABELS: 'labels',
  LABEL_GROUPS: 'labelGroups',
}

// Initialize IndexedDB
export function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result
      const transaction = (event.target as IDBOpenDBRequest).transaction!
      const oldVersion = event.oldVersion

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

      // Create label groups store (v2)
      if (!db.objectStoreNames.contains(STORES.LABEL_GROUPS)) {
        const labelGroupsStore = db.createObjectStore(STORES.LABEL_GROUPS, { keyPath: 'id' })
        labelGroupsStore.createIndex('createdAt', 'createdAt', { unique: false })
      }

      // Migration: Update existing labels with new fields (v1 -> v2)
      if (oldVersion < 2 && db.objectStoreNames.contains(STORES.LABELS)) {
        const labelsStore = transaction.objectStore(STORES.LABELS)
        const getAllRequest = labelsStore.getAll()

        getAllRequest.onsuccess = () => {
          const labels = getAllRequest.result as Label[]
          labels.forEach((label) => {
            // Add default values for new optional fields
            if (label.isVisible === undefined) {
              label.isVisible = true
            }
            if (label.groupId === undefined) {
              label.groupId = undefined // Explicitly set to undefined (ungrouped)
            }
            if (label.sortOrder === undefined) {
              label.sortOrder = 0
            }
            labelsStore.put(label)
          })
        }
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

async function clear(storeName: string): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readwrite')
    const store = transaction.objectStore(storeName)
    const request = store.clear()

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
  clear: () => clear(STORES.IMAGES),
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
  addMany: async (annotations: Annotation[]): Promise<void> => {
    if (annotations.length === 0) return

    const db = await openDB()
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORES.ANNOTATIONS, 'readwrite')
      const store = transaction.objectStore(STORES.ANNOTATIONS)

      // Queue all additions in single transaction
      annotations.forEach(annotation => {
        store.add(annotation)
      })

      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error)
    })
  },
  update: (annotation: Annotation) => update(STORES.ANNOTATIONS, annotation),
  remove: (id: string) => remove(STORES.ANNOTATIONS, id),
  removeMany: async (ids: string[]): Promise<void> => {
    await Promise.all(ids.map(id => annotationStorage.remove(id)))
  },
  removeByImageId: async (imageId: string): Promise<void> => {
    const annotations = await annotationStorage.getByImageId(imageId)
    await Promise.all(annotations.map(a => annotationStorage.remove(a.id)))
  },
  clear: () => clear(STORES.ANNOTATIONS),

  // Bulk update operations - optimized with single transaction
  updateMany: async (annotations: Annotation[]): Promise<void> => {
    if (annotations.length === 0) return

    const db = await openDB()
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORES.ANNOTATIONS, 'readwrite')
      const store = transaction.objectStore(STORES.ANNOTATIONS)

      // Queue all updates in single transaction
      annotations.forEach(annotation => {
        store.put(annotation)
      })

      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error)
    })
  },

  // Bulk change label for multiple annotations
  bulkChangeLabel: async (annotationIds: string[], newLabelId: string): Promise<void> => {
    const annotations = await annotationStorage.getAll()
    const toUpdate = annotations.filter(ann => annotationIds.includes(ann.id))
    const updated = toUpdate.map(ann => ({
      ...ann,
      labelId: newLabelId,
      updatedAt: Date.now(),
    }))
    await annotationStorage.updateMany(updated)
  },

  // Bulk toggle visibility for multiple annotations
  bulkToggleVisibility: async (annotationIds: string[]): Promise<void> => {
    const annotations = await annotationStorage.getAll()
    const toUpdate = annotations.filter(ann => annotationIds.includes(ann.id))
    const updated = toUpdate.map(ann => ({
      ...ann,
      isVisible: !(ann.isVisible ?? true),
      updatedAt: Date.now(),
    }))
    await annotationStorage.updateMany(updated)
  },
}

// Label operations
export const labelStorage = {
  getAll: () => getAll<Label>(STORES.LABELS),
  getById: (id: string) => getById<Label>(STORES.LABELS, id),
  add: (label: Label) => add(STORES.LABELS, label),
  update: (label: Label) => update(STORES.LABELS, label),
  remove: (id: string) => remove(STORES.LABELS, id),
  clear: () => clear(STORES.LABELS),

  // Get labels grouped by their groupId
  getGrouped: async (): Promise<Record<string, Label[]>> => {
    const labels = await labelStorage.getAll()
    const grouped: Record<string, Label[]> = {}

    labels.forEach(label => {
      const groupId = label.groupId || 'ungrouped'
      if (!grouped[groupId]) {
        grouped[groupId] = []
      }
      grouped[groupId].push(label)
    })

    // Sort labels within each group by sortOrder
    Object.values(grouped).forEach(group => {
      group.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
    })

    return grouped
  },

  // Initialize default labels if none exist (disabled - starts empty)
  initializeDefaults: async (): Promise<void> => {
    // No default labels - user must create them
  },
}

// Label group operations
export const labelGroupStorage = {
  getAll: () => getAll<LabelGroup>(STORES.LABEL_GROUPS),
  getById: (id: string) => getById<LabelGroup>(STORES.LABEL_GROUPS, id),
  add: (group: LabelGroup) => add(STORES.LABEL_GROUPS, group),
  update: (group: LabelGroup) => update(STORES.LABEL_GROUPS, group),
  remove: async (id: string): Promise<void> => {
    // When removing a group, ungroup all labels in that group
    const labels = await labelStorage.getAll()
    const labelsInGroup = labels.filter(l => l.groupId === id)

    await Promise.all(labelsInGroup.map(label => {
      label.groupId = undefined
      return labelStorage.update(label)
    }))

    return remove(STORES.LABEL_GROUPS, id)
  },
  clear: () => clear(STORES.LABEL_GROUPS),
}

// LocalStorage keys for UI state persistence
const LOCAL_STORAGE_KEYS = {
  GROUP_EXPANDED_STATES: 'sam3-group-expanded-states',
}

// Group UI state utilities (localStorage-based for lightweight persistence)
export const groupUIState = {
  // Get all expanded states
  getExpandedStates: (): Record<string, boolean> => {
    try {
      const stored = localStorage.getItem(LOCAL_STORAGE_KEYS.GROUP_EXPANDED_STATES)
      return stored ? JSON.parse(stored) : {}
    } catch {
      return {}
    }
  },

  // Set expanded state for a specific group
  setExpandedState: (groupId: string, isExpanded: boolean): void => {
    try {
      const states = groupUIState.getExpandedStates()
      states[groupId] = isExpanded
      localStorage.setItem(LOCAL_STORAGE_KEYS.GROUP_EXPANDED_STATES, JSON.stringify(states))
    } catch (error) {
      console.error('Failed to save group expanded state:', error)
    }
  },

  // Get expanded state for a specific group (default: true)
  getExpandedState: (groupId: string): boolean => {
    const states = groupUIState.getExpandedStates()
    return states[groupId] ?? true // Default to expanded
  },

  // Clear all expanded states
  clearExpandedStates: (): void => {
    try {
      localStorage.removeItem(LOCAL_STORAGE_KEYS.GROUP_EXPANDED_STATES)
    } catch (error) {
      console.error('Failed to clear group expanded states:', error)
    }
  },
}
