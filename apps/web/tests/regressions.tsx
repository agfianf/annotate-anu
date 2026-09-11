import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { useAutoSave } from '../src/hooks/useAutoSave'
import { useAuthenticatedImage } from '../src/hooks/useAuthenticatedImage'
import { useImagePreloader } from '../src/hooks/useImagePreloader'
import { jobsApi } from '../src/lib/api-client'
import type { Annotation, ImageData } from '../src/types/annotations'

declare global {
  interface Window { regressionResult?: { passed: string[]; error?: string } }
}

let current: ReturnType<typeof useAutoSave>
let preloader: ReturnType<typeof useImagePreloader>
let image: ReturnType<typeof useAuthenticatedImage>
let setImageUrl: (url: string) => void
export function Harness() {
  const save = useAutoSave('job-1', { enabled: false, intervalMs: 100000 })
  const preload = useImagePreloader([])
  const [url, setUrl] = useState<string | null>(null)
  const authenticated = useAuthenticatedImage(url)
  useEffect(() => {
    current = save
    preloader = preload
    image = authenticated
    setImageUrl = setUrl
  }, [save, preload, authenticated])
  return null
}

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message)
}
async function until(predicate: () => boolean) {
  const deadline = Date.now() + 5000
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('Timed out waiting for React state')
    await new Promise(resolve => setTimeout(resolve, 10))
  }
}
const annotation = (id: string, x = 10): Annotation => ({
  id, imageId: 'image-a', labelId: 'label-a', type: 'rectangle',
  x, y: 10, width: 20, height: 20, createdAt: 0, updatedAt: 0,
})

type SyncResult = Awaited<ReturnType<typeof jobsApi.syncAnnotations>>
const requests: {
  payload: Parameters<typeof jobsApi.syncAnnotations>[1]
  resolve: (result: SyncResult) => void
  reject: (error: Error) => void
}[] = []
jobsApi.syncAnnotations = async (_job, payload) => new Promise((resolve, reject) => {
  requests.push({ payload, resolve, reject })
})
function acknowledge(index: number, ids: Record<string, string> = {}) {
  requests[index].resolve({ synced_images: ['image-a'], total_operations: 1, created_ids: ids })
}

async function run() {
  const passed: string[] = []
  window.regressionResult = undefined
  try {
    createRoot(document.getElementById('root')!).render(<Harness />)
    await until(() => !!current)
    current.markCreate(annotation('a'), 100, 100)
    const first = current.syncNow()
    const concurrent = current.syncNow()
    await until(() => requests.length === 1)
    current.markCreate(annotation('a', 30), 100, 100)
    current.markCreate(annotation('b'), 100, 100)
    acknowledge(0, { a: 'server-a' })
    await until(() => requests.length === 2)
    const second = requests[1].payload.images['image-a'].detections
    assert(second.created.length === 1, 'Only the new shape should be created')
    assert(second.updated[0].id === 'server-a' && second.updated[0].x_min === 0.3, 'In-flight edit should update the acknowledged shape')
    acknowledge(1, { b: 'server-b' })
    await Promise.all([first, concurrent])
    await until(() => current.pendingCount === 0)
    passed.push('concurrent saves share requests and drain edits made during save')

    current.markCreate(annotation('c'), 100, 100)
    const deletion = current.syncNow()
    await until(() => requests.length === 3)
    current.markDelete('c', undefined, 'image-a', 'rectangle')
    acknowledge(2, { c: 'server-c' })
    await until(() => requests.length === 4)
    assert(requests[3].payload.images['image-a'].detections.deleted[0] === 'server-c', 'A deleted in-flight create must be deleted on the server')
    acknowledge(3)
    await deletion
    passed.push('create-then-delete during save remains deleted')

    current.markCreate(annotation('d'), 100, 100)
    const failed = current.syncNow().then(() => false, () => true)
    await until(() => requests.length === 5)
    requests[4].reject(new Error('Simulated network failure'))
    assert(await failed, 'Manual save must reject so navigation stays blocked')
    await until(() => current.pendingCount === 1 && current.syncStatus === 'error')
    current.clearPending()
    passed.push('failed saves retain pending work and reject the leave action')

    let fetchCount = 0
    const originalFetch = window.fetch
    const png = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII='), c => c.charCodeAt(0))
    const blob = new Blob([png], { type: 'image/png' })
    window.fetch = async () => { fetchCount++; return new Response(blob) }
    localStorage.setItem('access_token', 'user-one')
    window.dispatchEvent(new Event('auth-token-changed'))
    setImageUrl('/private/image')
    await until(() => !!image.blobUrl)
    const firstUrl = image.blobUrl
    localStorage.setItem('access_token', 'user-two')
    window.dispatchEvent(new Event('auth-token-changed'))
    await until(() => !!image.blobUrl && image.blobUrl !== firstUrl)
    assert(fetchCount === 2, 'Changing users must refetch protected images')
    window.dispatchEvent(new Event('auth-token-changed'))
    await new Promise(resolve => setTimeout(resolve, 30))
    assert(image.blobUrl !== null && fetchCount === 2, 'Same-token events must not strand mounted images')
    window.fetch = originalFetch
    passed.push('authenticated image cache is isolated across sessions')

    for (let index = 0; index < 20; index++) {
      await preloader.preloadImage({ id: String(index), blob } as ImageData)
    }
    assert(preloader.cache.size <= 5, 'Decoded image cache should retain only a navigation window')
    passed.push('preloader cache stays bounded while navigating')
    window.regressionResult = { passed }
  } catch (error) {
    window.regressionResult = { passed, error: error instanceof Error ? error.stack : String(error) }
  }
}
void run()
