/**
 * Explore-gallery browser benchmark (plan finding G04).
 *
 * Kept separate from `browser-regressions.mjs` on purpose: that suite must stay fast, this
 * one deliberately runs for minutes. Nothing here asserts; it measures and writes JSON.
 *
 * What is real and what is not
 * ----------------------------
 * Real: the whole client stack under `src/` (the infinite query, the canonical filter
 * contract, axios with its interceptors, the virtualizer, justified layout, the LRU blob
 * cache, thumbnail tier selection, the SVG annotation overlay); the JPEG bytes on the wire,
 * which are thumbnails this host's own api-core code rendered from its own share directory
 * at the three real tier sizes; the JSON payload bytes and their parse cost.
 *
 * Not real: the server. Explore responses come from a local fixture generator, so query
 * latency and database cost are excluded by construction — every filter number below is the
 * client-side half only, plus whatever CPU/network emulation was applied. Frame timings are
 * main-thread `requestAnimationFrame` intervals; headless Chrome has no display, so these
 * are not presented-frame timings and no conclusion about a 60 Hz display is drawn from them.
 *
 * Usage:
 *   export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"
 *   BENCH_THUMB_DIR=/path/to/thumbs BENCH_OUT=/path/to/browser-results.json \
 *     node tests/bench-gallery.mjs
 *
 * Environment:
 *   BENCH_THUMB_DIR   (required) thumbnail pool directory, see below
 *   BENCH_OUT         output JSON path
 *   BENCH_REPEATS     repetitions of the whole condition list (default 5)
 *   BENCH_ONLY        comma-separated condition keys to run
 *   BENCH_DPR         device pixel ratio (default 1)
 *   BENCH_CPU_THROTTLE  CDP Emulation.setCPUThrottlingRate multiplier (default 1)
 *   BENCH_NET         none | fast3g | slow3g (CDP Network.emulateNetworkConditions)
 *   BENCH_HTTP_CACHE  1 leaves the browser HTTP cache on (default: disabled)
 *   BENCH_PORT, BENCH_LABEL
 *
 * Building the thumbnail pool. The bench serves real JPEGs produced by api-core's own
 * pipeline, so regenerate them from a running api-core container rather than synthesising
 * bytes (stratified so both large and already-small source images are represented):
 *
 *   docker exec anu-api-core-dev /app/.venv/bin/python - <<'PY'
 *   import json, random
 *   from pathlib import Path
 *   from PIL import Image
 *   root = Path('/data/share')
 *   big, small = [], []
 *   for p in root.rglob('*'):
 *       if p.suffix.lower() not in {'.jpg', '.jpeg', '.png'} or not p.is_file(): continue
 *       try:
 *           with Image.open(p) as im: w, h = im.size
 *       except Exception: continue
 *       (big if max(w, h) >= 1500 else small).append((p, w, h))
 *   random.seed(11)
 *   sample = random.sample(big, min(20, len(big))) + random.sample(small, min(20, len(small)))
 *   out = Path('/tmp/benchthumbs'); out.mkdir(exist_ok=True)
 *   rows = []
 *   for i, (p, w, h) in enumerate(sample):
 *       rec = {'i': i, 'src': str(p.relative_to(root)), 'w': w, 'h': h,
 *              'src_bytes': p.stat().st_size, 'class': 'large' if max(w, h) >= 1500 else 'small'}
 *       for key, size in (('1x', (256, 256)), ('2x', (512, 512)), ('4x', (1024, 1024))):
 *           with Image.open(p) as im:
 *               im = im.convert('RGB'); im.thumbnail(size, Image.Resampling.LANCZOS)
 *               t = out / f'{i}_{key}.jpg'; im.save(t, 'JPEG', quality=85, optimize=True)
 *               rec[key + '_bytes'] = t.stat().st_size; rec[key + '_dim'] = list(im.size)
 *       rows.append(rec)
 *   json.dump(rows, open(out / 'index.json', 'w'), indent=1)
 *   PY
 *   docker cp anu-api-core-dev:/tmp/benchthumbs "$BENCH_THUMB_DIR"
 */

import { createServer } from 'vite'
import puppeteer from 'puppeteer'
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { execSync } from 'node:child_process'

const PORT = Number(process.env.BENCH_PORT ?? 18720)
const ORIGIN = `http://127.0.0.1:${PORT}`
const THUMB_DIR = process.env.BENCH_THUMB_DIR
const OUT = process.env.BENCH_OUT ?? 'bench-browser-results.json'
const REPEATS = Number(process.env.BENCH_REPEATS ?? 5)
const CPU_THROTTLE = Number(process.env.BENCH_CPU_THROTTLE ?? 1)
const NET_PROFILE = process.env.BENCH_NET ?? 'none'
const VIEWPORT = { width: 1440, height: 900 }
const DPR = Number(process.env.BENCH_DPR ?? 1)
/** Leave the browser HTTP cache on, so a repeat thumbnail request can be served from disk rather than the wire. Off by default so that every request the application chooses to issue is visible. */
const HTTP_CACHE = process.env.BENCH_HTTP_CACHE === '1'

if (!THUMB_DIR) throw new Error('BENCH_THUMB_DIR must point at the generated thumbnail pool')

// ---------------------------------------------------------------------------
// Thumbnail pool: real JPEGs rendered by api-core's own PIL pipeline at 1x/2x/4x.
// ---------------------------------------------------------------------------

const poolIndex = JSON.parse(readFileSync(join(THUMB_DIR, 'index.json'), 'utf8'))
const poolFiles = new Map()
for (const name of readdirSync(THUMB_DIR)) {
  if (name.endsWith('.jpg')) poolFiles.set(name, readFileSync(join(THUMB_DIR, name)))
}

// ---------------------------------------------------------------------------
// Fixture datasets
// ---------------------------------------------------------------------------

const DATASETS = {
  // "small": a project a reviewer finishes in one sitting.
  small: { count: 100, bboxes: 3, polygons: 0, polygonPoints: 0 },
  // "large": the plan's 10,000-image reference set, lightly annotated.
  large: { count: 10000, bboxes: 4, polygons: 0, polygonPoints: 0 },
  // "dense": the plan's annotation-heavy fixture — at the per-image preview caps.
  dense: { count: 2000, bboxes: 100, polygons: 50, polygonPoints: 24 },
}

const LABEL_COLORS = ['#ef4444', '#3b82f6', '#22c55e', '#eab308', '#a855f7', '#06b6d4']

/** Deterministic PRNG so every run sees byte-identical fixtures. */
function rng(seed) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

function makeImage(datasetKey, variant, index, includeBboxes, includePolygons) {
  const spec = DATASETS[datasetKey]
  const pool = poolIndex[index % poolIndex.length]
  const random = rng(index * 2654435761 + datasetKey.length * 7919)
  const id = `${datasetKey}-${variant}-${index}`
  const detectionCount = spec.bboxes === 0 ? 0 : 1 + Math.floor(random() * spec.bboxes)
  const segmentationCount = spec.polygons === 0 ? 0 : 1 + Math.floor(random() * spec.polygons)

  const summary = { detection_count: detectionCount, segmentation_count: segmentationCount }
  if (includeBboxes) {
    summary.bboxes = Array.from({ length: detectionCount }, (_, i) => {
      const x = random() * 0.7
      const y = random() * 0.7
      return {
        x_min: x,
        y_min: y,
        x_max: x + 0.05 + random() * 0.25,
        y_max: y + 0.05 + random() * 0.25,
        label_color: LABEL_COLORS[i % LABEL_COLORS.length],
        label_name: `label-${i % 6}`,
        label_id: `l${i % 6}`,
        confidence: Math.round(random() * 1000) / 1000,
        source: i % 3 === 0 ? 'manual' : 'model:bench',
      }
    })
    summary.bboxes_truncated = false
  }
  if (includePolygons && spec.polygons > 0) {
    summary.polygons = Array.from({ length: segmentationCount }, (_, i) => {
      const cx = 0.15 + random() * 0.7
      const cy = 0.15 + random() * 0.7
      const r = 0.03 + random() * 0.08
      return {
        points: Array.from({ length: spec.polygonPoints }, (_, p) => {
          const a = (p / spec.polygonPoints) * Math.PI * 2
          return [
            Math.round((cx + Math.cos(a) * r) * 100000) / 100000,
            Math.round((cy + Math.sin(a) * r) * 100000) / 100000,
          ]
        }),
        label_color: LABEL_COLORS[i % LABEL_COLORS.length],
        label_name: `label-${i % 6}`,
        label_id: `l${i % 6}`,
        confidence: Math.round(random() * 1000) / 1000,
        source: 'model:bench',
      }
    })
    summary.polygons_truncated = false
  }

  const tagCount = index % 4
  return {
    id,
    file_path: `bench/${pool.src}`,
    // The variant is in the filename so a tile's `alt` identifies its filter result set even on
    // the pre-change revision, whose thumbnails carry no `data-image-id`.
    filename: `bench-${variant}-${index}-${pool.src.split('/').pop()}`,
    width: pool.w,
    height: pool.h,
    file_size_bytes: pool.src_bytes,
    mime_type: 'image/jpeg',
    checksum_sha256: null,
    metadata: null,
    registered_by: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    thumbnail_url: `/bench-thumb/${id}?pool=${index % poolIndex.length}`,
    tags: Array.from({ length: tagCount }, (_, t) => ({
      id: `tag-${t}`,
      project_id: 1,
      category_id: null,
      name: `tag ${t}`,
      description: null,
      color: LABEL_COLORS[t % LABEL_COLORS.length],
      created_by: null,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    })),
    annotation_summary: summary,
  }
}

function benchPlugin() {
  return {
    name: 'bench-fixture-server',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = new URL(req.url, ORIGIN)

        if (url.pathname.startsWith('/bench-thumb/')) {
          const pool = Number(url.searchParams.get('pool') ?? 0)
          const size = url.searchParams.get('size') ?? '2x'
          const body = poolFiles.get(`${pool}_${size}.jpg`)
          if (!body) {
            res.statusCode = 404
            res.end('no such thumbnail')
            return
          }
          res.setHeader('Content-Type', 'image/jpeg')
          res.setHeader('Content-Length', String(body.length))
          // api-core sends `public, max-age=86400`; the bench disables the HTTP cache at the
          // CDP level so that every request the application decides to issue is observable.
          res.setHeader('Cache-Control', 'public, max-age=86400')
          res.end(body)
          return
        }

        if (url.pathname.match(/^\/api\/v1\/projects\/[^/]+\/explore$/)) {
          const search = url.searchParams.get('search') ?? 'small:v0'
          const [datasetKey, variant] = search.split(':')
          const spec = DATASETS[datasetKey] ?? DATASETS.small
          const page = Number(url.searchParams.get('page') ?? 1)
          const pageSize = Number(url.searchParams.get('page_size') ?? 100)
          const includeBboxes = url.searchParams.get('include_bboxes') !== 'false'
          const includePolygons = url.searchParams.get('include_polygons') !== 'false'
          const start = (page - 1) * pageSize
          const images = []
          for (let i = start; i < Math.min(start + pageSize, spec.count); i++) {
            images.push(makeImage(datasetKey, variant ?? 'v0', i, includeBboxes, includePolygons))
          }
          const body = JSON.stringify({
            data: {
              images,
              total: spec.count,
              page,
              page_size: pageSize,
              filters_applied: { search },
            },
            message: 'ok',
            status_code: 200,
          })
          res.setHeader('Content-Type', 'application/json')
          res.setHeader('Cache-Control', 'no-store')
          res.end(body)
          return
        }

        next()
      })
    },
  }
}

// ---------------------------------------------------------------------------
// Statistics
// ---------------------------------------------------------------------------

function quantile(sorted, q) {
  if (sorted.length === 0) return null
  const pos = (sorted.length - 1) * q
  const lo = Math.floor(pos)
  const hi = Math.ceil(pos)
  if (lo === hi) return sorted[lo]
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo)
}

function summarize(values) {
  const clean = values.filter(v => typeof v === 'number' && Number.isFinite(v)).sort((a, b) => a - b)
  if (clean.length === 0) return null
  const round = v => (v === null ? null : Math.round(v * 100) / 100)
  return {
    n: clean.length,
    min: round(clean[0]),
    p50: round(quantile(clean, 0.5)),
    p95: round(quantile(clean, 0.95)),
    max: round(clean[clean.length - 1]),
    mean: round(clean.reduce((a, b) => a + b, 0) / clean.length),
  }
}

// ---------------------------------------------------------------------------
// CDP instrumentation
// ---------------------------------------------------------------------------

async function newInstrumentedPage(browser) {
  const page = await browser.newPage()
  await page.setViewport({ ...VIEWPORT, deviceScaleFactor: DPR })
  const cdp = await page.createCDPSession()
  await cdp.send('Network.enable')
  await cdp.send('Performance.enable')
  await cdp.send('HeapProfiler.enable')
  await cdp.send('Runtime.enable')
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: !HTTP_CACHE })
  if (CPU_THROTTLE > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU_THROTTLE })

  const requests = []
  const byId = new Map()
  cdp.on('Network.requestWillBeSent', e => {
    byId.set(e.requestId, { url: e.request.url, start: e.timestamp, type: e.type })
  })
  cdp.on('Network.responseReceived', e => {
    const r = byId.get(e.requestId)
    if (r) {
      r.status = e.response.status
      r.mimeType = e.response.mimeType
      r.fromDiskCache = e.response.fromDiskCache
    }
  })
  cdp.on('Network.loadingFinished', e => {
    const r = byId.get(e.requestId)
    if (!r) return
    r.encodedDataLength = e.encodedDataLength
    r.end = e.timestamp
    requests.push(r)
    byId.delete(e.requestId)
  })
  cdp.on('Network.loadingFailed', e => byId.delete(e.requestId))

  return { page, cdp, requests }
}

/**
 * Network emulation is applied only after the page has loaded. The bench page is served by the
 * Vite dev server as hundreds of unbundled ES modules, and throttling those to a 3G profile
 * would time out the load without telling us anything about the gallery.
 */
async function applyNetworkEmulation(cdp) {
  if (NET_PROFILE === 'none') return
  const profiles = {
    // Chrome DevTools' own presets.
    fast3g: { downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8, latency: 150 },
    slow3g: { downloadThroughput: (400 * 1024) / 8, uploadThroughput: (400 * 1024) / 8, latency: 400 },
  }
  const profile = profiles[NET_PROFILE]
  if (!profile) throw new Error(`unknown BENCH_NET profile: ${NET_PROFILE}`)
  await cdp.send('Network.emulateNetworkConditions', { offline: false, ...profile })
}

async function heapUsedBytes(cdp) {
  await cdp.send('HeapProfiler.collectGarbage')
  const { usedSize } = await cdp.send('Runtime.getHeapUsage')
  return usedSize
}

async function perfMetrics(cdp) {
  const { metrics } = await cdp.send('Performance.getMetrics')
  return Object.fromEntries(metrics.map(m => [m.name, m.value]))
}

function metricDelta(before, after, keys) {
  const out = {}
  for (const key of keys) out[key] = Math.round(((after[key] ?? 0) - (before[key] ?? 0)) * 1000) / 1000
  return out
}

const CPU_KEYS = ['TaskDuration', 'ScriptDuration', 'LayoutDuration', 'RecalcStyleDuration', 'LayoutCount', 'RecalcStyleCount', 'Nodes', 'JSEventListeners']

// ---------------------------------------------------------------------------
// Scenario
// ---------------------------------------------------------------------------

const thumbRequests = requests => requests.filter(r => r.url.includes('/bench-thumb/'))
const exploreRequests = requests => requests.filter(r => r.url.includes('/explore?'))

function tierOf(url) {
  const match = /[?&]size=([^&]+)/.exec(url)
  return match ? match[1] : 'unset'
}

function imageIdOf(url) {
  const match = /\/bench-thumb\/([^?]+)/.exec(url)
  return match ? decodeURIComponent(match[1]) : null
}

/**
 * One measurement run: cold mount, settle, a forward scroll, a return scroll, a second
 * forward scroll over the same rows (the LRU cache probe), and a filter commit.
 */
async function runOnce({ page, cdp, requests }, condition) {
  requests.length = 0
  await page.evaluate(() => window.bench.reset())
  await page.evaluate(() => window.bench.resetLongTasks())
  const heapBefore = await heapUsedBytes(cdp)
  const metricsBefore = await perfMetrics(cdp)

  // --- cold first paint (cold query cache, cold blob cache, warm browser process) -------
  const mount = await page.evaluate(
    (dataset, overlays, gridSize, pageSize, explicitControls) =>
      window.bench.mountRun({ dataset, overlays, gridSize, pageSize, explicitControls, variant: 'v0' }),
    condition.dataset,
    condition.overlays,
    condition.gridSize,
    100,
    condition.explicitControls !== false
  )
  const mountLongTasks = await page.evaluate(() => window.bench.longTasks())
  const firstPaintRequests = requests.slice()
  await page.evaluate(() => window.bench.settle())
  await page.evaluate(() => window.bench.waitImages())

  const renderedTiles = await page.evaluate(() => window.bench.renderedTiles())

  // --- warm remount: both caches retained, so this is the repeat-visit path ------------
  const beforeWarm = requests.length
  await page.evaluate(() => window.bench.remount())
  const warmMount = await page.evaluate(
    (dataset, overlays, gridSize, pageSize, explicitControls) =>
      window.bench.mountRun({ dataset, overlays, gridSize, pageSize, explicitControls, variant: 'v0' }),
    condition.dataset,
    condition.overlays,
    condition.gridSize,
    100,
    condition.explicitControls !== false
  )
  await page.evaluate(() => window.bench.settle())
  const warmRequests = requests.slice(beforeWarm)
  const afterMountRequests = requests.length

  // --- forward scroll -------------------------------------------------------
  const scrollDistance = condition.scrollPx
  const down = await page.evaluate(d => window.bench.scroll(d, 40), scrollDistance)
  await page.evaluate(() => window.bench.settle())
  const afterDownRequests = requests.length
  const downThumbs = thumbRequests(requests.slice(afterMountRequests)).length

  // --- scroll back to the top ----------------------------------------------
  await page.evaluate(d => window.bench.scroll(-d, 40), scrollDistance)
  await page.evaluate(() => window.bench.settle())
  const afterUpRequests = requests.length
  const upThumbs = thumbRequests(requests.slice(afterDownRequests)).length

  // --- second forward pass over the same rows: the LRU cache probe ----------
  const down2 = await page.evaluate(d => window.bench.scroll(d, 40), scrollDistance)
  await page.evaluate(() => window.bench.settle())
  const secondPassThumbs = thumbRequests(requests.slice(afterUpRequests)).length

  const heapAfterScroll = await heapUsedBytes(cdp)
  const metricsAfterScroll = await perfMetrics(cdp)

  // --- filter commit --------------------------------------------------------
  await page.evaluate(() => window.bench.scrollTo(0))
  await page.evaluate(() => window.bench.settle())
  const beforeFilter = requests.length
  const filter = await page.evaluate(() => window.bench.filterRun('v1'))
  const filterRequests = requests.slice(beforeFilter)

  const state = await page.evaluate(() => window.bench.state())

  const firstPaintExplore = exploreRequests(firstPaintRequests)
  const allThumbs = thumbRequests(requests)

  return {
    mount,
    mountLongTasks,
    warmMount: {
      ...warmMount,
      thumbRequests: thumbRequests(warmRequests).length,
      exploreRequests: exploreRequests(warmRequests).length,
    },
    firstPaint: {
      exploreRequests: firstPaintExplore.length,
      exploreBytes: firstPaintExplore.reduce((a, r) => a + (r.encodedDataLength ?? 0), 0),
      thumbRequests: thumbRequests(firstPaintRequests).length,
    },
    scrollDown: {
      frames: down.frames,
      durationMs: Math.round(down.durationMs),
      stalledMs: Math.round(down.stalledMs),
      scrolledPx: down.scrolledPx,
      deltas: down.deltas,
      longTasks: down.longTasks,
      thumbRequests: downThumbs,
    },
    scrollBack: { thumbRequests: upThumbs },
    secondPass: {
      frames: down2.frames,
      scrolledPx: down2.scrolledPx,
      thumbRequests: secondPassThumbs,
      longTasks: down2.longTasks,
    },
    filter: {
      ...filter,
      exploreRequests: exploreRequests(filterRequests).length,
      exploreBytes: exploreRequests(filterRequests).reduce((a, r) => a + (r.encodedDataLength ?? 0), 0),
    },
    heap: { beforeBytes: heapBefore, afterScrollBytes: heapAfterScroll },
    cpu: metricDelta(metricsBefore, metricsAfterScroll, CPU_KEYS),
    nodes: metricsAfterScroll.Nodes,
    network: {
      totalRequests: requests.length,
      exploreRequests: exploreRequests(requests).length,
      exploreBytes: exploreRequests(requests).reduce((a, r) => a + (r.encodedDataLength ?? 0), 0),
      thumbRequests: allThumbs.length,
      thumbBytes: allThumbs.reduce((a, r) => a + (r.encodedDataLength ?? 0), 0),
      thumbFromHttpCache: allThumbs.filter(r => r.fromDiskCache).length,
      tierCounts: allThumbs.reduce((acc, r) => {
        const tier = tierOf(r.url)
        acc[tier] = (acc[tier] ?? 0) + 1
        return acc
      }, {}),
      tierBytes: allThumbs.reduce((acc, r) => {
        const tier = tierOf(r.url)
        acc[tier] = (acc[tier] ?? 0) + (r.encodedDataLength ?? 0)
        return acc
      }, {}),
    },
    tierSamples: (() => {
      const sizeById = new Map(renderedTiles.map(t => [t.id, t]))
      const seen = new Map()
      for (const r of allThumbs) {
        const id = imageIdOf(r.url)
        const rendered = id ? sizeById.get(id) : null
        if (!rendered || seen.has(id)) continue
        seen.set(id, {
          tier: tierOf(r.url),
          renderedWidth: rendered.width,
          renderedHeight: rendered.height,
          bytes: r.encodedDataLength ?? 0,
        })
      }
      return [...seen.values()].slice(0, 40)
    })(),
    state,
    tilesMounted: renderedTiles.length,
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

process.env.VITE_CORE_API_URL = ORIGIN

const conditions = [
  { key: 'small-overlays-on', dataset: 'small', overlays: true, gridSize: 'm', scrollPx: 3000 },
  { key: 'small-overlays-off', dataset: 'small', overlays: false, gridSize: 'm', scrollPx: 3000 },
  { key: 'large-overlays-on', dataset: 'large', overlays: true, gridSize: 'm', scrollPx: 6000 },
  { key: 'large-overlays-off', dataset: 'large', overlays: false, gridSize: 'm', scrollPx: 6000 },
  { key: 'dense-overlays-on', dataset: 'dense', overlays: true, gridSize: 'm', scrollPx: 6000 },
  { key: 'dense-overlays-off', dataset: 'dense', overlays: false, gridSize: 'm', scrollPx: 6000 },
  { key: 'large-xs-overlays-on', dataset: 'large', overlays: true, gridSize: 'xs', scrollPx: 6000 },
  // Deep enough to visit well over the 300-entry blob cache, so the second pass shows eviction.
  { key: 'large-deep-scroll', dataset: 'large', overlays: true, gridSize: 'm', scrollPx: 30000 },
  // Same as large-xs-overlays-on but without the C7 per-tile controls, isolating their cost.
  { key: 'large-xs-no-tile-controls', dataset: 'large', overlays: true, gridSize: 'xs', scrollPx: 6000, explicitControls: false },
]

const only = process.env.BENCH_ONLY ? process.env.BENCH_ONLY.split(',') : null
const selected = only ? conditions.filter(c => only.includes(c.key)) : conditions

const server = await createServer({
  configFile: false,
  root: process.cwd(),
  plugins: [(await import('@vitejs/plugin-react')).default(), benchPlugin()],
  resolve: { alias: { '@': join(process.cwd(), 'src') } },
  define: { 'import.meta.env.VITE_CORE_API_URL': JSON.stringify(ORIGIN) },
  // HMR off: editing a bench file mid-run would otherwise reload the page and destroy the
  // execution context the driver is measuring through.
  server: { host: '127.0.0.1', port: PORT, strictPort: true, hmr: false, watch: null },
})

let browser
const runs = []
try {
  await server.listen()
  browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] })

  const harness = await newInstrumentedPage(browser)
  await harness.page.goto(`${ORIGIN}/tests/bench-gallery.html`)
  await harness.page.waitForFunction(() => window.bench !== undefined, { timeout: 60000 })
  const environment = await harness.page.evaluate(() => window.bench.environment())
  await applyNetworkEmulation(harness.cdp)

  // Interleave: every repetition walks the whole condition list, so a drift in host load
  // spreads across conditions instead of landing on whichever one ran last.
  for (let repeat = 0; repeat < REPEATS; repeat++) {
    for (const condition of selected) {
      process.stdout.write(`run ${repeat + 1}/${REPEATS} ${condition.key}\n`)
      const result = await runOnce(harness, condition)
      runs.push({ repeat, condition: condition.key, ...condition, ...result })
    }
  }

  // --- aggregate ------------------------------------------------------------
  const byCondition = {}
  for (const condition of selected) {
    const mine = runs.filter(r => r.condition === condition.key)
    const allDeltas = mine.flatMap(r => r.scrollDown.deltas)
    const allLongTasks = mine.flatMap(r => r.scrollDown.longTasks.map(t => t.duration))
    byCondition[condition.key] = {
      condition,
      runs: mine.length,
      coldFirstRowMountedMs: summarize(mine.map(r => r.mount.firstRowMountedMs)),
      coldFirstRowPaintedMs: summarize(mine.map(r => r.mount.firstRowPaintedMs)),
      warmFirstRowMountedMs: summarize(mine.map(r => r.warmMount.firstRowMountedMs)),
      warmFirstRowPaintedMs: summarize(mine.map(r => r.warmMount.firstRowPaintedMs)),
      warmRemountThumbRequests: summarize(mine.map(r => r.warmMount.thumbRequests)),
      warmRemountExploreRequests: summarize(mine.map(r => r.warmMount.exploreRequests)),
      mountLongTasks: summarize(mine.map(r => r.mountLongTasks.length)),
      mountLongTaskDurationMs: summarize(mine.flatMap(r => r.mountLongTasks.map(t => t.duration))),
      exploreRequestsPerRun: summarize(mine.map(r => r.network.exploreRequests)),
      exploreBytesPerRun: summarize(mine.map(r => r.network.exploreBytes)),
      filterFirstNewRowMs: summarize(mine.map(r => r.filter.firstNewRowMs)),
      filterFirstNewRowPaintedMs: summarize(mine.map(r => r.filter.firstNewRowPaintedMs)),
      firstPageJsonBytes: summarize(mine.map(r => r.firstPaint.exploreBytes)),
      filterPageJsonBytes: summarize(mine.map(r => r.filter.exploreBytes)),
      scrollFrameIntervalMs: summarize(allDeltas),
      // Headless Chrome drives rAF at a nominal ~16.7 ms, so "over 16.7" is noise. A frame
      // interval past 33 ms is one whole missed 60 Hz frame's worth of main-thread delay,
      // which is the honest signal available here.
      scrollFrameIntervalPctOver33ms: allDeltas.length
        ? Math.round((allDeltas.filter(d => d > 33).length / allDeltas.length) * 10000) / 100
        : null,
      scrollFrameIntervalPctOver50ms: allDeltas.length
        ? Math.round((allDeltas.filter(d => d > 50).length / allDeltas.length) * 10000) / 100
        : null,
      scrollFrameIntervalPctOver100ms: allDeltas.length
        ? Math.round((allDeltas.filter(d => d > 100).length / allDeltas.length) * 10000) / 100
        : null,
      scrollStalledMs: summarize(mine.map(r => r.scrollDown.stalledMs)),
      scrollDistancePx: summarize(mine.map(r => r.scrollDown.scrolledPx)),
      longTasksPerScroll: summarize(mine.map(r => r.scrollDown.longTasks.length)),
      longTaskDurationMs: summarize(allLongTasks),
      scrollDownThumbRequests: summarize(mine.map(r => r.scrollDown.thumbRequests)),
      scrollBackThumbRequests: summarize(mine.map(r => r.scrollBack.thumbRequests)),
      secondPassThumbRequests: summarize(mine.map(r => r.secondPass.thumbRequests)),
      firstPaintThumbRequests: summarize(mine.map(r => r.firstPaint.thumbRequests)),
      totalThumbRequests: summarize(mine.map(r => r.network.thumbRequests)),
      totalThumbBytes: summarize(mine.map(r => r.network.thumbBytes)),
      thumbRequestsServedFromHttpCache: summarize(mine.map(r => r.network.thumbFromHttpCache)),
      jsHeapAfterScrollBytes: summarize(mine.map(r => r.heap.afterScrollBytes)),
      jsHeapBeforeMountBytes: summarize(mine.map(r => r.heap.beforeBytes)),
      domNodes: summarize(mine.map(r => r.nodes)),
      tilesMounted: summarize(mine.map(r => r.tilesMounted)),
      cpuTaskDurationS: summarize(mine.map(r => r.cpu.TaskDuration)),
      cpuScriptDurationS: summarize(mine.map(r => r.cpu.ScriptDuration)),
      cpuLayoutDurationS: summarize(mine.map(r => r.cpu.LayoutDuration)),
      cpuRecalcStyleDurationS: summarize(mine.map(r => r.cpu.RecalcStyleDuration)),
      tierCounts: mine[0]?.network.tierCounts ?? null,
      tierSamples: mine[0]?.tierSamples ?? null,
    }
  }

  let git = null
  try {
    git = {
      head: execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim(),
      branch: execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim(),
      dirty: execSync('git status --porcelain', { encoding: 'utf8' }).trim().length > 0,
    }
  } catch {
    git = null
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    label: process.env.BENCH_LABEL ?? null,
    method: {
      whatIsReal:
        'The entire client under apps/web/src runs unmodified: the infinite query, the canonical filter contract, axios and its interceptors, TanStack Virtual, the justified layout, the LRU blob cache in useAuthenticatedImage, thumbnail tier selection in ImageThumbnail, and the SVG AnnotationOverlay. Thumbnail bytes on the wire are real JPEGs produced by api-core\'s own PIL pipeline (LANCZOS, quality 85) at the three real tier bounds from this host\'s share directory.',
      whatIsNot:
        'The server is a local fixture generator, so no database or network latency to a real api-core is included; every filter figure is the client-side half only. Frame intervals are requestAnimationFrame deltas on the main thread in headless Chrome, which has no display: they are not presented-frame timings and no dropped-frame count is claimed. The JS heap figure excludes decoded image memory and GPU memory.',
      firstUsableDefinition:
        'firstRowMountedMs: first animation frame on which any tile element exists. firstRowPaintedMs: first frame on which every <img> in the top row reports complete && naturalWidth > 0, plus one further frame.',
      filterDefinition:
        'From the frame that commits the filter change to the first frame whose top-row tiles all carry ids from the new result set (firstNewRowMs), and to the frame after those images have decoded (firstNewRowPaintedMs). keepPreviousData leaves the old tiles visible in between.',
      cacheProbe:
        'Scroll forward scrollPx, back to the top, then forward over the same rows again, counting thumbnail requests on each leg. The HTTP cache is disabled over CDP so that every request the application chooses to issue is observable; in production these would additionally hit a 24 h Cache-Control on the thumbnail route.',
      noise:
        'Conditions are interleaved: each repetition walks the whole condition list rather than repeating one condition to exhaustion.',
    },
    environment: {
      ...environment,
      viewport: VIEWPORT,
      devicePixelRatioRequested: DPR,
      cpuThrottlingRate: CPU_THROTTLE,
      networkEmulation: NET_PROFILE,
      httpCacheEnabled: HTTP_CACHE,
      repeats: REPEATS,
      node: process.version,
      host: {
        loadavg: readFileSync('/proc/loadavg', 'utf8').trim(),
        cpus: Number(execSync('nproc', { encoding: 'utf8' }).trim()),
      },
      git,
    },
    datasets: DATASETS,
    thumbnailPool: poolIndex,
    byCondition,
    runs,
  }

  mkdirSync(dirname(OUT), { recursive: true })
  writeFileSync(OUT, JSON.stringify(payload, null, 2))
  process.stdout.write(`\nwrote ${OUT}\n`)
} finally {
  await browser?.close()
  await server.close()
}
