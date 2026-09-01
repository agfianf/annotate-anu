import type { ImageData, Annotation, Label, LabelGroup, Project } from '@/types/annotations'

const DB_NAME = 'sam3-annotation-db'
const DB_VERSION = 4 // v4: project scoping

// Every pre-v4 record is adopted by this project so no existing work is orphaned.
export const DEFAULT_PROJECT_ID = 'default-project'

const STORES = {
  IMAGES: 'images',
  ANNOTATIONS: 'annotations',
  LABELS: 'labels',
  LABEL_GROUPS: 'labelGroups',
  PROJECTS: 'projects',
}

const SCOPED_STORES = [STORES.IMAGES, STORES.ANNOTATIONS, STORES.LABELS, STORES.LABEL_GROUPS]

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

      // v3 -> v4: create projects store, backfill projectId, index it
      if (!db.objectStoreNames.contains(STORES.PROJECTS)) {
        const projectsStore = db.createObjectStore(STORES.PROJECTS, { keyPath: 'id' })
        projectsStore.createIndex('createdAt', 'createdAt', { unique: false })
      }

      if (oldVersion < 4) {
        // Label names are only unique within a project now
        if (db.objectStoreNames.contains(STORES.LABELS)) {
          const labelsStore = transaction.objectStore(STORES.LABELS)
          if (labelsStore.indexNames.contains('name')) {
            labelsStore.deleteIndex('name')
          }
          labelsStore.createIndex('name', 'name', { unique: false })
        }

        const projectsStore = transaction.objectStore(STORES.PROJECTS)
        projectsStore.put({
          id: DEFAULT_PROJECT_ID,
          name: 'Default Project',
          description: 'Work created before projects existed',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        })

        SCOPED_STORES.forEach((storeName) => {
          if (!db.objectStoreNames.contains(storeName)) return
          const store = transaction.objectStore(storeName)
          if (!store.indexNames.contains('projectId')) {
            store.createIndex('projectId', 'projectId', { unique: false })
          }
          const req = store.getAll()
          req.onsuccess = () => {
            req.result.forEach((record: any) => {
              if (!record.projectId) {
                record.projectId = DEFAULT_PROJECT_ID
                store.put(record)
              }
            })
          }
        })
      }

      // Migration: Add folder upload fields (v2 -> v3)
      if (oldVersion < 3 && db.objectStoreNames.contains(STORES.IMAGES)) {
        const imagesStore = transaction.objectStore(STORES.IMAGES)
        const getAllRequest = imagesStore.getAll()

        getAllRequest.onsuccess = () => {
          const images = getAllRequest.result
          images.forEach((image: any) => {
            if (!('displayName' in image)) {
              image.displayName = image.name
            }
            imagesStore.put(image)
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

async function getAllByProject<T>(storeName: string, projectId: string): Promise<T[]> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readonly')
    const index = transaction.objectStore(storeName).index('projectId')
    const request = index.getAll(projectId)

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function clearByProject(storeName: string, projectId: string): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readwrite')
    const store = transaction.objectStore(storeName)
    const request = store.index('projectId').getAllKeys(projectId)

    request.onsuccess = () => request.result.forEach((key) => store.delete(key))
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
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
  getAllByProject: (projectId: string) => getAllByProject<ImageData>(STORES.IMAGES, projectId),
  clearByProject: (projectId: string) => clearByProject(STORES.IMAGES, projectId),
  getById: (id: string) => getById<ImageData>(STORES.IMAGES, id),
  add: (image: ImageData) => add(STORES.IMAGES, image),
  update: (image: ImageData) => update(STORES.IMAGES, image),
  remove: (id: string) => remove(STORES.IMAGES, id),
  clear: () => clear(STORES.IMAGES),
}

// Annotation operations
export const annotationStorage = {
  getAll: () => getAll<Annotation>(STORES.ANNOTATIONS),
  getAllByProject: (projectId: string) => getAllByProject<Annotation>(STORES.ANNOTATIONS, projectId),
  clearByProject: (projectId: string) => clearByProject(STORES.ANNOTATIONS, projectId),
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
  getAllByProject: (projectId: string) => getAllByProject<Label>(STORES.LABELS, projectId),
  clearByProject: (projectId: string) => clearByProject(STORES.LABELS, projectId),
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
  getAllByProject: (projectId: string) => getAllByProject<LabelGroup>(STORES.LABEL_GROUPS, projectId),
  clearByProject: (projectId: string) => clearByProject(STORES.LABEL_GROUPS, projectId),
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


// Project operations
export const projectStorage = {
  getAll: async (): Promise<Project[]> => {
    const projects = await getAll<Project>(STORES.PROJECTS)
    return projects.sort((a, b) => b.updatedAt - a.updatedAt)
  },
  getById: (id: string) => getById<Project>(STORES.PROJECTS, id),
  add: (project: Project) => add(STORES.PROJECTS, project),
  update: (project: Project) => update(STORES.PROJECTS, project),

  create: async (name: string, description?: string): Promise<Project> => {
    const now = Date.now()
    const project: Project = { id: `proj-${now}-${Math.random().toString(36).slice(2, 8)}`, name, description, createdAt: now, updatedAt: now }
    await add(STORES.PROJECTS, project)
    return project
  },

  touch: async (id: string): Promise<void> => {
    const project = await getById<Project>(STORES.PROJECTS, id)
    if (project) await update(STORES.PROJECTS, { ...project, updatedAt: Date.now() })
  },

  // Deletes the project and every record scoped to it
  remove: async (id: string): Promise<void> => {
    await Promise.all(SCOPED_STORES.map((store) => clearByProject(store, id)))
    await remove(STORES.PROJECTS, id)
  },

  getStats: async (id: string): Promise<{ images: number; annotations: number; labels: number }> => {
    const [images, annotations, labels] = await Promise.all([
      getAllByProject<ImageData>(STORES.IMAGES, id),
      getAllByProject<Annotation>(STORES.ANNOTATIONS, id),
      getAllByProject<Label>(STORES.LABELS, id),
    ])
    return { images: images.length, annotations: annotations.length, labels: labels.length }
  },

  // Guarantees at least one project exists so the app always has somewhere to write
  ensureDefault: async (): Promise<Project> => {
    const existing = await getAll<Project>(STORES.PROJECTS)
    if (existing.length > 0) return existing[0]
    const now = Date.now()
    const project: Project = { id: DEFAULT_PROJECT_ID, name: 'Default Project', createdAt: now, updatedAt: now }
    await add(STORES.PROJECTS, project)
    return project
  },
}
