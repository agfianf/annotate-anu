/**
 * Browser benchmark page for the Explore gallery (plan finding G04).
 *
 * This mounts the REAL gallery stack — `useInfiniteExploreImages` -> the real axios
 * `projectImagesApi.explore` client -> `VirtualizedImageGrid` -> `JustifiedRow` ->
 * `ImageThumbnail` -> `useAuthenticatedImage` -> `AnnotationOverlay` — and points the
 * API base URL at the fixture server started by `bench-gallery.mjs`. Nothing in
 * `src/` is stubbed or patched: the only substitution is the origin the client dials,
 * which serves generated explore payloads and real JPEG thumbnails rendered from this
 * host's own share directory.
 *
 * Everything the page measures is exposed on `window.bench` and driven from
 * `bench-gallery.mjs`. Timings are `performance.now()` samples taken inside
 * `requestAnimationFrame` callbacks, so they are main-thread observations, not
 * presented-frame timings; headless Chrome has no display refresh rate.
 */

import '../src/index.css'
import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useInfiniteExploreImages } from '../src/hooks/useInfiniteExploreImages'
import { VirtualizedImageGrid } from '../src/components/explore/VirtualizedImageGrid'
import { GRID_SIZE_CONFIGS, type GridSize } from '../src/components/explore/toolbar/GridSlider'
import type { VisibilityState } from '../src/hooks/useExploreVisibility'
import type { ExploreFilters, SharedImage } from '../src/lib/data-management-client'

// ---------------------------------------------------------------------------
// Bench configuration store
// ---------------------------------------------------------------------------

interface BenchConfig {
  /** Fixture dataset key understood by the bench server: small | large | dense. */
  dataset: string
  /** Filter token. Changing it changes the canonical filter contract, so the real query key changes and a new first page is fetched. */
  variant: string
  /** Request and render annotation geometry. False is the app's "overlays hidden" path: no geometry in the payload and no SVG rendered. */
  overlays: boolean
  /** Grid density stop, exactly as `GridSlider` defines it. */
  gridSize: GridSize
  pageSize: number
  /**
   * Pass `onOpenImage`, which is what turns on the per-tile explicit controls added under
   * contract C7 (a labelled open button and a labelled checkbox on every tile) in place of the
   * hover-zone geometry. Setting it false reproduces the pre-C7 tile inside the current
   * revision, which isolates the cost of those controls from every other change.
   */
  explicitControls: boolean
  /** Mount the grid at all. Toggled off to force a cold remount between runs. */
  mounted: boolean
}

const defaultConfig: BenchConfig = {
  dataset: 'small',
  variant: 'v0',
  overlays: true,
  gridSize: 'm',
  pageSize: 100,
  explicitControls: true,
  mounted: false,
}

let config: BenchConfig = defaultConfig
const configListeners = new Set<() => void>()

function setConfig(patch: Partial<BenchConfig>): void {
  config = { ...config, ...patch }
  configListeners.forEach(listener => listener())
}

function subscribeConfig(listener: () => void): () => void {
  configListeners.add(listener)
  return () => configListeners.delete(listener)
}

function getConfig(): BenchConfig {
  return config
}

// ---------------------------------------------------------------------------
// Display state, matching what ProjectExploreTab hands the grid
// ---------------------------------------------------------------------------

const visibility: VisibilityState = {
  tags: {},
  categories: {},
  metadata: {
    filename: { visible: true, color: '#10B981' },
    width: { visible: false, color: '#10B981' },
    height: { visible: false, color: '#10B981' },
    fileSize: { visible: false, color: '#10B981' },
    imageId: { visible: false, color: '#10B981' },
    filepath: { visible: false, color: '#10B981' },
  },
  labels: {},
  annotationDisplay: {
    strokeWidth: 'normal',
    strokeOpacity: 'solid',
    showLabels: false,
    showConfidence: false,
    showBboxes: true,
    showPolygons: true,
    fillOpacity: 'none',
    highlightMode: false,
    dimLevel: 'medium',
  },
}

const NO_SELECTION: Set<string> = new Set()

// ---------------------------------------------------------------------------
// Harness component
// ---------------------------------------------------------------------------

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
})

/** Latest render snapshot, read by the measurement helpers below. */
const live = {
  imageCount: 0,
  total: 0,
  isLoading: true,
  isFetchingNextPage: false,
  hasNextPage: false,
  firstImageId: null as string | null,
  /** Incremented every time the grid commits a render, so a run can count React commits. */
  commits: 0,
}

function Gallery({ cfg }: { cfg: BenchConfig }) {
  const filters = useMemo<ExploreFilters>(
    () => ({ search: `${cfg.dataset}:${cfg.variant}` }),
    [cfg.dataset, cfg.variant]
  )

  const {
    images,
    total,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    nextPageError,
  } = useInfiniteExploreImages({
    projectId: '1',
    filters,
    pageSize: cfg.pageSize,
    includeBboxes: cfg.overlays,
    includePolygons: cfg.overlays,
  })

  const gridConfig = GRID_SIZE_CONFIGS[cfg.gridSize]
  const noop = useCallback(() => {}, [])
  const openImage = useCallback<(image: SharedImage) => void>(() => {}, [])

  // Published after commit rather than during render, so the measurement helpers read a value
  // that corresponds to DOM the browser has actually been handed.
  useEffect(() => {
    live.imageCount = images.length
    live.total = total
    live.isLoading = isLoading
    live.isFetchingNextPage = isFetchingNextPage
    live.hasNextPage = hasNextPage
    live.firstImageId = images[0]?.id ?? null
    live.commits += 1
  })

  return (
    <div className="relative" style={{ position: 'relative', width: '100%', height: '100vh' }}>
      <VirtualizedImageGrid
        images={images}
        selectedImages={NO_SELECTION}
        onToggleImage={noop}
        onImageDoubleClick={noop}
        onOpenImage={cfg.explicitControls ? openImage : undefined}
        targetRowHeight={gridConfig.targetRowHeight}
        thumbnailSize={gridConfig.thumbnailSize}
        spacing={2}
        hasNextPage={hasNextPage}
        isFetchingNextPage={isFetchingNextPage}
        fetchNextPage={fetchNextPage}
        nextPageError={nextPageError}
        onRetryNextPage={fetchNextPage}
        visibility={visibility}
        categoryColorMap={{}}
      />
    </div>
  )
}

export function Harness() {
  const cfg = useSyncExternalStore(subscribeConfig, getConfig, getConfig)
  return (
    <QueryClientProvider client={queryClient}>
      {cfg.mounted ? <Gallery cfg={cfg} key={`${cfg.dataset}|${cfg.gridSize}|${cfg.pageSize}`} /> : null}
    </QueryClientProvider>
  )
}

// ---------------------------------------------------------------------------
// Measurement helpers
// ---------------------------------------------------------------------------

const rAF = () => new Promise<number>(resolve => requestAnimationFrame(resolve))

/** Resolve at the first animation frame on which `predicate` holds, returning that frame's timestamp. */
async function frameWhen(predicate: () => boolean, timeoutMs = 120000): Promise<number> {
  const deadline = performance.now() + timeoutMs
  for (;;) {
    await rAF()
    if (predicate()) return performance.now()
    if (performance.now() > deadline) throw new Error('bench: timed out waiting for a condition')
  }
}

/**
 * The grid's scroll container. The current revision labels it `role="group"`; the pre-change
 * revision at HEAD has no role, so the bench also accepts the scrollable `.overflow-auto`
 * element under the root. Keeping both lets the same page measure either revision.
 */
function scroller(): HTMLElement {
  const labelled = document.querySelector<HTMLElement>('[role="group"][aria-label="Image gallery"]')
  if (labelled) return labelled
  const fallback = Array.from(document.querySelectorAll<HTMLElement>('#root div')).find(
    element => element.className.includes('overflow-auto') && element.scrollHeight > element.clientHeight
  )
  if (!fallback) throw new Error('bench: gallery scroll container is not mounted')
  return fallback
}

/** Tile roots. `data-image-id` exists only on the current revision; the class pair is on both. */
function tiles(): HTMLElement[] {
  const identified = Array.from(document.querySelectorAll<HTMLElement>('[data-image-id]'))
  if (identified.length > 0) return identified
  return Array.from(document.querySelectorAll<HTMLElement>('#root div.group.rounded-lg'))
}

/** Stable per-tile identity. Falls back to the image's alt text, which the fixture makes unique per filter variant. */
function tileKey(tile: HTMLElement): string {
  return (
    tile.getAttribute('data-image-id') ??
    tile.querySelector('img')?.getAttribute('alt') ??
    tile.textContent?.slice(0, 40) ??
    ''
  )
}

/** Images belonging to the topmost mounted row. */
function firstRowImages(): HTMLImageElement[] {
  const all = tiles()
  if (all.length === 0) return []
  const top = Math.min(...all.map(t => t.getBoundingClientRect().top))
  const firstRow = all.filter(t => Math.abs(t.getBoundingClientRect().top - top) < 2)
  return firstRow.flatMap(t => Array.from(t.querySelectorAll('img')))
}

function firstRowTileCount(): number {
  const all = tiles()
  if (all.length === 0) return 0
  const top = Math.min(...all.map(t => t.getBoundingClientRect().top))
  return all.filter(t => Math.abs(t.getBoundingClientRect().top - top) < 2).length
}

function firstRowPainted(): boolean {
  const count = firstRowTileCount()
  if (count === 0) return false
  const imgs = firstRowImages()
  if (imgs.length < count) return false
  return imgs.every(img => img.complete && img.naturalWidth > 0)
}

// Long tasks (>= 50 ms of uninterrupted main-thread work).
let longTasks: { start: number; duration: number }[] = []
try {
  new PerformanceObserver(list => {
    for (const entry of list.getEntries()) {
      longTasks.push({ start: entry.startTime, duration: entry.duration })
    }
  }).observe({ entryTypes: ['longtask'] })
} catch {
  // Long-task observation is unavailable; the harness reports this as null.
}

interface ScrollStats {
  frames: number
  /** Deltas between consecutive animation-frame callbacks, in ms. Main-thread cadence, not presented frames. */
  deltas: number[]
  durationMs: number
  /** Time spent parked at the bottom waiting for the next page, excluded from `deltas`. */
  stalledMs: number
  scrolledPx: number
  longTasks: { start: number; duration: number }[]
}

/**
 * Scroll the gallery by advancing `scrollTop` one step per animation frame, sampling the
 * interval between frame callbacks. This is the same work a wheel/trackpad scroll triggers
 * (virtualizer recompute, row mount/unmount, thumbnail fetches) but the cadence is driven
 * by rAF, not by an input device.
 *
 * When the bottom is reached with another page outstanding the loop parks until the content
 * grows. Those frames are timed separately (`stalledMs`) and kept out of `deltas`, so waiting
 * on the network is never reported as a slow frame.
 */
async function scrollRun(distancePx: number, pxPerFrame: number): Promise<ScrollStats> {
  const element = scroller()
  const deltas: number[] = []
  const longTasksBefore = longTasks.length
  const start = performance.now()
  let last = start
  let travelled = 0
  let stalledMs = 0
  const direction = Math.sign(distancePx) || 1
  const step = Math.abs(pxPerFrame) * direction
  const target = Math.abs(distancePx)

  while (travelled < target) {
    const atBottom = element.scrollTop + element.clientHeight >= element.scrollHeight - 1
    if (direction > 0 && atBottom) {
      if (!live.hasNextPage) break
      const stallStart = performance.now()
      const heightBefore = element.scrollHeight
      let waited = 0
      while (element.scrollHeight <= heightBefore && waited < 300) {
        await rAF()
        waited += 1
      }
      stalledMs += performance.now() - stallStart
      last = performance.now()
      if (element.scrollHeight <= heightBefore) break
      continue
    }
    if (direction < 0 && element.scrollTop <= 0) break

    element.scrollTop += step
    await rAF()
    const stamp = performance.now()
    deltas.push(stamp - last)
    last = stamp
    travelled += Math.abs(step)
  }

  return {
    frames: deltas.length,
    deltas,
    durationMs: performance.now() - start,
    stalledMs,
    scrolledPx: travelled,
    longTasks: longTasks.slice(longTasksBefore),
  }
}

declare global {
  interface Window {
    bench?: typeof benchApi
  }
}

const benchApi = {
  /** Reconfigure the page and wait for React to commit. */
  async configure(patch: Partial<BenchConfig>): Promise<void> {
    setConfig(patch)
    await rAF()
    await rAF()
  },

  /**
   * Unmount the gallery, clear the query cache, and clear the blob cache — the cold state.
   *
   * The blob cache is module-level in `useAuthenticatedImage` and has no exported reset, so
   * this uses the application's own invalidation path: a changed access token fires
   * `auth-token-changed`, which revokes every cached blob URL. Without this, repeat runs of
   * the same condition would find every thumbnail already decoded and report a first-paint
   * time that no real cold load could reach.
   */
  async reset(): Promise<void> {
    setConfig({ mounted: false })
    await rAF()
    queryClient.clear()
    localStorage.setItem('access_token', `bench-token-${Date.now()}-${Math.random()}`)
    window.dispatchEvent(new Event('auth-token-changed'))
    longTasks = []
    live.commits = 0
    await rAF()
    await rAF()
  },

  /** Unmount and remount without clearing either cache — the warm state. */
  async remount(): Promise<void> {
    setConfig({ mounted: false })
    await rAF()
    await rAF()
  },

  now(): number {
    return performance.now()
  },

  state() {
    return {
      ...live,
      tiles: tiles().length,
      firstRowTiles: firstRowTileCount(),
      scrollTop: (() => {
        try {
          return scroller().scrollTop
        } catch {
          return null
        }
      })(),
      scrollHeight: (() => {
        try {
          return scroller().scrollHeight
        } catch {
          return null
        }
      })(),
    }
  },

  /**
   * Mount the gallery and time it to first usable state.
   *
   * `firstRowMountedMs` — the first frame on which any tile element exists (skeleton or image).
   * `firstRowPaintedMs` — the first frame on which every image in the top row has decoded
   *   pixels (`complete && naturalWidth > 0`) and one further frame has elapsed.
   */
  async mountRun(patch: Partial<BenchConfig>): Promise<{
    t0: number
    firstRowMountedMs: number
    firstRowPaintedMs: number
    firstRowTiles: number
    total: number
    commits: number
  }> {
    const t0 = performance.now()
    setConfig({ ...patch, mounted: true })
    const mounted = await frameWhen(() => firstRowTileCount() > 0)
    await frameWhen(() => firstRowPainted())
    await rAF()
    const painted = performance.now()
    return {
      t0,
      firstRowMountedMs: mounted - t0,
      firstRowPaintedMs: painted - t0,
      firstRowTiles: firstRowTileCount(),
      total: live.total,
      commits: live.commits,
    }
  },

  /**
   * Commit a filter change on an already-mounted gallery and time it to first usable results.
   * `keepPreviousData` keeps the old tiles on screen, so the clock stops when the top row's
   * image ids belong to the new result set and their pixels have decoded.
   */
  async filterRun(variant: string): Promise<{
    firstNewRowMs: number
    firstNewRowPaintedMs: number
    total: number
  }> {
    const before = new Set(tiles().map(tileKey))
    const t0 = performance.now()
    setConfig({ variant })
    const swapped = await frameWhen(() => {
      const now = tiles().map(tileKey)
      return now.length > 0 && now.every(id => !before.has(id))
    })
    await frameWhen(() => firstRowPainted())
    await rAF()
    return {
      firstNewRowMs: swapped - t0,
      firstNewRowPaintedMs: performance.now() - t0,
      total: live.total,
    }
  },

  /** Scroll down then back up, so the caller can compare requests issued on each leg. */
  async scroll(distancePx: number, pxPerFrame = 40): Promise<ScrollStats> {
    return scrollRun(distancePx, pxPerFrame)
  },

  /** Wait until no next page is in flight and the visible rows have settled. */
  async settle(timeoutMs = 120000): Promise<void> {
    await frameWhen(() => !live.isFetchingNextPage, timeoutMs)
    for (let i = 0; i < 12; i++) await rAF()
  },

  /** Wait for every mounted image to finish decoding, or give up after `timeoutMs`. */
  async waitImages(timeoutMs = 60000): Promise<boolean> {
    try {
      await frameWhen(() => {
        const imgs = Array.from(document.querySelectorAll('img'))
        return imgs.length > 0 && imgs.every(img => img.complete)
      }, timeoutMs)
      return true
    } catch {
      return false
    }
  },

  scrollTo(top: number): void {
    scroller().scrollTop = top
  },

  longTasks(): { start: number; duration: number }[] {
    return longTasks.slice()
  },

  resetLongTasks(): void {
    longTasks = []
  },

  /**
   * Rendered CSS box of every mounted tile, keyed by image id. `bench-gallery.mjs` joins this
   * with the thumbnail request URLs captured over CDP (each carries the image id and the
   * `size` tier the component chose) to report tier selection against rendered size and DPR.
   */
  renderedTiles(): { id: string; key: string; width: number; height: number }[] {
    return tiles().map(tile => {
      const rect = tile.getBoundingClientRect()
      return {
        id: tile.getAttribute('data-image-id') ?? '',
        key: tileKey(tile),
        width: Math.round(rect.width * 10) / 10,
        height: Math.round(rect.height * 10) / 10,
      }
    })
  },

  environment() {
    return {
      devicePixelRatio: window.devicePixelRatio,
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      userAgent: navigator.userAgent,
      hardwareConcurrency: navigator.hardwareConcurrency,
      deviceMemory: (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? null,
    }
  },
}

window.bench = benchApi

localStorage.setItem('access_token', 'bench-token')
createRoot(document.getElementById('root')!).render(<Harness />)
