import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useAutoSave } from '../src/hooks/useAutoSave'
import { useAuthenticatedImage } from '../src/hooks/useAuthenticatedImage'
import { useImagePreloader } from '../src/hooks/useImagePreloader'
import { jobsApi } from '../src/lib/api-client'
import { sharedImagesApi, type JobAssociation, type SharedImage } from '../src/lib/data-management-client'
import { ImageDetailDialog } from '../src/components/explore/ImageDetailDialog'
import { VirtualizedImageGrid } from '../src/components/explore/VirtualizedImageGrid'
import { GRID_SIZE_CONFIGS } from '../src/components/explore/toolbar/GridSlider'
import type { Annotation, ImageData } from '../src/types/annotations'

declare global {
  interface Window { regressionResult?: { passed: string[]; error?: string } }
}

let current: ReturnType<typeof useAutoSave>
let preloader: ReturnType<typeof useImagePreloader>
let image: ReturnType<typeof useAuthenticatedImage>
let setImageUrl: (url: string) => void
let setViewerImage: (image: SharedImage | null) => void
let setRestoreTarget: (element: HTMLElement | null) => void
let setGallery: (gallery: { images: SharedImage[]; targetRowHeight: number } | null) => void
const viewerCalls = { next: 0, previous: 0, close: 0 }
const galleryCalls = { opened: [] as string[] }
/** Every thumbnail URL the grid asked for, so the delivered tier can be asserted. */
const thumbnailRequests: string[] = []

const sharedImage = (id: string, filename: string): SharedImage => ({
  id, file_path: `/pool/${filename}`, filename, width: 800, height: 600,
  file_size_bytes: 1024, mime_type: 'image/png', checksum_sha256: null, metadata: null,
  registered_by: null, created_at: '', updated_at: '', thumbnail_url: `/thumb/${id}`, tags: [],
})

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

export function Harness() {
  const save = useAutoSave('job-1', { enabled: false, intervalMs: 100000 })
  const preload = useImagePreloader([])
  const [url, setUrl] = useState<string | null>(null)
  const [viewer, setViewer] = useState<SharedImage | null>(null)
  const [restoreTarget, setRestore] = useState<HTMLElement | null>(null)
  const [gallery, setGalleryState] = useState<{ images: SharedImage[]; targetRowHeight: number } | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const authenticated = useAuthenticatedImage(url)
  useEffect(() => {
    current = save
    preloader = preload
    image = authenticated
    setImageUrl = setUrl
    setViewerImage = setViewer
    setRestoreTarget = setRestore
    setGallery = setGalleryState
  }, [save, preload, authenticated])
  return (
    <QueryClientProvider client={queryClient}>
      <button id="opener" type="button">Open</button>
      <button id="restore-target" type="button">Restore here</button>
      {viewer && (
        <ImageDetailDialog
          image={viewer}
          restoreFocusTo={restoreTarget}
          position={1}
          matchingTotal={8420}
          loadedCount={100}
          onClose={() => { viewerCalls.close += 1 }}
          onPrevious={() => { viewerCalls.previous += 1 }}
          onNext={() => { viewerCalls.next += 1 }}
          hasPrevious={true}
          hasNext={true}
          allTags={[]}
          tagCategories={[]}
          onAddTags={() => {}}
          onRemoveTag={() => {}}
          onAnnotate={() => {}}
        />
      )}
      {gallery && (
        <div id="gallery-host" style={{ position: 'relative', width: 1200, height: 600 }}>
          <VirtualizedImageGrid
            images={gallery.images}
            selectedImages={selected}
            onToggleImage={id =>
              setSelected(previous => {
                const next = new Set(previous)
                if (next.has(id)) next.delete(id)
                else next.add(id)
                return next
              })
            }
            onImageDoubleClick={() => {}}
            targetRowHeight={gallery.targetRowHeight}
            thumbnailSize={GRID_SIZE_CONFIGS.xs.thumbnailSize}
            hasNextPage={false}
            isFetchingNextPage={false}
            fetchNextPage={() => {}}
            onOpenImage={opened => { galleryCalls.opened.push(opened.id) }}
          />
        </div>
      )}
    </QueryClientProvider>
  )
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

    // --- Explore image viewer (G06 dialog semantics, G07 stale job responses) ---
    window.fetch = async () => new Response(blob)
    const jobRequests = new Map<string, (jobs: JobAssociation[]) => void>()
    sharedImagesApi.getImageJobs = async imageId =>
      new Promise<JobAssociation[]>(resolve => jobRequests.set(imageId, resolve))
    const job = (id: number, taskName: string): JobAssociation => ({
      job_id: id, job_status: 'pending', job_sequence: id, job_is_archived: false,
      task_id: id, task_name: taskName, task_status: 'open', task_is_archived: false,
      assignee_id: null, assignee_email: null,
    })

    const opener = document.getElementById('opener') as HTMLButtonElement
    opener.focus()
    setViewerImage(sharedImage('image-a', 'a.png'))
    await until(() => !!document.querySelector('[role="dialog"]'))
    const dialog = document.querySelector('[role="dialog"]') as HTMLElement
    assert(dialog.getAttribute('aria-modal') === 'true', 'The viewer must be a modal dialog')
    assert(!!dialog.getAttribute('aria-labelledby'), 'The dialog must be named')
    assert(document.getElementById('root')!.hasAttribute('inert'), 'The gallery behind the dialog must be inert')
    await until(() => dialog.contains(document.activeElement))
    passed.push('image viewer is a named modal dialog that takes focus and makes the gallery inert')

    // A slow response for the image the user has left must not land on the image they moved to.
    await until(() => jobRequests.has('image-a'))
    setViewerImage(sharedImage('image-b', 'b.png'))
    await until(() => jobRequests.has('image-b'))
    jobRequests.get('image-b')!([job(2, 'Task B'), job(3, 'Task B second')])
    await until(() => document.body.textContent!.includes('Task B'))
    jobRequests.get('image-a')!([job(1, 'Task A')])
    await new Promise(resolve => setTimeout(resolve, 50))
    assert(!document.body.textContent!.includes('Task A'), 'A late job response must not overwrite the current image')
    passed.push('viewer job state is keyed by image id, so obsolete responses are ignored')

    // Editable controls own their arrow keys; the dialog owns them everywhere else.
    const jobSelect = document.getElementById('image-detail-job-select') as HTMLSelectElement
    assert(!!jobSelect, 'Two active jobs should render the job selector')
    const before = viewerCalls.next
    jobSelect.focus()
    jobSelect.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    assert(viewerCalls.next === before, 'Arrow keys inside the job selector must not navigate images')
    dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    assert(viewerCalls.next === before + 1, 'Arrow keys in the dialog navigate images')
    dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    assert(viewerCalls.close === 1, 'Escape closes the dialog')
    passed.push('arrow keys navigate the viewer but never steal keystrokes from editable controls')

    // Pressing the backdrop leaves focus on <body>, where a keydown never reaches the dialog's
    // React tree. Without a document-level fallback Escape became a no-op with no way back out.
    const backdrop = dialog.parentElement as HTMLElement
    const closesBeforeBackdrop = viewerCalls.close
    ;(document.activeElement as HTMLElement | null)?.blur()
    assert(document.activeElement === document.body, 'Blurring leaves focus on the body, as a backdrop press does')
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    assert(viewerCalls.close === closesBeforeBackdrop + 1, 'Escape must close the viewer even when focus has left the dialog')
    backdrop.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    backdrop.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    assert(viewerCalls.close === closesBeforeBackdrop + 2, 'Pressing and releasing on the backdrop closes the viewer')
    const closesAfterBackdrop = viewerCalls.close
    dialog.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    backdrop.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    assert(viewerCalls.close === closesAfterBackdrop, 'A drag that starts inside the dialog must not close it')
    passed.push('the viewer closes on Escape after focus has left it, and on a backdrop click but not a drag')

    // The tag picker renders its panel through its own portal onto document.body, so it is a DOM
    // sibling of the dialog. A focus trap built only from the dialog's subtree sent Tab off the
    // panel's last control out of the page entirely, and skipped the panel from the dialog.
    const focusableSelector = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'
    const visibleFocusable = (root: HTMLElement) =>
      Array.from(root.querySelectorAll<HTMLElement>(focusableSelector)).filter(el => el.offsetParent !== null)
    const addTags = Array.from(dialog.querySelectorAll('button')).find(b => b.textContent?.includes('Add Tags'))
    assert(!!addTags, 'The viewer offers a tag picker')
    addTags!.click()
    await until(() => !!backdrop.nextElementSibling?.querySelector('input'))
    const panel = backdrop.nextElementSibling as HTMLElement
    assert(!dialog.contains(panel), 'The tag panel is a sibling of the dialog, not a descendant')
    const panelControls = visibleFocusable(panel)
    assert(panelControls.length > 1, 'The tag panel has controls to tab through')
    const lastPanelControl = panelControls[panelControls.length - 1]
    lastPanelControl.focus()
    lastPanelControl.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }))
    assert(dialog.contains(document.activeElement), 'Tab off the last control of a portal the dialog opened must stay in the dialog')
    // The panel sits after the dialog in the ring, so the dialog's last control is no longer the
    // end of it: Tab there is the browser's to handle and must not be wrapped back to the top.
    const dialogControls = visibleFocusable(dialog)
    const lastDialogControl = dialogControls[dialogControls.length - 1]
    lastDialogControl.focus()
    lastDialogControl.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }))
    assert(document.activeElement === lastDialogControl, 'Tab off the dialog must fall through to the panel it opened rather than wrap past it')
    dialogControls[0].focus()
    dialogControls[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true }))
    assert(panel.contains(document.activeElement), 'Shift+Tab off the first control must wrap to the last control of the panel, not of the dialog')
    // Escape inside that panel belongs to the panel, not to the viewer.
    const closesBeforePanelEscape = viewerCalls.close
    panelControls[0].focus()
    panelControls[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await until(() => !backdrop.nextElementSibling?.querySelector('input'))
    assert(viewerCalls.close === closesBeforePanelEscape, 'Escape in the tag panel must close the panel, not the viewer')
    passed.push('focus stays trapped across a portal the dialog opened, and that portal keeps its own Escape')

    setViewerImage(null)
    await until(() => !document.querySelector('[role="dialog"]'))
    assert(!document.getElementById('root')!.hasAttribute('inert'), 'Closing must restore the gallery')
    await until(() => document.activeElement === opener)
    passed.push('closing the viewer restores focus to the control that opened it')

    // `restoreFocusTo` names the opener explicitly, for the case where a re-render has already
    // moved focus by the time the dialog mounts. It has to win over whatever is focused then.
    const restoreTarget = document.getElementById('restore-target') as HTMLButtonElement
    setRestoreTarget(restoreTarget)
    opener.focus()
    setViewerImage(sharedImage('image-c', 'c.png'))
    await until(() => !!document.querySelector('[role="dialog"]'))
    setViewerImage(null)
    await until(() => !document.querySelector('[role="dialog"]'))
    await until(() => document.activeElement === restoreTarget)
    passed.push('restoreFocusTo decides where focus lands on close')

    // --- Explore gallery tiles (C7 controls, G01 keyboard operation, G04 scroll cost) ---
    // Every tile keeps its controls at every density. They are what a screen reader finds when
    // it browses the tree, so they are asserted on a non-active tile as well as the active one.
    window.fetch = async input => {
      thumbnailRequests.push(typeof input === 'string' ? input : (input as Request).url)
      return new Response(blob)
    }
    const gridImages = Array.from({ length: 60 }, (_, index) => sharedImage(`grid-${index}`, `grid-${index}.png`))
    setGallery({ images: gridImages, targetRowHeight: GRID_SIZE_CONFIGS.xs.targetRowHeight })
    await until(() => document.querySelectorAll('[data-image-id]').length > 20)
    const tiles = () => Array.from(document.querySelectorAll<HTMLElement>('#gallery-host [data-image-id]'))
    const control = (imageId: string, kind: string) =>
      document.querySelector<HTMLElement>(`[data-image-id="${imageId}"] [data-tile-control="${kind}"]`)

    // The tile root owns its own stacking context. Without it the tiles' z-10..z-50 chrome
    // interleaves in one global paint order and the compositor's Layerize pass grows with the
    // number of mounted tiles: measured 43.3 ms against 29.7 ms scroll frame p50 at 164 tiles.
    // This page does not load Tailwind, so the class list rather than the computed style is what
    // can be asserted here; the class is the thing a refactor would drop.
    assert(tiles()[0].classList.contains('isolate'), 'Each tile must isolate its own stacking context')

    for (const tile of tiles()) {
      const imageId = tile.getAttribute('data-image-id')!
      assert(tile.getAttribute('role') === 'group', `${imageId} must be announced as a group`)
      assert(tile.getAttribute('aria-label')?.includes(imageId), `${imageId} must be named`)
      const select = control(imageId, 'select') as HTMLInputElement | null
      const open = control(imageId, 'open')
      assert(!!select && select.getAttribute('aria-label')!.startsWith('Select '), `${imageId} must expose a named selection control`)
      assert(!!open && open.getAttribute('aria-label')!.startsWith('Open '), `${imageId} must expose a named open control`)
    }
    passed.push('every mounted tile is announced by name and exposes named selection and open controls')

    // Exactly one tile is the roving tab stop; the rest are reachable with the arrow keys.
    const tabbable = () =>
      Array.from(document.querySelectorAll<HTMLElement>('#gallery-host [data-tile-control]')).filter(el => el.tabIndex === 0)
    const firstId = tiles()[0].getAttribute('data-image-id')!
    assert(tabbable().every(el => el.closest('[data-image-id]')!.getAttribute('data-image-id') === firstId),
      'Only the active tile may hold a tab stop')
    assert(control(firstId, 'open')!.tabIndex === 0 && (control(firstId, 'select') as HTMLInputElement).tabIndex === 0,
      'The active tile exposes both of its controls to Tab')
    const laterId = tiles()[12].getAttribute('data-image-id')!
    assert(control(laterId, 'open')!.tabIndex === -1, 'A non-active tile is not a tab stop')
    control(laterId, 'open')!.focus()
    await until(() => control(laterId, 'open')!.tabIndex === 0)
    assert(control(laterId, 'select')!.tabIndex === 0, 'Focusing a tile promotes all of its controls to the tab order')
    assert(control(firstId, 'open')!.tabIndex === -1, 'The tab stop moves with focus rather than being duplicated')
    passed.push('the active tile owns the tab stop and focusing a non-active tile moves it')

    // Arrow keys move by grid geometry and keep the same kind of control focused.
    const arrow = (key: string) =>
      document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
    const focusedTile = () => (document.activeElement as HTMLElement).closest('[data-image-id]')?.getAttribute('data-image-id')
    const focusedControl = () => (document.activeElement as HTMLElement).getAttribute('data-tile-control')
    control(firstId, 'open')!.focus()
    await until(() => focusedTile() === firstId)
    arrow('ArrowRight')
    await until(() => focusedTile() !== firstId)
    const secondId = focusedTile()!
    assert(focusedControl() === 'open', 'ArrowRight keeps the open control focused on the next tile')
    arrow('ArrowDown')
    await until(() => focusedTile() !== secondId)
    assert(focusedControl() === 'open', 'ArrowDown moves a row down and stays on the open control')
    const rowBelowId = focusedTile()!
    assert(rowBelowId !== firstId && rowBelowId !== secondId, 'ArrowDown lands on a different row')

    // Selection is reachable with the keyboard: move onto the checkbox, walk with the arrows, and
    // activate it. A dispatched keydown does not produce the browser's synthetic click, so the
    // activation itself is the click Enter/Space would generate.
    ;(control(rowBelowId, 'select') as HTMLInputElement).focus()
    await until(() => focusedControl() === 'select')
    arrow('ArrowRight')
    await until(() => focusedTile() !== rowBelowId)
    assert(focusedControl() === 'select', 'Arrow keys keep the selection checkbox focused across tiles')
    const selectedId = focusedTile()!
    ;(document.activeElement as HTMLElement).click()
    await until(() => (control(selectedId, 'select') as HTMLInputElement).checked)
    assert((control(selectedId, 'select') as HTMLInputElement).getAttribute('aria-label')!.includes(selectedId),
      'A selected tile keeps its accessible name')
    assert(tiles().filter(tile => (control(tile.getAttribute('data-image-id')!, 'select') as HTMLInputElement).checked).length === 1,
      'Selecting one tile must not select any other')

    const opensBefore = galleryCalls.opened.length
    control(selectedId, 'open')!.focus()
    await until(() => focusedControl() === 'open')
    ;(document.activeElement as HTMLElement).click()
    assert(galleryCalls.opened.length === opensBefore + 1 && galleryCalls.opened.at(-1) === selectedId,
      'Activating the focused open control opens that image')
    passed.push('keyboard navigation reaches selection and open on every tile at XS density')

    // Tier ladder: a tile whose longest rendered side lands between 512 and 768 CSS px must ask
    // for 3x. Before that tier existed the same tile jumped to 4x and shipped 1024 px of image.
    thumbnailRequests.length = 0
    setGallery(null)
    await until(() => document.querySelectorAll('[data-image-id]').length === 0)
    setGallery({ images: gridImages.slice(0, 4), targetRowHeight: 440 })
    await until(() => document.querySelectorAll('[data-image-id]').length === 4)
    const rendered = tiles()[0].getBoundingClientRect()
    const longestSide = Math.max(rendered.width, rendered.height) * Math.min(window.devicePixelRatio, 2)
    assert(longestSide > 512 && longestSide <= 768, `This fixture must land in the 3x band, not ${Math.round(longestSide)}px`)
    await until(() => thumbnailRequests.length > 0)
    assert(thumbnailRequests.every(url => new URL(url, location.origin).searchParams.get('size') === '3x'),
      `Tiles in the 3x band must request 3x, got ${thumbnailRequests.map(url => new URL(url, location.origin).searchParams.get('size')).join(',')}`)
    setGallery(null)
    passed.push('a tile between the 2x and 4x bounds requests the 3x thumbnail tier')
    window.fetch = originalFetch

    window.regressionResult = { passed }
  } catch (error) {
    window.regressionResult = { passed, error: error instanceof Error ? error.stack : String(error) }
  }
}
void run()
